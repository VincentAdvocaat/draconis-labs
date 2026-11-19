import { contextBridge, ipcRenderer } from 'electron';
import type { ProbeBridge } from './bridge.js';

const bridge: ProbeBridge = {
  invoke: command => ipcRenderer.invoke('probe:command', command),
  ready: () => ipcRenderer.invoke('probe:ready'),
};
contextBridge.exposeInMainWorld('plannerProbe', bridge);
