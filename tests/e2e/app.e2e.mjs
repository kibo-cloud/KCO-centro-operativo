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

async function toTasks(page) {
  await page.click('#tabTareas');
  await page.click('#segBtnTareas');
}

export const tests = [
  {
    name: 'boot: renders without errors',
    async fn(page) {
      assert.match(await page.eval('document.title'), /KCO/);
      assert.equal(await page.storage('kibco.esquema'), '4');
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
    name: 'core: edit text from the sheet',
    async fn(page) {
      await capture(page, 'texto viejo');
      await openFirstItem(page);
      await page.click('#btnEditar');
      await page.type('#txtEditar', 'texto nuevo');
      await page.click('#btnGuardarEdicion');
      assert.equal((await items(page))[0].texto, 'texto nuevo');
      assert.ok((await events(page)).some((e) => e.tipo === 'edicion'));
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
      await page.click('[data-acc="acompras"]');
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
      await toTasks(page);
      await page.click('[data-acc="acompras"]');
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
      await page.click('#btnCerrarItem');
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
      await page.click('#btnCerrarItem');
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
      await page.click('#btnCerrarItem');
      await toTasks(page);
      await page.eval(`(function(){var l=document.querySelectorAll('#lista li.item');for(var i=0;i<l.length;i++){if(l[i].textContent.indexOf('deshago')>-1){l[i].querySelector('[data-acc="listo"]').click();}}})()`);
      await page.click('#btnDeshacer');
      await page.click('#tabMisiones');
      await page.click('[data-mision="pkco"]');
      await page.click('#misHitos [data-hito="h2"]');
      await page.click('#btnCerrarMision');
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

async function openFirstItem(page, estado) {
  await toTasks(page);
  if (estado) {
    await page.eval(`(function(){var c=document.querySelector('#chips [data-filtro="${estado}"]');if(c)c.click();})()`);
  }
  await page.click('#lista li.item');
}
