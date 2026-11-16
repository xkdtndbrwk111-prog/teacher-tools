// Apply AFTER the original R7 patch. No change to existing ledger entries or receipt history.
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const file=path.join(process.argv[2]||'system','coins.js');
const s=fs.readFileSync(file,'utf8');
const start="  if(type==='tt-coins-grant'){\n";
const end="  }else if(type==='tt-coins-setting'){";
assert.equal(s.split(start).length,2,'unexpected R7 grant implementation');
assert.equal(s.split(end).length,2,'unexpected R7 settings implementation');
const i=s.indexOf(start),j=s.indexOf(end,i);
assert(j>i);
const out=s.slice(0,i)+"  if(type==='tt-coins-grant')return fail('코인 지급·차감은 호자보드에서만 할 수 있습니다.');\n  if(type==='tt-coins-setting'){"+s.slice(j+end.length);
fs.writeFileSync(file,out,'utf8');
console.log('PASS: disabled manager grants; kept settings and ledger interpretation');
