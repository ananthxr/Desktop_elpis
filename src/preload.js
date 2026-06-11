'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('catApi', {
  onInit: (cb) => ipcRenderer.on('init', (_e, p) => cb(p)),
  onStimulus: (cb) => ipcRenderer.on('stimulus', (_e, p) => cb(p)),
  setInteractive: (v) => ipcRenderer.send('set-interactive', !!v),
  report: (m) => ipcRenderer.send('cat-report', String(m)),
});
