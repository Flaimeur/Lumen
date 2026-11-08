'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lumen', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),
  systems: () => ipcRenderer.invoke('systems'),
  cachedLibrary: () => ipcRenderer.invoke('library:cached'),
  scan: (opts) => ipcRenderer.invoke('library:scan', opts || {}),
  onLibraryChanged: (cb) => ipcRenderer.on('library:changed', () => cb()),
  onAchievementsChanged: (cb) => ipcRenderer.on('achievements:changed', () => cb()),
  testAchNotify: () => ipcRenderer.invoke('achnotify:test'),
  steamAccounts: () => ipcRenderer.invoke('steam:accounts'),
  gameHistory: (p) => ipcRenderer.invoke('game:history', p),
  openFolder: (p) => ipcRenderer.invoke('shell:folder', p),
  companions: {
    list: (force) => ipcRenderer.invoke('companions:list', !!force),
    run: (id, action) => ipcRenderer.invoke('companions:run', id, action),
  },
  openUrl: (u) => ipcRenderer.invoke('shell:url', u),
  capture: {
    arm: (game) => ipcRenderer.invoke('capture:arm', game || null),
    take: () => ipcRenderer.invoke('capture:take'),
    list: (name) => ipcRenderer.invoke('capture:list', name),
    open: (name) => ipcRenderer.invoke('capture:open', name || ''),
    onTaken: (cb) => ipcRenderer.on('capture:taken', (_e, d) => cb(d)),
  },
  romm: {
    status: () => ipcRenderer.invoke('romm:status'),
    setSecret: (kind, value) => ipcRenderer.invoke('romm:setSecret', kind, value),
    test: () => ipcRenderer.invoke('romm:test'),
    download: (game) => ipcRenderer.invoke('romm:download', {
      system: game.system, rommId: game.rommId, rommFile: game.rommFile, rommMulti: game.rommMulti, rommNoExt: game.rommNoExt, size: game.size,
    }),
    cancel: () => ipcRenderer.invoke('romm:cancel'),
    deleteLocal: (game) => ipcRenderer.invoke('romm:deleteLocal', {
      path: game.path, system: game.system, rommId: game.rommId, rommFile: game.rommFile, rommMulti: game.rommMulti, rommNoExt: game.rommNoExt,
    }),
    onProgress: (cb) => ipcRenderer.on('romm:progress', (_e, p) => cb(p)),
  },
  achievements: {
    summary: () => ipcRenderer.invoke('achievements:summary'),
    game: (game) => ipcRenderer.invoke('achievements:game', game.path),
  },
  ra: {
    status: () => ipcRenderer.invoke('ra:status'),
    setKey: (value) => ipcRenderer.invoke('ra:setKey', value),
    summary: () => ipcRenderer.invoke('ra:summary'),
    game: (id) => ipcRenderer.invoke('ra:game', id),
  },
  apps: {
    add: () => ipcRenderer.invoke('apps:add'),
    remove: (id) => ipcRenderer.invoke('apps:remove', id),
    update: (id, changes) => ipcRenderer.invoke('apps:update', id, changes),
  },
  iidb: {
    fetch: (opts) => ipcRenderer.invoke('iidb:fetch', opts || {}),
    cancel: () => ipcRenderer.invoke('iidb:cancel'),
    onProgress: (cb) => ipcRenderer.on('iidb:progress', (_e, p) => cb(p)),
  },
  sgdb: {
    status: () => ipcRenderer.invoke('sgdb:status'),
    setKey: (value) => ipcRenderer.invoke('sgdb:setKey', value),
    fetch: () => ipcRenderer.invoke('sgdb:fetch'),
    cancel: () => ipcRenderer.invoke('sgdb:cancel'),
    onProgress: (cb) => ipcRenderer.on('sgdb:progress', (_e, p) => cb(p)),
  },
  launch: (game) => ipcRenderer.invoke('game:launch', { path: game.path, system: game.system }),
  quitGame: () => ipcRenderer.invoke('game:quit'),
  pickFolder: (title, defaultPath) => ipcRenderer.invoke('dialog:folder', title, defaultPath),
  pickFile: (title, defaultPath) => ipcRenderer.invoke('dialog:file', title, defaultPath),
  pickAudio: (title) => ipcRenderer.invoke('dialog:audio', title),
  pickImage: (title) => ipcRenderer.invoke('dialog:image', title),
  artOptions: (target) => ipcRenderer.invoke('art:options', target),
  iidbCollections: () => ipcRenderer.invoke('iidb:collections'),
  iidbGameIcons: (name) => ipcRenderer.invoke('iidb:gameIcons', name),
  listMusic: (dir) => ipcRenderer.invoke('music:list', dir),
  readSound: (file) => ipcRenderer.invoke('sound:read', file),
  quit: () => ipcRenderer.invoke('app:quit'),
  version: ipcRenderer.sendSync('app:version'),
  padLog: (msg) => ipcRenderer.send('pad:log', msg),
  weather: (city) => ipcRenderer.invoke('weather:get', city),
  media: (cmd) => ipcRenderer.invoke('media:ask', cmd || 'state'),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    notes: () => ipcRenderer.invoke('update:notes'),
    onState: (cb) => ipcRenderer.on('update:state', (_e, s) => cb(s)),
  },
  importConfig: () => ipcRenderer.invoke('config:import'),
  onNativePad: (cb) => ipcRenderer.on('pad:native', (_e, ev) => cb(ev)),
  mapper: {
    start: () => ipcRenderer.invoke('mapper:start'),
    send: (events) => ipcRenderer.send('mapper:send', events),
    stop: () => ipcRenderer.invoke('mapper:stop'),
  },
  openPlatformDir: () => ipcRenderer.invoke('app:openPlatformDir'),
  toggleFullscreen: () => ipcRenderer.invoke('app:fullscreen'),
  onGameExit: (cb) => ipcRenderer.on('game:exit', (_e, data) => cb(data)),
  fetchThumbnails: (systemId) => ipcRenderer.invoke('thumbs:fetch', systemId || null),
  cancelThumbnails: () => ipcRenderer.invoke('thumbs:cancel'),
  onThumbProgress: (cb) => ipcRenderer.on('thumbs:progress', (_e, data) => cb(data)),
  mediaUrl: (p) => {
    if (!p) return '';
    if (p.startsWith('romm-cover:')) return 'lumen-media://romm/?c=' + encodeURIComponent(p);
    if (p.startsWith('web-cover:')) return 'lumen-media://web/?u=' + encodeURIComponent(p.slice(10));
    return 'lumen-media://img/?p=' + encodeURIComponent(p);
  },
});
