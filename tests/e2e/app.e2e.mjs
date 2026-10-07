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

async function openFirstItem(page, estado) {
  await toTasks(page);
  if (estado) {
    await page.eval(`(function(){var c=document.querySelector('#chips [data-filtro="${estado}"]');if(c)c.click();})()`);
  }
  await page.click('#lista li.item');
}
