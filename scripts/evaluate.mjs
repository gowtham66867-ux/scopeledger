import {mkdir,writeFile} from 'node:fs/promises';
import {evaluate} from '../lib/engine.mjs';
const report=evaluate();
await mkdir('evidence',{recursive:true});
await writeFile('evidence/regression-latest.json',JSON.stringify(report,null,2)+'\n');
console.log(`${report.passed}/${report.total} deterministic scenarios passed. Live ArmorIQ verified: ${report.armorVerified}.`);
if(report.passed!==report.total)process.exitCode=1;
