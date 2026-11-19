import { contextBridge, ipcRenderer } from 'electron';
import type { ProbeBridge } from './bridge.js';

const bridge: ProbeBridge = {
  list: () => ipcRenderer.invoke('probe:list'),
  create: input => ipcRenderer.invoke('probe:create', input),
  ready: () => ipcRenderer.invoke('probe:ready'),
};
contextBridge.exposeInMainWorld('plannerProbe', bridge);
