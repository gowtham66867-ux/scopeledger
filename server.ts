import {createServer,IncomingMessage,ServerResponse} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {resolve,extname} from 'node:path';
import {Storage} from '@google-cloud/storage';
import {GoogleAuth} from 'google-auth-library';
import {runScenario,evaluate,scenarios} from './lib/engine.mjs';
import {planWithGemini} from './lib/gemini';
import {ArmorIQClient,IntentMismatchException,PolicyBlockedException,PolicyHoldException} from '@armoriq/sdk';
const port=Number(process.env.PORT||8080);const root=resolve('dist/client');
const storage=process.env.RUNS_BUCKET?new Storage().bucket(process.env.RUNS_BUCKET):null;
const vertexAuth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
const memory=new Map<string,any[]>();const rate=new Map<string,{at:number;count:number}>();
function json(res:ServerResponse,status:number,data:unknown){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));}
function session(req:IncomingMessage,res:ServerResponse){
 const value=req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('scopeledger_session='))?.slice(20);
 const id=value&&/^[a-f0-9]{64}$/.test(value)?value:randomBytes(32).toString('hex');
 if(id!==value)res.setHeader('Set-Cookie',`scopeledger_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.K_SERVICE?'; Secure':''}`);
 return createHash('sha256').update(id).digest('hex');
}
function admin(req:IncomingMessage){const secret=process.env.ADMIN_BEARER_TOKEN;const token=req.headers.authorization?.replace(/^Bearer /,'')||'';return !!secret&&Buffer.byteLength(token)===Buffer.byteLength(secret)&&timingSafeEqual(Buffer.from(token),Buffer.from(secret));}
async function save(id:string,report:any){if(storage){await storage.file(`runs/${id}/${report.createdAt.replace(/:/g,'-')}-${report.id}.json`).save(JSON.stringify(report),{resumable:false,contentType:'application/json',preconditionOpts:{ifGenerationMatch:0}});}else{memory.set(id,[report,...(memory.get(id)||[])].slice(0,20));if(memory.size>1000)memory.delete(memory.keys().next().value!);}}
async function history(id:string){if(!storage)return memory.get(id)||[];const [files]=await storage.getFiles({prefix:`runs/${id}/`,autoPaginate:true});return Promise.all(files.sort((a,b)=>b.name.localeCompare(a.name)).slice(0,20).map(async file=>{const [bytes]=await file.download();return JSON.parse(bytes.toString());}));}
async function body(req:IncomingMessage){let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>12000)throw new Error('Request too large');}return JSON.parse(raw||'{}');}
async function reserveModelRun(){
 if(!storage)return false;
 const file=storage.file('limits/gemini/'+new Date().toISOString().slice(0,10)+'.json');
 for(let attempt=0;attempt<5;attempt++){
  let generation=0;let used=0;
  try{const[meta]=await file.getMetadata();generation=Number(meta.generation);const[bytes]=await storage.file(file.name,{generation:meta.generation}).download();used=JSON.parse(bytes.toString()).used;}
  catch(error){if((error as {code?:number}).code!==404)throw error;}
  if(used>=20)return false;
  try{await file.save(JSON.stringify({used:used+1}),{resumable:false,contentType:'application/json',preconditionOpts:{ifGenerationMatch:generation}});return true;}
  catch(error){if((error as {code?:number}).code!==412)throw error;}
 }
 return false;
}
async function cloudProof(email:string){
 if(!process.env.ARMORIQ_API_KEY||!process.env.ARMORIQ_MCP_NAME)throw new Error('ArmorIQ credentials and MCP registration are not configured');
 const client=new ArmorIQClient({apiKey:process.env.ARMORIQ_API_KEY,useProduction:true});const mcp=process.env.ARMORIQ_MCP_NAME;
 const plan={goal:'Run synthetic collections',steps:[{mcp,action:'run_collections_workflow',params:{scenario:'redirect'}}]};const captured=client.capturePlan('deterministic-boundary-proof',plan.goal,plan);const token=await client.getIntentToken(captured);
 const result=await client.invoke(mcp,'run_collections_workflow',token,{scenario:'redirect'},undefined,email);if(result.status==='error'||result.verified!==true)throw new Error('Allowed call did not return verified success');
 try{await client.invoke(mcp,'change_payment_details',token,{accountId:'AC-101',bank:'ATTACKER-DEMO-999'},undefined,email);return{armorVerified:true,boundaryVerified:false,decision:'unexpectedly allowed'};}
 catch(error){if(error instanceof IntentMismatchException||error instanceof PolicyBlockedException)return{armorVerified:true,boundaryVerified:true,decision:'blocked',allowed:result.result,at:new Date().toISOString()};if(error instanceof PolicyHoldException)return{armorVerified:true,boundaryVerified:false,decision:'held'};throw error;}
}
export const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
 const path=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname;
 if(path==='/healthz'||path==='/api/health'){return json(res,200,{status:'ok',service:'scopeledger',host:'Texmed Google Cloud'});}
 const id=session(req,res);
 try{
  if(req.method==='POST'){
   const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)return json(res,403,{error:'Origin not permitted'});
   const counter=rate.get(id);if(counter&&Date.now()-counter.at<60000){if(counter.count++>=30)return json(res,429,{error:'Please wait a minute before running more scenarios.'});}else{rate.set(id,{at:Date.now(),count:1});if(rate.size>2000)rate.delete(rate.keys().next().value!);}
  }
  if(path==='/api/status'&&req.method==='GET')return json(res,200,{modelConfigured:!!((process.env.VERTEX_PROJECT||process.env.GEMINI_API_KEY)&&process.env.PUBLIC_MODEL_DEMO==='true'),modelProvider:'Google Gemini',modelName:process.env.GEMINI_MODEL||'gemini-3.8-flash',armorConfigured:!!process.env.ARMORIQ_API_KEY,armorVerified:false,enforcement:'Local signed-scope policy',dataset:'Synthetic business invoices',outboundEmail:false,hosting:'Texmed Google Cloud Run',history:storage?'Google Cloud Storage':'ephemeral local memory'});
  if(path==='/api/history'&&req.method==='GET')return json(res,200,await history(id));
  if(path==='/api/evaluate'&&req.method==='POST')return json(res,200,evaluate());
  if(path==='/api/run'&&req.method==='POST'){
   const input=await body(req);if(!scenarios.some(s=>s.id===input.scenario))return json(res,400,{error:'Unknown scenario'});
   let proposals=null; let modelMetadata=null;
   if(input.planner==='model'){
    if(!admin(req)&&process.env.PUBLIC_MODEL_DEMO!=='true')return json(res,403,{error:'Live model execution requires administrator authorization'});
    if(!process.env.GEMINI_API_KEY&&!process.env.VERTEX_PROJECT)return json(res,409,{error:'Live model credential is not configured'});
    if(input.guarded===false)return json(res,400,{error:'Live models require enforcement'});
    if(input.scenario==='outage')return json(res,400,{error:'Use the deterministic harness to simulate a verifier outage'});
    if(!admin(req)&&!await reserveModelRun())return json(res,429,{error:'The public live-model demo has reached its daily limit. Deterministic scenarios remain available.'});
    const planned=await planWithGemini({key:process.env.GEMINI_API_KEY,project:process.env.VERTEX_PROJECT,accessToken:process.env.VERTEX_PROJECT?(await vertexAuth.getAccessToken())||undefined:undefined,model:process.env.GEMINI_MODEL||'gemini-3.8-flash',scenario:input.scenario});
    proposals=planned.proposals;modelMetadata=planned.metadata;
   }
   const report=runScenario(input.scenario,{guarded:input.guarded!==false,proposals,injectAttack:!proposals,planner:proposals?'Live Gemini proposals; no inserted adversarial tool calls':'Scripted boundary test'});Object.assign(report,{model:modelMetadata});await save(id,report);return json(res,200,report);
  }
  if(path==='/api/cloud'&&req.method==='POST'){
   if(!process.env.ARMORIQ_API_KEY||!process.env.ARMORIQ_MCP_NAME)return json(res,409,{error:'ArmorIQ credentials and MCP registration are not configured'});
   if(!admin(req))return json(res,403,{error:'Live cloud verification requires administrator authorization'});
   if(!process.env.ARMORIQ_USER_EMAIL)return json(res,409,{error:'ArmorIQ end-user attribution is not configured'});
   return json(res,200,await cloudProof(process.env.ARMORIQ_USER_EMAIL));
  }
  if(path==='/mcp'&&req.method==='POST'){
   const input=await body(req);const rpcId=input.id??null;
   const reply=(result:unknown)=>json(res,200,{jsonrpc:'2.0',id:rpcId,result});
   if(input.method==='initialize')return reply({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'scopeledger-mcp',version:'0.2.0'}});
   if(input.method==='notifications/initialized'){res.writeHead(202);return res.end();}
   if(input.method==='tools/list')return reply({tools:[{name:'run_collections_workflow',description:'Run a synthetic collections workflow under local signed-scope controls',inputSchema:{type:'object',properties:{scenario:{type:'string',enum:scenarios.map(s=>s.id)}},required:['scenario'],additionalProperties:false}}]});
   if(input.method!=='tools/call')return json(res,400,{error:'Unsupported MCP method'});
   if(!admin(req))return json(res,401,{error:'Service authorization required'});
   const args=input.params?.arguments;if(input.params?.name!=='run_collections_workflow'||!args||Object.keys(args).some(k=>k!=='scenario')||!scenarios.some(s=>s.id===args.scenario))return reply({isError:true,content:[{type:'text',text:'Tool or arguments unavailable'}]});
   return reply({content:[{type:'text',text:JSON.stringify(runScenario(args.scenario))}]});
  }
  if(path.startsWith('/api/'))return json(res,404,{error:'Endpoint not found'});
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
  let file=resolve(root,'.'+path);if(!file.startsWith(root+'/')&&file!==root)return json(res,404,{error:'Not found'});
  if(path==='/')file=resolve(root,'index.html');let bytes;
  try{bytes=await readFile(file);}catch{if(extname(path))return json(res,404,{error:'Asset not found'});file=resolve(root,'index.html');bytes=await readFile(file);}
  const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
  res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':extname(file)==='.html'?'no-cache':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(error){console.error('Request failed:',error instanceof Error?error.name:'Error');json(res,500,{error:'Workflow could not complete. No live verification success is claimed.'});}
});
server.listen(port,'0.0.0.0',()=>console.log(`ScopeLedger listening on ${typeof server.address()==='object'?(server.address() as {port:number}).port:port}`));
