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
      await page.click('li.item');
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
      await page.click('[data-acc="acompras"]');
      await page.eval(`(function(){var l=JSON.parse(localStorage.getItem('kibco.items'));l[0].estado='oc_enviada';l[0].pausado=true;localStorage.setItem('kibco.items',JSON.stringify(l));})()`);
      await page.reload();
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"todo\"]').click()");
      await page.eval("document.getElementById('tabCompras').click()");
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
      await page.eval("document.getElementById('tabTablero').click()");
      assert.equal(await page.count('#lista li.item'), 3);
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

async function openFirstItem(page, estado) {
  if (estado) {
    await page.eval(`(function(){var c=document.querySelector('#chips [data-filtro="${estado}"]');if(c)c.click();})()`);
  }
  await page.click('li.item');
}
