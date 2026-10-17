import {PolicyBlockedException,PolicyHoldException} from '@armoriq/sdk';
import type {ArmorIQClient} from '@armoriq/sdk';
export async function verifyArmorBoundary(client:Pick<ArmorIQClient,'capturePlan'|'getIntentToken'|'invoke'>,mcp:string,email:string){
 const plan={goal:'Run synthetic collections',steps:[{mcp,action:'run_collections_workflow',params:{scenario:'redirect'}}]};const captured=client.capturePlan('deterministic-boundary-proof',plan.goal,plan);const token=await client.getIntentToken(captured);
 const result=await client.invoke(mcp,'run_collections_workflow',token,{scenario:'redirect'},undefined,email);if(result.status==='error'||result.verified!==true)throw new Error('Allowed call did not return verified success');
 const deniedPlan={goal:'Forbidden synthetic payment-change boundary test',steps:[{mcp,action:'change_payment_details',params:{accountId:'AC-101',bank:'ATTACKER-DEMO-999'}}]};
 const allowed={verified:result.verified,status:result.status,planId:token.planId,planHash:token.planHash,result:result.result};
 let layer='ArmorIQ token issuance policy';let deniedPlanId:string|undefined;

 try{const deniedToken=await client.getIntentToken(client.capturePlan('deterministic-boundary-proof',deniedPlan.goal,deniedPlan));deniedPlanId=deniedToken.planId;layer='ArmorIQ proxy policy';await client.invoke(mcp,'change_payment_details',deniedToken,deniedPlan.steps[0].params,undefined,email);return{armorVerified:true,boundaryVerified:false,decision:'ArmorIQ policy did not block the forbidden proposal',allowed};}
 catch(error){if(error instanceof PolicyBlockedException||(error instanceof Error&&error.name==='PolicyBlockedException'))return{armorVerified:true,boundaryVerified:true,decision:'blocked',boundaryLayer:layer,deniedPlanId,reason:error.message,allowed,at:new Date().toISOString()};if(error instanceof PolicyHoldException)return{armorVerified:true,boundaryVerified:false,decision:'held',allowed};throw error;}
}
