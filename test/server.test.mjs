import test from 'node:test';import assert from 'node:assert/strict';import {spawn}from'node:child_process';
test('Texmed HTTP build isolates histories, blocks cross-origin and protects live services',async()=>{
 const child=spawn(process.execPath,['dist/server.mjs'],{env:{...process.env,PORT:'0',RUNS_BUCKET:''},stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{child.stdout.on('data',b=>{const m=b.toString().match(/listening on (\d+)/);if(m)resolve(m[1]);});child.once('error',reject);child.once('exit',c=>reject(new Error('Server exited '+c)));});const base='http://127.0.0.1:'+port;
  const start=await fetch(base+'/');assert.equal(start.status,200);const cookie=start.headers.getSetCookie()[0].split(';')[0];assert.match(cookie,/scopeledger_session=[a-f0-9]{64}/);
  const post=await fetch(base+'/api/run',{method:'POST',headers:{cookie,'content-type':'application/json',origin:base},body:JSON.stringify({scenario:'redirect',guarded:true})});assert.equal(post.status,200);const report=await post.json();assert.equal(report.metrics.legitimateCompleted,6);assert.equal(report.metrics.unauthorizedEffects,0);
  const own=await(await fetch(base+'/api/history',{headers:{cookie}})).json();assert.equal(own.length,1);assert.equal(own[0].id,report.id);
  const other=await(await fetch(base+'/api/history')).json();assert.equal(other.length,0);
  const cross=await fetch(base+'/api/run',{method:'POST',headers:{cookie,origin:'https://attacker.invalid'},body:'{}'});assert.equal(cross.status,403);
  const model=await fetch(base+'/api/run',{method:'POST',headers:{cookie},body:JSON.stringify({scenario:'normal',planner:'model'})});assert.equal(model.status,403);
  const mcp=await fetch(base+'/mcp',{method:'POST',headers:{cookie},body:JSON.stringify({id:1,method:'tools/call',params:{name:'run_collections_workflow',arguments:{scenario:'normal'}}})});assert.equal(mcp.status,401);
  const suite=await(await fetch(base+'/api/evaluate',{method:'POST',headers:{cookie},body:'{}'})).json();assert.equal(suite.passed,7);
  const status=await(await fetch(base+'/api/status')).json();assert.equal(status.armorVerified,false);
 }finally{child.kill('SIGTERM');}
});
