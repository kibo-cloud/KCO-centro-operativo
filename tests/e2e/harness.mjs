// Zero-dependency E2E harness: static server + headless Edge/Chrome over the
// Chrome DevTools Protocol (Node >= 22 ships a global WebSocket).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8'
};

export function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const BROWSERS = [
  process.env.KCO_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

function findBrowser() {
  for (const b of BROWSERS) { if (fs.existsSync(b)) return b; }
  throw new Error('No Chromium-based browser found. Set KCO_BROWSER.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchBrowser() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kco-e2e-'));
  const proc = spawn(findBrowser(), [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync', 'about:blank'
  ], { stdio: 'ignore' });
  const portFile = path.join(dir, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
  return {
    port,
    async close() {
      // Edge's launcher exits early and the real browser is re-parented, so a
      // plain kill leaks a whole process tree that keeps the ~450 MB profile
      // locked. Close the browser over CDP, then kill anything still holding
      // this run's unique profile directory.
      try {
        const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        const ws = new WebSocket(v.webSocketDebuggerUrl);
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
        ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
        await sleep(1500);
      } catch { /* already gone */ }
      try { proc.kill(); } catch { /* ignore */ }
      if (process.platform === 'win32') {
        const tag = path.basename(dir).replace(/'/g, '');
        spawnSync('powershell', ['-NoProfile', '-Command',
          `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${tag}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
          { stdio: 'ignore' });
      }
      for (let i = 0; i < 10; i++) {
        try { fs.rmSync(dir, { recursive: true, force: true }); break; } catch { await sleep(300); }
      }
      if (fs.existsSync(dir)) console.log('  warn: could not remove browser profile ' + dir);
    }
  };
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      } else if (msg.method) {
        for (const l of this.listeners) l(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  once(method, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting ' + method)), timeout);
      const l = (msg) => {
        if (msg.method !== method) return;
        clearTimeout(t);
        this.listeners = this.listeners.filter((x) => x !== l);
        resolve(msg.params);
      };
      this.listeners.push(l);
    });
  }
}

export async function openPage(browser, baseUrl) {
  const res = await fetch(`http://127.0.0.1:${browser.port}/json/new?about:blank`, { method: 'PUT' });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const cdp = new Cdp(ws);
  const errors = [];
  cdp.listeners.push((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon|ERR_INTERNET_DISCONNECTED/.test(m.params.entry.text)) errors.push(m.params.entry.text);
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('DOM.enable');

  // Per-spec CDP state that must not outlive the spec (see teardown()).
  const initScripts = [];
  const mediaEmulated = new Set();
  let focusEmulated = false;

  const page = {
    cdp, errors, baseUrl,
    // Injects a script before any page script on every next document of this page.
    async addInitScript(source) {
      const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
      initScripts.push(identifier);
      return identifier;
    },
    // Emulates CSS media features (e.g. prefers-color-scheme); applies live.
    async emulateMedia(features) {
      await cdp.send('Emulation.setEmulatedMedia', { features });
      for (const f of features) mediaEmulated.add(f.name);
    },
    // Headless pages are not focused, so focus/blur events do not fire; this makes them fire.
    async emulateFocus() {
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      focusEmulated = true;
    },
    // Undoes every per-spec override so nothing leaks into later specs, even if
    // a future runner reuses the target: init scripts, emulated media, focus emulation.
    async teardown() {
      while (initScripts.length) {
        const identifier = initScripts.pop();
        try { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }); } catch { /* target gone */ }
      }
      // An empty features list does not clear a feature: each one is reset to ''.
      if (mediaEmulated.size) {
        const features = [...mediaEmulated].map((name) => ({ name, value: '' }));
        try { await cdp.send('Emulation.setEmulatedMedia', { media: '', features }); } catch { /* target gone */ }
        mediaEmulated.clear();
      }
      if (focusEmulated) {
        try { await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }); } catch { /* target gone */ }
        focusEmulated = false;
      }
    },
    pendingInitScripts() { return initScripts.length; },
    async viewport(width, height, mobile = true) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    },
    async goto(p = '/') {
      const loaded = cdp.once('Page.loadEventFired');
      loaded.catch(() => {});
      await cdp.send('Page.navigate', { url: baseUrl + p });
      await loaded;
      await sleep(150);
    },
    async reload() {
      const loaded = cdp.once('Page.loadEventFired');
      loaded.catch(() => {});
      await cdp.send('Page.reload', { ignoreCache: false });
      await loaded;
      await sleep(150);
    },
    async eval(expr) {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n' + expr);
      return r.result.value;
    },
    async click(sel) {
      const ok = await page.eval(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.click();return true;})()`);
      if (!ok) throw new Error('click: not found ' + sel);
      await sleep(60);
    },
    async clickText(sel, text) {
      const ok = await page.eval(`(function(){var l=document.querySelectorAll(${JSON.stringify(sel)});for(var i=0;i<l.length;i++){if(l[i].textContent.indexOf(${JSON.stringify(text)})>-1&&l[i].offsetParent!==null){l[i].click();return true;}}return false;})()`);
      if (!ok) throw new Error(`clickText: "${text}" not found in ${sel}`);
      await sleep(60);
    },
    async type(sel, value, enter = false) {
      await page.eval(`(function(){var e=document.querySelector(${JSON.stringify(sel)});e.focus();e.value=${JSON.stringify(value)};
        e.dispatchEvent(new Event('input',{bubbles:true}));
        ${enter ? "e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));" : ''}
        e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await sleep(60);
    },
    text(sel) { return page.eval(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return e?e.textContent:null;})()`); },
    count(sel) { return page.eval(`document.querySelectorAll(${JSON.stringify(sel)}).length`); },
    visible(sel) { return page.eval(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return !!(e&&e.offsetParent!==null);})()`); },
    // Real key press through CDP (default actions and keydown listeners run), e.g. 'Escape', 'Tab'.
    async key(name, { shift = false } = {}) {
      const codes = { Escape: 27, Tab: 9, Enter: 13 };
      const base = { key: name, code: name, windowsVirtualKeyCode: codes[name] || 0, modifiers: shift ? 8 : 0 };
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(60);
    },
    // Real printable key press through CDP (keydown listeners run; the character is
    // inserted into the focused field unless a listener prevents it), e.g. 'n', '/'.
    async press(ch) {
      const vk = ch === '/' ? 191 : ch.toUpperCase().charCodeAt(0);
      const base = { key: ch, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk };
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, windowsVirtualKeyCode: vk });
      await sleep(60);
    },
    // Touch tap at viewport coordinates (needs a mobile viewport: touch emulation on).
    async tap(x, y) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(120);
    },
    // Touch drag from (x0,y0) to (x1,y1) in small steps, like a finger (pointer + touch events).
    async drag(x0, y0, x1, y1, steps = 8) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
      for (let i = 1; i <= steps; i++) {
        const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        await sleep(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(120);
    },
    // Bounding box of the first match, or null.
    rect(sel) { return page.eval(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var r=e.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height,b:r.bottom,r:r.right};})()`); },
    storage(key) { return page.eval(`localStorage.getItem(${JSON.stringify(key)})`); },
    async setStorage(obj) {
      await page.eval(`(function(){localStorage.clear();var o=${JSON.stringify(obj)};for(var k in o){localStorage.setItem(k,o[k]);}})()`);
    },
    async screenshot(file) {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    async offline(on) {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    },
    async setFile(sel, file) {
      const doc = await cdp.send('DOM.getDocument');
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel });
      await cdp.send('DOM.setFileInputFiles', { nodeId, files: [file] });
      await sleep(300);
    },
    async close() { try { ws.close(); } catch { /* ignore */ } }
  };
  return page;
}

export { sleep, ROOT };
