import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {expect,it} from 'vitest';
import {buildCmsApp} from '../src/modules/cms/app.js';
import {contactBundle} from '../src/modules/cms/contact-fixture/bundle.js';

it('serves immutable contact preview assets through the CMS development proxy',async()=>{
 const cmsRoot=fileURLToPath(new URL('../../../apps/cms/',import.meta.url));
 const requireCms=createRequire(join(cmsRoot,'package.json'));
 const {createServer,loadConfigFromFile}=await import(pathToFileURL(requireCms.resolve('vite')).href);
 const root=mkdtempSync(join(tmpdir(),'cms-contact-proxy-'));
 let running:Awaited<ReturnType<typeof buildCmsApp>>|undefined;
 let vite:Awaited<ReturnType<typeof createServer>>|undefined;
 try {
  running=await buildCmsApp({runtimeRoot:root,seed:true,enablePages:true,enableSharedNavigation:true,enableContactTemplate:true,credentials:[{name:'proxy-test',role:'publisher',websiteIds:['demo-cms'],tokenHash:createHash('sha256').update('proxy-test').digest('hex')}]});
  await running.app.listen({host:'127.0.0.1',port:0});
  const address=running.app.server.address();
  if(!address||typeof address==='string')throw Error('Missing API address');
  const target=`http://127.0.0.1:${address.port}`;
  const config=(await loadConfigFromFile({command:'serve',mode:'development'},join(cmsRoot,'vite.config.ts'))).config;
  // Keep the configured route keys; only replace the backend port for isolation.
  const proxy=Object.fromEntries(Object.keys(config.server.proxy).map(key=>[key,target]));
  vite=await createServer({...config,configFile:false,root:cmsRoot,server:{host:'127.0.0.1',port:0,proxy}});
  await vite.listen();
  const viteAddress=vite.httpServer.address();
  const origin=`http://127.0.0.1:${viteAddress.port}`;
  const record=(await running.app.inject({url:'/api/v1/cms/websites/demo-cms/contact-template',headers:{authorization:'Bearer proxy-test'}})).json();
  for(const [filename,mime,expected] of [['contact.css','text/css',contactBundle.css],['contact.js','text/javascript',contactBundle.js]]){
   const response=await fetch(`${origin}/contact-fixture-assets/${record.template.hash}/${filename}`);
   expect(response.status).toBe(200);
   expect(response.headers.get('content-type')).toContain(mime);
   expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(expected));
  }
 } finally {
  await vite?.close();
  await running?.app.close();
  if(resolve(root).startsWith(resolve(tmpdir()))&&root.includes('cms-contact-proxy-'))rmSync(root,{recursive:true,force:true});
 }
},30_000);
