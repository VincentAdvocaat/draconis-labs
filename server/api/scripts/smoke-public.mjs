import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

const directory=mkdtempSync(join(tmpdir(),'public-smoke-')),path=join(directory,'own.sqlite'),origin='http://127.0.0.1:3044';
assert.equal(dirname(resolve(directory)),resolve(tmpdir()),'Smoke cleanup must stay in the own temp directory');
new Database(path).close();
function command(args){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--import','tsx',...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',error='';
  child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{error+=data;});child.on('error',reject);child.on('close',code=>resolve({code,output,error}));
});}
const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(done=>reservation.close(done));
let processState;
async function start(){
  const child=spawn(process.execPath,['--import','tsx','dist/public.js'],{windowsHide:true,env:{...process.env,DATABASE_PATH:path,PUBLIC_HOST:'127.0.0.1',PUBLIC_PORT:String(port)},stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',data=>{log=(log+data).slice(-5000);});child.stderr.on('data',data=>{log=(log+data).slice(-5000);});
  const ended=once(child,'close');processState={child,ended};
  for(let attempt=0;attempt<100;attempt++){
    if(child.exitCode!==null)throw Error(log);
    try{const response=await fetch(`http://127.0.0.1:${port}/health`);if((await response.json()).service==='public-booking')return;}catch{}
    await new Promise(done=>setTimeout(done,100));
  }throw Error('Public API did not become ready: '+log);
}
async function stop(){if(processState){processState.child.kill();await processState.ended;processState=undefined;}}
try{
  const created=await command(['scripts/create-public-channel.ts','--database',path,'--origin',origin,'--name','Fictieve smoke-site']);assert.equal(created.code,0,created.error);const channel=JSON.parse(created.output);
  const duplicate=await command(['scripts/create-public-channel.ts','--database',path,'--origin',origin,'--name','Duplicate fixture']);assert.equal(duplicate.code,1);
  await start();const base=`http://127.0.0.1:${port}`,route='/api/v1/public/channels/'+channel.channelId;
  const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Amsterdam'});
  const offered=await (await fetch(base+route+'/availability?postcode=0002AA&date='+date)).json();assert(offered.ok);assert.equal(offered.value.slots.length,2);
  const input={key:randomUUID(),postcode:'0002AA',slotId:offered.value.slots[0].id,contact:{name:'Fictieve smoke-bezoeker',email:'smoke@example.test'}};
  async function reserve(){const response=await fetch(base+route+'/reservations',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)});assert.equal(response.status,200);return response.json();}
  const receipt=await reserve();assert(receipt.ok);assert(!JSON.stringify(receipt).includes('smoke@example.test'));assert.deepEqual(await reserve(),receipt);
  const privatePath=await fetch(base+'/api/v1/workspaces/local/contacts');assert.equal(privatePath.status,404);
  assert.equal((await fetch(base+route+'/confirmations/'+receipt.value.reference)).status,404);
  await stop();await start();assert.deepEqual(await reserve(),receipt);
  const after=await (await fetch(base+route+'/availability?postcode=0002AA&date='+date)).json();assert.equal(after.value.slots.length,1);
  console.log(JSON.stringify({startCommand:'node --import tsx dist/public.js',explicitFixtureChannel:true,oneActiveChannel:true,publicReservation:true,exactReplay:true,privateRoutesAbsent:true,noPiiLookup:true,processRestartPreservesReceiptAndCapacity:true,node:process.version}));
}finally{
  await stop();rmSync(directory,{recursive:true,force:true});
}
