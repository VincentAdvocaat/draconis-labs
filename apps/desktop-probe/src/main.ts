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
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  const page = pathToFileURL(join(__dirname, 'index.html')).href;
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
      const encrypted = await safeStorage.isAsyncEncryptionAvailable();
      const tokenRoundTrip = encrypted && (await safeStorage.decryptStringAsync(await safeStorage.encryptStringAsync('synthetic-token'))).result === 'synthetic-token';
      const screenshot = await win.webContents.capturePage();
      writeFileSync(`${process.env.PLANNER_PROBE_OUTPUT}.png`, screenshot.toPNG());
      writeFileSync(process.env.PLANNER_PROBE_OUTPUT, JSON.stringify({
        version: app.getVersion(), electron: process.versions.electron, node: process.versions.node,
        abi: process.versions.modules, readyMs, readyEpochMs, before, task, read, rejected, actorBoundary, conflictRejected,
        workspaceRejected, conflictCode, preferencesRoundTrip, deletedId: removable?.id ?? null,
        tokenRoundTrip, sqlite: 'better-sqlite3', profile: app.getPath('userData'),
      }, null, 2));
      app.quit();
    } catch (error) { console.error(error); app.exit(1); }
  });
  await win.loadFile(join(__dirname, 'index.html'));
}).catch(error => { console.error(error); app.exit(1); });
