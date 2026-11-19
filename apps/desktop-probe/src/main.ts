import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openProbeStore } from './store.js';

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
  const assertSender = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== page) {
      throw new Error('Unknown probe sender');
    }
  };
  ipcMain.handle('probe:list', event => { assertSender(event); return store!.list(); });
  ipcMain.handle('probe:create', (event, input) => { assertSender(event); return store!.create(input); });
  ipcMain.handle('probe:ready', async event => {
    assertSender(event);
    const readyMs = performance.now() - started;
    const readyEpochMs = Date.now();
    if (!process.env.PLANNER_PROBE_OUTPUT) return;
    try {
      const before = store!.list();
      // Invoke the actual isolated preload interface from the bundled renderer.
      const task = await win.webContents.executeJavaScript("window.plannerProbe.create({title:'Persistente fictieve desktoptaak',labels:['probe']})");
      const read = await win.webContents.executeJavaScript('window.plannerProbe.list()');
      const rejected = await win.webContents.executeJavaScript("window.plannerProbe.create({title:''}).then(()=>false,()=>true)");
      const encrypted = await safeStorage.isAsyncEncryptionAvailable();
      const tokenRoundTrip = encrypted && (await safeStorage.decryptStringAsync(await safeStorage.encryptStringAsync('synthetic-token'))).result === 'synthetic-token';
      const screenshot = await win.webContents.capturePage();
      writeFileSync(`${process.env.PLANNER_PROBE_OUTPUT}.png`, screenshot.toPNG());
      writeFileSync(process.env.PLANNER_PROBE_OUTPUT, JSON.stringify({
        version: app.getVersion(), electron: process.versions.electron, node: process.versions.node,
        abi: process.versions.modules, readyMs, readyEpochMs, before, task, read, rejected,
        tokenRoundTrip, sqlite: 'better-sqlite3', profile: app.getPath('userData'),
      }, null, 2));
      app.quit();
    } catch (error) { console.error(error); app.exit(1); }
  });
  await win.loadFile(join(__dirname, 'index.html'));
}).catch(error => { console.error(error); app.exit(1); });
