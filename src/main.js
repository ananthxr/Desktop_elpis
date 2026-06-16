'use strict';
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

const TOGGLE_ACCEL = 'Control+Alt+C';   // global show/hide shortcut

let win = null;
let tray = null;
let paused = false;
let hidden = false;

// persisted settings (size / corner)
let SETTINGS_PATH = '';
const settings = { pixel: 4, corner: 'br' };
function loadSettings() {
  SETTINGS_PATH = path.join(app.getPath('userData'), 'pixel-cat-settings.json');
  try { Object.assign(settings, JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))); } catch (_) {}
}
function saveSettings() { try { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings)); } catch (_) {} }

// tray icon = the sitting frame (row 0, col 0) cropped from the sprite sheet
function makeTrayIcon() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'sheet.png'));
    const frame = img.crop({ x: 0, y: 0, width: 32, height: 32 });
    return frame.isEmpty() ? nativeImage.createEmpty() : frame;
  } catch (e) {
    console.error('tray icon failed:', e.message);
    return nativeImage.createEmpty();
  }
}

// ---------------------------------------------------------------------------
// overlay window
// ---------------------------------------------------------------------------
function currentArea() {
  const d = screen.getPrimaryDisplay();
  return { wa: d.workArea, scale: d.scaleFactor };
}

function createWindow() {
  const { wa } = currentArea();
  win = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: wa.height,
    transparent: true, frame: false, resizable: false, movable: false,
    skipTaskbar: true, hasShadow: false, focusable: false, fullscreenable: false,
    alwaysOnTop: true, backgroundColor: '#00000000', roundedCorners: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Keep the cat above newly-opened / fullscreen windows: re-assert topmost
  // periodically and whenever another app grabs focus. Some apps open as
  // topmost themselves and would otherwise cover the overlay.
  const reassertTop = () => {
    if (hidden || !win || win.isDestroyed()) return;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  };
  setInterval(reassertTop, 1000);
  app.on('browser-window-blur', reassertTop);
  app.on('browser-window-focus', reassertTop);

  win.webContents.on('console-message', (...args) => {
    let level, message;
    if (args[0] && typeof args[0] === 'object' && 'message' in args[0]) { level = args[0].level; message = args[0].message; }
    else { level = args[1]; message = args[2]; }
    if (level === undefined || level >= 1) console.log('[renderer]', message);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.error('[renderer gone]', d && d.reason));

  const pushInit = () => {
    if (!win || win.isDestroyed()) return;
    const { wa: a, scale } = currentArea();
    win.setBounds({ x: a.x, y: a.y, width: a.width, height: a.height });
    win.webContents.send('init', { originX: a.x, originY: a.y, width: a.width, height: a.height, scaleFactor: scale, pixel: settings.pixel, corner: settings.corner });
  };
  win.webContents.on('did-finish-load', pushInit);
  screen.on('display-metrics-changed', pushInit);
  screen.on('display-added', pushInit);
  screen.on('display-removed', pushInit);
}

function sendStimulus(type, data) {
  if (paused || !win || win.isDestroyed()) return;
  win.webContents.send('stimulus', { type, data });
}
// control messages (size/position/recenter) ignore the pause gate
function sendDirect(type, data) {
  if (win && !win.isDestroyed()) win.webContents.send('stimulus', { type, data });
}

let refreshTray = () => {};
function setHidden(v) {
  hidden = v;
  if (!win || win.isDestroyed()) return;
  if (hidden) {
    win.hide();
  } else {
    win.showInactive();                 // show without stealing focus
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  }
  refreshTray();
}
function toggleCat() { setHidden(!hidden); }

// ---------------------------------------------------------------------------
// global input hooks (uiohook-napi)
// ---------------------------------------------------------------------------
function startInputHooks() {
  let uIOhook, UiohookKey;
  try { ({ uIOhook, UiohookKey } = require('uiohook-napi')); }
  catch (e) { console.error('uiohook-napi unavailable - reactions disabled:', e.message); return; }

  const K = UiohookKey || {};
  const has = (...names) => names.map((n) => K[n]).filter((v) => v !== undefined);
  const NON_TYPING = new Set(has(
    'Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Shift', 'ShiftRight', 'Meta', 'MetaRight',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Escape', 'CapsLock', 'Tab', 'NumLock', 'ScrollLock', 'PrintScreen', 'Insert',
    'Home', 'End', 'PageUp', 'PageDown', 'Delete',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  ));
  const mods = { ctrl: false, alt: false, shift: false };

  let lastMove = 0;
  uIOhook.on('mousemove', (e) => {
    const now = Date.now();
    if (now - lastMove < 24) return;
    lastMove = now;
    sendStimulus('mousemove', { x: e.x, y: e.y });
  });
  uIOhook.on('mousedown', (e) => sendStimulus('mousedown', { x: e.x, y: e.y, button: e.button }));
  uIOhook.on('mouseup', (e) => sendStimulus('mouseup', { x: e.x, y: e.y, button: e.button }));
  uIOhook.on('wheel', (e) => sendStimulus('scroll', { rotation: e.rotation, dir: (e.rotation || 0) < 0 ? 'down' : 'up' }));

  uIOhook.on('keydown', (e) => {
    const kc = e.keycode;
    if (kc === K.Ctrl || kc === K.CtrlRight) mods.ctrl = true;
    if (kc === K.Alt || kc === K.AltRight) mods.alt = true;
    if (kc === K.Shift || kc === K.ShiftRight) mods.shift = true;

    if ((mods.alt && kc === K.F4) || (mods.ctrl && kc === K.W)) { sendStimulus('closewindow'); return; }
    if (!NON_TYPING.has(kc)) sendStimulus('type', {});
  });
  uIOhook.on('keyup', (e) => {
    const kc = e.keycode;
    if (kc === K.Ctrl || kc === K.CtrlRight) mods.ctrl = false;
    if (kc === K.Alt || kc === K.AltRight) mods.alt = false;
    if (kc === K.Shift || kc === K.ShiftRight) mods.shift = false;
  });

  try { uIOhook.start(); }
  catch (e) { console.error('uiohook start failed:', e.message); return; }
  app.on('will-quit', () => { try { uIOhook.stop(); } catch (_) {} });
}

// ---------------------------------------------------------------------------
// foreground-window watcher (email detection) - optional / guarded
// ---------------------------------------------------------------------------
const MAIL_OWNER = /outlook|thunderbird|mailbird|mailspring|postbox|em\s?client|spark|windowsmail|hxmail|^mail$/i;
const MAIL_TITLE = /\b(inbox|gmail|outlook|proton\s?mail|yahoo mail|webmail)\b|mail\.google|outlook\.(live|office)/i;
function startWindowWatcher() {
  let activeWin;
  try { activeWin = require('active-win'); }
  catch (e) { console.error('active-win unavailable - email detection off:', e.message); return; }
  let wasMail = false;
  setInterval(async () => {
    if (paused) return;
    try {
      const w = await activeWin();
      if (!w) return;
      const owner = (w.owner && w.owner.name) || '';
      const title = w.title || '';
      const isMail = MAIL_OWNER.test(owner) || MAIL_TITLE.test(title);
      if (isMail && !wasMail) sendStimulus('email');
      wasMail = isMail;
    } catch (_) { /* ignore transient failures */ }
  }, 1300);
}

// ---------------------------------------------------------------------------
// tray
// ---------------------------------------------------------------------------
function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('Pixel - your desktop cat');
  const rebuild = () => {
    const setSize = (px) => { settings.pixel = px; saveSettings(); sendDirect('setsize', { pixel: px }); rebuild(); };
    const setCorner = (c) => { settings.corner = c; saveSettings(); sendDirect('setcorner', { corner: c }); rebuild(); };
    const menu = Menu.buildFromTemplate([
      { label: 'Pixel the Desktop Cat', enabled: false },
      { type: 'separator' },
      { label: hidden ? 'Show cat' : 'Hide cat', accelerator: TOGGLE_ACCEL, click: () => toggleCat() },
      { label: paused ? 'Resume reactions' : 'Pause reactions', click: () => { paused = !paused; rebuild(); } },
      {
        label: 'Size', submenu: [
          { type: 'radio', label: 'Small', checked: settings.pixel === 3, click: () => setSize(3) },
          { type: 'radio', label: 'Medium', checked: settings.pixel === 4, click: () => setSize(4) },
          { type: 'radio', label: 'Large', checked: settings.pixel === 5, click: () => setSize(5) },
        ],
      },
      {
        label: 'Position', submenu: [
          { type: 'radio', label: 'Bottom right', checked: settings.corner === 'br', click: () => setCorner('br') },
          { type: 'radio', label: 'Bottom center', checked: settings.corner === 'bc', click: () => setCorner('bc') },
          { type: 'radio', label: 'Bottom left', checked: settings.corner === 'bl', click: () => setCorner('bl') },
        ],
      },
      { label: 'Bring cat to me (center)', click: () => sendDirect('recenter') },
      { type: 'checkbox', label: 'Start with Windows', checked: app.getLoginItemSettings().openAtLogin, click: (mi) => app.setLoginItemSettings({ openAtLogin: mi.checked }) },
      { type: 'separator' },
      { label: `Toggle cat:  ${TOGGLE_ACCEL}`, enabled: false },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
  };
  refreshTray = rebuild;
  rebuild();
  tray.on('click', () => { if (hidden) setHidden(false); else sendStimulus('poke'); });
}

// ---------------------------------------------------------------------------
// IPC from renderer
// ---------------------------------------------------------------------------
ipcMain.on('set-interactive', (_e, interactive) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!interactive, { forward: true });
});
ipcMain.on('cat-report', (_e, m) => console.log('[cat]', m));

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  // Another copy is already running. Our launch acts as a toggle: the primary
  // instance (below) will quit on the 'second-instance' event, so this second
  // process just exits and the net effect is the cat turning OFF.
  app.quit();
} else {
  // Launching the app again while it's running closes it (double-click = toggle).
  app.on('second-instance', () => { app.quit(); });
  app.whenReady().then(async () => {
    loadSettings();
    createWindow();
    createTray();
    startInputHooks();
    startWindowWatcher();
    const ok = globalShortcut.register(TOGGLE_ACCEL, toggleCat);
    if (!ok) console.error('Failed to register toggle shortcut', TOGGLE_ACCEL);
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { /* keep running in tray */ });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
