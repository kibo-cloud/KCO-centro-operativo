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

  const page = {
    cdp, errors, baseUrl,
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
