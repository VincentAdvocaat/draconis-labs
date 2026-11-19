import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openProbeStore } from './store.js';
import { assertProbeSender, guardProbeInvoke } from './sender.js';

const started = performance.now();
if (process.argv.some(arg => arg.startsWith('--squirrel-'))) app.exit(0);
const profile = process.env.PLANNER_PROBE_PROFILE;
if (profile) app.setPath('userData', resolve(profile));
app.setName('DraconisPlannerProbe');
let store: ReturnType<typeof openProbeStore> | undefined;
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => store?.close());

app.whenReady().then(async () => {
  mkdirSync(app.getPath('userData'), { recursive: true });
  store = openProbeStore(join(app.getPath('userData'), 'probe.sqlite'));
  const win = new BrowserWindow({
    width: 900, height: 650, show: !process.env.PLANNER_PROBE_OUTPUT,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: !process.env.PLANNER_PROBE_OUTPUT },
  });
  const page = pathToFileURL(join(__dirname, 'index.html')).href;
  if (process.env.PLANNER_PROBE_OUTPUT) {
    win.webContents.on('console-message', details => console.error('Renderer:', details.message));
    win.webContents.on('render-process-gone', (_event, details) => { console.error('Renderer stopped:', details.reason); app.exit(1); });
  }
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith('file:') });
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  const sender = { webContents: win.webContents, mainFrame: win.webContents.mainFrame, page };
  ipcMain.handle('probe:command', guardProbeInvoke(sender, input => store!.invoke(input)));
  ipcMain.handle('probe:ready', async event => {
    assertProbeSender(event, sender);
    const readyMs = performance.now() - started;
    const readyEpochMs = Date.now();
    if (!process.env.PLANNER_PROBE_OUTPUT) return;
    try {
      const before = store!.list();
      const wrongWorkspace = await win.webContents.executeJavaScript("window.plannerProbe.invoke({type:'tasks.list',workspaceId:'other'})");
      const workspaceRejected = !wrongWorkspace.ok && wrongWorkspace.error.code === 'WORKSPACE_NOT_FOUND';
      const removable = before.find(task => task.recurrence === null);
      if (removable) await win.webContents.executeJavaScript(`window.plannerClient.remove('${removable.id}')`);
      // Invoke the actual isolated preload interface from the bundled renderer.
      const initial = await win.webContents.executeJavaScript(`window.plannerClient.create({
        title: 'Rijke fictieve desktoptaak', description: 'Behoud alle velden',
        plannedDate: '2026-11-19', dueDate: '2026-11-20', dueTime: '09:15',
        timezone: 'Europe/Amsterdam', recurrence: {frequency:'weekly',interval:2},
        priority:'high', labels:['probe','onderhoud'],
        createdBy:'forged', id:'forged', lane:'done', version:999
      })`);
      const actorBoundary = initial.createdBy === 'local-probe' && initial.id !== 'forged' && initial.lane === 'todo' && initial.version === 1;
      await win.webContents.executeJavaScript(`window.plannerClient.update('${initial.id}', {lane:'doing',position:${initial.position},version:1})`);
      const conflictCode = await win.webContents.executeJavaScript(`window.plannerClient.update('${initial.id}',{title:'stale',version:1}).then(()=>null,error=>error.code)`);
      const conflictRejected = conflictCode === 'VERSION_CONFLICT';
      await win.webContents.executeJavaScript(`window.plannerClient.update('${initial.id}',{lane:'done',version:2})`);
      const task = await win.webContents.executeJavaScript(`window.plannerClient.update('${initial.id}',{lane:'done',version:3})`);
      const read = await win.webContents.executeJavaScript('window.plannerClient.list()');
      const rejected = await win.webContents.executeJavaScript("window.plannerClient.create({title:''}).then(()=>false,error=>error.code==='INVALID_INPUT')");
      await win.webContents.executeJavaScript("window.plannerClient.preferences.update({locale:'en'})");
      const preferences = await win.webContents.executeJavaScript('window.plannerClient.preferences.get()');
      const preferencesRoundTrip = preferences.locale === 'en';
      const booking = await win.webContents.executeJavaScript(`(async () => {
        const client = window.bookingClient;
        const state = async () => Promise.all((await client.contacts.list({archived:true})).map(contact => client.contacts.card(contact.id)));
        const before = await state();
        const tick = () => new Promise(resolve=>setTimeout(resolve,20));
        const wait = async predicate => { const until=Date.now()+5000; while(!(await predicate())) { if(Date.now()>until) throw Error('Packaged UI condition timed out'); await tick(); } };
        const nav = text => Array.from(document.querySelectorAll('nav[aria-label="Planner onderdelen"] button')).find(button=>button.textContent===text).click();
        const change = (element,value) => { Object.getOwnPropertyDescriptor(element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(element,value); element.dispatchEvent(new Event(element.tagName==='SELECT'||element.type==='date'?'change':'input',{bubbles:true})); };
        const name='Fictieve plannerklant '+(before.length+1);
        nav('Relaties');
        await wait(()=>document.querySelector('input[maxlength="160"]') && !document.querySelector('input[maxlength="160"]').closest('fieldset').disabled);
        const nameInput=document.querySelector('input[maxlength="160"]'); change(nameInput,name); await tick();
        nameInput.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
        let contact;
        await wait(async()=>{ contact=(await client.contacts.list()).find(person=>person.name===name); return contact; });
        const key = crypto.randomUUID(), input = {version:contact.version,name};
        const updated = await client.contacts.update(contact.id,input,key);
        const repeated = await client.contacts.update(contact.id,input,key);
        const today = new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Amsterdam'});
        const date = new Date(Date.parse(today+'T12:00:00Z')+before.length*86400000).toISOString().slice(0,10);
        const slots = await client.availability(date), morning = slots[0].slot, afternoon = slots[1].slot;
        const block = await client.blocks.create({slotId:morning.id,reason:'Fictief onderhoud'},crypto.randomUUID());
        nav('Afspraken'); await wait(()=>document.querySelector('input[type="date"]')); await tick();
        change(document.querySelector('input[type="date"]'),date); await tick();
        await wait(()=>document.querySelector('section[aria-label="Afspraak plannen"] option[value="'+afternoon.id+'"]') && !document.querySelector('section[aria-label="Afspraak plannen"] fieldset').disabled);
        const form=document.querySelector('section[aria-label="Afspraak plannen"] form'), selects=form.querySelectorAll('select');
        change(selects[0],contact.id); change(selects[1],afternoon.id); await tick();
        form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
        let visit;
        await wait(async()=>{ visit=(await client.appointments.list(date)).find(item=>item.contactId===contact.id); return visit; });
        await wait(()=>document.querySelector('section[aria-label="Afspraken op datum"]').textContent.includes(name));
        const blocked = await client.appointments.move(visit.id,{version:1,slotId:morning.id},crypto.randomUUID()).then(()=>null,error=>error.code);
        await client.blocks.remove(block.id,crypto.randomUUID());
        const moved = await client.appointments.move(visit.id,{version:1,slotId:morning.id,arrivalAt:new Date(Date.parse(morning.startAt)+75*60000).toISOString()},crypto.randomUUID());
        const stale = await client.appointments.status(visit.id,{version:1,status:'cancelled'},crypto.randomUUID()).then(()=>null,error=>error.code);
        await client.appointments.status(visit.id,{version:2,status:'completed'},crypto.randomUUID());
        const cancelled = await client.appointments.create({contactId:contact.id,slotId:afternoon.id},crypto.randomUUID());
        await client.appointments.status(cancelled.id,{version:1,status:'cancelled'},crypto.randomUUID());
        await client.contacts.update(contact.id,{version:updated.version,archived:true},crypto.randomUUID());
        const after = await state(), available = await client.availability(date);
        return {before,after,uiContactCreated:true,uiAppointmentCreated:true,idempotent:updated.version===repeated.version,blocked,stale,moved,available};
      })()`);
      const encrypted = await safeStorage.isAsyncEncryptionAvailable();
      const tokenRoundTrip = encrypted && (await safeStorage.decryptStringAsync(await safeStorage.encryptStringAsync('synthetic-token'))).result === 'synthetic-token';
      await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('nav[aria-label=\"Planner onderdelen\"] button')).find(button=>button.textContent==='Afspraken').click()");
      // A hidden Chromium surface can retain its first frame despite DOM updates.
      // Show without activation so capture verifies the normal painted window.
      win.showInactive();
      await new Promise(resolve => setTimeout(resolve, 200));
      const screenshot = await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
      writeFileSync(`${process.env.PLANNER_PROBE_OUTPUT}.png`, screenshot.toPNG());
      writeFileSync(process.env.PLANNER_PROBE_OUTPUT, JSON.stringify({
        version: app.getVersion(), electron: process.versions.electron, node: process.versions.node,
        abi: process.versions.modules, readyMs, readyEpochMs, before, task, read, rejected, actorBoundary, conflictRejected,
        workspaceRejected, conflictCode, preferencesRoundTrip, deletedId: removable?.id ?? null,
        booking, tokenRoundTrip, sqlite: 'better-sqlite3', profile: app.getPath('userData'),
      }, null, 2));
      app.quit();
    } catch (error) { console.error(error); app.exit(1); }
  });
  await win.loadFile(join(__dirname, 'index.html'));
}).catch(error => { console.error(error); app.exit(1); });
