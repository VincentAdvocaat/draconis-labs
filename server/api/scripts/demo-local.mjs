import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import Database from 'better-sqlite3';

const api=fileURLToPath(new URL('..',import.meta.url));
const planner=resolve(api,'../../apps/planner');
const children=[];
let stopping=false;
async function stop(){
  if(stopping)return;stopping=true;
  await Promise.all(children.map(child=>new Promise(done=>{
    if(child.exitCode!==null||child.signalCode!==null)return done();
    child.once('exit',done);child.kill();
  })));
}
function start(args,cwd,env){
  const child=spawn(process.execPath,args,{cwd,env:{...process.env,...env},windowsHide:true,stdio:'inherit'});
  children.push(child);
  child.on('error',error=>{console.error(error);process.exitCode=1;void stop();});
  child.on('exit',()=>{if(!stopping){process.exitCode=1;void stop();}});
}
async function free(port){
  await new Promise((done,reject)=>{const server=createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(done));});
}
process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
try{
  for(const port of [3041,3042,3043,3044])await free(port);
  const directory=mkdtempSync(join(tmpdir(),'planner-local-demo-'));
  const database=join(directory,'own.sqlite');new Database(database).close();
  const created=spawnSync(process.execPath,['--import','tsx','scripts/create-public-channel.ts','--database',database,'--origin','http://127.0.0.1:3044','--name','Fictieve lokale demo'],{cwd:api,encoding:'utf8',windowsHide:true});
  if(created.status!==0)throw Error(created.stderr||'Channel creation failed');
  const channel=JSON.parse(created.stdout);
  writeFileSync(join(directory,'demo.json'),JSON.stringify({database,...channel},null,2));
  start(['--import','tsx','dist/index.js'],api,{DATABASE_PATH:database,HOST:'127.0.0.1',PORT:'3041'});
  start(['--import','tsx','dist/public.js'],api,{DATABASE_PATH:database,PUBLIC_HOST:'127.0.0.1',PUBLIC_PORT:'3043'});
  const vite=join(planner,'node_modules/vite/bin/vite.js');
  start([vite,'--host','127.0.0.1','--port','3042','--strictPort'],planner,{VITE_API_URL:'http://127.0.0.1:3041'});
  start([vite,'--config','vite.public.config.ts'],planner,{});
  console.log('\nFictieve demo: http://127.0.0.1:3042/\nBezoekers: '+channel.publicUrl+'\nEigen gegevens: '+directory+'\nCtrl+C stopt de vier eigen processen. Gegevens blijven bewaard.');
}catch(error){console.error(error);process.exitCode=1;await stop();}
