// End-to-end specs. Each test starts on a fresh page with the given localStorage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { sleep, ROOT } from './harness.mjs';

const OUT = path.join(ROOT, 'tests', 'e2e', 'out');
const items = async (page) => JSON.parse((await page.storage('kibco.items')) || '[]');
const events = async (page) => JSON.parse((await page.storage('kibco.eventos')) || '[]');

async function capture(page, text) {
  await page.type('#txtCaptura', text, true);
}

// Emulates the OS color scheme (prefers-color-scheme) for the page; applies live.
async function scheme(page, value) {
  await page.emulateMedia([{ name: 'prefers-color-scheme', value }]);
  await sleep(60);
}
const cssVar = (page, el, n) => page.eval(`getComputedStyle(${el}).getPropertyValue(${JSON.stringify(n)}).trim()`);
const themeColors = (page) => page.eval("Array.prototype.map.call(document.querySelectorAll('meta[name=\"theme-color\"]'),function(m){return m.getAttribute('content');})");

// Bottom tab bar probe: every tab fully on screen with a 44px target, no inner scroll.
const TABS_PROBE = `(function(){var n=document.querySelector('.tabs'),t=n.querySelectorAll('.tab'),w=window.innerWidth,bad=[],r=n.getBoundingClientRect();
  for(var i=0;i<t.length;i++){var b=t[i].getBoundingClientRect();if(b.left<0||b.right>w+0.5||b.height<44||b.width<44||t[i].scrollWidth>t[i].clientWidth)bad.push(t[i].id);}
  return {n:t.length,bad:bad,over:n.scrollWidth>n.clientWidth,fixed:getComputedStyle(n).position==='fixed',bottom:r.bottom,h:window.innerHeight};})()`;

async function toTasks(page) {
  await page.click('#tabTareas');
  await page.click('#segBtnTareas');
}

const CORRUPT_PROGRESO_SEED = (() => {
  const list = [];
  for (let i = 0; i < 8; i++) list.push({ id: 'x' + i, texto: 'vieja ' + i, contexto: 'trabajo', tipo: 'tarea', estado: 'completado', nivel: 'importante',
    creado: new Date(Date.now() - 86400000 * (i + 3)).toISOString(), estadoDesde: new Date(Date.now() - 86400000 * (i + 2)).toISOString() });
  return { 'kibco.esquema': '4', 'kibco.items': JSON.stringify(list), 'kibco.progreso': '{roto', 'kibco.eventos': '[]' };
})();

export const tests = [
  {
    name: 'boot: renders without errors',
    async fn(page) {
      assert.match(await page.eval('document.title'), /KCO/);
      assert.equal(await page.storage('kibco.esquema'), '4');
    }
  },
  {
    name: 'boot: kco.css is loaded and the design tokens resolve',
    async fn(page) {
      assert.ok(await page.eval("Array.prototype.some.call(document.styleSheets,function(s){return /\\/kco\\.css$/.test(s.href||'');})"), 'kco.css stylesheet loaded');
      const tok = (n) => page.eval(`getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(n)}).trim()`);
      assert.equal(await tok('--sp-4'), '16px');
      assert.equal(await tok('--tap'), '44px');
      assert.equal(await tok('--fs-xs'), '12px');
      // Rules use the tokens: dark background; the focus ring follows the context accent.
      await scheme(page, 'dark');
      assert.equal(await page.eval('getComputedStyle(document.body).backgroundColor'), 'rgb(13, 15, 18)');
      await page.eval("document.body.className='ctx-apps'");
      assert.equal((await page.eval("getComputedStyle(document.body).getPropertyValue('--focus').trim()")).toUpperCase(), '#A78BFA');
    }
  },
  {
    name: 'core: capture persists and survives reload',
    async fn(page) {
      await capture(page, 'cambiar rodamiento cinta 3');
      let list = await items(page);
      assert.equal(list.length, 1);
      assert.equal(list[0].texto, 'cambiar rodamiento cinta 3');
      assert.equal(list[0].estado, 'entrada');
      await page.reload();
      list = await items(page);
      assert.equal(list.length, 1);
      assert.equal((await events(page))[0].tipo, 'captura');
    }
  },
  {
    name: 'core: capture detects @time as reminder',
    async fn(page) {
      await capture(page, 'llamar proveedor @9:30');
      const [it] = await items(page);
      assert.equal(it.texto, 'llamar proveedor');
      assert.ok(it.recordatorio, 'reminder set');
      assert.equal(new Date(it.recordatorio).getMinutes(), 30);
    }
  },
  {
    name: 'core: complete from card, undo restores',
    async fn(page) {
      await capture(page, 'tarea a completar');
      await toTasks(page);
      await page.click('[data-acc="listo"]');
      assert.equal((await items(page))[0].estado, 'completado');
      await page.click('#btnDeshacer');
      assert.equal((await items(page))[0].estado, 'entrada');
    }
  },
  {
    name: 'core: reopen a completed task from the sheet',
    async fn(page) {
      await capture(page, 'reabrir esto');
      await toTasks(page);
      await page.click('[data-acc="listo"]');
      await page.eval("(function(){var it=JSON.parse(localStorage.getItem('kibco.items'))[0];return it.id;})()");
      await openFirstItem(page, 'completado');
      await page.click('#gridEstados [data-estado="pendiente"]');
      assert.equal((await items(page))[0].estado, 'pendiente');
    }
  },
  {
    name: 'core: edit the title in place at the top of the sheet; Enter saves, logs edicion and undo restores',
    async fn(page) {
      await capture(page, 'texto viejo');
      await openFirstItem(page);
      assert.equal(await page.eval("document.getElementById('txtTituloItem').value"), 'texto viejo');
      await page.type('#txtTituloItem', 'texto nuevo', true);
      assert.equal((await items(page))[0].texto, 'texto nuevo');
      const ev = (await events(page)).filter((e) => e.tipo === 'edicion');
      assert.equal(ev.length, 1);
      assert.equal(ev[0].desde, 'texto viejo');
      assert.equal(ev[0].hasta, 'texto nuevo');
      assert.match(await page.text('#lista'), /texto nuevo/, 'the card updates');
      await page.click('#btnDeshacer');
      assert.equal((await items(page))[0].texto, 'texto viejo');
      assert.equal(await page.eval("document.getElementById('txtTituloItem').value"), 'texto viejo');
      // Blur also saves; an empty title is refused and the field shows the saved text again.
      await page.eval("(function(){var t=document.getElementById('txtTituloItem');t.value='por blur';t.dispatchEvent(new Event('blur'));})()");
      assert.equal((await items(page))[0].texto, 'por blur');
      await page.eval("(function(){var t=document.getElementById('txtTituloItem');t.value='   ';t.dispatchEvent(new Event('blur'));})()");
      assert.equal((await items(page))[0].texto, 'por blur');
      assert.equal(await page.eval("document.getElementById('txtTituloItem').value"), 'por blur');
    }
  },
  {
    name: 'core: delete with confirmation, undo brings it back',
    async fn(page) {
      await capture(page, 'borrame');
      await openFirstItem(page);
      await page.click('#btnBorrar');
      await page.click('#btnConfSi');
      assert.equal((await items(page)).length, 0);
      await page.click('#btnDeshacer');
      assert.equal((await items(page)).length, 1);
    }
  },
  {
    name: 'core: move to purchases starts factory flow in Trabajo',
    async fn(page) {
      await capture(page, 'rodamiento 6204');
      await toTasks(page);
      await openQuickMenu(page, '#lista li.item');
      await page.click('#tapaRapido [data-rap="compras"]');
      assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa', 'the menu closes');
      const [it] = await items(page);
      assert.equal(it.tipo, 'compra');
      assert.equal(it.estado, 'cotizando');
    }
  },
  {
    name: 'data: schema 3 migration maps Hogar purchases to the simple list',
    storage: {
      'kibco.esquema': '3',
      'kibco.items': JSON.stringify([
        { id: 'a1', texto: 'detergente', contexto: 'hogar', tipo: 'compra', estado: 'esperando_oc', creado: '2026-01-01T10:00:00.000Z' },
        { id: 'a2', texto: 'filtro', contexto: 'trabajo', tipo: 'compra', estado: 'esperando_oc', creado: '2026-01-01T10:00:00.000Z' }
      ]),
      'kibco.eventos': '[]'
    },
    async fn(page) {
      const list = await items(page);
      assert.equal(list.find((i) => i.id === 'a1').estado, 'por_comprar');
      assert.equal(list.find((i) => i.id === 'a2').estado, 'esperando_oc');
      assert.equal(await page.storage('kibco.esquema'), '4');
      assert.ok((await events(page)).some((e) => e.tipo === 'migracion'));
    }
  },
  {
    name: 'data: corrupt list is quarantined and app goes read-only',
    storage: { 'kibco.esquema': '4', 'kibco.items': '{not json' },
    async fn(page) {
      const keys = await page.eval('Object.keys(localStorage)');
      assert.ok(keys.some((k) => k.indexOf('kibco.items.roto.') === 0), 'quarantine copy');
      assert.ok(await page.visible('#aviso'));
      await capture(page, 'no deberia guardarse');
      assert.equal(await page.storage('kibco.items'), '{not json');
    }
  },
  {
    name: 'data: newer schema is never overwritten',
    storage: { 'kibco.esquema': '99', 'kibco.items': '[]' },
    async fn(page) {
      await capture(page, 'nada');
      assert.equal(await page.storage('kibco.items'), '[]');
      assert.equal(await page.storage('kibco.esquema'), '99');
    }
  },
  {
    name: 'backup: text export + file restore round-trip',
    async fn(page) {
      await capture(page, 'item uno');
      await capture(page, 'item dos');
      await page.click('#btnAjustes');
      await page.click('#btnBackupTexto');
      const json = await page.eval("document.getElementById('txtSalida').value");
      const data = JSON.parse(json);
      assert.equal(data.app, 'kco');
      assert.equal(data.schema, 4);
      assert.equal(data.items.length, 2);
      const file = path.join(os.tmpdir(), 'kco-e2e-backup.json');
      fs.writeFileSync(file, json);
      await page.eval("localStorage.setItem('kibco.items','[]')");
      await page.reload();
      assert.equal((await items(page)).length, 0);
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      assert.equal((await items(page)).length, 2);
      assert.ok((await events(page)).some((e) => e.tipo === 'restauracion'));
    }
  },
  {
    name: 'backup: foreign app backup is rejected',
    async fn(page) {
      await capture(page, 'mio');
      const file = path.join(os.tmpdir(), 'kco-e2e-foreign.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kibo', schema: 1, items: [] }));
      await page.setFile('#archivoImport', file);
      assert.match(await page.text('#aviso'), /otra app/);
      assert.equal((await items(page)).length, 1);
    }
  },
  {
    name: 'backup: restore is refused while stored data is from a newer schema',
    storage: { 'kibco.esquema': '99', 'kibco.items': JSON.stringify([{ id: 'f1', texto: 'del futuro', estado: 'pendiente' }]) },
    async fn(page) {
      const before = await page.storage('kibco.items');
      const file = path.join(os.tmpdir(), 'kco-e2e-newer.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 4, items: [] }));
      await page.setFile('#archivoImport', file);
      assert.match(await page.text('#aviso'), /mas nueva/);
      // Even if a confirmation slipped through, accepting it must not change anything.
      await page.eval("(function(){var b=document.getElementById('btnConfSi');if(b&&b.offsetParent!==null){b.click();}})()");
      await sleep(100);
      assert.equal(await page.storage('kibco.items'), before);
      assert.equal(await page.storage('kibco.esquema'), '99');
    }
  },
  {
    name: 'backup: a hostile logros key neither throws nor half-restores',
    storage: { 'kibco.esquema': '4', 'kibco.items': JSON.stringify([{ id: 'v1', texto: 'viejo', estado: 'pendiente', creado: new Date().toISOString() }]) },
    async fn(page) {
      const file = path.join(os.tmpdir(), 'kco-e2e-hostil.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 4, items: [{ id: 'n1', texto: 'nuevo', estado: 'pendiente', creado: new Date().toISOString() }],
        progreso: { nivelVisto: 1, logros: { hasOwnProperty: 'x', primer_paso: '2026-01-01T10:00:00.000Z' } } }));
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      const list = await items(page);
      assert.equal(list.length, 1);
      assert.equal(list[0].texto, 'nuevo');
      const prog = JSON.parse(await page.storage('kibco.progreso'));
      assert.ok(prog.logros.primer_paso);
      assert.ok(!Object.prototype.hasOwnProperty.call(prog.logros, 'hasOwnProperty'));
    }
  },
  {
    name: 'backup: a failed write rolls the whole restore back',
    storage: { 'kibco.esquema': '4', 'kibco.items': JSON.stringify([{ id: 'v1', texto: 'viejo', estado: 'pendiente', creado: new Date().toISOString() }]), 'kibco.eventos': '[]' },
    async fn(page) {
      const beforeItems = await page.storage('kibco.items');
      const beforeEvents = await page.storage('kibco.eventos');
      const file = path.join(os.tmpdir(), 'kco-e2e-falla.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 4, items: [{ id: 'n1', texto: 'nuevo', estado: 'pendiente', creado: new Date().toISOString() }], proyectos: [] }));
      await page.eval("(function(){var o=Storage.prototype.setItem;window.__setItem=o;Storage.prototype.setItem=function(k,v){if(k==='kibco.proyectos'){throw new Error('quota');}return o.call(this,k,v);};})()");
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      assert.match(await page.text('#aviso'), /No se pudo restaurar/);
      assert.equal(await page.storage('kibco.items'), beforeItems);
      assert.equal(await page.storage('kibco.eventos'), beforeEvents);
      await page.eval('Storage.prototype.setItem=window.__setItem');
      await capture(page, 'despues');
      assert.deepEqual((await items(page)).map((i) => i.texto).sort(), ['despues', 'viejo'], 'memory rolled back too');
    }
  },
  {
    name: 'backup: a pre-2.0 backup (no progreso) is re-seeded silently',
    async fn(page) {
      const list = [];
      for (let i = 0; i < 8; i++) list.push({ id: 'x' + i, texto: 'vieja ' + i, contexto: 'trabajo', tipo: 'tarea', estado: 'completado', nivel: 'importante',
        creado: new Date(Date.now() - 86400000 * (i + 3)).toISOString(), estadoDesde: new Date(Date.now() - 86400000 * (i + 2)).toISOString() });
      const file = path.join(os.tmpdir(), 'kco-e2e-pre2.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 4, items: list, eventos: [] }));
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      const prog = JSON.parse(await page.storage('kibco.progreso'));
      assert.equal(prog.nivelVisto, 2);
      assert.ok(prog.logros.primer_paso);
      await capture(page, 'nueva despues del restore');
      await page.click('.hero [data-hero="hecho"]');
      const evs = await events(page);
      assert.ok(evs.some((e) => e.tipo === 'completado' || e.hasta === 'completado'), 'the completion happened');
      assert.ok(!evs.some((e) => e.tipo === 'logro' || e.tipo === 'nivel'), 'no fake achievement or level events');
    }
  },
  {
    name: 'data: corrupt progreso is quarantined and re-seeded without announcements',
    storage: (() => {
      const list = [];
      for (let i = 0; i < 8; i++) list.push({ id: 'x' + i, texto: 'vieja ' + i, contexto: 'trabajo', tipo: 'tarea', estado: 'completado', nivel: 'importante',
        creado: new Date(Date.now() - 86400000 * (i + 3)).toISOString(), estadoDesde: new Date(Date.now() - 86400000 * (i + 2)).toISOString() });
      return { 'kibco.esquema': '4', 'kibco.items': JSON.stringify(list), 'kibco.progreso': '{roto' };
    })(),
    async fn(page) {
      const keys = await page.eval('Object.keys(localStorage)');
      const copies = keys.filter((k) => k.indexOf('kibco.progreso.roto.') === 0);
      assert.equal(copies.length, 1, 'one quarantine copy');
      assert.equal(await page.storage(copies[0]), '{roto');
      assert.equal(JSON.parse(await page.storage('kibco.progreso')).nivelVisto, 2);
      assert.ok(!(await events(page)).some((e) => e.tipo === 'logro' || e.tipo === 'nivel'), 'nothing announced');
      await capture(page, 'sigue escribiendo');
      assert.ok((await items(page)).some((i) => i.texto === 'sigue escribiendo'), 'not read-only');
    }
  },
  {
    name: 'data: the same corrupt value is quarantined only once',
    storage: { 'kibco.esquema': '4', 'kibco.items': '{not json' },
    async fn(page) {
      await page.reload();
      await page.reload();
      const keys = await page.eval('Object.keys(localStorage)');
      assert.equal(keys.filter((k) => k.indexOf('kibco.items.roto.') === 0).length, 1);
    }
  },
  {
    name: 'data: catalogs are not written while read-only',
    storage: { 'kibco.esquema': '4', 'kibco.items': '{not json' },
    async fn(page) {
      await page.click('#btnAjustes');
      await page.type('#txtNuevoSolic', 'Mantenimiento');
      await page.click('#btnSumarSolic');
      assert.equal(await page.storage('kibco.solicitantes'), null);
    }
  },
  {
    name: 'security: user text is never parsed as HTML',
    async fn(page) {
      await capture(page, '<img src=x onerror="window.__pwned=1">');
      await sleep(200);
      assert.equal(await page.eval('window.__pwned || 0'), 0);
      assert.equal(await page.count('li.item img'), 0);
    }
  },
  {
    name: 'pwa: service worker caches the shell and the app boots offline',
    keepStorage: true,
    allowErrors: ['Failed to load resource', 'ERR_INTERNET_DISCONNECTED'],
    async fn(page) {
      await page.eval('navigator.serviceWorker.ready.then(function(){return true;})');
      await page.reload();
      assert.ok(await page.eval('!!navigator.serviceWorker.controller'), 'page controlled by SW');
      await page.offline(true);
      await page.reload();
      assert.match(await page.eval('document.title'), /KCO/);
      assert.ok(await page.visible('#txtCaptura'));
      // The stylesheet came from the cache too: tokens resolve and rules apply offline.
      assert.equal(await page.eval("getComputedStyle(document.documentElement).getPropertyValue('--sp-4').trim()"), '16px');
      assert.equal(await page.eval("getComputedStyle(document.querySelector('.captura')).position"), 'fixed');
      assert.ok(await page.eval("caches.match('./kco.css').then(function(r){return !!r;})"), 'kco.css is precached');
      await page.offline(false);
    }
  },
  {
    name: 'model: capture understands #context, !! and a trailing day word',
    async fn(page) {
      await capture(page, 'editar video intro #contenido !! mañana');
      const [it] = await items(page);
      assert.equal(it.texto, 'editar video intro');
      assert.equal(it.contexto, 'contenido');
      assert.equal(it.nivel, 'urgente');
      assert.equal(it.prioridad, true, 'legacy flag mirrors urgent');
      assert.match(it.fecha, /^\d{4}-\d{2}-\d{2}$/);
    }
  },
  {
    name: 'model: legacy item without new fields reads with fallbacks',
    storage: {
      'kibco.esquema': '4',
      'kibco.items': JSON.stringify([{ id: 'old1', texto: 'viejo', contexto: 'trabajo', tipo: 'tarea', estado: 'pendiente', prioridad: true, creado: '2026-01-01T10:00:00.000Z' }])
    },
    async fn(page) {
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"trabajo\"]').click()");
      await toTasks(page);
      await page.click('#lista li.item');
      assert.ok(await page.eval("document.querySelector('#gridNivel [data-nivel=\"urgente\"]').className.indexOf('on')>-1"));
      await page.click('#gridNivel [data-nivel="baja"]');
      const [it] = await items(page);
      assert.equal(it.nivel, 'baja');
      assert.equal(it.prioridad, false);
      assert.equal(it.fecha, '');
    }
  },
  {
    name: 'model: moving a factory purchase to Casa maps the state and drops the pause',
    async fn(page) {
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"trabajo\"]').click()");
      await capture(page, 'tornillos');
      await openFirstItem(page);
      await page.click('#btnAcompra');
      await page.eval(`(function(){var l=JSON.parse(localStorage.getItem('kibco.items'));l[0].estado='oc_enviada';l[0].pausado=true;localStorage.setItem('kibco.items',JSON.stringify(l));})()`);
      await page.reload();
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"todo\"]').click()");
      await page.click('#tabTareas');
      await page.click('#segBtnCompras');
      await page.click('#listaCompras li.item');
      await page.click('#gridCtx [data-ctx="hogar"]');
      const [it] = await items(page);
      assert.equal(it.contexto, 'hogar');
      assert.equal(it.estado, 'por_comprar');
      assert.equal(it.pausado, false);
      await page.click('#btnDeshacer');
      const [back] = await items(page);
      assert.equal(back.contexto, 'trabajo');
      assert.equal(back.estado, 'oc_enviada');
    }
  },
  {
    name: 'model: Todo shows every context, capture goes to the last real context',
    async fn(page) {
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"personal\"]').click()");
      await capture(page, 'entrenar');
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"trabajo\"]').click()");
      await capture(page, 'informe');
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"todo\"]').click()");
      await capture(page, 'otra');
      const list = await items(page);
      assert.equal(list.find((i) => i.texto === 'otra').contexto, 'trabajo');
      await toTasks(page);
      assert.equal(await page.count('#lista li.item'), 3);
    }
  },
  {
    name: 'ahora: the next move is the overdue urgent item, with its reason',
    storage: seed(),
    async fn(page) {
      assert.equal(await page.text('.hero .hero-txt'), 'Enviar presupuesto bomba');
      assert.match(await page.text('.hero .hero-meta'), /Vencida/);
      assert.ok(await page.count('#secInbox li.item') >= 1);
      await page.screenshot(path.join(OUT, 'ahora.png'));
    }
  },
  {
    name: 'ahora: hero Done completes it and the next one takes its place',
    storage: seed(),
    async fn(page) {
      await page.click('.hero [data-hero="hecho"]');
      const it = (await items(page)).find((i) => i.texto === 'Enviar presupuesto bomba');
      assert.equal(it.estado, 'completado');
      assert.notEqual(await page.text('.hero .hero-txt'), 'Enviar presupuesto bomba');
    }
  },
  {
    name: 'ahora: "Mañana" postpones without losing it, undo restores',
    storage: seed(),
    async fn(page) {
      const before = await page.text('.hero .hero-txt');
      await page.click('.hero [data-hero="manana"]');
      const it = (await items(page)).find((i) => i.texto === before);
      assert.equal(it.fecha, ymd(1));
      await page.click('#btnDeshacer');
      const back = (await items(page)).find((i) => i.texto === before);
      assert.equal(back.fecha, ymd(-1));
    }
  },
  {
    name: 'ahora: inbox triage moves an item out of the inbox in one tap',
    storage: seed(),
    async fn(page) {
      const n = await page.count('#secInbox li.item');
      await page.click('#secInbox [data-acc="parahoy"]');
      assert.equal(await page.count('#secInbox li.item'), n - 1);
      const list = await items(page);
      assert.equal(list.filter((i) => ['comprar lija', 'idea: modo foco'].includes(i.texto) && i.estado === 'pendiente' && i.fecha === ymd(0)).length, 1);
    }
  },
  {
    name: 'hoy: today, overdue and upcoming days are grouped',
    storage: seed(),
    async fn(page) {
      await page.click('#tabHoy');
      assert.ok(await page.visible('#secVencidas'));
      assert.ok(await page.visible('#secParaHoy'));
      assert.ok(await page.visible('#dia-' + ymd(2)));
      assert.match(await page.text('#dia-' + ymd(2)), /Grabar video/);
      await page.screenshot(path.join(OUT, 'hoy.png'));
    }
  },
  {
    name: 'recurring: create a daily routine, today occurrence appears once',
    async fn(page) {
      await page.click('#tabHoy');
      await page.click('#btnRutinas');
      await page.click('#btnNuevaRutina');
      await page.type('#txtRutina', 'Dar de comer a la gata');
      await page.click('#gridFrec [data-frec="diaria"]');
      await page.click('#gridRutCtx [data-ctx="hogar"]');
      await page.click('#btnGuardarRutina');
      const defs = JSON.parse(await page.storage('kibco.rutinas'));
      assert.equal(defs.length, 1);
      let occ = (await items(page)).filter((i) => i.rutinaId === defs[0].id);
      assert.equal(occ.length, 1);
      assert.equal(occ[0].ocurrencia, ymd(0));
      assert.equal(occ[0].estado, 'pendiente');
      assert.equal(occ[0].contexto, 'hogar');
      await page.reload();
      occ = (await items(page)).filter((i) => i.rutinaId === defs[0].id);
      assert.equal(occ.length, 1, 'idempotent across reloads');
      await page.click('#tabHoy');
      assert.match(await page.text('#secRutinasHoy'), /gata/);
    }
  },
  {
    name: 'recurring: completing keeps history; next day is a new record and the streak grows',
    storage: rutinaSeed([[-3, 'completado'], [-2, 'completado'], [-1, 'completado']]),
    async fn(page) {
      const list = await items(page);
      const today = list.filter((i) => i.rutinaId === 'rgata' && i.ocurrencia === ymd(0));
      assert.equal(today.length, 1, 'today generated as a separate item');
      assert.equal(list.filter((i) => i.rutinaId === 'rgata').length, 4, 'history preserved');
      await page.click('#tabHoy');
      assert.match(await page.text('#secRutinasHoy'), /3 seguidas/);
      await page.click('#secRutinasHoy [data-acc="listo"]');
      await page.click('#tabHoy');
      assert.match(await page.text('#secRutinasHoy'), /4 seguidas/);
      assert.match(await page.text('#secRutinasHoy'), /1\/1/);
    }
  },
  {
    name: 'recurring: an occurrence left open overnight closes as unrecorded, never piles up',
    storage: rutinaSeed([[-5, 'completado'], [-1, 'pendiente']]),
    async fn(page) {
      const list = (await items(page)).filter((i) => i.rutinaId === 'rgata');
      const ayer = list.find((i) => i.ocurrencia === ymd(-1));
      assert.equal(ayer.estado, 'cancelado');
      assert.equal(ayer.motivo, 'vencida');
      assert.equal(list.filter((i) => i.estado === 'pendiente').length, 1, 'only today is open');
      assert.equal(list.length, 3, 'no backlog for the days the app was closed');
    }
  },
  {
    name: 'recurring: "no tocaba" exception keeps the streak; undo restores',
    storage: rutinaSeed([[-2, 'completado'], [-1, 'completado']]),
    async fn(page) {
      await page.click('#tabHoy');
      await page.click('#secRutinasHoy li.item');
      assert.ok(await page.visible('#cajaOcurrencia'));
      await page.click('#btnEx_no_corresponde');
      let t = (await items(page)).find((i) => i.ocurrencia === ymd(0));
      assert.equal(t.estado, 'cancelado');
      assert.equal(t.motivo, 'no_corresponde');
      await page.click('#tapaItem .hoja-x');
      await page.click('#tabHoy');
      assert.match(await page.text('#secRutinasHoy'), /2 seguidas/);
      await page.click('#btnDeshacer');
      t = (await items(page)).find((i) => i.ocurrencia === ymd(0));
      assert.equal(t.estado, 'pendiente');
      assert.equal(t.motivo, '');
    }
  },
  {
    name: 'recurring: upcoming days preview future occurrences without creating them',
    storage: rutinaSeed([], { tipo: 'semana', dias: [new Date(Date.now() + 2 * 86400000).getDay()] }),
    async fn(page) {
      await page.click('#tabHoy');
      assert.ok(await page.count('#dia-' + ymd(2) + ' li.prevista') === 1);
      assert.equal((await items(page)).filter((i) => i.rutinaId === 'rgata' && i.ocurrencia >= ymd(1)).length, 0);
    }
  },
  {
    name: 'recurring: "hacer recurrente" turns the task into today\'s occurrence (no duplicate)',
    async fn(page) {
      await capture(page, 'regar plantas');
      await openFirstItem(page);
      await page.click('#btnHacerRutina');
      await page.click('#btnGuardarRutina');
      const list = await items(page);
      assert.equal(list.length, 1);
      assert.ok(list[0].rutinaId);
      assert.equal(list[0].ocurrencia, ymd(0));
    }
  },
  {
    name: 'recurring: routines travel in the backup and come back on restore',
    storage: rutinaSeed([[-1, 'completado']]),
    async fn(page) {
      await page.click('#btnAjustes');
      await page.click('#btnBackupTexto');
      const json = await page.eval("document.getElementById('txtSalida').value");
      assert.equal(JSON.parse(json).rutinas.length, 1);
      const file = path.join(os.tmpdir(), 'kco-e2e-rutinas.json');
      fs.writeFileSync(file, json);
      await page.eval("localStorage.setItem('kibco.rutinas','[]');localStorage.setItem('kibco.items','[]')");
      await page.reload();
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      assert.equal(JSON.parse(await page.storage('kibco.rutinas')).length, 1);
      assert.equal((await items(page)).filter((i) => i.rutinaId === 'rgata').length, 2);
    }
  },
  {
    name: 'missions: create, add milestones and tasks, next action is concrete',
    async fn(page) {
      await page.click('#tabMisiones');
      await page.click('#btnNuevaMision');
      await page.type('#txtMisNombre', 'TU GASTO - ALFA');
      await page.type('#txtMisObjetivo', 'Primera version usable');
      await page.click('#gridMisCtx [data-ctx="apps"]');
      await page.click('#btnGuardarMision');
      for (const h of ['Auditoria', 'QA', 'Preparar release']) {
        await page.type('#txtHito', h, true);
      }
      await page.type('#txtMisTarea', 'Revisar resultado del audit', true);
      const [p] = JSON.parse(await page.storage('kibco.proyectos'));
      assert.equal(p.hitos.length, 3);
      assert.equal(p.contexto, 'apps');
      const t = (await items(page)).find((i) => i.proyectoId === p.id);
      assert.equal(t.texto, 'Revisar resultado del audit');
      assert.match(await page.text('#misProxima'), /Revisar resultado del audit/);
      await page.click('#misHitos [data-hito="' + p.hitos[0].id + '"]');
      assert.equal(await page.text('#misPctTxt'), '33%');
      await page.screenshot(path.join(OUT, 'mision.png'));
      await page.click('#misProxima [data-mis="hecho"]');
      assert.equal((await items(page)).find((i) => i.id === t.id).estado, 'completado');
      assert.match(await page.text('#misProxima'), /Hito: QA/, 'falls back to next milestone');
      assert.ok((await events(page)).some((e) => e.tipo === 'hito'));
    }
  },
  {
    name: 'missions: link a task from its sheet; AHORA shows the mission next move',
    storage: misionSeed(),
    async fn(page) {
      await capture(page, 'Escribir changelog');
      await openFirstItem(page);
      await page.click('#gridMision [data-mision="pkco"]');
      assert.equal((await items(page)).find((i) => i.texto === 'Escribir changelog').proyectoId, 'pkco');
      await page.click('#tapaItem .hoja-x');
      await page.click('#tabAhora');
      assert.match(await page.text('#secMisiones'), /KCO/);
      assert.match(await page.text('#secMisiones'), /Escribir changelog/);
      await page.click('#tabMisiones');
      await page.screenshot(path.join(OUT, 'misiones.png'));
    }
  },
  {
    name: 'missions: completing with open tasks asks first, then records it',
    storage: misionSeed(),
    async fn(page) {
      await page.click('#tabMisiones');
      await page.click('[data-mision="pkco"]');
      await page.type('#txtMisTarea', 'pendiente suelta', true);
      await page.click('#btnMisTerminar');
      assert.ok(await page.visible('#tapaConfirmar .hoja'));
      await page.click('#btnConfSi');
      const [p] = JSON.parse(await page.storage('kibco.proyectos'));
      assert.equal(p.estado, 'terminado');
      assert.ok(p.terminado);
      assert.ok((await events(page)).some((e) => e.tipo === 'mision_fin'));
      await page.click('#btnMisTerminar');
      assert.equal(JSON.parse(await page.storage('kibco.proyectos'))[0].estado, 'activo', 'can be reopened');
    }
  },
  {
    name: 'missions: deleting a mission keeps its tasks (unlinked)',
    storage: misionSeed(true),
    async fn(page) {
      await page.click('#tabMisiones');
      await page.click('[data-mision="pkco"]');
      await page.click('#btnMisBorrar');
      await page.click('#btnConfSi');
      assert.equal(JSON.parse(await page.storage('kibco.proyectos')).length, 0);
      const t = (await items(page)).find((i) => i.texto === 'tarea de mision');
      assert.ok(t, 'task survives');
      assert.equal(t.proyectoId, '');
    }
  },
  {
    name: 'missions: travel in the backup',
    storage: misionSeed(true),
    async fn(page) {
      await page.click('#btnAjustes');
      await page.click('#btnBackupTexto');
      const data = JSON.parse(await page.eval("document.getElementById('txtSalida').value"));
      assert.equal(data.proyectos.length, 1);
      assert.equal(data.proyectos[0].hitos.length, 2);
    }
  },
  {
    name: 'journal: records real progress automatically and hides undone completions',
    storage: misionSeed(true),
    async fn(page) {
      await capture(page, 'Entrenamiento');
      await capture(page, 'tarea que deshago');
      await toTasks(page);
      await page.clickText('#lista li.item', 'Entrenamiento');
      await page.click('#gridEstados [data-estado="completado"]');
      await page.click('#tapaItem .hoja-x');
      await toTasks(page);
      await page.eval(`(function(){var l=document.querySelectorAll('#lista li.item');for(var i=0;i<l.length;i++){if(l[i].textContent.indexOf('deshago')>-1){l[i].querySelector('[data-acc="listo"]').click();}}})()`);
      await page.click('#btnDeshacer');
      await page.click('#tabMisiones');
      await page.click('[data-mision="pkco"]');
      await page.click('#misHitos [data-hito="h2"]');
      await page.click('#tapaMision .hoja-x');
      await page.click('#tabRegistro');
      const txt = await page.text('#diarioCuerpo');
      assert.match(txt, /Entrenamiento/);
      assert.match(txt, /Hito: Release/);
      assert.match(txt, /KCO · 100%/);
      assert.doesNotMatch(txt, /deshago/);
      await page.screenshot(path.join(OUT, 'diario.png'));
      await page.click('#btnModoRegistro');
      assert.match(await page.text('#timeline'), /deshago/, 'raw log still has everything');
    }
  },
  {
    name: 'xp: completing shows +XP immediately and the level card updates',
    async fn(page) {
      await capture(page, 'tarea de valor');
      await page.eval(`(function(){var l=JSON.parse(localStorage.getItem('kibco.items'));l[0].creado=new Date(Date.now()-3600000).toISOString();l[0].nivel='importante';localStorage.setItem('kibco.items',JSON.stringify(l));})()`);
      await page.reload();
      await page.click('.hero [data-hero="hecho"]');
      assert.match(await page.text('#qpaso'), /\+25 XP/);
      assert.match(await page.text('#tarjetaNivel'), /25\/100 XP/);
      assert.match(await page.text('#tarjetaNivel'), /\+25 XP hoy/);
      await page.click('#btnDeshacer');
      assert.match(await page.text('#tarjetaNivel'), /0\/100 XP/, 'undo takes the XP back');
    }
  },
  {
    name: 'xp: level up is celebrated once and lands in the journal',
    storage: (() => {
      const list = [];
      for (let i = 0; i < 4; i++) list.push({ id: 'x' + i, texto: 'imp ' + i, contexto: 'trabajo', tipo: 'tarea', estado: 'completado', nivel: 'importante',
        creado: new Date(Date.now() - 86400000 * 2).toISOString(), estadoDesde: new Date(Date.now() - 86400000).toISOString() });
      list.push({ id: 'y', texto: 'la que sube', contexto: 'trabajo', tipo: 'tarea', estado: 'pendiente', nivel: 'normal', creado: new Date(Date.now() - 86400000).toISOString() });
      return { 'kibco.esquema': '4', 'kibco.items': JSON.stringify(list), 'kibco.progreso': JSON.stringify({ nivelVisto: 1, logros: {} }) };
    })(),
    async fn(page) {
      await page.click('.hero [data-hero="hecho"]');
      assert.match(await page.text('#qpaso'), /Nivel 2!/);
      assert.equal(JSON.parse(await page.storage('kibco.progreso')).nivelVisto, 2);
      assert.ok((await events(page)).some((e) => e.tipo === 'nivel' && e.hasta === '2'));
    }
  },
  {
    name: 'xp: upgrading users get their historic level silently',
    storage: (() => {
      const list = [];
      for (let i = 0; i < 8; i++) list.push({ id: 'x' + i, texto: 'vieja ' + i, contexto: 'trabajo', tipo: 'tarea', estado: 'completado', nivel: 'importante',
        creado: new Date(Date.now() - 86400000 * (i + 3)).toISOString(), estadoDesde: new Date(Date.now() - 86400000 * (i + 2)).toISOString() });
      return { 'kibco.esquema': '4', 'kibco.items': JSON.stringify(list) };
    })(),
    async fn(page) {
      assert.equal(JSON.parse(await page.storage('kibco.progreso')).nivelVisto, 2);
      assert.ok(!(await events(page)).some((e) => e.tipo === 'nivel'), 'no fake level-up event');
      assert.match(await page.text('#tarjetaNivel'), /NV 2/);
    }
  },
  {
    name: 'achievements: first completion unlocks one, announced once, kept forever',
    async fn(page) {
      await capture(page, 'algo');
      await page.eval(`(function(){var l=JSON.parse(localStorage.getItem('kibco.items'));l[0].creado=new Date(Date.now()-3600000).toISOString();localStorage.setItem('kibco.items',JSON.stringify(l));})()`);
      await page.reload();
      await page.click('.hero [data-hero="hecho"]');
      assert.match(await page.text('#qpaso'), /Primer paso/);
      const prog = JSON.parse(await page.storage('kibco.progreso'));
      assert.ok(prog.logros.primer_paso);
      assert.ok((await events(page)).some((e) => e.tipo === 'logro' && e.hasta === 'Primer paso'));
      await page.click('#btnDeshacer');
      assert.ok(JSON.parse(await page.storage('kibco.progreso')).logros.primer_paso, 'never taken away');
    }
  },
  {
    name: 'campaign: stats, weekly activity, contexts and achievements (secrets hidden)',
    storage: (() => {
      const list = [];
      for (let d = 0; d < 9; d++) list.push({ id: 'c' + d, texto: 'avance ' + d, contexto: d % 2 ? 'apps' : 'personal', tipo: 'tarea', estado: 'completado',
        nivel: 'normal', creado: new Date(Date.now() - (d + 2) * 86400000).toISOString(), estadoDesde: (() => { const x = new Date(Date.now() - d * 86400000); x.setHours(12, 0, 0, 0); return x.toISOString(); })() });
      return { 'kibco.esquema': '4', 'kibco.items': JSON.stringify(list) };
    })(),
    async fn(page) {
      await page.click('#tarjetaNivel');
      assert.ok(await page.visible('#campanaCuerpo'));
      const txt = await page.text('#campanaCuerpo');
      assert.match(txt, /9dias activos/);
      assert.match(txt, /9racha actual/);
      assert.match(txt, /7 dias avanzando/);
      assert.match(txt, /Logro secreto/);
      assert.doesNotMatch(txt, /Madrugador/);
      assert.equal(await page.count('.semanas .sem'), 12);
      assert.ok(await page.eval("document.querySelector('[data-logro=\"racha_7\"]').className.indexOf('ganado')>-1"),
        'historic 7-day streak unlocked silently on first 2.0 run');
      await page.screenshot(path.join(OUT, 'campana.png'));
    }
  },
  {
    name: 'rollback: a failed write leaves a state change completely untouched',
    async fn(page) {
      await capture(page, 'falla al completar');
      const before = (await items(page))[0];
      await toTasks(page);
      await failItemWrites(page);
      await page.click('[data-acc="listo"]');
      assert.match(await page.text('#aviso'), /No se pudo guardar/);
      await restoreWrites(page);
      await capture(page, 'otra');
      const after = (await items(page)).find((i) => i.id === before.id);
      assert.deepEqual(after, before, 'memory was fully rolled back before the next save');
    }
  },
  {
    name: 'rollback: a failed event-log write keeps the item, drops the event and warns',
    async fn(page) {
      await capture(page, 'registro lleno');
      const evsBefore = await page.storage('kibco.eventos');
      await toTasks(page);
      await failEventWrites(page);
      await page.click('[data-acc="listo"]');
      assert.match(await page.text('#aviso'), /No se pudo guardar el registro: almacenamiento lleno/);
      assert.equal((await items(page))[0].estado, 'completado', 'the item change is kept, not lost silently');
      assert.equal(await page.storage('kibco.eventos'), evsBefore, 'the log on disk is untouched');
      await restoreWrites(page);
      await capture(page, 'despues');
      const evs = await events(page);
      assert.deepEqual(evs.map((e) => e.tipo), ['captura', 'captura'], 'the failed event was rolled back from memory');
    }
  },
  {
    name: 'compaction: a full event log is compacted and the write retried once',
    storage: (() => {
      const old = [];
      const ts = new Date(Date.now() - 400 * 86400000).toISOString();
      for (let i = 0; i < 50; i++) old.push({ id: 'old' + i, ts, tipo: 'captura', itemId: 'gone' + i, texto: 'ruido viejo', contexto: 'trabajo', desde: '', hasta: '' });
      old.push({ id: 'keep', ts, tipo: 'hito', itemId: 'p1', texto: 'KCO', contexto: 'apps', desde: '50', hasta: 'Release' });
      return { 'kibco.esquema': '4', 'kibco.eventos': JSON.stringify(old) };
    })(),
    async fn(page) {
      // Quota stand-in: the log only fits once the old noise is gone.
      await page.eval("(function(){var o=Storage.prototype.setItem;window.__setItem=o;Storage.prototype.setItem=function(k,v){if(k==='kibco.eventos'&&String(v).indexOf('ruido viejo')>-1){throw new Error('quota');}return o.call(this,k,v);};})()");
      await capture(page, 'entra igual');
      await restoreWrites(page);
      assert.doesNotMatch(await page.text('#aviso'), /No se pudo guardar/);
      const evs = await events(page);
      assert.deepEqual(evs.map((e) => e.tipo), ['compactado', 'hito', 'captura'], 'old noise folded, journal material kept');
      assert.equal(evs[0].texto, '50 movimientos viejos resumidos');
    }
  },
  {
    name: 'rollback: a failed delete puts the item back and offers no undo',
    async fn(page) {
      await capture(page, 'no me borres');
      await openFirstItem(page);
      await failItemWrites(page);
      await page.click('#btnBorrar');
      await page.click('#btnConfSi');
      assert.ok(await page.eval("document.getElementById('barraDeshacer').className.indexOf(' on')===-1"), 'no undo offered');
      await restoreWrites(page);
      await capture(page, 'otra');
      assert.deepEqual((await items(page)).map((i) => i.texto).sort(), ['no me borres', 'otra']);
    }
  },
  {
    name: 'recurring: deleting today\'s occurrence marks it skipped instead of regenerating it',
    storage: rutinaSeed([[-1, 'completado']]),
    async fn(page) {
      await page.click('#tabHoy');
      await page.click('#secRutinasHoy li.item');
      await page.click('#btnBorrar');
      assert.match(await page.text('#confDetalle'), /omitida/);
      await page.click('#btnConfSi');
      let today = (await items(page)).filter((i) => i.rutinaId === 'rgata' && i.ocurrencia === ymd(0));
      assert.equal(today.length, 1);
      assert.equal(today[0].estado, 'cancelado');
      assert.equal(today[0].motivo, 'omitida');
      await page.reload();
      today = (await items(page)).filter((i) => i.rutinaId === 'rgata' && i.ocurrencia === ymd(0));
      assert.equal(today.length, 1, 'not regenerated');
    }
  },
  {
    name: 'recurring: a routine occurrence card offers no one-tap Mover a Compras',
    storage: rutinaSeed([]),
    async fn(page) {
      await toTasks(page);
      assert.equal(await page.count('#lista li.item'), 1);
      assert.equal(await page.count('[data-acc="acompras"]'), 0);
      assert.match(await page.eval("document.querySelector('#lista [data-acc=\"listo\"]').getAttribute('aria-label')"), /^Completar: /);
      await openQuickMenu(page, '#lista li.item');
      assert.equal(await page.visible('#tapaRapido [data-rap="compras"]'), false, 'nor in the quick menu');
    }
  },
  {
    name: 'purchases: moving a done purchase between contexts keeps its completion time',
    storage: (() => {
      const hace = new Date(Date.now() - 2 * 86400000).toISOString();
      return { 'kibco.esquema': '4', 'kibco.contexto': 'todo', 'kibco.filtroCompra': 'comprado',
        'kibco.items': JSON.stringify([{ id: 'c1', texto: 'detergente', contexto: 'hogar', tipo: 'compra', estado: 'comprado',
          creado: hace, actualizado: hace, estadoDesde: hace }]) };
    })(),
    async fn(page) {
      const before = (await items(page))[0];
      await page.click('#tabTareas');
      await page.click('#segBtnCompras');
      await page.click('#listaCompras li.item');
      await page.click('#gridCtx [data-ctx="trabajo"]');
      const after = (await items(page))[0];
      assert.equal(after.contexto, 'trabajo');
      assert.equal(after.estado, 'recibido');
      assert.equal(after.estadoDesde, before.estadoDesde);
    }
  },
  {
    name: 'multi-tab: a change from another window turns this one read-only',
    async fn(page) {
      await capture(page, 'antes');
      await page.eval("window.dispatchEvent(new StorageEvent('storage',{key:'kibco.items.roto.1',newValue:'x'}))");
      assert.doesNotMatch(await page.text('#aviso'), /otra ventana/, 'quarantine copies are ignored');
      await page.eval("window.dispatchEvent(new StorageEvent('storage',{key:'kibco.items',newValue:'[]'}))");
      assert.match(await page.text('#aviso'), /otra ventana/);
      const stored = await page.storage('kibco.items');
      await capture(page, 'despues');
      assert.equal(await page.storage('kibco.items'), stored, 'stale window does not overwrite');
    }
  },
  {
    name: 'multi-tab: a preference-only change keeps this window writable',
    async fn(page) {
      for (const k of ['kibco.contexto', 'kibco.contextoCaptura', 'kibco.filtro', 'kibco.filtroCompra', 'kibco.filtroTag',
        'kibco.luz', 'kibco.tema', 'kibco.vista', 'kibco.ultimoBackup', 'kibco.solicitantes', 'kibco.destinos']) {
        await page.eval(`window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(k)},newValue:'x'}))`);
      }
      assert.doesNotMatch(await page.text('#aviso'), /otra ventana/);
      await capture(page, 'sigue escribiendo');
      assert.ok((await items(page)).some((i) => i.texto === 'sigue escribiendo'), 'not read-only');
      await page.eval("window.dispatchEvent(new StorageEvent('storage',{key:null}))");
      assert.match(await page.text('#aviso'), /otra ventana/, 'a full clear still counts');
    }
  },
  {
    name: 'data: corrupt progreso that cannot be quarantined is re-seeded in memory only',
    async fn(page) {
      await page.addInitScript(
        "(function(){var o=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(String(k).indexOf('.roto.')>-1){throw new Error('quota');}return o.call(this,k,v);};})()");
      await page.setStorage(CORRUPT_PROGRESO_SEED);
      await page.reload();
      await page.reload();
      const keys = await page.eval('Object.keys(localStorage)');
      assert.equal(keys.filter((k) => k.indexOf('.roto.') > -1).length, 0, 'no copy could be made');
      assert.equal(await page.storage('kibco.progreso'), '{roto', 'the unreadable value is never overwritten');
      await capture(page, 'nueva sin copia');
      await page.click('.hero [data-hero="hecho"]');
      assert.ok(!(await events(page)).some((e) => e.tipo === 'logro' || e.tipo === 'nivel'), 'no fake achievement or level events');
      assert.equal(await page.storage('kibco.progreso'), '{roto');
    }
  },
  {
    name: 'theme: a light system preference applies the light tokens and follows live changes',
    async fn(page) {
      await scheme(page, 'light');
      await page.reload();
      assert.equal(await page.eval("document.documentElement.getAttribute('data-tema')"), 'claro');
      assert.equal(await page.eval('getComputedStyle(document.body).backgroundColor'), 'rgb(242, 243, 246)');
      assert.equal(await page.eval('getComputedStyle(document.body).color'), 'rgb(21, 24, 30)');
      assert.equal(await page.eval('getComputedStyle(document.documentElement).colorScheme'), 'light');
      assert.deepEqual(await themeColors(page), ['#F2F3F6', '#F2F3F6'], 'every theme-color meta follows the active theme');
      await page.eval("document.body.className='ctx-apps'");
      assert.equal((await cssVar(page, 'document.body', '--accent')).toUpperCase(), '#6D28D9', 'context accent has a light variant');
      await scheme(page, 'dark');
      assert.equal(await page.eval("document.documentElement.getAttribute('data-tema')"), 'oscuro', 'Sistema follows a live OS change');
      assert.equal(await page.eval('getComputedStyle(document.body).backgroundColor'), 'rgb(13, 15, 18)');
      assert.equal(await page.eval('getComputedStyle(document.documentElement).colorScheme'), 'dark');
      assert.deepEqual(await themeColors(page), ['#0D0F12', '#0D0F12']);
    }
  },
  {
    name: 'theme: choosing Oscuro in Ajustes persists kibco.tema and is applied before first paint',
    async fn(page) {
      await scheme(page, 'light');
      await page.reload();
      await page.click('#btnAjustes');
      assert.ok(await page.eval("document.querySelector('#segTema [data-tema=\"sistema\"]').className.indexOf('on')>-1"), 'Sistema is the default');
      await page.click('#segTema [data-tema="oscuro"]');
      assert.equal(await page.storage('kibco.tema'), 'oscuro');
      assert.equal(await page.eval("document.documentElement.getAttribute('data-tema')"), 'oscuro');
      await page.addInitScript(
        "document.addEventListener('DOMContentLoaded',function(){window.__temaDCL=document.documentElement.getAttribute('data-tema');window.__bgDCL=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();});");
      await page.reload();
      assert.equal(await page.eval('window.__temaDCL'), 'oscuro', 'data-tema is set before DOMContentLoaded (no flash)');
      assert.equal((await page.eval('window.__bgDCL')).toUpperCase(), '#0D0F12');
      assert.equal(await page.eval('getComputedStyle(document.body).backgroundColor'), 'rgb(13, 15, 18)');
      assert.deepEqual(await themeColors(page), ['#0D0F12', '#0D0F12']);
      await page.click('#btnAjustes');
      assert.ok(await page.eval("document.querySelector('#segTema [data-tema=\"oscuro\"]').className.indexOf('on')>-1"));
      await page.click('#segTema [data-tema="sistema"]');
      assert.equal(await page.storage('kibco.tema'), 'sistema');
      assert.equal(await page.eval("document.documentElement.getAttribute('data-tema')"), 'claro', 'back to the OS preference');
    }
  },
  {
    name: 'theme: a theme change in another tab applies here and keeps this window writable',
    async fn(page) {
      await scheme(page, 'dark');
      await page.eval("localStorage.setItem('kibco.tema','claro');window.dispatchEvent(new StorageEvent('storage',{key:'kibco.tema',newValue:'claro'}))");
      assert.equal(await page.eval("document.documentElement.getAttribute('data-tema')"), 'claro');
      assert.doesNotMatch(await page.text('#aviso'), /otra ventana/);
      await page.click('#btnAjustes');
      assert.ok(await page.eval("document.querySelector('#segTema [data-tema=\"claro\"]').className.indexOf('on')>-1"), 'Ajustes shows the synced choice');
    }
  },
  {
    name: 'theme: the backup does not carry the theme preference',
    storage: { 'kibco.esquema': '4', 'kibco.tema': 'claro' },
    async fn(page) {
      assert.equal(await page.eval("document.documentElement.getAttribute('data-tema')"), 'claro');
      await page.click('#btnAjustes');
      await page.click('#btnBackupTexto');
      const bk = await page.eval("document.getElementById('txtSalida').value");
      assert.equal(bk.indexOf('tema'), -1, 'preferences stay out of the backup, like luz and filters');
      assert.ok(Array.isArray(JSON.parse(bk).items));
    }
  },
  {
    name: 'ux: every visible text in AHORA computes at least 12px at 390px',
    storage: seed(),
    async fn(page) {
      const bad = await page.eval(`(function(){var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null),n,b=[];
        while((n=w.nextNode())){if(!/\S/.test(n.nodeValue))continue;var e=n.parentElement;if(!e)continue;var cs=getComputedStyle(e);
          if(cs.visibility==='hidden'||cs.display==='none')continue;var r=e.getBoundingClientRect();if(r.width===0||r.height===0)continue;
          var hid=false,p=e;while(p){var ps=getComputedStyle(p);if(ps.display==='none'||ps.visibility==='hidden'||ps.opacity==='0'){hid=true;break;}p=p.parentElement;}if(hid)continue;
          var s=parseFloat(cs.fontSize);if(s<12)b.push((e.className||e.tagName)+':'+s+':'+n.nodeValue.trim().slice(0,20));}
        return b;})()`);
      assert.deepEqual(bad, []);
    }
  },
  {
    name: 'ux: the five bottom tabs fit at 390px without clipping',
    async fn(page) {
      const r = await page.eval(TABS_PROBE);
      assert.equal(r.n, 5);
      assert.deepEqual(r.bad, [], 'every tab fully visible with a 44px target');
      assert.equal(r.over, false, 'no horizontal scroll in the tab bar');
      assert.equal(r.fixed, true, 'the tab bar is fixed');
      assert.ok(Math.abs(r.bottom - r.h) <= 1, 'the tab bar sits on the bottom edge');
    }
  },
  {
    name: 'ux: the five bottom tabs fit at 340px without clipping',
    width: 340,
    height: 740,
    async fn(page) {
      const r = await page.eval(TABS_PROBE);
      assert.equal(r.n, 5);
      assert.deepEqual(r.bad, []);
      assert.ok(Math.abs(r.bottom - r.h) <= 1);
      assert.equal(await page.eval('document.documentElement.scrollWidth > window.innerWidth'), false, 'no horizontal page scroll');
    }
  },
  {
    name: 'shell: at 390px the capture bar sits right above the bottom tab bar and content clears both',
    storage: seed(),
    async fn(page) {
      const r = await page.eval(`(function(){var t=document.querySelector('.tabs').getBoundingClientRect(),c=document.querySelector('.captura').getBoundingClientRect(),
        m=document.querySelector('main');return {tTop:t.top,tH:t.height,cBottom:c.bottom,cH:c.height,pad:parseFloat(getComputedStyle(m).paddingBottom),
        lat:getComputedStyle(document.getElementById('lateral')).display,svg:document.querySelectorAll('.tabs .tab svg').length,
        cur:Array.prototype.map.call(document.querySelectorAll('.tabs .tab'),function(b){return b.getAttribute('aria-selected');})};})()`);
      assert.ok(Math.abs(r.cBottom - r.tTop) <= 1, 'capture bar directly above the tab bar');
      assert.ok(r.pad >= r.tH + r.cH, 'main bottom padding clears capture + tabs');
      assert.equal(r.lat, 'none', 'no sidebar on mobile');
      assert.equal(r.svg, 5, 'every tab has an SVG icon');
      assert.deepEqual(r.cur, ['true', 'false', 'false', 'false', 'false']);
      await page.click('#tabHoy');
      assert.ok(await page.visible('#vistaHoy'));
      assert.equal(await page.eval("document.getElementById('tabHoy').getAttribute('aria-selected')"), 'true');
      // Typing: the tab bar steps aside so the capture bar stays usable above the keyboard.
      await page.emulateFocus();
      await page.eval("document.getElementById('txtCaptura').focus()");
      assert.equal(await page.eval("getComputedStyle(document.querySelector('.tabs')).display"), 'none');
      assert.ok(await page.visible('#txtCaptura'));
      await page.eval("document.getElementById('txtCaptura').blur()");
      assert.notEqual(await page.eval("getComputedStyle(document.querySelector('.tabs')).display"), 'none');
    }
  },
  {
    name: 'shell: the context switcher opens from the app bar, picks Casa and captures go there',
    storage: seed(),
    async fn(page) {
      const attr = (a) => page.eval(`document.getElementById('btnCtx').getAttribute('${a}')`);
      assert.equal(await attr('aria-haspopup'), 'dialog');
      assert.equal(await attr('aria-expanded'), 'false');
      assert.match(await page.text('#btnCtx'), /Todo/);
      await page.click('#btnCtx');
      assert.ok(await page.eval("document.getElementById('tapaCtx').className.indexOf('on')>-1"), 'switcher open');
      assert.equal(await attr('aria-expanded'), 'true');
      const rows = await page.eval("Array.prototype.map.call(document.querySelectorAll('#ctxsel [data-ctx]'),function(b){return [b.getAttribute('data-ctx'),b.getAttribute('aria-pressed'),b.querySelector('.ctxfila-n').textContent];})");
      assert.deepEqual(rows.map((x) => x[0]), ['todo', 'trabajo', 'hogar', 'apps', 'contenido', 'personal']);
      assert.deepEqual(rows.map((x) => x[1]), ['true', 'false', 'false', 'false', 'false', 'false'], 'the current context is checked');
      assert.equal(rows.find((x) => x[0] === 'hogar')[2], '2', 'Casa shows its open count');
      await page.click('#ctxsel [data-ctx="hogar"]');
      assert.match(await page.eval('document.body.className'), /\bctx-hogar\b/);
      assert.equal(await page.storage('kibco.contexto'), 'hogar');
      assert.equal(await page.eval("document.getElementById('tapaCtx').className"), 'tapa', 'switcher closes after picking');
      assert.equal(await attr('aria-expanded'), 'false');
      assert.match(await page.text('#btnCtx'), /Casa/);
      await capture(page, 'cambiar cuerito');
      assert.equal((await items(page)).find((i) => i.texto === 'cambiar cuerito').contexto, 'hogar');
    }
  },
  {
    name: 'shell: no horizontal overflow and nothing clipped in the app bar at 340 and 390px',
    storage: seed(),
    async fn(page) {
      for (const w of [340, 390]) {
        await page.viewport(w, 760, true);
        await page.reload();
        const r = await page.eval(`(function(){var w=window.innerWidth,bad=[],l=document.querySelectorAll('header button');
          for(var i=0;i<l.length;i++){var b=l[i].getBoundingClientRect();if(b.width>0&&(b.left<0||b.right>w+0.5))bad.push(l[i].id);}
          return {sw:document.scrollingElement.scrollWidth,w:w,bad:bad};})()`);
        assert.ok(r.sw <= r.w, `page scrollWidth ${r.sw} <= ${r.w}`);
        assert.deepEqual(r.bad, [], 'app bar buttons fully visible at ' + w);
        // The slide between views must not widen the layout (that zooms out mobile pages).
        await page.click('#tabTareas');
        const t = await page.eval('[document.scrollingElement.scrollWidth, window.innerWidth, window.innerHeight]');
        await sleep(400);
        const t2 = await page.eval('[document.scrollingElement.scrollWidth, window.innerWidth, window.innerHeight]');
        assert.ok(t[0] <= t[1] && t2[0] <= t2[1], 'Tareas: no horizontal overflow during or after the transition at ' + w);
        assert.equal(t2[2], 760, 'layout viewport not stretched');
      }
    }
  },
  {
    name: 'shell: at 1366px a sidebar replaces the bottom tabs, navigates views and switches context',
    width: 1366,
    height: 900,
    mobile: false,
    storage: seed(),
    async fn(page) {
      const r = await page.eval(`(function(){var a=document.getElementById('lateral').getBoundingClientRect(),m=document.getElementById('vistaAhora').getBoundingClientRect(),
        c=document.querySelector('.captura').getBoundingClientRect();
        return {tabs:getComputedStyle(document.querySelector('.tabs')).display,aw:a.width,al:a.left,ml:m.left,mw:m.width,cTop:c.top,mTop:m.top,
          nav:document.querySelectorAll('#navLateral [data-vista]').length,ctx:document.querySelectorAll('#ctxLateral [data-ctx]').length,
          dots:document.querySelectorAll('#ctxLateral .punto').length};})()`);
      assert.equal(r.tabs, 'none', 'no bottom tab bar on desktop');
      assert.equal(r.al, 0);
      assert.ok(r.aw >= 220 && r.aw <= 260, 'sidebar ~240px, got ' + r.aw);
      assert.ok(r.ml >= r.aw, 'content column starts after the sidebar');
      assert.ok(Math.abs((r.ml + r.mw / 2) - (r.aw + (1366 - r.aw) / 2)) <= 10, 'column centered in the space right of the sidebar');
      assert.ok(r.mw <= 760, 'content column at most 760px, got ' + r.mw);
      assert.ok(r.cTop < r.mTop, 'capture bar sits at the top of the main column');
      assert.equal(r.nav, 5);
      assert.equal(r.ctx, 6);
      assert.equal(r.dots, 6, 'contexts are a colored dot + name');
      const cur = (v) => page.eval(`document.querySelector('#navLateral [data-vista="${v}"]').getAttribute('aria-current')`);
      assert.equal(await cur('ahora'), 'page');
      await page.click('#navLateral [data-vista="hoy"]');
      assert.ok(await page.visible('#vistaHoy'));
      assert.equal(await cur('hoy'), 'page');
      assert.equal(await cur('ahora'), null);
      await page.click('#navLateral [data-vista="tablero"]');
      assert.ok(await page.visible('#vistaTablero'));
      await page.click('#ctxLateral [data-ctx="apps"]');
      assert.match(await page.eval('document.body.className'), /\bctx-apps\b/);
      assert.equal(await page.eval("document.querySelector('#ctxLateral [data-ctx=\"apps\"]').getAttribute('aria-pressed')"), 'true');
      assert.equal(await page.count('#lista li.item'), 2, 'only Apps tasks');
    }
  },
  {
    name: 'a11y: every icon-only button has an accessible name and the chrome uses SVG icons, not emoji',
    storage: seed(),
    async fn(page) {
      const noName = await page.eval(`(function(){var l=document.querySelectorAll('button'),b=[];for(var i=0;i<l.length;i++){
        if(l[i].textContent.replace(/\\s/g,'')===''&&!l[i].getAttribute('aria-label'))b.push(l[i].id||l[i].className);}return b;})()`);
      assert.deepEqual(noName, []);
      assert.equal(await page.eval("document.getElementById('btnBuscar').querySelector('svg')!==null"), true);
      const svg = await page.eval(`(function(){var s=window.KCOIconos.crear('check','x');return [s.namespaceURI,s.getAttribute('viewBox'),s.getAttribute('stroke'),s.getAttribute('stroke-width'),s.getAttribute('aria-hidden'),s.getAttribute('class')];})()`);
      assert.deepEqual(svg, ['http://www.w3.org/2000/svg', '0 0 24 24', 'currentColor', '1.75', 'true', 'ico x']);
      const chrome = await page.eval(`(function(){var t='';['header','.tabs','#lateral','.hero-rot','.hero-accs','.pulso','#ahoraCuerpo .sec-tit','#segTareas','#vistaRegistro .seg'].forEach(function(s){
        var l=document.querySelectorAll(s);for(var i=0;i<l.length;i++)t+=l[i].textContent;});return t;})()`);
      assert.doesNotMatch(chrome, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{23E9}-\u{23FA}]/u, 'no emoji in UI chrome');
      assert.ok(await page.eval("document.querySelectorAll('.hero-accs svg').length") >= 2, 'hero buttons carry icons');
      await toTasks(page);
      assert.equal(await page.eval("Array.prototype.filter.call(document.querySelectorAll('svg.ico'),function(s){return s.childElementCount===0;}).length"), 0, 'every icon name used exists in iconos.js');
    }
  },
  {
    name: 'sheets: every sheet is a labelled modal dialog with a drag handle and a top close button',
    async fn(page) {
      const r = await page.eval(`(function(){var l=document.querySelectorAll('.tapa'),out=[];for(var i=0;i<l.length;i++){var t=l[i],lb=document.getElementById(t.getAttribute('aria-labelledby')||'');
        var x=t.querySelector('.hoja-cab .hoja-x');
        out.push({id:t.id,role:t.getAttribute('role'),modal:t.getAttribute('aria-modal'),label:!!(lb&&lb.textContent.trim()),inside:!!(lb&&t.contains(lb)),
          x:x?x.getAttribute('aria-label'):null,asa:!!t.querySelector('.hoja-cab .asa')});}return out;})()`);
      assert.ok(r.length >= 9, 'all sheets found: ' + r.length);
      for (const s of r) {
        assert.deepEqual(s, { id: s.id, role: 'dialog', modal: 'true', label: true, inside: true, x: 'Cerrar', asa: true }, s.id);
      }
    }
  },
  {
    name: 'sheets: Escape closes only the top sheet, focus returns to the opener and history stays in step',
    storage: seed(),
    async fn(page) {
      await page.emulateFocus();
      const active = () => page.eval('document.activeElement && (document.activeElement.id || document.activeElement.className)');
      const inSheet = (id) => page.eval(`document.getElementById('${id}').contains(document.activeElement)`);
      const isOpen = (id) => page.eval(`document.getElementById('${id}').className.indexOf('on')>-1`);
      const capa = () => page.eval('history.state && history.state.kcoCapa || null');
      await page.eval("(function(){var b=document.getElementById('btnAjustes');b.focus();b.click();})()");
      await sleep(80);
      assert.ok(await inSheet('tapaAjustes'), 'focus moves into the sheet');
      await page.key('Escape');
      await sleep(150);
      assert.equal(await isOpen('tapaAjustes'), false);
      assert.equal(await active(), 'btnAjustes', 'focus returns to the opener');
      assert.equal(await capa(), null, 'its history entry is gone');
      // Two stacked sheets: Escape peels one at a time, the history follows.
      await openFirstItem(page);
      await page.click('#btnBorrar');
      await sleep(150);
      assert.equal(await capa(), 'tapaConfirmar');
      await page.key('Escape');
      await sleep(150);
      assert.equal(await isOpen('tapaConfirmar'), false);
      assert.ok(await isOpen('tapaItem'), 'the sheet below stays open');
      assert.equal(await capa(), 'tapaItem');
      assert.equal((await items(page)).length, 10, 'Escape on the confirm cancels');
      await page.key('Escape');
      await sleep(150);
      assert.equal(await isOpen('tapaItem'), false);
      assert.equal(await capa(), null);
      // Back now behaves as with nothing open: Tareas -> Ahora.
      await page.eval('history.back()');
      await sleep(200);
      assert.equal(await page.eval("document.getElementById('tabAhora').getAttribute('aria-selected')"), 'true');
    }
  },
  {
    name: 'sheets: Tab and Shift+Tab cycle inside the top sheet',
    async fn(page) {
      await page.emulateFocus();
      await page.click('#btnBuscar');
      await sleep(80);
      const where = () => page.eval("[document.getElementById('tapaBuscar').querySelector('.hoja').contains(document.activeElement), document.activeElement.id || document.activeElement.className]");
      const seen = new Set();
      for (let i = 0; i < 6; i++) {
        await page.key('Tab');
        const [inside, id] = await where();
        assert.ok(inside, 'Tab stays in the sheet (step ' + i + ', on ' + id + ')');
        seen.add(id);
      }
      assert.ok(seen.has('txtBusca') && [...seen].some((s) => /hoja-x/.test(s)), 'cycles over the field and the close button: ' + [...seen]);
      for (let i = 0; i < 4; i++) {
        await page.key('Tab', { shift: true });
        assert.ok((await where())[0], 'Shift+Tab stays in the sheet');
      }
    }
  },
  {
    name: 'sheets: tapping the backdrop closes the item sheet and the context switcher',
    storage: seed(),
    async fn(page) {
      await openFirstItem(page);
      await sleep(400);
      const top = await page.rect('#tapaItem .hoja');
      assert.ok(top.y > 30, 'there is backdrop above the sheet');
      await page.tap(195, 12);
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa');
      await sleep(150);
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), null);
      await page.click('#btnCtx');
      await sleep(400);
      await page.tap(195, 12);
      assert.equal(await page.eval("document.getElementById('tapaCtx').className"), 'tapa');
      assert.equal(await page.eval("document.getElementById('btnCtx').getAttribute('aria-expanded')"), 'false');
      // A tap inside the sheet does not close it.
      await page.click('#btnCtx');
      await sleep(400);
      const h = await page.rect('#tapaCtx h2');
      await page.tap(h.x + 4, h.y + h.h / 2);
      assert.ok(await page.eval("document.getElementById('tapaCtx').className.indexOf('on')>-1"));
    }
  },
  {
    name: 'sheets: dragging the handle down closes the sheet; a short drag snaps back',
    async fn(page) {
      await page.click('#btnAjustes');
      await sleep(400);
      const c = await page.rect('#tapaAjustes .hoja-cab');
      const x = c.x + 40, y = c.y + 12;
      await page.drag(x, y, x, y + 30);
      await sleep(400);
      assert.ok(await page.eval("document.getElementById('tapaAjustes').className.indexOf('on')>-1"), 'short drag keeps it open');
      assert.equal(await page.eval("document.querySelector('#tapaAjustes .hoja').style.transform"), '', 'snapped back');
      await page.drag(x, y, x, y + 160);
      assert.equal(await page.eval("document.getElementById('tapaAjustes').className"), 'tapa', 'long drag closes');
      await sleep(150);
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), null);
    }
  },
  {
    name: 'sheets: at 390x844 Hecho, Hoy, Mañana, Prioridad and Contexto are on screen without scrolling',
    storage: seed(),
    async fn(page) {
      await openFirstItem(page);
      await sleep(450);
      const r = await page.eval(`(function(){var h=window.innerHeight,bad=[],ids=['#btnHecho','#btnDiaHoy','#btnDiaMan','#gridNivel button','#gridCtx button','#txtTituloItem'];
        for(var i=0;i<ids.length;i++){var l=document.querySelectorAll(ids[i]);if(!l.length)bad.push(ids[i]+' missing');
          for(var j=0;j<l.length;j++){var b=l[j].getBoundingClientRect();if(b.top<0||b.bottom>h||(l[j].tagName==='BUTTON'&&b.height<40))bad.push(ids[i]+'#'+j+' '+Math.round(b.top)+'-'+Math.round(b.bottom)+' h'+Math.round(b.height));}}
        return {bad:bad,scroll:document.querySelector('#tapaItem .hoja').scrollTop};})()`);
      assert.equal(r.scroll, 0);
      assert.deepEqual(r.bad, []);
      const texto = await page.eval("document.getElementById('txtTituloItem').value");
      await page.click('#btnHecho');
      assert.equal((await items(page)).find((i) => i.texto === texto).estado, 'completado');
    }
  },
  {
    name: 'sheets: at 1366px a sheet is a centered dialog of at most 560px',
    storage: seed(),
    width: 1366, height: 900, mobile: false,
    async fn(page) {
      await page.click('#navLateral [data-vista="tablero"]');
      await page.click('#lista li.item');
      await sleep(450);
      const r = await page.rect('#tapaItem .hoja');
      assert.ok(r.w <= 560 && r.w >= 480, 'width ' + r.w);
      assert.ok(Math.abs((r.x + r.w / 2) - 683) < 2, 'horizontally centered: ' + r.x);
      assert.ok(r.y > 20 && r.b < 880, 'vertically inside the window: ' + r.y + '-' + r.b);
      assert.equal(await page.visible('#tapaItem .asa'), false, 'no drag handle with a mouse');
    }
  },
  {
    name: 'cards: a round checkbox on the left completes the task; its name carries the task text; undo restores',
    async fn(page) {
      await capture(page, 'llamar a <b>Juan</b>');
      await toTasks(page);
      const r = await page.eval(`(function(){var li=document.querySelector('#lista li.item'),c=li.querySelector('.chk'),v=c.querySelector('.chk-c'),cb=c.getBoundingClientRect(),vb=v.getBoundingClientRect(),
        t=li.querySelector('.txt').getBoundingClientRect();
        return {acc:c.getAttribute('data-acc'),name:c.getAttribute('aria-label'),w:cb.width,h:cb.height,vw:vb.width,left:cb.right<=t.left+1,b:li.querySelectorAll('b').length};})()`);
      assert.equal(r.acc, 'listo');
      assert.equal(r.name, 'Completar: llamar a <b>Juan</b>', 'built from the text, never parsed as HTML');
      assert.equal(r.b, 0);
      assert.ok(r.w >= 44 && r.h >= 44, 'hit area ' + r.w + 'x' + r.h);
      assert.ok(r.vw >= 20 && r.vw <= 22, 'visual circle ' + r.vw);
      assert.ok(r.left, 'checkbox before the text');
      await page.click('#lista .chk');
      assert.equal((await items(page))[0].estado, 'completado');
      await page.click('#btnDeshacer');
      assert.equal((await items(page))[0].estado, 'entrada');
    }
  },
  {
    name: 'cards: no task card has a cart button; an inbox card keeps one small Hoy for 1-tap triage',
    storage: seed(),
    async fn(page) {
      const inbox = await page.eval(`Array.prototype.map.call(document.querySelectorAll('#secInbox li.item'),function(li){
        return Array.prototype.map.call(li.querySelectorAll('button'),function(b){return b.getAttribute('data-acc');}).join(',');})`);
      assert.ok(inbox.length >= 2);
      for (const b of inbox) assert.equal(b, 'listo,parahoy');
      await toTasks(page);
      const r = await page.eval(`(function(){var l=document.querySelectorAll('#lista li.item'),cart=0,big=0;for(var i=0;i<l.length;i++){
        if(l[i].querySelector('[data-acc="acompras"]'))cart++;var bs=l[i].querySelectorAll('button');for(var j=0;j<bs.length;j++){if(bs[j].className.indexOf('abtn')>-1)big++;}}
        return {n:l.length,cart:cart,big:big};})()`);
      assert.ok(r.n >= 8);
      assert.equal(r.cart, 0, 'no Mover a Compras on cards');
      assert.equal(r.big, 0, 'no big square action buttons');
    }
  },
  {
    name: 'cards: swipe right on a row completes it, the view stays, undo restores; a vertical drag does nothing',
    storage: seed(),
    async fn(page) {
      await toTasks(page);
      const id = await page.eval("document.querySelector('#lista li.item').getAttribute('data-id')");
      const c = await page.rect('#lista li.item');
      await page.drag(c.x + 60, c.y + c.h / 2, c.x + 300, c.y + c.h / 2 + 6);
      assert.equal((await items(page)).find((i) => i.id === id).estado, 'completado');
      assert.equal(await page.eval("document.getElementById('tabTareas').getAttribute('aria-selected')"), 'true', 'no view change');
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa', 'the sheet did not open');
      await page.click('#btnDeshacer');
      assert.equal((await items(page)).find((i) => i.id === id).estado, 'pendiente');
      const c2 = await page.rect('#lista li.item');
      await page.drag(c2.x + 100, c2.y + c2.h / 2, c2.x + 130, c2.y + c2.h / 2 - 60);
      assert.equal((await items(page)).find((i) => i.id === id).estado, 'pendiente');
      assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa');
    }
  },
  {
    name: 'cards: swipe left opens the quick menu (Hoy, Mañana, Prioridad, Mover a Compras, Borrar); keyboard reaches the same',
    storage: seed(),
    async fn(page) {
      await toTasks(page);
      const id = await page.eval("document.querySelector('#lista li.item').getAttribute('data-id')");
      const c = await page.rect('#lista li.item');
      await page.drag(c.x + 320, c.y + c.h / 2, c.x + 60, c.y + c.h / 2);
      await sleep(300);
      assert.ok(await page.eval("document.getElementById('tapaRapido').className.indexOf('on')>-1"), 'quick menu open');
      assert.equal(await page.eval("document.getElementById('tapaRapido').getAttribute('role')"), 'dialog');
      assert.deepEqual(await page.eval("Array.prototype.map.call(document.querySelectorAll('#tapaRapido [data-rap]'),function(b){return b.getAttribute('data-rap');})"),
        ['hoy', 'manana', 'prioridad', 'compras', 'borrar']);
      assert.equal(await page.eval("document.getElementById('tabTareas').getAttribute('aria-selected')"), 'true', 'no view change');
      await page.click('#tapaRapido [data-rap="prioridad"]');
      await page.click('#tapaRapido [data-nivel="baja"]');
      assert.equal((await items(page)).find((i) => i.id === id).nivel, 'baja');
      assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa');
      await openQuickMenu(page, `#lista li.item[data-id="${id}"]`);
      await page.click('#tapaRapido [data-rap="manana"]');
      assert.equal((await items(page)).find((i) => i.id === id).fecha, ymd(1));
      await openQuickMenu(page, `#lista li.item[data-id="${id}"]`);
      await page.click('#tapaRapido [data-rap="borrar"]');
      await page.click('#btnConfSi');
      assert.ok(!(await items(page)).some((i) => i.id === id), 'deleted after confirming');
      assert.equal(await page.eval("document.querySelector('#lista li.item').getAttribute('tabindex')"), '0');
      await page.emulateFocus();
      await page.eval("document.querySelector('#lista li.item').focus()");
      await page.key('Enter');
      assert.ok(await page.eval("document.getElementById('tapaItem').className.indexOf('on')>-1"), 'Enter opens the sheet');
      await page.key('Escape');
      await openQuickMenu(page, '#lista li.item');
      await page.click('#btnRapFicha');
      assert.ok(await page.eval("document.getElementById('tapaItem').className.indexOf('on')>-1"), 'Mas opciones opens the sheet');
      assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa');
    }
  },
  {
    name: 'quick menu: "Más opciones" hands off to the item sheet with its own history entry; back closes it',
    storage: seed(),
    async fn(page) {
      await toTasks(page);
      await openQuickMenu(page, '#lista li.item');
      await page.click('#btnRapFicha');
      await sleep(200);
      assert.ok(await page.eval("document.getElementById('tapaItem').className.indexOf('on')>-1"), 'the item sheet is open');
      assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa', 'the quick menu is closed');
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), 'tapaItem', 'history entry matches the open sheet');
      await page.eval('history.back()');
      await sleep(200);
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa', 'back closes the item sheet');
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), null);
      assert.equal(await page.eval("document.getElementById('tabTareas').getAttribute('aria-selected')"), 'true', 'back only closed the sheet');
    }
  },
  {
    name: 'quick menu: "Borrar" hands off to the confirm sheet with its own history entry; back cancels it',
    storage: seed(),
    async fn(page) {
      await toTasks(page);
      const id = await page.eval("document.querySelector('#lista li.item').getAttribute('data-id')");
      await openQuickMenu(page, `#lista li.item[data-id="${id}"]`);
      await page.click('#tapaRapido [data-rap="borrar"]');
      await sleep(200);
      assert.ok(await page.eval("document.getElementById('tapaConfirmar').className.indexOf('on')>-1"), 'the confirm sheet is open');
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), 'tapaConfirmar', 'history entry matches the open sheet');
      await page.eval('history.back()');
      await sleep(200);
      assert.equal(await page.eval("document.getElementById('tapaConfirmar').className"), 'tapa', 'back closes the confirm sheet');
      assert.ok((await items(page)).some((i) => i.id === id), 'back cancels the delete');
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), null);
      assert.equal(await page.eval("document.getElementById('tabTareas').getAttribute('aria-selected')"), 'true', 'back only closed the sheet');
    }
  },
  {
    name: 'quick menu: "Para hoy" takes an inbox item out of the inbox for today',
    storage: seed(),
    async fn(page) {
      const id = (await items(page)).find((i) => i.texto === 'comprar lija').id;
      await openQuickMenu(page, `li.item[data-id="${id}"]`);
      await page.click('#tapaRapido [data-rap="hoy"]');
      const it = (await items(page)).find((i) => i.id === id);
      assert.equal(it.estado, 'pendiente', 'out of the inbox');
      assert.equal(it.fecha, ymd(0), 'scheduled for today');
      assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa');
    }
  },
  {
    name: 'quick menu: "Para hoy" moves a non-inbox item to today',
    storage: seed(),
    async fn(page) {
      await toTasks(page);
      const id = (await items(page)).find((i) => i.texto === 'Grabar video tutorial').id;
      await openQuickMenu(page, `#lista li.item[data-id="${id}"]`);
      await page.click('#tapaRapido [data-rap="hoy"]');
      const it = (await items(page)).find((i) => i.id === id);
      assert.equal(it.fecha, ymd(0), 'scheduled for today');
      assert.equal(it.estado, 'pendiente', 'state unchanged');
      assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa');
    }
  },
  {
    name: 'harness: per-spec teardown removes init scripts and resets emulated media',
    async fn(page) {
      const dark = "matchMedia('(prefers-color-scheme: dark)').matches";
      const baseline = await page.eval(dark);
      await page.addInitScript('window.__leak = 1;');
      await scheme(page, baseline ? 'light' : 'dark');
      await page.reload();
      assert.equal(await page.eval('window.__leak'), 1);
      assert.equal(await page.eval(dark), !baseline, 'emulation applied');
      await page.teardown();
      assert.equal(page.pendingInitScripts(), 0);
      await page.reload();
      assert.equal(await page.eval('typeof window.__leak'), 'undefined', 'init script removed');
      assert.equal(await page.eval(dark), baseline, 'emulated media reset to the real preference');
    }
  },
  {
    name: 'pwa: a waiting update shows a non-blocking banner; tapping it activates and reloads once',
    async fn(page) {
      await stubServiceWorker(page, 'waiting');
      assert.ok(await page.visible('#avisoVersion'), 'banner visible');
      assert.match(await page.text('#avisoVersion'), /Nueva versión disponible/);
      assert.ok(await page.visible('#txtCaptura'), 'the app stays usable');
      await page.eval('window.__marker = 1');
      await page.eval("window.__fireSw('controllerchange'); true");
      await sleep(300);
      assert.equal(await page.eval('window.__marker'), 1, 'no reload unless the user asked for the update');
      await page.click('#btnActualizar');
      assert.deepEqual(await page.eval('window.__swMsgs'), [{ type: 'SKIP_WAITING' }]);
      const loaded = page.cdp.once('Page.loadEventFired');
      await page.eval("window.__fireSw('controllerchange'); window.__fireSw('controllerchange'); true");
      await loaded;
      await sleep(200);
      assert.equal(await page.eval('typeof window.__marker'), 'undefined', 'page reloaded');
    }
  },
  {
    name: 'pwa: an update found while open shows the banner once it is installed',
    async fn(page) {
      await stubServiceWorker(page, 'installing');
      assert.equal(await page.visible('#avisoVersion'), false);
      await page.eval('window.__installNew(); true');
      await sleep(100);
      assert.ok(await page.visible('#avisoVersion'));
    }
  },
  {
    name: 'pwa: the Capturar shortcut (?capturar=1) focuses the capture input',
    async fn(page) {
      await page.goto('/?capturar=1');
      assert.equal(await page.eval('document.activeElement && document.activeElement.id'), 'txtCaptura');
    }
  },
  {
    name: 'ux: every text field computes at least 16px at 390px (no iOS focus zoom)',
    async fn(page) {
      const bad = await page.eval(`(function(){var l=document.querySelectorAll('input:not([type=file]),textarea,select'),b=[];
        for(var i=0;i<l.length;i++){var s=parseFloat(getComputedStyle(l[i]).fontSize);if(s<16)b.push((l[i].id||l[i].tagName)+':'+s);}return b;})()`);
      assert.deepEqual(bad, []);
    }
  },
  {
    name: 'backup: never backed up reads just "nunca"',
    storage: { 'kibco.esquema': '4', 'kibco.items': JSON.stringify([{ id: 'v1', texto: 'viejo', contexto: 'trabajo', tipo: 'tarea', estado: 'pendiente', nivel: 'normal', creado: new Date(Date.now() - 5 * 86400000).toISOString() }]) },
    async fn(page) {
      await page.click('#btnAjustes');
      assert.equal(await page.text('#vBackup'), 'nunca');
    }
  },
  {
    name: 'achievements: a failed event-log write never loses the achievement silently',
    async fn(page) {
      const backdate = `(function(){var l=JSON.parse(localStorage.getItem('kibco.items'));for(var i=0;i<l.length;i++){l[i].creado=new Date(Date.now()-3600000).toISOString();}localStorage.setItem('kibco.items',JSON.stringify(l));})()`;
      await capture(page, 'algo');
      await page.eval(backdate);
      await page.reload();
      await failEventWrites(page);
      await page.click('.hero [data-hero="hecho"]');
      assert.match(await page.text('#aviso'), /No se pudo guardar el registro/);
      assert.ok(!JSON.parse(await page.storage('kibco.progreso')).logros.primer_paso, 'not marked as won without its journal entry');
      await restoreWrites(page);
      await capture(page, 'otra');
      await page.eval(backdate);
      await page.reload();
      await page.click('.hero [data-hero="hecho"]');
      assert.ok(JSON.parse(await page.storage('kibco.progreso')).logros.primer_paso, 'won on the next chance');
      assert.equal((await events(page)).filter((e) => e.tipo === 'logro' && e.hasta === 'Primer paso').length, 1, 'journal shows it once');
    }
  },
  {
    name: 'compaction: when even the compacted log cannot be saved, it warns and memory is unchanged',
    storage: (() => {
      const old = [];
      const ts = new Date(Date.now() - 400 * 86400000).toISOString();
      for (let i = 0; i < 20; i++) old.push({ id: 'old' + i, ts, tipo: 'captura', itemId: 'gone' + i, texto: 'ruido viejo', contexto: 'trabajo', desde: '', hasta: '' });
      return { 'kibco.esquema': '4', 'kibco.eventos': JSON.stringify(old) };
    })(),
    async fn(page) {
      const before = await page.storage('kibco.eventos');
      await failEventWrites(page);
      await capture(page, 'no entra');
      assert.match(await page.text('#aviso'), /No se pudo guardar el registro/);
      assert.equal(await page.storage('kibco.eventos'), before, 'disk untouched');
      await restoreWrites(page);
      await capture(page, 'despues');
      const evs = await events(page);
      assert.equal(evs.length, 21, 'memory kept the full old log (no compacted copy swapped in)');
      assert.ok(!evs.some((e) => e.tipo === 'compactado'));
      assert.equal(evs[20].texto, 'despues');
    }
  },
  {
    name: 'capture bar: live chips show the parsed context, day and priority; saving stores the same',
    storage: { 'kibco.esquema': '4', 'kibco.contexto': 'trabajo' },
    async fn(page) {
      assert.equal(await page.visible('#capChips'), false, 'no chips while the bar is empty');
      await page.type('#txtCaptura', 'pagar luz #casa !! mañana');
      assert.equal(await page.visible('#capChips'), true, 'chips appear while typing');
      assert.equal((await page.text('#capCtx')).trim(), 'Casa');
      assert.equal((await page.text('#capDia')).trim(), 'Mañana');
      assert.equal((await page.text('#capNivel')).trim(), 'Urgente');
      // 390px: the chip row stays on screen and the bar does not overflow sideways.
      const row = await page.rect('#capChips');
      assert.ok(row.x >= 0 && row.r <= 390.5, 'chips inside the viewport: ' + row.x + '-' + row.r);
      assert.equal(await page.eval("document.querySelector('.captura').scrollWidth<=document.querySelector('.captura').clientWidth"), true, 'no horizontal overflow');
      await page.screenshot(path.join(OUT, 'capture-mobile.png'));
      await page.type('#txtCaptura', 'pagar luz #casa !! mañana', true);
      const it = (await items(page)).find((i) => i.texto === 'pagar luz');
      assert.equal(it.contexto, 'hogar');
      assert.equal(it.nivel, 'urgente');
      assert.equal(it.fecha, ymd(1));
      assert.equal(await page.visible('#capChips'), false, 'chips clear after saving');
      // Reminder + default target: the chips name the view context and the time.
      await page.type('#txtCaptura', 'turno @9:30 mañana');
      assert.equal((await page.text('#capCtx')).trim(), 'Trabajo');
      assert.equal((await page.text('#capDia')).trim(), 'Mañana 09:30');
      assert.equal(await page.visible('#capNivel'), false, 'no priority chip without a mark');
    }
  },
  {
    name: 'capture bar: tapping the context chip picks the target; the item saves there; history stays in sync',
    storage: { 'kibco.esquema': '4', 'kibco.contexto': 'trabajo' },
    async fn(page) {
      const capa = () => page.eval('history.state && history.state.kcoCapa || null');
      await page.type('#txtCaptura', 'idea video');
      assert.equal((await page.text('#capCtx')).trim(), 'Trabajo');
      await page.click('#capCtx');
      assert.ok(await page.eval("document.getElementById('tapaDestino').className.indexOf('on')>-1"), 'target sheet open');
      assert.equal(await page.eval("document.getElementById('tapaDestino').getAttribute('role')"), 'dialog');
      assert.equal(await capa(), 'tapaDestino');
      assert.equal(await page.count('#destsel [data-ctx="todo"]'), 0, 'Todo is not a target');
      await page.click('#destsel [data-ctx="contenido"]');
      await sleep(150);
      assert.equal(await page.eval("document.getElementById('tapaDestino').className"), 'tapa', 'sheet closed');
      assert.equal(await capa(), null, 'history popped with the sheet');
      assert.equal(await page.eval('document.activeElement&&document.activeElement.id'), 'txtCaptura', 'focus back in the bar');
      assert.equal((await page.text('#capCtx')).trim(), 'Contenido');
      await page.type('#txtCaptura', 'idea video', true);
      assert.equal((await items(page)).find((i) => i.texto === 'idea video').contexto, 'contenido');
      assert.equal(await page.storage('kibco.contexto'), 'trabajo', 'the view context did not change');
      // The pick is for one capture: the next one goes back to the view context.
      await page.type('#txtCaptura', 'otra cosa');
      assert.equal((await page.text('#capCtx')).trim(), 'Trabajo');
      // A typed #tag is replaced by the pick, so the chip and the saved item agree.
      await page.type('#txtCaptura', 'barrer #casa patio');
      assert.equal((await page.text('#capCtx')).trim(), 'Casa');
      await page.click('#capCtx');
      await page.click('#destsel [data-ctx="apps"]');
      await sleep(150);
      assert.equal(await page.eval("document.getElementById('txtCaptura').value"), 'barrer patio');
      assert.equal((await page.text('#capCtx')).trim(), 'Apps');
      await page.type('#txtCaptura', 'barrer patio', true);
      assert.equal((await items(page)).find((i) => i.texto === 'barrer patio').contexto, 'apps');
    }
  },
  {
    name: 'capture bar: n and / focus it; typing inside a field or with a sheet open is never hijacked',
    storage: seed(),
    width: 1366, height: 900, mobile: false,
    async fn(page) {
      const active = () => page.eval('document.activeElement&&document.activeElement.id||""');
      const value = () => page.eval("document.getElementById('txtCaptura').value");
      await page.eval('document.activeElement&&document.activeElement.blur()');
      await page.press('n');
      assert.equal(await active(), 'txtCaptura', 'n focuses the capture bar');
      assert.equal(await value(), '', 'the shortcut key is not typed');
      await page.eval('document.activeElement.blur()');
      await page.press('/');
      assert.equal(await active(), 'txtCaptura', '/ focuses the capture bar');
      assert.equal(await value(), '');
      // Already typing: n and / are just characters.
      await page.press('n');
      await page.press('/');
      assert.equal(await value(), 'n/', 'typed, not hijacked');
      await page.eval("document.getElementById('txtCaptura').value='';document.activeElement.blur()");
      // A sheet is open: the key stays with the sheet.
      await page.click('#navLateral [data-vista="tablero"]');
      await page.click('#lista li.item');
      await sleep(200);
      assert.ok(await page.eval("document.getElementById('tapaItem').className.indexOf('on')>-1"), 'item sheet open');
      await page.press('n');
      assert.notEqual(await active(), 'txtCaptura', 'no jump while a sheet is open');
      assert.equal(await value(), '');
      await page.key('Escape');
      await sleep(150);
      // Any other editable field (no sheet open) keeps its keys.
      await page.eval("(function(){var i=document.createElement('input');i.id='otroCampo';document.querySelector('main').appendChild(i);i.focus();})()");
      await page.press('n');
      await page.press('/');
      assert.equal(await active(), 'otroCampo', 'focus stays in the other field');
      assert.equal(await page.eval("document.getElementById('otroCampo').value"), 'n/');
      await page.eval("document.getElementById('otroCampo').remove()");
      await page.type('#txtCaptura', 'pagar luz #casa !');
      await page.screenshot(path.join(OUT, 'capture-desktop.png'));
      const row = await page.rect('#capChips');
      assert.ok(row && row.w > 0 && row.r <= 1366, 'chips laid out on desktop');
    }
  },
  {
    name: 'sheets: a self-initiated history.go whose popstate never arrives does not strand later sheets without a history entry',
    storage: seed(),
    async fn(page) {
      const capa = () => page.eval('history.state && history.state.kcoCapa || null');
      await page.click('#btnCtx');
      await sleep(150);
      assert.equal(await capa(), 'tapaCtx');
      // history.go becomes a no-op (history boundary, bfcache, external navigation): no popstate follows.
      await page.eval('window.__go=history.go;history.go=function(){}');
      await page.key('Escape');
      await sleep(450);
      assert.equal(await page.eval("document.getElementById('tapaCtx').className"), 'tapa', 'the switcher closed');
      await openFirstItem(page);
      await sleep(150);
      assert.ok(await page.eval("document.getElementById('tapaItem').className.indexOf('on')>-1"), 'the item sheet is open');
      assert.equal(await capa(), 'tapaItem', 'the sheet opened afterwards still gets its own history entry');
      // With traversal back, back closes only that sheet.
      await page.eval('history.go=window.__go');
      await page.eval('history.back()');
      await sleep(200);
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa', 'back closes the item sheet');
      assert.equal(await page.eval("document.getElementById('tabTareas').getAttribute('aria-selected')"), 'true', 'back only closed the sheet');
    }
  },
  {
    name: 'capture bar: at 320px long chips (Mañana 09:30 + priority) may wrap and the content still clears the bar',
    storage: seed(),
    width: 320, height: 700,
    async fn(page) {
      await page.type('#txtCaptura', 'turno medico @9:30 mañana !! #contenido');
      assert.equal((await page.text('#capDia')).trim(), 'Mañana 09:30');
      assert.equal(await page.visible('#capNivel'), true);
      await sleep(50);
      const r = await page.eval(`(function(){var c=document.querySelector('.captura').getBoundingClientRect(),m=document.querySelector('main');
        return {top:c.top,h:window.innerHeight,pad:parseFloat(getComputedStyle(m).paddingBottom)};})()`);
      const covered = r.h - r.top;
      assert.ok(r.pad >= covered, 'main bottom padding ' + r.pad + ' clears capture + tabs ' + covered);
      const row = await page.rect('#capChips');
      assert.ok(row.x >= 0 && row.r <= 320.5, 'chips inside the viewport');
      await page.screenshot(path.join(OUT, 'capture-320.png'));
      // Clearing the bar drops back to the base height.
      await page.eval("(function(){var i=document.getElementById('txtCaptura');i.value='';i.dispatchEvent(new Event('input'));})()");
      assert.equal(await page.eval("document.documentElement.style.getPropertyValue('--capbar-h')"), '');
    }
  },
  {
    name: 'ux: mobile screenshot',
    async fn(page) {
      await capture(page, 'revisar bomba hidraulica');
      await capture(page, 'comprar guantes');
      await page.screenshot(path.join(OUT, 'mobile.png'));
    }
  }
];

function ymd(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function seed() {
  const iso = (days) => new Date(Date.now() + days * 86400000).toISOString();
  let n = 0;
  const it = (o) => Object.assign({ id: 's' + (++n), contexto: 'trabajo', tipo: 'tarea', estado: 'pendiente',
    nivel: 'normal', creado: iso(-3), actualizado: iso(-3), estadoDesde: iso(-3) }, o);
  return {
    'kibco.esquema': '4',
    'kibco.contexto': 'todo',
    'kibco.items': JSON.stringify([
      it({ texto: 'Enviar presupuesto bomba', nivel: 'urgente', prioridad: true, fecha: ymd(-1) }),
      it({ texto: 'Revisar resultado del audit', contexto: 'apps', estado: 'proceso' }),
      it({ texto: 'Pagar internet', contexto: 'hogar', fecha: ymd(0), nivel: 'importante' }),
      it({ texto: 'Grabar video tutorial', contexto: 'contenido', fecha: ymd(2) }),
      it({ texto: 'Entrenamiento piernas', contexto: 'personal', fecha: ymd(0) }),
      it({ texto: 'Respuesta de RRHH', estado: 'esperando', espera: 'RRHH' }),
      it({ texto: 'comprar lija', estado: 'entrada', creado: iso(0) }),
      it({ texto: 'idea: modo foco', contexto: 'apps', estado: 'entrada', creado: iso(0) }),
      it({ texto: 'Ordenar placard', contexto: 'hogar', nivel: 'baja' }),
      it({ texto: 'Informe semanal', estado: 'completado', estadoDesde: iso(0) })
    ]),
    'kibco.eventos': '[]'
  };
}

function rutinaSeed(history, extra) {
  const r = Object.assign({ id: 'rgata', texto: 'Dar de comer a la gata', contexto: 'hogar', tipo: 'dias', cada: 1,
    inicio: ymd(-10), activa: true }, extra || {});
  const list = history.map(([d, estado], k) => ({ id: 'h' + k, texto: r.texto, contexto: 'hogar', tipo: 'tarea',
    estado, rutinaId: r.id, ocurrencia: ymd(d), creado: new Date(Date.now() + d * 86400000).toISOString(),
    estadoDesde: new Date(Date.now() + d * 86400000).toISOString() }));
  return { 'kibco.esquema': '4', 'kibco.contexto': 'todo', 'kibco.rutinas': JSON.stringify([r]), 'kibco.items': JSON.stringify(list) };
}

function misionSeed(withTask) {
  const p = { id: 'pkco', nombre: 'KCO', objetivo: 'Personal Control Center', contexto: 'apps', estado: 'activo',
    hitos: [{ id: 'h1', texto: 'Auditoria', hecho: true, cuando: new Date().toISOString() }, { id: 'h2', texto: 'Release' }],
    creado: new Date().toISOString(), actualizado: new Date().toISOString() };
  const list = withTask ? [{ id: 'mt', texto: 'tarea de mision', contexto: 'apps', tipo: 'tarea', estado: 'pendiente', proyectoId: 'pkco', creado: new Date().toISOString() }] : [];
  return { 'kibco.esquema': '4', 'kibco.contexto': 'todo', 'kibco.contextoCaptura': 'apps', 'kibco.proyectos': JSON.stringify([p]), 'kibco.items': JSON.stringify(list) };
}

// Simulates a full browser storage for kibco.items only (the event log still saves).
async function failItemWrites(page) {
  await page.eval("(function(){var o=Storage.prototype.setItem;window.__setItem=o;Storage.prototype.setItem=function(k,v){if(k==='kibco.items'){throw new Error('quota');}return o.call(this,k,v);};})()");
}

// Simulates a full browser storage for the event log only (items still save).
async function failEventWrites(page) {
  await page.eval("(function(){var o=Storage.prototype.setItem;window.__setItem=o;Storage.prototype.setItem=function(k,v){if(k==='kibco.eventos'){throw new Error('quota');}return o.call(this,k,v);};})()");
}

// Replaces navigator.serviceWorker before the app runs (CDP injection, not CSP-bound)
// so the update flow can be driven deterministically: a real second SW version
// cannot be produced from the static repo root. mode 'waiting' = an update already
// waits; 'installing' = window.__installNew() simulates updatefound -> installed.
async function stubServiceWorker(page, mode) {
  const source = `(function(){
    var ls={};
    function worker(state){var w={state:state,ls:[],postMessage:function(m){(window.__swMsgs=window.__swMsgs||[]).push(m);},
      addEventListener:function(t,f){if(t==='statechange')w.ls.push(f);}};return w;}
    var reg={waiting:${mode === 'waiting' ? "worker('installed')" : 'null'},installing:null,active:worker('activated'),rls:[],
      addEventListener:function(t,f){if(t==='updatefound')reg.rls.push(f);},update:function(){return Promise.resolve();}};
    window.__installNew=function(){var w=worker('installing');reg.installing=w;reg.rls.forEach(function(f){f({});});
      w.state='installed';reg.installing=null;reg.waiting=w;w.ls.forEach(function(f){f({});});};
    var sw={controller:{postMessage:function(){}},ready:Promise.resolve(reg),register:function(){return Promise.resolve(reg);},
      addEventListener:function(t,f){(ls[t]=ls[t]||[]).push(f);}};
    window.__fireSw=function(t){(ls[t]||[]).forEach(function(f){f({});});};
    Object.defineProperty(Navigator.prototype,'serviceWorker',{configurable:true,get:function(){return sw;}});
  })();`;
  await page.addInitScript(source);
  await page.reload();
  await sleep(100);
}

async function restoreWrites(page) {
  await page.eval('Storage.prototype.setItem=window.__setItem');
}

// Opens a card's quick menu the keyboard/mouse way (context menu); swipe-left is covered by its own spec.
async function openQuickMenu(page, sel) {
  await page.eval(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
  await sleep(80);
  assert.ok(await page.eval("document.getElementById('tapaRapido').className.indexOf('on')>-1"), 'quick menu open');
}

async function openFirstItem(page, estado) {
  await toTasks(page);
  if (estado) {
    await page.eval(`(function(){var c=document.querySelector('#chips [data-filtro="${estado}"]');if(c)c.click();})()`);
  }
  await page.click('#lista li.item');
}
