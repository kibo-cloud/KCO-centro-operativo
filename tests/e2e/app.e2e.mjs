// End-to-end specs. Each test starts on a fresh page with the given localStorage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { sleep, esperarHasta, ROOT } from './harness.mjs';

const OUT = path.join(ROOT, 'tests', 'e2e', 'out');
// Emoji and pictographs: the interface shows stroke icons and words instead (Cabina).
const EMOJI_UI = /[\u{1F000}-\u{1FAFF}\u2600-\u27BF\u2B50\u203C\u23E9-\u23FA\u2610\u2611\u2715]/u;
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

// Our own history traversals land late: history.go / back really run 600ms after the call.
const SLOW_HISTORY = "(function(){var h=history,g=h.go,b=h.back;window.__go=g;window.__back=b;" +
  "h.go=function(n){setTimeout(function(){g.call(h,n);},600);};h.back=function(){setTimeout(function(){b.call(h);},600);};})()";

const isOpen = (page, id) => page.eval(`document.getElementById(${JSON.stringify(id)}).className.indexOf('on')>-1`);
// Section ids in the order the Ajustes "Apartados" list shows them.
const apRows = (page) => page.eval("Array.prototype.map.call(document.querySelectorAll('#listaApartados [data-ap]'),function(r){return r.getAttribute('data-ap');})");

async function openAjustes(page) {
  await page.click('#btnAjustes');
  await sleep(120);
}

// A real fresh install: nothing stored at all (the runner's empty seed stores
// the legacy sections, like an existing user).
async function freshInstall(page) {
  await page.eval('localStorage.clear()');
  await page.reload();
}
// Makes localStorage.setItem throw for the given keys (after letting allow[key]
// writes through), like a full storage; restoreWrites (below) undoes it.
async function failWrites(page, keys, allow = {}) {
  await page.eval(`(function(){var o=window.__setItem||Storage.prototype.setItem,ks=${JSON.stringify(keys)},left=${JSON.stringify(allow)};window.__setItem=o;
    Storage.prototype.setItem=function(k,v){if(ks.indexOf(k)>-1){if(left[k]>0){left[k]--;}else{throw new Error('quota');}}return o.call(this,k,v);};})()`);
}
const migrations = async (page) => (await events(page)).filter((e) => e.tipo === 'migracion');
const storedSectionIds = async (page) => JSON.parse(await page.storage('kibco.apartados')).map((a) => a.id);

async function toTasks(page) {
  await page.click('#tabTareas');
  await page.click('#segBtnTareas');
}

// Schema-5 sections registry with the five legacy sections, for fixtures that
// describe current data (so no 4->5 migration event is logged at boot).
const LEGACY_SECTIONS = JSON.stringify([
  { id: 'trabajo', nom: 'Trabajo', ico: 'clipboard', color: 'naranja', orden: 0, compras: 'fabrica' },
  { id: 'hogar', nom: 'Casa', ico: 'users', color: 'cian', orden: 1, alias: ['casa'] },
  { id: 'apps', nom: 'Apps', ico: 'layers', color: 'violeta', orden: 2, alias: ['app'] },
  { id: 'contenido', nom: 'Contenido', ico: 'play', color: 'rosa', orden: 3 },
  { id: 'personal', nom: 'Personal', ico: 'target', color: 'verde', orden: 4 }
]);

// Custom sections, one per purchase mode, none with a legacy id.
const CUSTOM_SECTIONS = JSON.stringify([
  { id: 'taller', nom: 'Taller', ico: 'settings', color: 'naranja', orden: 0, compras: 'fabrica' },
  { id: 'mercado', nom: 'Mercado', ico: 'cart', color: 'verde', orden: 1, compras: 'lista' },
  { id: 'estudio', nom: 'Estudio', ico: 'book', color: 'azul', orden: 2, compras: 'no' }
]);

// Sections with goals/descriptions (T08): estudio (desc + 2/week), lectura (long desc + 1/month),
// gym (neither). Items are dated relative to now so "this week/month" holds on any day.
const GOAL_SECTIONS = JSON.stringify([
  { id: 'estudio', nom: 'Estudio', ico: 'book', color: 'azul', orden: 0, desc: 'Materias del cuatrimestre', meta: { n: 2, periodo: 'semana' } },
  { id: 'lectura', nom: 'Lectura', ico: 'layers', color: 'violeta', orden: 1,
    desc: 'Una descripcion larga que no entra en una sola linea del telefono y tiene que cortarse con puntos suspensivos', meta: { n: 1, periodo: 'mes' } },
  { id: 'gym', nom: 'Gym', ico: 'trophy', color: 'lima', orden: 2 }
]);
const GOAL_ITEMS = () => {
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 60 * 86400000).toISOString();
  const it = (id, contexto, estado, estadoDesde) => ({ id, texto: id, contexto, tipo: 'tarea', estado, nivel: 'normal',
    creado: old, estadoDesde: estadoDesde || old });
  return JSON.stringify([
    it('g-d1', 'estudio', 'completado', now), it('g-old', 'estudio', 'completado', old), it('g-p1', 'estudio', 'pendiente'),
    it('g-p2', 'estudio', 'pendiente'), it('g-l1', 'lectura', 'completado', now), it('g-g1', 'gym', 'completado', now)
  ]);
};

// Notes (T08b): taller and estudio use notes (estudio by default), mercado has them off.
const NOTE_SECTIONS = JSON.stringify([
  { id: 'taller', nom: 'Taller', ico: 'settings', color: 'naranja', orden: 0, compras: 'fabrica', notas: true,
    tags: [{ id: 'tornos', nom: 'Tornos' }, { id: 'pedidos', nom: 'Pedidos' }] },
  { id: 'mercado', nom: 'Mercado', ico: 'cart', color: 'verde', orden: 1, notas: false },
  { id: 'estudio', nom: 'Estudio', ico: 'book', color: 'azul', orden: 2, compras: 'no' }
]);
function NOTE_LIST() {
  const at = (d) => new Date(2026, 9, d, 12).toISOString();
  return JSON.stringify([
    { id: 'n1', tit: 'Ideas sueltas', txt: 'cambiar la correa', ctx: 'taller', creada: at(1), editada: at(5) },
    { id: 'n2', tit: 'Pedido de rodamientos', txt: 'Llamar a Juan por el precio', ctx: 'taller', tags: ['pedidos'], fijada: true, creada: at(1), editada: at(2) },
    { id: 'n3', tit: 'Reunión de cátedra', txt: 'llevar apuntes', ctx: 'estudio', creada: at(1), editada: at(3) },
    { id: 'n4', tit: 'Yerba', txt: 'precio', ctx: 'mercado', creada: at(1), editada: at(9) },
    { id: 'n5', tit: 'Vieja', txt: 'archivada', ctx: 'taller', archivada: true, creada: at(1), editada: at(8) }
  ]);
}
const noteRows = (page) => page.eval("Array.prototype.map.call(document.querySelectorAll('#listaNotas [data-nota]'),function(r){return r.getAttribute('data-nota');})");

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
      assert.equal(await page.storage('kibco.esquema'), '5');
    }
  },
  {
    name: 'boot: kco.css is loaded and the design tokens resolve',
    async fn(page) {
      assert.ok(await page.eval("Array.prototype.some.call(document.styleSheets,function(s){return /\\/kco\\.css$/.test(s.href||'');})"), 'kco.css stylesheet loaded');
      const tok = (n) => page.eval(`getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(n)}).trim()`);
      assert.equal(await tok('--s-4'), '16px');
      assert.equal(await tok('--tap'), '44px');
      assert.equal(await tok('--fs-13'), '13px');
      // Rules use the tokens: dark background; the focus ring follows the context accent.
      await scheme(page, 'dark');
      assert.equal(await page.eval('getComputedStyle(document.body).backgroundColor'), 'rgb(11, 13, 16)');
      await page.eval("document.body.className='pal-violeta'");
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
      assert.equal(await page.storage('kibco.esquema'), '5');
      const mig = (await events(page)).filter((e) => e.tipo === 'migracion');
      assert.ok(mig.some((e) => e.hasta === 'esquema 4'), 'hogar purchases migration logged');
      assert.ok(mig.some((e) => e.hasta === 'esquema 5'), 'sections migration logged');
      const secs = JSON.parse(await page.storage('kibco.apartados'));
      assert.deepEqual(secs.map((a) => a.id), ['trabajo', 'hogar', 'apps', 'contenido', 'personal']);
    }
  },
  {
    name: 'data: schema 4 migrates to 5 seeding the legacy sections',
    storage: {
      'kibco.esquema': '4',
      'kibco.items': JSON.stringify([
        { id: 'm1', texto: 'tarea casa', contexto: 'hogar', tipo: 'tarea', estado: 'pendiente', nivel: 'normal', creado: '2026-01-01T10:00:00.000Z' },
        { id: 'm2', texto: 'filtro', contexto: 'trabajo', tipo: 'compra', estado: 'esperando_oc', creado: '2026-01-01T10:00:00.000Z' }
      ]),
      'kibco.eventos': '[]'
    },
    async fn(page) {
      assert.equal(await page.storage('kibco.esquema'), '5');
      const secs = JSON.parse(await page.storage('kibco.apartados'));
      assert.deepEqual(secs.map((a) => a.id), ['trabajo', 'hogar', 'apps', 'contenido', 'personal']);
      assert.equal(secs[0].compras, 'fabrica');
      assert.equal(secs[1].nom, 'Casa');
      const mig = (await events(page)).filter((e) => e.tipo === 'migracion');
      assert.equal(mig.length, 1);
      assert.equal(mig[0].desde, 'esquema 4');
      assert.equal(mig[0].hasta, 'esquema 5');
      const list = await items(page);
      assert.equal(list.find((i) => i.id === 'm1').contexto, 'hogar');
      assert.equal(list.find((i) => i.id === 'm2').estado, 'esperando_oc');
      // A second boot does not migrate again.
      await page.reload();
      assert.equal((await events(page)).filter((e) => e.tipo === 'migracion').length, 1);
    }
  },
  {
    name: 'sections: a fresh install opens the template picker first',
    async fn(page) {
      await freshInstall(page);
      assert.ok(await isOpen(page, 'tapaPlantillas'), 'picker open on first run');
      assert.equal(await page.storage('kibco.apartados'), null, 'nothing persisted before choosing');
      const ids = await page.eval("Array.prototype.map.call(document.querySelectorAll('#listaPlantillas [data-plantilla]'),function(b){return b.getAttribute('data-plantilla');})");
      assert.ok(ids.length >= 4, 'several presets plus starting from scratch');
      assert.equal(ids[ids.length - 1], 'cero');
      assert.match(await page.text('#listaPlantillas'), /Empezar de cero/);
      // Every preset previews its sections (name per section).
      assert.match(await page.text('[data-plantilla="trabajo-casa"]'), /Trabajo.*Casa/);
      assert.ok(!(await isOpen(page, 'tapaApartado')), 'the sections editor is not reachable yet');
    }
  },
  {
    name: 'sections: choosing a preset persists its sections and ends the first run',
    async fn(page) {
      await freshInstall(page);
      await page.click('[data-plantilla="estudiante"]');
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'picker closed');
      assert.deepEqual(await storedSectionIds(page), ['estudio', 'proyectos', 'casa', 'personal']);
      assert.equal(await page.storage('kibco.esquema'), '5');
      assert.match(await page.eval("document.getElementById('ctxsel').textContent"), /Estudio/);
      assert.doesNotMatch(await page.eval("document.getElementById('ctxsel').textContent"), /Trabajo/);
      await capture(page, 'leer apunte #casa');
      assert.equal((await items(page))[0].contexto, 'casa');
      await page.reload();
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'no picker on the next boot');
      assert.deepEqual(await storedSectionIds(page), ['estudio', 'proyectos', 'casa', 'personal']);
      assert.equal((await migrations(page)).length, 0, 'no migration event');
      // Everything stays editable in Ajustes > Apartados.
      await openAjustes(page);
      assert.deepEqual(await apRows(page), ['estudio', 'proyectos', 'casa', 'personal']);
    }
  },
  {
    name: 'sections: starting from scratch creates one editable section and opens its editor',
    async fn(page) {
      await freshInstall(page);
      await page.click('[data-plantilla="cero"]');
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'picker closed');
      const secs = JSON.parse(await page.storage('kibco.apartados'));
      assert.equal(secs.length, 1);
      assert.equal(secs[0].activo, true);
      assert.ok(await isOpen(page, 'tapaApartado'), 'editor opened for the new section');
      assert.equal(await page.eval("document.getElementById('apNom').value"), secs[0].nom);
      await page.type('#apNom', 'Taller');
      await page.click('#btnApGuardar');
      assert.ok(!(await isOpen(page, 'tapaApartado')), 'editor closed after saving');
      const after = JSON.parse(await page.storage('kibco.apartados'));
      assert.equal(after.length, 1);
      assert.equal(after[0].nom, 'Taller');
      await page.reload();
      assert.ok(!(await isOpen(page, 'tapaPlantillas')));
      assert.match(await page.eval("document.getElementById('ctxsel').textContent"), /Taller/);
    }
  },
  {
    name: 'sections: dismissing the template picker starts with one generic section',
    async fn(page) {
      await freshInstall(page);
      await page.key('Escape');
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'picker closed');
      const secs = JSON.parse(await page.storage('kibco.apartados'));
      assert.equal(secs.length, 1, 'the app is usable: one active section');
      assert.equal(secs[0].activo, true);
      assert.ok(!(await isOpen(page, 'tapaApartado')), 'no editor on dismiss');
      await capture(page, 'algo');
      assert.equal((await items(page))[0].contexto, secs[0].id);
      await page.reload();
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'no picker on the next boot');
      assert.equal((await migrations(page)).length, 0);
    }
  },
  {
    name: 'sections: dismissing the template picker with the X, the backdrop or back also starts with one generic section',
    async fn(page) {
      const routes = {
        x: () => page.click('#tapaPlantillas .hoja-x'),
        backdrop: () => page.click('#tapaPlantillas'),
        back: async () => { await page.eval('history.back()'); await sleep(250); }
      };
      for (const [route, dismiss] of Object.entries(routes)) {
        await freshInstall(page);
        assert.ok(await isOpen(page, 'tapaPlantillas'), route + ': picker open');
        await dismiss();
        await sleep(150);
        assert.ok(!(await isOpen(page, 'tapaPlantillas')), route + ': picker closed');
        const secs = JSON.parse(await page.storage('kibco.apartados'));
        assert.equal(secs.length, 1, route + ': one generic section saved');
        assert.equal(secs[0].activo, true);
        assert.ok(!(await isOpen(page, 'tapaApartado')), route + ': no editor on dismiss');
        assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), null, route + ': no layer left in history');
      }
    }
  },
  {
    name: 'sections: a failed template write shows the error, keeps the picker open and persists nothing',
    async fn(page) {
      await freshInstall(page);
      await failWrites(page, ['kibco.apartados']);
      await page.click('[data-plantilla="estudiante"]');
      assert.match(await page.text('#plError'), /No se pudo guardar/);
      assert.ok(await isOpen(page, 'tapaPlantillas'), 'picker stays open');
      assert.equal(await page.storage('kibco.apartados'), null, 'no sections persisted');
      assert.equal(await page.storage('kibco.items'), null, 'no items persisted');
      await restoreWrites(page);
      await page.click('[data-plantilla="estudiante"]');
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'a retry works');
      assert.deepEqual(await storedSectionIds(page), ['estudio', 'proyectos', 'casa', 'personal']);
    }
  },
  {
    name: 'sections: a failed write when dismissing the picker is reported, and later saves ask for a template again',
    async fn(page) {
      await freshInstall(page);
      await failWrites(page, ['kibco.apartados']);
      await page.click('#tapaPlantillas .hoja-x');
      await sleep(150);
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'picker closed');
      assert.equal(await page.storage('kibco.apartados'), null, 'nothing persisted');
      assert.match(await page.eval("document.getElementById('aviso').className"), /\bon\b/, 'the failure is shown');
      assert.match(await page.text('#aviso'), /apartado/);
      await restoreWrites(page);
      // Another writer (a new mission) does not fail silently: it asks for a template first.
      await page.click('#tabMisiones');
      await page.click('#btnNuevaMision');
      await page.type('#txtMisNombre', 'Mudanza');
      await page.click('#btnGuardarMision');
      assert.ok(await isOpen(page, 'tapaPlantillas'), 'the picker comes back');
      assert.match(await page.text('#plError'), /Eleg/);
      assert.equal(await page.storage('kibco.proyectos'), null, 'nothing persisted before choosing');
      await page.click('[data-plantilla="personal"]');
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'picker closed after choosing');
      assert.ok(await isOpen(page, 'tapaMision'), 'the mission sheet is still there');
      await page.click('#btnGuardarMision');
      assert.equal(JSON.parse(await page.storage('kibco.proyectos')).length, 1, 'the retry saves');
    }
  },
  {
    name: 'sections ui: a failed write while reordering keeps the order in memory and in storage',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': CUSTOM_SECTIONS },
    async fn(page) {
      await openAjustes(page);
      await failWrites(page, ['kibco.apartados']);
      await page.click('#listaApartados [data-ap="estudio"] [data-subir]');
      assert.deepEqual(await apRows(page), ['taller', 'mercado', 'estudio'], 'rows unchanged');
      assert.deepEqual(await page.eval('KCOCore.apartados().map(function(a){return a.id;})'), ['taller', 'mercado', 'estudio'], 'registry rolled back');
      assert.deepEqual(await storedSectionIds(page), ['taller', 'mercado', 'estudio']);
      assert.match(await page.text('#aviso'), /No se pudo guardar/);
    }
  },
  {
    name: 'sections ui: a failed write while deleting a section rolls everything back and says so',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': CUSTOM_SECTIONS,
      'kibco.items': JSON.stringify([{ id: 'm1', texto: 'ordenar alacena', contexto: 'mercado', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]),
      'kibco.proyectos': JSON.stringify([{ id: 'p1', nombre: 'Despensa', contexto: 'mercado', estado: 'activo', hitos: [] }]) },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="mercado"] .apfila-abrir');
      await page.click('#btnApBorrar');
      await page.click('#apDestinos [data-ctx="estudio"]');
      await failWrites(page, ['kibco.proyectos']);
      await page.click('#btnConfSi');
      await sleep(150);
      assert.match(await page.text('#aviso'), /No se pudo borrar el apartado/);
      assert.deepEqual(await storedSectionIds(page), ['taller', 'mercado', 'estudio'], 'registry untouched in storage');
      assert.deepEqual(await apRows(page), ['taller', 'mercado', 'estudio'], 'and in memory');
      assert.equal((await items(page))[0].contexto, 'mercado', 'items untouched');
      assert.equal(JSON.parse(await page.storage('kibco.proyectos'))[0].contexto, 'mercado');
      assert.equal(await page.eval("KCOCore.infoContexto('mercado') ? 'ok' : 'gone'"), 'ok');
    }
  },
  {
    name: 'sections ui: a failed item write while editing a section rolls the section back and says so',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': CUSTOM_SECTIONS,
      'kibco.items': JSON.stringify([{ id: 'y1', texto: 'yerba', contexto: 'mercado', tipo: 'compra', estado: 'por_comprar', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="mercado"] .apfila-abrir');
      await page.click('#segComprasAp [data-compras="fabrica"]');
      await failWrites(page, ['kibco.items']);
      await page.click('#btnApGuardar');
      assert.ok(await isOpen(page, 'tapaApartado'), 'the editor stays open');
      assert.match(await page.text('#apError'), /No se pudo guardar/);
      assert.match(await page.text('#aviso'), /No se pudo guardar el apartado/);
      assert.equal(JSON.parse(await page.storage('kibco.apartados')).find((a) => a.id === 'mercado').compras, 'lista', 'registry rolled back in storage');
      assert.equal(await page.eval("KCOCore.infoContexto('mercado').compras"), 'lista', 'and in memory');
      assert.equal((await items(page))[0].estado, 'por_comprar');
    }
  },
  {
    name: 'sections ui: a failed item write after confirming a section edit rolls it back and says so',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': CUSTOM_SECTIONS,
      'kibco.items': JSON.stringify([{ id: 'c1', texto: 'rodamiento', contexto: 'taller', tipo: 'compra', estado: 'cotizando', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="taller"] .apfila-abrir');
      await page.click('#segComprasAp [data-compras="no"]');
      await page.click('#btnApGuardar');
      assert.ok(await isOpen(page, 'tapaConfirmar'));
      await failWrites(page, ['kibco.items']);
      await page.click('#btnConfSi');
      await sleep(150);
      assert.match(await page.text('#aviso'), /No se pudo guardar el apartado/);
      assert.equal(JSON.parse(await page.storage('kibco.apartados')).find((a) => a.id === 'taller').compras, 'fabrica');
      assert.equal(await page.eval("KCOCore.infoContexto('taller').compras"), 'fabrica');
      const [c1] = await items(page);
      assert.deepEqual([c1.tipo, c1.estado], ['compra', 'cotizando']);
    }
  },
  {
    name: 'sections ui: when the rollback of a section edit also fails the message says what was kept',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': CUSTOM_SECTIONS,
      'kibco.items': JSON.stringify([{ id: 'y1', texto: 'yerba', contexto: 'mercado', tipo: 'compra', estado: 'por_comprar', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="mercado"] .apfila-abrir');
      await page.click('#segComprasAp [data-compras="fabrica"]');
      // Items never save; the registry saves once (the edit) and then fails (the rollback).
      await failWrites(page, ['kibco.items', 'kibco.apartados'], { 'kibco.apartados': 1 });
      await page.click('#btnApGuardar');
      assert.match(await page.text('#aviso'), /Recarg/);
      const stored = JSON.parse(await page.storage('kibco.apartados')).find((a) => a.id === 'mercado').compras;
      assert.equal(stored, 'fabrica', 'the edit stayed in storage');
      assert.equal(await page.eval("KCOCore.infoContexto('mercado').compras"), stored, 'memory matches storage');
      assert.equal((await items(page))[0].estado, 'por_comprar', 'items unchanged');
    }
  },
  {
    name: 'sections ui: a direct section save failure shows its own reason in #apError, not whatever #aviso holds',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': CUSTOM_SECTIONS },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="mercado"] .apfila-abrir');
      await page.type('#apNom', 'Super');
      await failWrites(page, ['kibco.apartados']);
      // The global notice keeps showing something unrelated (writes to it are ignored).
      await page.eval("Object.defineProperty(document.getElementById('aviso'),'textContent',{configurable:true,get:function(){return 'otro aviso';},set:function(){}})");
      await page.click('#btnApGuardar');
      assert.ok(await isOpen(page, 'tapaApartado'), 'the editor stays open');
      const msg = await page.text('#apError');
      assert.match(msg, /No se pudo guardar el apartado/);
      assert.doesNotMatch(msg, /otro aviso/);
      assert.equal(await page.eval("KCOCore.infoContexto('mercado').nom"), 'Mercado', 'nothing changed');
    }
  },
  {
    name: 'sections: an automatic write while no template is chosen is skipped quietly and never opens the picker',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': '[]' },
    async fn(page) {
      // Keep the app's 30 s tick (reminders + day rollover) callable on demand.
      await page.addInitScript("(function(){var si=window.setInterval;window.__ticks=[];window.setInterval=function(f,ms){if(ms===30000){window.__ticks.push(f);}return si.apply(window,arguments);};})()");
      const soon = new Date(Date.now() + 2500).toISOString();
      await page.eval(`localStorage.setItem('kibco.items',JSON.stringify([{id:'r1',texto:'llamar',contexto:'trabajo',tipo:'tarea',estado:'pendiente',
        creado:'2026-01-01T10:00:00.000Z',recordatorio:${JSON.stringify(soon)},recAvisado:false}]))`);
      await page.reload();
      assert.ok(await isOpen(page, 'tapaPlantillas'), 'no active section: the picker opens at boot');
      await failWrites(page, ['kibco.apartados']);
      await page.click('#tapaPlantillas .hoja-x');
      await sleep(150);
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'dismissed (and the template write failed)');
      await restoreWrites(page);
      await sleep(2600);
      assert.equal(await page.eval('window.__ticks.length'), 1);
      const before = await page.storage('kibco.items');
      await page.eval('window.__ticks[0]()');
      await sleep(100);
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'the automatic reminder write does not pop the picker');
      assert.equal(await page.storage('kibco.items'), before, 'and writes nothing');
      // A user save still asks for a template.
      await capture(page, 'algo nuevo');
      assert.ok(await isOpen(page, 'tapaPlantillas'), 'a user action still asks for a template');
    }
  },
  {
    name: 'sections: a due reminder before choosing a template notifies once, after the template, across ticks and reloads',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': '[]' },
    async fn(page) {
      // Granted notifications that count, and the 30 s tick callable on demand (both survive reloads).
      await page.addInitScript("(function(){var si=window.setInterval;window.__ticks=[];window.setInterval=function(f,ms){if(ms===30000){window.__ticks.push(f);}return si.apply(window,arguments);};" +
        "var N=function(t,o){var l=JSON.parse(sessionStorage.getItem('__notifs')||'[]');l.push(o&&o.tag);sessionStorage.setItem('__notifs',JSON.stringify(l));};N.permission='granted';N.requestPermission=function(){return Promise.resolve('granted');};window.Notification=N;})()");
      const soon = new Date(Date.now() + 1500).toISOString();
      await page.eval(`localStorage.setItem('kibco.items',JSON.stringify([{id:'r1',texto:'llamar',contexto:'personal',tipo:'tarea',estado:'pendiente',
        creado:'2026-01-01T10:00:00.000Z',recordatorio:${JSON.stringify(soon)},recAvisado:false}]))`);
      await page.reload();
      assert.ok(await isOpen(page, 'tapaPlantillas'), 'no active section: the picker opens at boot');
      await sleep(1700);
      const notifs = async () => JSON.parse((await page.eval("sessionStorage.getItem('__notifs')")) || '[]');
      await page.eval('window.__ticks[0]()');
      await page.eval('window.__ticks[0]()');
      await sleep(100);
      assert.deepEqual(await notifs(), [], 'nothing can be saved yet: no notification that would repeat on every boot');
      await page.reload();
      await page.eval('window.__ticks[0]()');
      await sleep(100);
      assert.deepEqual(await notifs(), [], 'still none after a reload');
      await page.click('[data-plantilla="personal"]');
      await sleep(150);
      await page.eval('window.__ticks[0]()');
      await page.eval('window.__ticks[0]()');
      await sleep(100);
      assert.deepEqual(await notifs(), ['r1'], 'with a template: one notification across two ticks');
      assert.equal((await items(page))[0].recAvisado, true, 'and it is persisted');
      await page.reload();
      await page.eval('window.__ticks[0]()');
      await sleep(100);
      assert.deepEqual(await notifs(), ['r1'], 'not repeated after a reload');
    }
  },
  {
    name: 'sections: an existing user never sees the template picker',
    async fn(page) {
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'stored sections: no picker');
      await page.setStorage({ 'kibco.esquema': '4', 'kibco.eventos': '[]',
        'kibco.items': JSON.stringify([{ id: 'v1', texto: 'vieja', contexto: 'hogar', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) });
      await page.reload();
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'schema 4 data: no picker');
      assert.deepEqual(await storedSectionIds(page), ['trabajo', 'hogar', 'apps', 'contenido', 'personal']);
      // Data at schema 5 without a registry (lost key) is also an existing user.
      await page.setStorage({ 'kibco.esquema': '5',
        'kibco.items': JSON.stringify([{ id: 'v2', texto: 'otra', contexto: 'trabajo', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) });
      await page.reload();
      assert.ok(!(await isOpen(page, 'tapaPlantillas')), 'schema 5 data: no picker');
    }
  },
  {
    name: 'sections: a capture before choosing a template persists nothing and never seeds legacy sections',
    async fn(page) {
      await freshInstall(page);
      await capture(page, 'antes de elegir');
      assert.equal(await page.storage('kibco.items'), null, 'no item persisted');
      assert.ok(await isOpen(page, 'tapaPlantillas'), 'the picker asks first');
      assert.equal(await page.eval("document.getElementById('txtCaptura').value"), 'antes de elegir', 'typed text kept');
      await page.reload();
      assert.ok(await isOpen(page, 'tapaPlantillas'), 'still a fresh install on the second boot');
      assert.equal(await page.storage('kibco.apartados'), null, 'no legacy sections seeded');
      assert.equal((await migrations(page)).length, 0, 'no misleading migration event');
      await page.click('[data-plantilla="personal"]');
      await capture(page, 'ahora si');
      const [it] = await items(page);
      assert.equal(it.texto, 'ahora si');
      const ids = await storedSectionIds(page);
      assert.ok(ids.indexOf(it.contexto) > -1, 'captured into a section of the chosen template');
      await page.reload();
      assert.deepEqual(await storedSectionIds(page), ids, 'registry unchanged on the next boot');
      assert.equal((await migrations(page)).length, 0, 'no migration event on the next boot');
    }
  },
  {
    name: 'data: stored custom sections drive the context selector',
    storage: {
      'kibco.esquema': '5',
      'kibco.contexto': 'trabajo',
      'kibco.contextoCaptura': 'trabajo',
      'kibco.apartados': JSON.stringify([{ id: 'estudio', nom: 'Estudio', ico: 'target', color: 'azul', orden: 0, compras: 'no' }])
    },
    async fn(page) {
      assert.equal(await page.eval("document.getElementById('ctxNombre').textContent"), 'Estudio');
      const filas = await page.eval("document.getElementById('ctxsel').textContent");
      assert.match(filas, /Estudio/);
      assert.doesNotMatch(filas, /Trabajo|Casa/);
      await capture(page, 'leer capitulo 2');
      assert.equal((await items(page))[0].contexto, 'estudio');
      assert.equal(JSON.parse(await page.storage('kibco.apartados')).length, 1);
      assert.equal((await events(page)).filter((e) => e.tipo === 'migracion').length, 0);
    }
  },
  {
    name: 'sections: a custom section paints its palette color and its icon',
    storage: {
      'kibco.esquema': '5',
      'kibco.contexto': 'estudio',
      'kibco.apartados': JSON.stringify([{ id: 'estudio', nom: 'Estudio', ico: 'book', color: 'azul', orden: 0 },
        { id: 'gym', nom: 'Gym', ico: 'trophy', color: 'lima', orden: 1 }])
    },
    async fn(page) {
      const dot = (sel) => page.eval(`document.querySelector(${JSON.stringify(sel)}).className`);
      // Name of the section icon (iconos.js SVG) and how many shapes it drew.
      const ico = (sel) => page.eval(`(function(){var s=document.querySelector(${JSON.stringify(sel)});return s?s.getAttribute('data-ico-nom')+':'+s.childNodes.length:'';})()`);
      assert.equal(await page.eval("document.body.getAttribute('data-ctx')"), 'estudio');
      assert.match(await page.eval('document.body.className'), /\bpal-azul\b/, 'body takes the palette class');
      assert.equal(await page.eval("getComputedStyle(document.body).getPropertyValue('--accent').trim()"),
        await page.eval("getComputedStyle(document.documentElement).getPropertyValue('--pal-azul').trim()"));
      assert.equal(await dot('#ctxPunto'), 'punto pal-azul', 'header dot');
      assert.equal(await dot('#ctxsel [data-ctx="estudio"] .punto'), 'punto pal-azul');
      assert.equal(await dot('#ctxsel [data-ctx="gym"] .punto'), 'punto pal-lima');
      assert.match(await ico('#ctxsel [data-ctx="estudio"] svg.ctxfila-ico'), /^book:[1-9]/, 'selector row shows the icon');
      assert.match(await ico('#ctxsel [data-ctx="gym"] svg.ctxfila-ico'), /^trophy:[1-9]/);
      assert.match(await ico('#ctxLateral [data-ctx="estudio"] svg.ctxfila-ico'), /^book:[1-9]/, 'sidebar row shows the icon');
      assert.match(await ico('#btnCtx svg.ctxchip-ico'), /^book:[1-9]/, 'the header chip shows the icon');
      // Switching section repaints body, dot and header icon.
      await page.click('#btnCtx');
      await page.click('#ctxsel [data-ctx="gym"]');
      assert.equal(await page.eval("document.body.getAttribute('data-ctx')"), 'gym');
      assert.match(await page.eval('document.body.className'), /\bpal-lima\b/);
      assert.match(await ico('#btnCtx svg.ctxchip-ico'), /^trophy:[1-9]/);
      // Todo is the neutral aggregate (chalk accent, pal-todo).
      await page.click('#btnCtx');
      await page.click('#ctxsel [data-ctx="todo"]');
      assert.equal(await page.eval("document.body.getAttribute('data-ctx')"), 'todo');
      assert.match(await page.eval('document.body.className'), /\bpal-todo\b/);
      // A color change in the registry (same ids) repaints the rows.
      await page.eval("(function(){var v=JSON.stringify([{id:'estudio',nom:'Estudio',ico:'book',color:'rojo',orden:0},{id:'gym',nom:'Gym',ico:'trophy',color:'lima',orden:1}]);" +
        "localStorage.setItem('kibco.apartados',v);window.dispatchEvent(new StorageEvent('storage',{key:'kibco.apartados',newValue:v}));})()");
      await sleep(100);
      assert.equal(await dot('#ctxsel [data-ctx="estudio"] .punto'), 'punto pal-rojo');
    }
  },
  {
    name: 'sections: the destination sheet lists the registry sections with icon and color',
    storage: {
      'kibco.esquema': '5',
      'kibco.contexto': 'estudio',
      'kibco.apartados': JSON.stringify([{ id: 'estudio', nom: 'Estudio', ico: 'book', color: 'azul', orden: 0 },
        { id: 'gym', nom: 'Gym', ico: 'trophy', color: 'lima', orden: 1 }])
    },
    async fn(page) {
      await page.type('#txtCaptura', 'algo');
      await page.click('#capCtx');
      const rows = await page.eval("Array.prototype.map.call(document.querySelectorAll('#destsel [data-ctx]'),function(b){var s=b.querySelector('svg.ctxfila-ico');" +
        "return b.getAttribute('data-ctx')+'|'+b.querySelector('.punto').className+'|'+(s?s.getAttribute('data-ico-nom'):'');})");
      assert.deepEqual(rows, ['estudio|punto pal-azul|book', 'gym|punto pal-lima|trophy']);
    }
  },
  {
    name: 'sections: a custom fabrica section gets the factory purchase flow, labels, report and catalogs',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'taller', 'kibco.contextoCaptura': 'taller', 'kibco.apartados': CUSTOM_SECTIONS },
    async fn(page) {
      await capture(page, 'rodamiento 6204');
      await toTasks(page);
      assert.ok(await page.visible('#segBtnCompras'), 'Compras segment offered');
      await openQuickMenu(page, '#lista li.item');
      assert.ok(await page.visible('#btnRapCompras'));
      await page.click('#tapaRapido [data-rap="compras"]');
      assert.equal((await items(page))[0].estado, 'cotizando', 'factory flow');
      await page.click('#segBtnCompras');
      assert.equal(await page.text('#rotCompras'), 'Material recibido');
      assert.match(await page.text('#chipsCompra'), /Abiertas/);
      await page.click('#tabRegistro');
      await page.click('#btnResumen');
      assert.match(await page.eval("document.getElementById('txtSalida').value"), /COMPRAS ABIERTAS:\n- rodamiento 6204 \(Cotizando\)/);
      await page.key('Escape');
      await page.click('#btnRelevo');
      const relevo = await page.eval("document.getElementById('txtSalida').value");
      assert.ok(relevo.indexOf('🔧 RELEVO DE TURNO · Taller') === 0, 'factory header: ' + relevo.split('\n')[0]);
      assert.match(relevo, /COMPRAS PENDIENTES \(1\)/);
      await page.key('Escape');
      await page.click('#btnAjustes');
      assert.ok(await page.visible('#bloqueCatalogos'), 'catalogs shown with a factory section');
    }
  },
  {
    name: 'sections: a custom lista section gets the simple purchase list labels and report',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'mercado', 'kibco.contextoCaptura': 'mercado', 'kibco.apartados': CUSTOM_SECTIONS },
    async fn(page) {
      await capture(page, 'yerba');
      await toTasks(page);
      await openQuickMenu(page, '#lista li.item');
      await page.click('#tapaRapido [data-rap="compras"]');
      assert.equal((await items(page))[0].estado, 'por_comprar', 'simple list');
      await page.click('#segBtnCompras');
      assert.equal(await page.text('#rotCompras'), 'Lista de compras');
      assert.match(await page.text('#chipsCompra'), /Por comprar/);
      assert.doesNotMatch(await page.text('#chipsCompra'), /Cotizando/);
      await page.click('#tabRegistro');
      await page.click('#btnRelevo');
      const relevo = await page.eval("document.getElementById('txtSalida').value");
      assert.ok(relevo.indexOf('🛒 RELEVO DE TURNO · Mercado') === 0, 'section emoji header: ' + relevo.split('\n')[0]);
      assert.match(relevo, /LISTA DE COMPRAS \(1\)/);
    }
  },
  {
    name: 'sections: a section without purchases hides Compras, never offers moving to it and falls back to Tareas',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'taller', 'kibco.contextoCaptura': 'taller', 'kibco.apartados': CUSTOM_SECTIONS },
    async fn(page) {
      await toTasks(page);
      await page.click('#segBtnCompras');
      assert.equal(await page.eval("document.getElementById('vistaCompras').style.display"), 'block');
      await page.click('#btnCtx');
      await page.click('#ctxsel [data-ctx="estudio"]');
      assert.equal(await page.eval("document.getElementById('vistaCompras').style.display"), 'none', 'Compras left');
      assert.equal(await page.eval("document.getElementById('vistaTablero').style.display"), 'block', 'back to Tareas');
      assert.equal(await page.visible('#segBtnCompras'), false, 'no Compras segment');
      await capture(page, 'leer capitulo 3');
      const [it] = await items(page);
      assert.equal(it.contexto, 'estudio');
      assert.equal(it.tipo, 'tarea');
      await openQuickMenu(page, '#lista li.item');
      assert.equal(await page.visible('#btnRapCompras'), false, 'no Mover a Compras');
      await page.key('Escape');
      await page.click('#lista li.item');
      assert.equal(await page.visible('#btnAcompra'), false, 'no purchase action in the sheet');
      await page.key('Escape');
      // Todo still offers Compras while some section uses purchases.
      await page.click('#btnCtx');
      await page.click('#ctxsel [data-ctx="todo"]');
      assert.ok(await page.visible('#segBtnCompras'));
    }
  },
  {
    name: 'sections: purchase catalogs are hidden in Ajustes without a factory section',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'estudio',
      'kibco.apartados': JSON.stringify([{ id: 'estudio', nom: 'Estudio', compras: 'no', orden: 0 }, { id: 'mercado', nom: 'Mercado', compras: 'lista', orden: 1 },
        { id: 'viejo', nom: 'Viejo', compras: 'fabrica', orden: 2, activo: false }]) },
    async fn(page) {
      await page.click('#btnAjustes');
      assert.ok(await page.visible('#btnExportar'));
      assert.equal(await page.visible('#bloqueCatalogos'), false, 'catalogs hidden');
      assert.ok(await page.eval("!!document.getElementById('bloqueCatalogos')"), 'present but hidden');
    }
  },
  {
    name: 'sections ui: Ajustes lists every section (active first, archived marked) right after Backup',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': JSON.stringify([
      { id: 'viejo', nom: 'Viejo', ico: 'flag', color: 'gris', orden: 0, activo: false },
      { id: 'estudio', nom: 'Estudio', ico: 'book', color: 'azul', orden: 1 },
      { id: 'gym', nom: 'Gym', ico: 'trophy', color: 'lima', orden: 2 }]) },
    async fn(page) {
      await openAjustes(page);
      assert.deepEqual(await apRows(page), ['estudio', 'gym', 'viejo']);
      assert.match(await page.text('#listaApartados [data-ap="viejo"]'), /Archivado/);
      assert.doesNotMatch(await page.text('#listaApartados [data-ap="gym"]'), /Archivado/);
      assert.equal(await page.eval("document.querySelector('#listaApartados [data-ap=\"gym\"] .punto').className"), 'punto pal-lima');
      assert.equal(await page.eval("document.querySelector('#listaApartados [data-ap=\"gym\"] svg.apfila-ico').getAttribute('data-ico-nom')"), 'trophy');
      assert.ok(await page.visible('#btnNuevoApartado'));
      const order = await page.eval("(function(){var h=document.getElementById('tapaAjustes'),a=h.getElementsByTagName('*'),p={},k;for(k=0;k<a.length;k++){if(a[k].id)p[a[k].id]=k;}return p;})()");
      assert.ok(order.btnExportar < order.btnEditarApartados && order.btnEditarApartados < order.segTema, 'the Apartados group sits between the backup card and Pantalla');
      assert.ok(await page.eval("document.getElementById('tapaApartados').contains(document.getElementById('listaApartados'))"), 'the list lives in its sub-sheet');
      assert.equal(await page.eval('document.documentElement.scrollWidth <= window.innerWidth'), true, 'no horizontal scroll at 390px');
    }
  },
  {
    name: 'sections ui: a new section shows in the selector and #slug capture saves there',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'todo', 'kibco.apartados': CUSTOM_SECTIONS },
    async fn(page) {
      await openAjustes(page);
      await page.click('#btnNuevoApartado');
      assert.ok(await isOpen(page, 'tapaApartado'), 'the editor opens');
      assert.ok(await page.eval("(function(){var h=document.querySelector('#tapaApartado .hoja');return h.scrollWidth<=h.clientWidth;})()"), 'the editor fits 390px');
      await sleep(400);
      await page.screenshot(path.join(OUT, 'apartado-editor-mobile.png'));
      await page.type('#apNom', 'Diseño 3D');
      assert.match(await page.text('#apSlug'), /#diseno-3d/, 'shows the capture tag');
      await page.click('#apIcos [data-ico-ap="star"]');
      await page.click('#apColores [data-color="rosa"]');
      await page.type('#apDesc', 'Piezas para imprimir');
      await page.click('#segMetaAp [data-meta="semana"]');
      await page.type('#apMetaN', '4');
      await page.type('#apAlias', 'impresion, 3d');
      assert.match(await page.text('#apAliasPista'), /#impresion/);
      await page.click('#segComprasAp [data-compras="no"]');
      await page.type('#apTagNuevo', 'Filamento');
      await page.click('#btnApTag');
      await page.click('#btnApGuardar');
      assert.equal(await isOpen(page, 'tapaApartado'), false, 'the editor closes');
      assert.ok(await isOpen(page, 'tapaAjustes'), 'back in Ajustes');
      const regs = JSON.parse(await page.storage('kibco.apartados'));
      const a = regs.find((x) => x.id === 'diseno-3d');
      assert.ok(a, 'saved with the slug id: ' + regs.map((x) => x.id));
      assert.deepEqual([a.nom, a.ico, a.color, a.desc, a.compras, a.orden], ['Diseño 3D', 'star', 'rosa', 'Piezas para imprimir', 'no', 3]);
      assert.deepEqual(a.meta, { n: 4, periodo: 'semana' });
      assert.deepEqual(a.alias, ['impresion', '3d']);
      assert.deepEqual(a.tags, [{ id: 'filamento', nom: 'Filamento' }]);
      assert.deepEqual(await apRows(page), ['taller', 'mercado', 'estudio', 'diseno-3d']);
      await page.key('Escape');
      assert.ok(await page.eval("!!document.querySelector('#ctxsel [data-ctx=\"diseno-3d\"]')"), 'in the selector');
      await capture(page, 'soporte de monitor #impresion');
      assert.equal((await items(page)).find((i) => i.texto === 'soporte de monitor').contexto, 'diseno-3d');
      await capture(page, 'engranaje #diseno-3d');
      assert.equal((await items(page)).find((i) => i.texto === 'engranaje').contexto, 'diseno-3d');
      // A second section with the same name gets a unique id; an empty name is refused.
      await openAjustes(page);
      await page.click('#btnNuevoApartado');
      await page.click('#btnApGuardar');
      assert.ok(await isOpen(page, 'tapaApartado'), 'an empty name keeps the editor open');
      assert.match(await page.text('#apError'), /nombre/i);
      await page.type('#apNom', 'Diseño 3D');
      await page.click('#btnApGuardar');
      assert.ok(JSON.parse(await page.storage('kibco.apartados')).some((x) => x.id === 'diseno-3d-2'));
    }
  },
  {
    name: 'sections ui: editing name, color and icon repaints the header and keeps the id',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'estudio', 'kibco.apartados': CUSTOM_SECTIONS,
      'kibco.items': JSON.stringify([{ id: 'e1', texto: 'leer', contexto: 'estudio', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="estudio"] .apfila-abrir');
      assert.equal(await page.eval("document.getElementById('apNom').value"), 'Estudio', 'the editor loads the section');
      assert.match(await page.eval("document.querySelector('#apColores [data-color=\"azul\"]').className"), /\bon\b/);
      await page.type('#apNom', 'Facultad');
      await page.click('#apColores [data-color="violeta"]');
      await page.click('#apIcos [data-ico-ap="compass"]');
      await page.click('#btnApGuardar');
      assert.equal(await page.eval("document.getElementById('ctxNombre').textContent"), 'Facultad');
      assert.equal(await page.eval("document.getElementById('ctxPunto').className"), 'punto pal-violeta');
      assert.equal(await page.eval("document.querySelector('#btnCtx svg.ctxchip-ico').getAttribute('data-ico-nom')"), 'compass');
      assert.match(await page.eval('document.body.className'), /\bpal-violeta\b/);
      assert.match(await page.text('#listaApartados [data-ap="estudio"]'), /Facultad/, 'the Ajustes list follows');
      assert.equal((await items(page))[0].contexto, 'estudio', 'records keep the stable id');
      await page.key('Escape');
      await capture(page, 'parcial #facultad');
      assert.equal((await items(page)).find((i) => i.texto === 'parcial').contexto, 'estudio', 'the new name captures');
    }
  },
  {
    name: 'sections: the active section shows its description and goal progress, live after completing an item',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'estudio', 'kibco.apartados': GOAL_SECTIONS, 'kibco.items': GOAL_ITEMS() },
    async fn(page) {
      await scheme(page, 'dark');
      assert.equal(await page.visible('#apInfo'), true, 'the info band shows for a section with desc and goal');
      assert.equal(await page.text('#apInfo .apinfo-desc'), 'Materias del cuatrimestre');
      const bar = '#apInfo [role="progressbar"]';
      const aria = (n) => page.eval(`document.querySelector(${JSON.stringify(bar)}).getAttribute(${JSON.stringify(n)})`);
      assert.equal(await page.text('#apInfo .apmeta-txt'), '1/2 esta semana', 'only this week, this section, completed');
      assert.deepEqual([await aria('aria-valuemin'), await aria('aria-valuemax'), await aria('aria-valuenow')], ['0', '2', '1']);
      assert.equal(await aria('aria-valuetext'), '1/2 esta semana');
      assert.match(await aria('aria-label'), /Estudio/);
      assert.equal(await page.eval("document.querySelector('#apInfo .apmeta').className"), 'apmeta');
      assert.equal(await page.eval('document.documentElement.scrollWidth <= window.innerWidth'), true, 'no horizontal scroll at 390px');
      await sleep(300);
      await page.screenshot(path.join(OUT, 'section-goal-mobile-dark.png'));
      // Completing a pending item of the section updates the progress and announces the met goal in words.
      await toTasks(page);
      await page.click('#lista li.item[data-id="g-p1"] .chk');
      await sleep(80);
      assert.equal(await page.text('#apInfo .apmeta-txt'), '2/2 esta semana · meta cumplida');
      assert.equal(await aria('aria-valuenow'), '2');
      assert.match(await aria('aria-valuetext'), /meta cumplida/);
      assert.equal(await page.eval("document.querySelector('#apInfo .apmeta').className"), 'apmeta cumplida');
      // A section without desc or goal, and Todo, show no band.
      await page.click('#btnCtx');
      await page.click('#ctxsel [data-ctx="gym"]');
      assert.equal(await page.visible('#apInfo'), false, 'no band without desc and goal');
      await page.click('#btnCtx');
      await page.click('#ctxsel [data-ctx="todo"]');
      assert.equal(await page.visible('#apInfo'), false, 'no band in Todo');
      // A long description is cut to one line instead of overflowing.
      await page.click('#btnCtx');
      await page.click('#ctxsel [data-ctx="lectura"]');
      assert.equal(await page.eval("(function(){var d=document.querySelector('#apInfo .apinfo-desc');return d.scrollWidth>d.clientWidth&&getComputedStyle(d).textOverflow==='ellipsis';})()"), true, 'long desc truncated');
      assert.equal(await page.eval('document.documentElement.scrollWidth <= window.innerWidth'), true);
    }
  },
  {
    name: 'sections: editing the goal and description in Ajustes repaints the band live',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'estudio', 'kibco.apartados': GOAL_SECTIONS, 'kibco.items': GOAL_ITEMS() },
    async fn(page) {
      assert.equal(await page.text('#apInfo .apmeta-txt'), '1/2 esta semana');
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="estudio"] .apfila-abrir');
      await page.type('#apDesc', 'Final de abril');
      await page.click('#segMetaAp [data-meta="mes"]');
      await page.type('#apMetaN', '6');
      await page.click('#btnApGuardar');
      assert.equal(await page.text('#apInfo .apinfo-desc'), 'Final de abril');
      assert.match(await page.text('#apInfo .apmeta-txt'), /^\d+\/6 este mes$/);
      await page.click('#listaApartados [data-ap="estudio"] .apfila-abrir');
      await page.type('#apDesc', '');
      await page.click('#segMetaAp [data-meta="no"]');
      await page.click('#btnApGuardar');
      assert.equal(await page.visible('#apInfo'), false, 'no desc and no goal: the band hides');
    }
  },
  {
    name: 'sections: Campaña in Todo lists every section goal with progress and met state; a section lists only its own',
    width: 1366,
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'todo', 'kibco.apartados': GOAL_SECTIONS, 'kibco.items': GOAL_ITEMS() },
    async fn(page) {
      await scheme(page, 'light');
      await page.click('#tabRegistro');
      const rows = () => page.eval("Array.prototype.map.call(document.querySelectorAll('#secMetas [data-meta-ap]'),function(r){" +
        "return r.getAttribute('data-meta-ap')+'|'+r.querySelector('.apmeta-nom').textContent+'|'+r.querySelector('.apmeta-txt').textContent+'|'+r.className+'|'+r.querySelector('[role=\"progressbar\"]').getAttribute('aria-valuenow');})");
      assert.deepEqual(await rows(), [
        'estudio|Estudio|1/2 esta semana|apmeta|1',
        'lectura|Lectura|1/1 este mes · meta cumplida|apmeta cumplida|1'
      ], 'sections without a goal are omitted');
      assert.match(await page.text('#secMetas .sec-tit'), /Objetivos/);
      assert.match(await page.text('#secMetas .sec-tit b'), /1\/2 cumplidos/);
      assert.equal(await page.eval('document.documentElement.scrollWidth <= window.innerWidth'), true, 'no horizontal scroll at 1366px');
      await page.eval("document.getElementById('secMetas').scrollIntoView()");
      await sleep(300);
      await page.screenshot(path.join(OUT, 'section-goals-campaign-desktop-light.png'));
      await page.click('#ctxLateral [data-ctx="estudio"]');
      assert.deepEqual((await rows()).map((r) => r.split('|')[0]), ['estudio'], 'a section shows only its own goal');
      await page.click('#ctxLateral [data-ctx="gym"]');
      assert.equal(await page.count('#secMetas'), 0, 'no goal: no Objetivos section');
    }
  },
  {
    name: 'sections ui: reordering changes the selector order and is saved',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': CUSTOM_SECTIONS },
    async fn(page) {
      await openAjustes(page);
      assert.equal(await page.eval("document.querySelector('#listaApartados [data-ap=\"taller\"] [data-subir]').disabled"), true, 'the first cannot go up');
      assert.equal(await page.eval("document.querySelector('#listaApartados [data-ap=\"estudio\"] [data-bajar]').disabled"), true, 'the last cannot go down');
      await page.click('#listaApartados [data-ap="estudio"] [data-subir]');
      assert.deepEqual(await apRows(page), ['taller', 'estudio', 'mercado']);
      await page.click('#listaApartados [data-ap="taller"] [data-bajar]');
      assert.deepEqual(await apRows(page), ['estudio', 'taller', 'mercado']);
      const sel = await page.eval("Array.prototype.map.call(document.querySelectorAll('#ctxsel [data-ctx]'),function(b){return b.getAttribute('data-ctx');})");
      assert.deepEqual(sel, ['todo', 'estudio', 'taller', 'mercado']);
      const saved = JSON.parse(await page.storage('kibco.apartados')).sort((a, b) => a.orden - b.orden).map((a) => a.id);
      assert.deepEqual(saved, ['estudio', 'taller', 'mercado']);
    }
  },
  {
    name: 'sections ui: a tag rename keeps its id; removing a used tag clears it from items after confirming the count',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'mercado', 'kibco.apartados': JSON.stringify([
      { id: 'mercado', nom: 'Mercado', orden: 0, tags: [{ id: 'verduras', nom: 'Verduras' }, { id: 'limpieza', nom: 'Limpieza' }] },
      { id: 'casa', nom: 'Casa', orden: 1, tags: [{ id: 'limpieza', nom: 'Limpieza' }] }]),
      'kibco.items': JSON.stringify([
        { id: 'm1', texto: 'tomates', contexto: 'mercado', tag: 'verduras', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' },
        { id: 'm2', texto: 'lavandina', contexto: 'mercado', tag: 'limpieza', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' },
        { id: 'm3', texto: 'detergente', contexto: 'mercado', tag: 'limpieza', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' },
        { id: 'c1', texto: 'trapear', contexto: 'casa', tag: 'limpieza', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="mercado"] .apfila-abrir');
      await page.type('#apTags [data-tag="verduras"] input', 'Verdulería');
      await page.click('#apTags [data-tag="limpieza"] [data-quitar]');
      assert.equal(await page.count('#apTags [data-tag="limpieza"]'), 0, 'removed from the draft');
      await page.click('#btnApGuardar');
      assert.ok(await isOpen(page, 'tapaConfirmar'), 'removing a used tag asks first');
      assert.match(await page.text('#confDetalle'), /2 items/);
      await page.click('#btnConfSi');
      await sleep(150);
      const reg = JSON.parse(await page.storage('kibco.apartados'));
      assert.deepEqual(reg.find((a) => a.id === 'mercado').tags, [{ id: 'verduras', nom: 'Verdulería' }]);
      const list = await items(page);
      assert.equal(list.find((i) => i.id === 'm1').tag, 'verduras', 'renamed tag keeps its id on items');
      assert.equal(list.find((i) => i.id === 'm2').tag, '');
      assert.equal(list.find((i) => i.id === 'm3').tag, '');
      assert.equal(list.find((i) => i.id === 'c1').tag, 'limpieza', 'another section using the same tag id is untouched');
      assert.ok(await isOpen(page, 'tapaAjustes'), 'back in Ajustes after confirming');
      assert.equal(await isOpen(page, 'tapaApartado'), false);
    }
  },
  {
    name: 'sections ui: back from the editor returns to Ajustes, a second back closes Ajustes',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': CUSTOM_SECTIONS },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="mercado"] .apfila-abrir');
      await sleep(150);
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), 'tapaApartado');
      await page.eval('history.back()');
      await sleep(250);
      assert.equal(await isOpen(page, 'tapaApartado'), false, 'back closes the editor');
      assert.ok(await isOpen(page, 'tapaAjustes'), 'Ajustes stays open');
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), 'tapaAjustes');
      await page.eval('history.back()');
      await sleep(250);
      assert.equal(await isOpen(page, 'tapaAjustes'), false, 'a second back closes Ajustes');
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), null);
      // Saving from the editor also lands in Ajustes with its entry on top.
      await openAjustes(page);
      await page.click('#btnNuevoApartado');
      await page.type('#apNom', 'Huerta');
      await page.click('#btnApGuardar');
      await sleep(250);
      assert.ok(await isOpen(page, 'tapaAjustes'));
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), 'tapaAjustes');
    }
  },
  {
    name: 'sections ui: archiving keeps the items, hides the section from pickers and moves the view to Todo; unarchive brings it back',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'estudio', 'kibco.contextoCaptura': 'estudio', 'kibco.apartados': CUSTOM_SECTIONS,
      'kibco.items': JSON.stringify([{ id: 'e1', texto: 'leer', contexto: 'estudio', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' },
        { id: 't1', texto: 'torno', contexto: 'taller', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="estudio"] .apfila-abrir');
      assert.equal(await page.text('#btnApArchivar'), 'Archivar');
      await page.click('#btnApArchivar');
      assert.equal(await isOpen(page, 'tapaApartado'), false, 'the editor closes');
      assert.deepEqual(await apRows(page), ['taller', 'mercado', 'estudio']);
      assert.match(await page.text('#listaApartados [data-ap="estudio"]'), /Archivado/);
      assert.equal(JSON.parse(await page.storage('kibco.apartados')).find((a) => a.id === 'estudio').activo, false);
      assert.equal(await page.eval("document.body.getAttribute('data-ctx')"), 'todo', 'the archived current section falls back to Todo');
      assert.equal(await page.eval("!!document.querySelector('#ctxsel [data-ctx=\"estudio\"]')"), false, 'gone from the selector');
      await page.key('Escape');
      await page.type('#txtCaptura', 'algo');
      await page.click('#capCtx');
      assert.equal(await page.eval("!!document.querySelector('#destsel [data-ctx=\"estudio\"]')"), false, 'gone from the destination sheet');
      await page.key('Escape');
      await page.type('#txtCaptura', '');
      await capture(page, 'resumen #estudio');
      assert.notEqual((await items(page)).find((i) => i.texto.indexOf('resumen') === 0).contexto, 'estudio', 'capture never routes to it');
      assert.equal((await items(page)).find((i) => i.id === 'e1').contexto, 'estudio', 'its items keep the section id');
      await toTasks(page);
      await page.click('#lista li.item[data-id="t1"]');
      assert.equal(await page.eval("!!document.querySelector('#gridCtx [data-ctx=\"estudio\"]')"), false, 'not offered in the item sheet');
      await page.key('Escape');
      await page.reload();
      assert.equal((await items(page)).find((i) => i.id === 'e1').contexto, 'estudio', 'survives a reload');
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="estudio"] .apfila-abrir');
      assert.equal(await page.text('#btnApArchivar'), 'Desarchivar');
      await page.click('#btnApArchivar');
      assert.deepEqual(await apRows(page), ['taller', 'mercado', 'estudio']);
      assert.doesNotMatch(await page.text('#listaApartados [data-ap="estudio"]'), /Archivado/);
      assert.ok(await page.eval("!!document.querySelector('#ctxsel [data-ctx=\"estudio\"]')"), 'back in the selector');
    }
  },
  {
    name: 'sections ui: deleting a section with records asks for a target, moves items, routines and missions, then confirms',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'mercado', 'kibco.apartados': CUSTOM_SECTIONS,
      'kibco.items': JSON.stringify([
        { id: 'm1', texto: 'yerba', contexto: 'mercado', tipo: 'compra', estado: 'por_comprar', comentarios: [{ cuando: '2026-01-02T10:00:00.000Z', texto: 'la de siempre' }], creado: '2026-01-01T10:00:00.000Z' },
        { id: 'm2', texto: 'ordenar alacena', contexto: 'mercado', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' },
        { id: 't1', texto: 'torno', contexto: 'taller', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]),
      'kibco.rutinas': JSON.stringify([{ id: 'r1', texto: 'lista semanal', contexto: 'mercado', tipo: 'dias', cada: 7, inicio: '2026-01-01' }]),
      'kibco.proyectos': JSON.stringify([{ id: 'p1', nombre: 'Despensa', contexto: 'mercado', estado: 'activo', hitos: [] }]),
      'kibco.eventos': JSON.stringify([{ id: 'ev1', ts: '2026-01-01T10:00:00.000Z', tipo: 'captura', itemId: 'm2', texto: 'ordenar alacena', contexto: 'mercado' }]) },
    async fn(page) {
      const enMercado = (await items(page)).filter((i) => i.contexto === 'mercado').length;
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="mercado"] .apfila-abrir');
      await page.click('#btnApBorrar');
      assert.ok(await page.visible('#cajaApMover'), 'asks where the records go');
      assert.match(await page.text('#apMoverPista'), new RegExp(enMercado + ' items, 1 rutina y 1 misi'));
      const dest = await page.eval("Array.prototype.map.call(document.querySelectorAll('#apDestinos [data-ctx]'),function(b){return b.getAttribute('data-ctx');})");
      assert.deepEqual(dest, ['taller', 'estudio'], 'only other active sections');
      await page.click('#apDestinos [data-ctx="estudio"]');
      assert.ok(await isOpen(page, 'tapaConfirmar'));
      assert.match(await page.text('#confDetalle'), /Estudio/);
      await page.click('#btnConfSi');
      await sleep(150);
      assert.deepEqual(JSON.parse(await page.storage('kibco.apartados')).map((a) => a.id), ['taller', 'estudio']);
      const list = await items(page);
      const m1 = list.find((i) => i.id === 'm1');
      assert.deepEqual([m1.contexto, m1.tipo, m1.estado, m1.texto], ['estudio', 'tarea', 'pendiente', 'yerba'], 'a purchase moved into a section without purchases becomes a task');
      assert.equal(m1.comentarios[0].texto, 'la de siempre', 'comments kept');
      assert.equal(list.find((i) => i.id === 'm2').contexto, 'estudio');
      assert.equal(list.filter((i) => i.contexto === 'mercado').length, 0, 'nothing left behind');
      assert.equal(list.find((i) => i.id === 't1').contexto, 'taller', 'other sections untouched');
      assert.equal(JSON.parse(await page.storage('kibco.rutinas'))[0].contexto, 'estudio');
      assert.equal(JSON.parse(await page.storage('kibco.proyectos'))[0].contexto, 'estudio');
      assert.equal((await events(page)).find((e) => e.id === 'ev1').contexto, 'estudio', 'history follows the records');
      assert.equal(await page.eval("document.body.getAttribute('data-ctx')"), 'todo', 'the deleted current section falls back to Todo');
      assert.deepEqual(await apRows(page), ['taller', 'estudio']);
      assert.ok(await isOpen(page, 'tapaAjustes'));
    }
  },
  {
    name: 'sections ui: deleting an empty section only confirms; the last active section cannot be archived or deleted',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': JSON.stringify([
      { id: 'solo', nom: 'Solo', orden: 0 }, { id: 'vacio', nom: 'Vacio', orden: 1 }, { id: 'viejo', nom: 'Viejo', orden: 2, activo: false }]) },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="vacio"] .apfila-abrir');
      await page.click('#btnApBorrar');
      assert.ok(await isOpen(page, 'tapaConfirmar'), 'no records: straight to the confirmation');
      await page.click('#btnConfNo');
      await sleep(150);
      assert.equal(JSON.parse(await page.storage('kibco.apartados')).length, 3, 'cancel keeps it');
      await page.click('#listaApartados [data-ap="vacio"] .apfila-abrir');
      await page.click('#btnApBorrar');
      await page.click('#btnConfSi');
      await sleep(150);
      assert.deepEqual(await apRows(page), ['solo', 'viejo']);
      await page.click('#listaApartados [data-ap="solo"] .apfila-abrir');
      assert.equal(await page.eval("document.getElementById('btnApArchivar').disabled"), true);
      assert.equal(await page.eval("document.getElementById('btnApBorrar').disabled"), true);
      assert.match(await page.text('#apUltimo'), /único apartado activo/);
      await page.key('Escape');
      // An archived section can still be deleted while another one stays active.
      await page.click('#listaApartados [data-ap="viejo"] .apfila-abrir');
      assert.equal(await page.eval("document.getElementById('btnApBorrar').disabled"), false);
      assert.equal(await page.eval("document.getElementById('btnApArchivar').disabled"), false, 'it can be unarchived');
    }
  },
  {
    name: 'sections ui: switching purchases to "No" converts the section purchases to tasks after confirming',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'taller', 'kibco.apartados': CUSTOM_SECTIONS,
      'kibco.items': JSON.stringify([
        { id: 'c1', texto: 'rodamiento', contexto: 'taller', tipo: 'compra', estado: 'oc_enviada', pausado: true, fecha: ymd(2), creado: '2026-01-01T10:00:00.000Z' },
        { id: 'c2', texto: 'aceite', contexto: 'taller', tipo: 'compra', estado: 'recibido', estadoDesde: '2026-01-03T10:00:00.000Z', creado: '2026-01-01T10:00:00.000Z' },
        { id: 'c3', texto: 'correa', contexto: 'taller', tipo: 'compra', estado: 'cancelado', creado: '2026-01-01T10:00:00.000Z' },
        { id: 'c4', texto: 'yerba', contexto: 'mercado', tipo: 'compra', estado: 'por_comprar', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="taller"] .apfila-abrir');
      await page.click('#segComprasAp [data-compras="no"]');
      assert.match(await page.text('#apComprasPista'), /3 compras/);
      await page.click('#btnApGuardar');
      assert.ok(await isOpen(page, 'tapaConfirmar'));
      assert.match(await page.text('#confDetalle'), /3 compras/);
      await page.click('#btnConfSi');
      await sleep(150);
      const list = await items(page);
      const by = (id) => list.find((i) => i.id === id);
      assert.deepEqual([by('c1').tipo, by('c1').estado, by('c1').pausado, by('c1').fecha], ['tarea', 'pendiente', false, ymd(2)]);
      assert.deepEqual([by('c2').tipo, by('c2').estado, by('c2').estadoDesde], ['tarea', 'completado', '2026-01-03T10:00:00.000Z']);
      assert.deepEqual([by('c3').tipo, by('c3').estado], ['tarea', 'cancelado']);
      assert.deepEqual([by('c4').tipo, by('c4').contexto], ['compra', 'mercado'], 'other sections keep their purchases');
      assert.equal(JSON.parse(await page.storage('kibco.apartados')).find((a) => a.id === 'taller').compras, 'no');
      await page.key('Escape');
      await toTasks(page);
      assert.match(await page.text('#lista'), /rodamiento/, 'the open one is reachable as a task');
      assert.equal(await page.visible('#segBtnCompras'), false);
    }
  },
  {
    name: 'sections ui: moving a purchase into a section without purchases makes it a task; undo restores the purchase',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'mercado', 'kibco.apartados': CUSTOM_SECTIONS,
      'kibco.items': JSON.stringify([{ id: 'c1', texto: 'yerba', contexto: 'mercado', tipo: 'compra', estado: 'por_comprar', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await page.click('#tabTareas');
      await page.click('#segBtnCompras');
      await page.click('#listaCompras li.item');
      assert.ok(await isOpen(page, 'tapaItem'), 'item sheet open');
      await page.click('#gridCtx [data-ctx="estudio"]');
      const [it] = await items(page);
      assert.deepEqual([it.contexto, it.tipo, it.estado], ['estudio', 'tarea', 'pendiente']);
      await page.key('Escape');
      await page.click('#btnDeshacer');
      const [back] = await items(page);
      assert.deepEqual([back.contexto, back.tipo, back.estado], ['mercado', 'compra', 'por_comprar']);
    }
  },
  {
    name: 'sections ui: a restored backup with a purchase inside a section without purchases shows it as a task',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': CUSTOM_SECTIONS },
    async fn(page) {
      const file = path.join(os.tmpdir(), 'kco-e2e-compra-sin-compras.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 5,
        apartados: [{ id: 'estudio', nom: 'Estudio', orden: 0, compras: 'no' }],
        items: [{ id: 'b1', texto: 'calculadora', contexto: 'estudio', tipo: 'compra', estado: 'esperando_entrega', creado: '2026-01-01T10:00:00.000Z' }] }));
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      await sleep(150);
      const [it] = await items(page);
      assert.deepEqual([it.contexto, it.tipo, it.estado], ['estudio', 'tarea', 'pendiente']);
      await toTasks(page);
      assert.match(await page.text('#lista'), /calculadora/);
      await page.reload();
      await toTasks(page);
      assert.match(await page.text('#lista'), /calculadora/, 'still a task after a reload');
    }
  },
  {
    name: 'sections ui: another tab switching a section to "No" shows its purchases as tasks and Ajustes turns read-only',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'mercado', 'kibco.apartados': CUSTOM_SECTIONS,
      'kibco.items': JSON.stringify([{ id: 'c1', texto: 'yerba', contexto: 'mercado', tipo: 'compra', estado: 'por_comprar', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="estudio"] .apfila-abrir');
      const otra = JSON.parse(CUSTOM_SECTIONS).map((a) => (a.id === 'mercado' ? Object.assign({}, a, { compras: 'no' }) : a));
      await page.eval(`(function(){var v=${JSON.stringify(JSON.stringify(otra))};localStorage.setItem('kibco.apartados',v);window.dispatchEvent(new StorageEvent('storage',{key:'kibco.apartados',newValue:v}));})()`);
      await sleep(120);
      assert.equal(await page.eval("document.getElementById('btnApGuardar').disabled"), true, 'the open editor can no longer save');
      await page.key('Escape');
      assert.equal(await page.eval("document.getElementById('btnNuevoApartado').disabled"), true);
      assert.equal(await page.eval("document.querySelector('#listaApartados [data-ap=\"mercado\"] [data-bajar]').disabled"), true, 'no reordering');
      await page.key('Escape');
      await toTasks(page);
      assert.match(await page.text('#lista'), /yerba/, 'the purchase is reachable as a task');
    }
  },
  {
    name: 'sections ui: the destination sheet rebuilds after the sections change',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'todo', 'kibco.apartados': CUSTOM_SECTIONS },
    async fn(page) {
      const rows = () => page.eval("Array.prototype.map.call(document.querySelectorAll('#destsel [data-ctx]'),function(b){return b.getAttribute('data-ctx')+':'+b.textContent;})");
      await page.type('#txtCaptura', 'algo');
      await page.click('#capCtx');
      assert.deepEqual(await rows(), ['taller:Taller', 'mercado:Mercado', 'estudio:Estudio']);
      await page.key('Escape');
      await openAjustes(page);
      await page.click('#btnNuevoApartado');
      await page.type('#apNom', 'Huerta');
      await page.click('#btnApGuardar');
      await page.click('#listaApartados [data-ap="estudio"] .apfila-abrir');
      await page.type('#apNom', 'Facultad');
      await page.click('#btnApGuardar');
      await page.click('#listaApartados [data-ap="mercado"] .apfila-abrir');
      await page.click('#btnApArchivar');
      await page.key('Escape');
      await page.type('#txtCaptura', 'otra cosa');
      await page.click('#capCtx');
      assert.deepEqual(await rows(), ['taller:Taller', 'estudio:Facultad', 'huerta:Huerta']);
    }
  },
  {
    name: 'data: sections changed in another tab are re-applied and writes stop',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': LEGACY_SECTIONS, 'kibco.contexto': 'hogar' },
    async fn(page) {
      assert.equal(await page.eval("document.getElementById('ctxNombre').textContent"), 'Casa');
      await page.eval("(function(){var v=JSON.stringify([{id:'estudio',nom:'Estudio',color:'azul'}]);" +
        "localStorage.setItem('kibco.apartados',v);window.dispatchEvent(new StorageEvent('storage',{key:'kibco.apartados',newValue:v}));})()");
      await sleep(100);
      assert.equal(await page.eval("document.getElementById('ctxNombre').textContent"), 'Estudio');
      assert.doesNotMatch(await page.eval("document.getElementById('ctxsel').textContent"), /Casa/);
      assert.ok(await page.visible('#aviso'));
      await capture(page, 'no deberia guardarse');
      assert.equal(await page.storage('kibco.items'), null);
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
    name: 'data: future schema 6 stays read-only and seeds nothing',
    storage: { 'kibco.esquema': '6', 'kibco.items': JSON.stringify([{ id: 'f1', texto: 'del futuro', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      assert.ok(await page.visible('#aviso'));
      await capture(page, 'nada');
      assert.equal(JSON.parse(await page.storage('kibco.items')).length, 1);
      assert.equal(await page.storage('kibco.esquema'), '6');
      assert.equal(await page.storage('kibco.apartados'), null);
      assert.equal(await page.storage('kibco.eventos'), null);
    }
  },
  {
    name: 'backup: export carries every section, archived ones too, as schema 5',
    storage: {
      'kibco.esquema': '5',
      'kibco.apartados': JSON.stringify([{ id: 'estudio', nom: 'Estudio', color: 'azul', orden: 0 },
        { id: 'viejo', nom: 'Viejo', orden: 1, activo: false }])
    },
    async fn(page) {
      await page.click('#btnAjustes');
      await page.click('#btnBackupTexto');
      const data = JSON.parse(await page.eval("document.getElementById('txtSalida').value"));
      assert.equal(data.schema, 5);
      assert.deepEqual(data.apartados.map((a) => a.id), ['estudio', 'viejo']);
      assert.equal(data.apartados[0].nom, 'Estudio');
      assert.equal(data.apartados[1].activo, false);
    }
  },
  {
    name: 'backup: a schema-5 backup restores its sections and items stay in them',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': LEGACY_SECTIONS, 'kibco.contexto': 'hogar', 'kibco.contextoCaptura': 'hogar',
      'kibco.items': JSON.stringify([{ id: 'v1', texto: 'viejo', contexto: 'hogar', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      const file = path.join(os.tmpdir(), 'kco-e2e-apartados5.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 5,
        apartados: [{ id: 'estudio', nom: 'Estudio', ico: 'book', color: 'azul', orden: 0 }, { id: 'gym', nom: 'Gym', orden: 1 }],
        items: [{ id: 'e1', texto: 'leer capitulo', contexto: 'estudio', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' },
          { id: 'g1', texto: 'sentadillas', contexto: 'gym', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }] }));
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      assert.deepEqual(JSON.parse(await page.storage('kibco.apartados')).map((a) => a.id), ['estudio', 'gym']);
      const list = await items(page);
      assert.equal(list.find((i) => i.id === 'e1').contexto, 'estudio');
      assert.equal(list.find((i) => i.id === 'g1').contexto, 'gym');
      assert.equal(await page.eval("document.getElementById('ctxNombre').textContent"), 'Estudio', 'current context refreshed');
      const filas = await page.eval("document.getElementById('ctxsel').textContent");
      assert.match(filas, /Estudio/);
      assert.match(filas, /Gym/);
      assert.doesNotMatch(filas, /Casa|Trabajo/);
      await capture(page, 'remo #gym');
      assert.equal((await items(page)).find((i) => i.texto === 'remo').contexto, 'gym');
      await page.reload();
      assert.equal((await items(page)).find((i) => i.id === 'e1').contexto, 'estudio', 'survives a reload');
    }
  },
  {
    name: 'backup: a schema-5 backup replaces the stored sections',
    async fn(page) {
      assert.deepEqual(await storedSectionIds(page), ['trabajo', 'hogar', 'apps', 'contenido', 'personal']);
      const file = path.join(os.tmpdir(), 'kco-e2e-apartados-fresh.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 5, apartados: [{ id: 'estudio', nom: 'Estudio' }],
        items: [{ id: 'e1', texto: 'leer', contexto: 'estudio', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }] }));
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      assert.deepEqual(JSON.parse(await page.storage('kibco.apartados')).map((a) => a.id), ['estudio']);
      assert.equal((await items(page))[0].contexto, 'estudio');
    }
  },
  {
    name: 'backup: a schema-4 backup seeds the legacy sections',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': JSON.stringify([{ id: 'estudio', nom: 'Estudio', color: 'azul' }]),
      'kibco.items': JSON.stringify([{ id: 'x1', texto: 'leer', contexto: 'estudio', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      const file = path.join(os.tmpdir(), 'kco-e2e-apartados4.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 4,
        items: [{ id: 'h1', texto: 'barrer', contexto: 'hogar', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' },
          { id: 't1', texto: 'filtro', contexto: 'trabajo', tipo: 'compra', estado: 'esperando_oc', creado: '2026-01-01T10:00:00.000Z' }] }));
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      const secs = JSON.parse(await page.storage('kibco.apartados'));
      assert.deepEqual(secs.map((a) => a.id), ['trabajo', 'hogar', 'apps', 'contenido', 'personal']);
      assert.equal(secs[0].compras, 'fabrica');
      const list = await items(page);
      assert.equal(list.find((i) => i.id === 'h1').contexto, 'hogar');
      assert.equal(list.find((i) => i.id === 't1').estado, 'esperando_oc');
      assert.doesNotMatch(await page.eval("document.getElementById('ctxsel').textContent"), /Estudio/);
    }
  },
  {
    name: 'backup: a context id outside the legacy set gets a generated section',
    async fn(page) {
      const file = path.join(os.tmpdir(), 'kco-e2e-apartados-extra.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 4,
        items: [{ id: 'k1', texto: 'tornear eje', contexto: 'taller', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' },
          { id: 'k2', texto: 'raro', contexto: 'todo', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }],
        eventos: [{ id: 'ev1', ts: '2026-01-01T10:00:00.000Z', tipo: 'captura', itemId: 'm', texto: 'm', contexto: 'musica' }],
        rutinas: [], proyectos: [] }));
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      const secs = JSON.parse(await page.storage('kibco.apartados'));
      assert.deepEqual(secs.map((a) => a.id), ['trabajo', 'hogar', 'apps', 'contenido', 'personal', 'taller', 'musica']);
      const taller = secs.find((a) => a.id === 'taller');
      assert.equal(taller.nom, 'taller');
      assert.equal(taller.color, 'gris');
      assert.equal(taller.activo, true);
      const list = await items(page);
      assert.equal(list.find((i) => i.id === 'k1').contexto, 'taller');
      assert.equal(list.find((i) => i.id === 'k2').contexto, 'trabajo', 'todo is never a section');
      assert.equal((await events(page)).find((e) => e.id === 'ev1').contexto, 'musica');
    }
  },
  {
    name: 'backup: records of an archived section survive load, round-trip and reload',
    storage: { 'kibco.esquema': '5', 'kibco.eventos': '[]',
      'kibco.apartados': JSON.stringify([{ id: 'estudio', nom: 'Estudio', color: 'azul', orden: 0 },
        { id: 'viejo', nom: 'Viejo', orden: 1, activo: false }]),
      'kibco.items': JSON.stringify([{ id: 'a1', texto: 'archivado', contexto: 'viejo', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]),
      'kibco.rutinas': JSON.stringify([{ id: 'r1', texto: 'regar', contexto: 'viejo', tipo: 'dias', cada: 1, inicio: '2026-01-01' }]) },
    async fn(page) {
      // A write after boot persists the in-memory lists: the archived id must still be there.
      await capture(page, 'nueva');
      assert.equal((await items(page)).find((i) => i.id === 'a1').contexto, 'viejo', 'kept on load');
      assert.equal((await items(page)).find((i) => i.texto === 'nueva').contexto, 'estudio', 'capture uses an active section');
      assert.doesNotMatch(await page.eval("document.getElementById('ctxsel').textContent"), /Viejo/, 'archived not offered');
      await page.click('#btnAjustes');
      await page.click('#btnBackupTexto');
      const texto = await page.eval("document.getElementById('txtSalida').value");
      assert.equal(JSON.parse(texto).items.find((i) => i.id === 'a1').contexto, 'viejo', 'exported in its section');
      const file = path.join(os.tmpdir(), 'kco-e2e-apartados-archivado.json');
      fs.writeFileSync(file, texto);
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      assert.equal((await items(page)).find((i) => i.id === 'a1').contexto, 'viejo', 'restored in its section');
      await page.reload();
      await capture(page, 'otra');
      assert.equal((await items(page)).find((i) => i.id === 'a1').contexto, 'viejo', 'survives a reload');
      assert.equal(JSON.parse(await page.storage('kibco.rutinas'))[0].contexto, 'viejo', 'routine kept too');
    }
  },
  {
    name: 'backup: a schema-5 backup with a record id missing from its apartados gets a generated section',
    async fn(page) {
      const file = path.join(os.tmpdir(), 'kco-e2e-apartados5-extra.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 5, apartados: [{ id: 'estudio', nom: 'Estudio', color: 'azul' }],
        items: [{ id: 'k1', texto: 'tornear eje', contexto: 'taller', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' },
          { id: 'k2', texto: 'leer', contexto: 'estudio', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }] }));
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      const secs = JSON.parse(await page.storage('kibco.apartados'));
      assert.deepEqual(secs.map((a) => a.id), ['estudio', 'taller']);
      assert.equal(secs[1].nom, 'taller');
      assert.equal(secs[1].color, 'gris');
      const list = await items(page);
      assert.equal(list.find((i) => i.id === 'k1').contexto, 'taller');
      assert.equal(list.find((i) => i.id === 'k2').contexto, 'estudio');
    }
  },
  {
    name: 'data: a failed 4-to-5 section seed keeps the stored schema and retries next boot',
    async fn(page) {
      await page.addInitScript("(function(){var o=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){" +
        "if(k==='kibco.apartados'&&localStorage.getItem('e2e.failSeed')==='1'){throw new Error('quota');}return o.call(this,k,v);};})()");
      await page.setStorage({ 'e2e.failSeed': '1', 'kibco.esquema': '4', 'kibco.eventos': '[]',
        'kibco.items': JSON.stringify([{ id: 'm1', texto: 'tarea casa', contexto: 'hogar', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) });
      await page.reload();
      assert.equal(await page.storage('kibco.apartados'), null);
      assert.equal(await page.storage('kibco.esquema'), '4', 'schema not bumped without sections');
      assert.equal((await events(page)).filter((e) => e.tipo === 'migracion').length, 0);
      await page.eval("localStorage.removeItem('e2e.failSeed')");
      await page.reload();
      assert.equal(await page.storage('kibco.esquema'), '5');
      assert.deepEqual(JSON.parse(await page.storage('kibco.apartados')).map((a) => a.id), ['trabajo', 'hogar', 'apps', 'contenido', 'personal']);
      assert.equal((await events(page)).filter((e) => e.tipo === 'migracion').length, 1);
      assert.equal((await items(page))[0].contexto, 'hogar');
    }
  },
  {
    name: 'backup: an unusable apartados field is rejected without writing anything',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': LEGACY_SECTIONS,
      'kibco.items': JSON.stringify([{ id: 'v1', texto: 'viejo', contexto: 'hogar', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      const before = { items: await page.storage('kibco.items'), secs: await page.storage('kibco.apartados'), evs: await page.storage('kibco.eventos') };
      const bad = [[], [{ id: 'todo', nom: 'Todo' }, { nom: 'sin id' }], [{ id: 'x', nom: 'X', activo: false }], 'nope', null];
      for (let k = 0; k < bad.length; k++) {
        const file = path.join(os.tmpdir(), 'kco-e2e-apartados-bad' + k + '.json');
        fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 5, apartados: bad[k],
          items: [{ id: 'n1', texto: 'nuevo', contexto: 'hogar', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }] }));
        await page.setFile('#archivoImport', file);
        assert.match(await page.text('#aviso'), /apartado/, 'case ' + k);
        assert.notEqual(await page.eval("document.getElementById('tapaConfirmar').className"), 'tapa on', 'no confirmation for case ' + k);
        assert.equal(await page.storage('kibco.items'), before.items);
        assert.equal(await page.storage('kibco.apartados'), before.secs);
        assert.equal(await page.storage('kibco.eventos'), before.evs);
      }
    }
  },
  {
    name: 'backup: a failed write also rolls the sections back',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': LEGACY_SECTIONS, 'kibco.contexto': 'hogar',
      'kibco.items': JSON.stringify([{ id: 'v1', texto: 'viejo', contexto: 'hogar', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]), 'kibco.eventos': '[]' },
    async fn(page) {
      const beforeSecs = await page.storage('kibco.apartados');
      const file = path.join(os.tmpdir(), 'kco-e2e-apartados-falla.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 5, apartados: [{ id: 'estudio', nom: 'Estudio' }],
        items: [{ id: 'n1', texto: 'nuevo', contexto: 'estudio', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }], proyectos: [] }));
      await page.eval("(function(){var o=Storage.prototype.setItem;window.__setItem=o;Storage.prototype.setItem=function(k,v){if(k==='kibco.esquema'){throw new Error('quota');}return o.call(this,k,v);};})()");
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      assert.match(await page.text('#aviso'), /No se pudo restaurar/);
      assert.equal(await page.storage('kibco.apartados'), beforeSecs);
      await page.eval('Storage.prototype.setItem=window.__setItem');
      assert.equal(await page.eval("document.getElementById('ctxNombre').textContent"), 'Casa');
      await capture(page, 'despues #casa');
      assert.equal((await items(page)).find((i) => i.texto === 'despues').contexto, 'hogar', 'registry rolled back in memory');
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
      assert.equal(data.schema, 5);
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
      assert.match(await page.text('#aviso'), /más nueva/);
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
      assert.equal(await page.eval("getComputedStyle(document.documentElement).getPropertyValue('--s-4').trim()"), '16px');
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
      assert.match(await page.text('.hero .hero-motivo'), /Vencida/, 'the reason sits right of the label');
      assert.match(await page.eval("document.querySelector('.hero .hero-motivo').className"), /peligro/, 'overdue reason in danger');
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
      await page.click('.tira-dias [data-dia="' + ymd(2) + '"]');
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
      assert.ok(await page.visible('#fichaProps .prop[data-prop="rutina"]'), 'an occurrence shows its Rutina row');
      await page.click('#fichaProps .prop[data-prop="rutina"]');
      assert.ok(await page.visible('#cajaOcurrencia'), 'the row opens the routine exceptions');
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
      await page.click('.tira-dias [data-dia="' + ymd(2) + '"]');
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
      await page.click('#btnModoDiario');
      const txt = await page.text('#diarioCuerpo');
      assert.match(txt, /Entrenamiento/);
      assert.match(txt, /Hito: Release/);
      assert.match(txt, /KCO · 100%/);
      assert.doesNotMatch(txt, /deshago/);
      assert.doesNotMatch(txt, EMOJI_UI, 'the journal shows icons and words, no emoji');
      assert.ok((await page.count('#diarioCuerpo svg.diario-ico')) > 0, 'journal entries carry stroke icons');
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
      assert.equal(await page.text('.xp-vuelo'), '+25 XP', 'the XP flies to the ring');
      assert.ok(!/XP/.test(await page.text('#qpaso')), 'the toast keeps one action');
      assert.equal(await page.count('#ahoraCuerpo #tarjetaNivel'), 0, 'the level card left Ahora');
      await page.click('#btnNivel');
      assert.match(await page.text('#tarjetaNivel'), /25 \/ 100 XP/);
      assert.match(await page.text('#tarjetaNivel'), /\+25 hoy/);
      await page.click('#btnDeshacer');
      assert.match(await page.text('#tarjetaNivel'), /0 \/ 100 XP/, 'undo takes the XP back');
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
      assert.ok(!/Nivel/.test(await page.text('#qpaso')), 'the toast stays short; the level sheet follows it');
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
      await page.click('#tabRegistro');
      assert.match(await page.text('#tarjetaNivel'), /Nivel 2/);
    }
  },
  {
    name: 'achievements: first completion unlocks one, announced once, kept forever',
    async fn(page) {
      await capture(page, 'algo');
      await page.eval(`(function(){var l=JSON.parse(localStorage.getItem('kibco.items'));l[0].creado=new Date(Date.now()-3600000).toISOString();localStorage.setItem('kibco.items',JSON.stringify(l));})()`);
      await page.reload();
      await page.click('.hero [data-hero="hecho"]');
      assert.equal(await page.text('#qpaso'), 'Completado: algo', 'the achievement waits for the level sheet');
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
      await page.click('#btnNivel');
      assert.ok(await page.visible('#campanaCuerpo'));
      const txt = await page.text('#campanaCuerpo');
      assert.match(txt, /9días activos/);
      assert.match(txt, /9mejor racha/);
      assert.match(await page.text('#tarjetaNivel'), /Racha de 9 días/, 'the current streak rides on the level card');
      assert.match(txt, /7 días avanzando/);
      assert.match(txt, /SecretoSeguí jugando/);
      assert.doesNotMatch(txt, /Madrugador/);
      assert.doesNotMatch(txt, EMOJI_UI, 'achievements use stroke icons, no emoji');
      assert.equal(await page.count('#secLogros .logro'), await page.count('#secLogros svg.logro-ico'), 'one icon per achievement');
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
      return { 'kibco.esquema': '5', 'kibco.apartados': LEGACY_SECTIONS, 'kibco.eventos': JSON.stringify(old) };
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
      assert.equal(await page.eval('getComputedStyle(document.body).backgroundColor'), 'rgb(243, 244, 246)');
      assert.equal(await page.eval('getComputedStyle(document.body).color'), 'rgb(20, 23, 28)');
      assert.equal(await page.eval('getComputedStyle(document.documentElement).colorScheme'), 'light');
      assert.deepEqual(await themeColors(page), ['#F3F4F6', '#F3F4F6'], 'every theme-color meta follows the active theme');
      await page.eval("document.body.className='pal-violeta'");
      assert.equal((await cssVar(page, 'document.body', '--accent')).toUpperCase(), '#6D28D9', 'palette accent has a light variant');
      await scheme(page, 'dark');
      assert.equal(await page.eval("document.documentElement.getAttribute('data-tema')"), 'oscuro', 'Sistema follows a live OS change');
      assert.equal(await page.eval('getComputedStyle(document.body).backgroundColor'), 'rgb(11, 13, 16)');
      assert.equal(await page.eval('getComputedStyle(document.documentElement).colorScheme'), 'dark');
      assert.deepEqual(await themeColors(page), ['#0B0D10', '#0B0D10']);
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
      assert.equal((await page.eval('window.__bgDCL')).toUpperCase(), '#0B0D10');
      assert.equal(await page.eval('getComputedStyle(document.body).backgroundColor'), 'rgb(11, 13, 16)');
      assert.deepEqual(await themeColors(page), ['#0B0D10', '#0B0D10']);
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
      assert.equal(await page.eval("document.body.getAttribute('data-ctx')"), 'hogar');
      assert.match(await page.eval('document.body.className'), /\bpal-cian\b/, 'Casa keeps its cyan accent');
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
    name: 'shell: the tab bar reads Ahora, Hoy, Listas, Misiones, Progreso (data-tab) and Progreso opens on Campaña',
    storage: seed(),
    async fn(page) {
      const tabs = await page.eval("Array.prototype.map.call(document.querySelectorAll('.tabs .tab'),function(b){return b.getAttribute('data-tab')+':'+b.textContent.trim();})");
      assert.deepEqual(tabs, ['ahora:Ahora', 'hoy:Hoy', 'listas:Listas', 'misiones:Misiones', 'progreso:Progreso']);
      const bar = await page.rect('.tabs');
      assert.equal(Math.round(bar.h), 84, 'tab bar is 84px (no safe area in the test viewport)');
      const pill = await page.rect('.tabs [data-tab="hoy"] .tab-ico');
      assert.deepEqual([Math.round(pill.w), Math.round(pill.h)], [56, 32], 'icon pill 56x32');
      await page.click('.tabs [data-tab="progreso"]');
      assert.equal(await page.eval("document.querySelector('.tabs [data-tab=\"progreso\"]').getAttribute('aria-selected')"), 'true');
      assert.equal(await page.eval("document.querySelector('#vistaRegistro').firstElementChild.id"), 'campanaCuerpo', 'Campaña is the first reading of Progreso');
      assert.equal(await page.eval("document.querySelector('#campanaCuerpo').firstElementChild.id"), 'tarjetaNivel', 'the level card leads');
      assert.equal(await page.visible('#campanaCuerpo'), true, 'the campaign shows');
      await sleep(300); // the pill color transition settles
      const bg = await page.eval(`(function(){var p=document.createElement('i');p.style.background='var(--brasa-soft)';document.body.appendChild(p);
        var c=getComputedStyle(p).backgroundColor;p.remove();return [c,getComputedStyle(document.querySelector('.tabs [data-tab="progreso"] .tab-ico')).backgroundColor];})()`);
      assert.equal(bg[1], bg[0], 'active Progreso uses --brasa-soft');
      assert.equal(await page.text('#tituloVista'), 'Progreso');
      await page.click('.tabs [data-tab="listas"]');
      assert.equal(await page.visible('#vistaTablero'), true, 'Listas opens the task list');
      assert.equal(await page.text('#tituloVista'), 'Listas');
    }
  },
  {
    name: 'shell: the XP ring shows the level, sits in a 44px target and opens Progreso on Campaña',
    storage: seed(),
    async fn(page) {
      assert.equal(await page.count('header .anillo-xp'), 1);
      const lv = await page.eval("KCOCore.nivelPorXP(KCOCore.calcularXP(JSON.parse(localStorage.getItem('kibco.items')||'[]'),JSON.parse(localStorage.getItem('kibco.proyectos')||'[]')).total).nivel");
      assert.equal((await page.text('header .anillo-xp')).trim(), '' + lv);
      assert.match(await page.eval("document.querySelector('header .anillo-xp').getAttribute('aria-label')"), new RegExp('Nivel ' + lv));
      const r = await page.rect('header .anillo-xp');
      assert.ok(r.w >= 44 && r.h >= 44, 'ring target 44px');
      const ring = await page.eval("getComputedStyle(document.querySelector('header .anillo-xp .anillo-xp-aro')).backgroundImage");
      assert.match(ring, /conic-gradient/, 'conic ring');
      await page.click('header .anillo-xp');
      assert.equal(await page.eval("document.querySelector('.tabs [data-tab=\"progreso\"]').getAttribute('aria-selected')"), 'true');
      assert.ok(await page.visible('#tarjetaNivel'), 'opens on Campaña (the level card)');
    }
  },
  {
    name: 'shell: the context page indicator has one dot per section, the active one is a 12px bar and Todo shows three overlapping dots',
    async fn(page) {
      const n = await page.eval('KCOCore.CONTEXTOS.length');
      assert.equal(await page.count('header .indicador-contexto .ind-punto'), n, 'one dot per section');
      assert.equal(await page.count('header .indicador-contexto .ind-punto.on'), 0, 'Todo: no section is active');
      assert.equal(await page.count('header .indicador-contexto .ind-todo.on i'), 3, 'Todo: three overlapping dots');
      await page.click('#btnCtx');
      await page.click('#ctxsel [data-ctx="hogar"]');
      await sleep(120);
      assert.equal(await page.count('header .indicador-contexto .ind-punto.on'), 1);
      assert.equal(await page.eval("document.querySelector('header .indicador-contexto .ind-punto.on').getAttribute('data-ctx')"), 'hogar');
      const on = await page.rect('header .indicador-contexto .ind-punto.on');
      const off = await page.rect('header .indicador-contexto .ind-punto:not(.on)');
      assert.deepEqual([Math.round(on.w), Math.round(on.h)], [12, 4], 'active bar 12x4');
      assert.deepEqual([Math.round(off.w), Math.round(off.h)], [4, 4], 'dot 4px');
      const chip = await page.rect('#btnCtx');
      const ind = await page.rect('header .indicador-contexto');
      assert.ok(ind.y >= chip.b - 1, 'the indicator sits below the context chip');
    }
  },
  {
    name: 'capture: the send button shows only with text, saves on tap and leaves the bar empty and focused',
    storage: { 'kibco.esquema': '4', 'kibco.contexto': 'trabajo' },
    async fn(page) {
      await page.emulateFocus();
      assert.equal(await page.visible('#btnEnviar'), false, 'no send button while empty');
      assert.match(await page.eval("document.getElementById('txtCaptura').getAttribute('placeholder')"), /^Capturar en Trabajo$/);
      await page.type('#txtCaptura', 'revisar bomba');
      assert.equal(await page.visible('#btnEnviar'), true, 'send button with text');
      const b = await page.rect('#btnEnviar');
      assert.deepEqual([Math.round(b.w), Math.round(b.h)], [48, 48], 'send button 48px round');
      assert.equal(await page.eval("document.documentElement.hasAttribute('data-escribiendo')"), true);
      assert.equal(await page.eval("getComputedStyle(document.querySelector('.tabs')).display"), 'none', 'tabs hide while typing');
      await page.eval("document.getElementById('btnEnviar').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}))");
      await page.click('#btnEnviar');
      assert.equal((await items(page))[0].texto, 'revisar bomba');
      assert.equal(await page.eval("document.getElementById('txtCaptura').value"), '');
      assert.equal(await page.eval('document.activeElement.id'), 'txtCaptura', 'focus stays in the bar');
      assert.equal(await page.visible('#btnEnviar'), false, 'hidden again once empty');
      // Enter still saves.
      await page.type('#txtCaptura', 'otra cosa', true);
      assert.equal((await items(page)).length, 2);
    }
  },
  {
    name: 'capture: the shortcut row inserts #, !, @ and nota: at the cursor and keeps focus',
    storage: { 'kibco.esquema': '4', 'kibco.contexto': 'trabajo' },
    async fn(page) {
      await page.emulateFocus();
      await page.type('#txtCaptura', 'pagar luz');
      assert.equal(await page.visible('.atajos-captura'), true, 'shortcut row while typing');
      assert.equal(await page.count('.atajos-captura button'), 4);
      const sizes = await page.eval("Array.prototype.map.call(document.querySelectorAll('.atajos-captura button'),function(b){var r=b.getBoundingClientRect();return Math.min(r.width,r.height);})");
      assert.ok(sizes.every((s) => s >= 44), '44px shortcut buttons: ' + sizes);
      const val = () => page.eval("document.getElementById('txtCaptura').value");
      await page.eval("(function(){var i=document.getElementById('txtCaptura');i.setSelectionRange(5,5);})()");
      await page.click('.atajos-captura [data-atajo="!"]');
      assert.equal(await val(), 'pagar ! luz', 'inserted at the cursor');
      assert.equal(await page.eval("document.getElementById('txtCaptura').selectionStart"), 7, 'cursor after the token');
      assert.equal((await page.text('#capNivel')).trim(), 'Importante', 'chips follow the inserted token');
      await page.eval("(function(){var i=document.getElementById('txtCaptura');i.setSelectionRange(i.value.length,i.value.length);})()");
      await page.click('.atajos-captura [data-atajo="#"]');
      assert.equal(await val(), 'pagar ! luz #');
      await page.click('.atajos-captura [data-atajo="@"]');
      assert.equal(await val(), 'pagar ! luz # @');
      await page.click('.atajos-captura [data-atajo="nota:"]');
      assert.equal(await val(), 'nota: pagar ! luz # @', 'nota: goes first, where the parser reads it');
      assert.equal(await page.eval('document.activeElement.id'), 'txtCaptura');
    }
  },
  {
    name: 'capture: the day and priority chips each carry a 44px clear button that removes only that token',
    storage: { 'kibco.esquema': '4', 'kibco.contexto': 'trabajo' },
    async fn(page) {
      await page.emulateFocus();
      await page.type('#txtCaptura', 'turno medico @9:30 mañana !! #casa');
      assert.equal((await page.text('#capDia')).trim(), 'Mañana 09:30');
      assert.equal(await page.visible('#capDiaX'), true);
      assert.equal(await page.visible('#capNivelX'), true);
      const x = await page.rect('#capNivelX');
      assert.ok(x.w >= 44 && x.h >= 44, 'clear target 44px');
      const c = await page.rect('#capCtx');
      assert.ok(c.h >= 44, 'destination chip 44px');
      await page.click('#capNivelX');
      assert.equal(await page.eval("document.getElementById('txtCaptura').value"), 'turno medico @9:30 mañana #casa');
      assert.equal(await page.visible('#capNivel'), false, 'priority chip gone');
      await page.click('#capDiaX');
      assert.equal(await page.eval("document.getElementById('txtCaptura').value"), 'turno medico #casa');
      assert.equal(await page.visible('#capDia'), false, 'day chip gone');
      assert.equal((await page.text('#capCtx')).trim(), 'Casa', 'the destination stays');
      assert.equal(await page.eval('document.activeElement.id'), 'txtCaptura');
      // A trailing day word (no time) clears too.
      await page.type('#txtCaptura', 'pagar luz hoy');
      await page.click('#capDiaX');
      assert.equal(await page.eval("document.getElementById('txtCaptura').value"), 'pagar luz');
    }
  },
  {
    name: 'capture (desktop): the send button stays visible but disabled while empty; n and / still focus the bar',
    width: 1366, height: 900, mobile: false,
    storage: { 'kibco.esquema': '4', 'kibco.contexto': 'trabajo' },
    async fn(page) {
      await page.emulateFocus();
      assert.equal(await page.visible('#btnEnviar'), true, 'send button shown on desktop');
      assert.equal(await page.eval("document.getElementById('btnEnviar').disabled"), true, 'disabled while empty');
      assert.equal(await page.visible('header .anillo-xp'), false, 'no XP ring in the desktop header (the rail comes later)');
      assert.equal(await page.visible('header .indicador-contexto'), false, 'no page indicator on desktop');
      const nav = await page.eval("Array.prototype.map.call(document.querySelectorAll('#navLateral .lat-item-nom'),function(s){return s.textContent;})");
      assert.deepEqual(nav, ['Ahora', 'Hoy', 'Listas', 'Misiones', 'Progreso']);
      await page.press('n');
      assert.equal(await page.eval('document.activeElement.id'), 'txtCaptura');
      await page.type('#txtCaptura', 'algo');
      assert.equal(await page.eval("document.getElementById('btnEnviar').disabled"), false);
      await page.click('#btnEnviar');
      assert.equal((await items(page))[0].texto, 'algo');
      assert.equal(await page.eval("document.getElementById('btnEnviar').disabled"), true);
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
      // At 1366 the right rail (320px, Cabina T6) takes the right edge: the column centers between both.
      assert.ok(Math.abs((r.ml + r.mw / 2) - (r.aw + (1366 - r.aw - 320) / 2)) <= 10, 'column centered between the sidebar and the rail');
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
      assert.equal(await page.eval("document.body.getAttribute('data-ctx')"), 'apps');
      assert.match(await page.eval('document.body.className'), /\bpal-violeta\b/);
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
        // Short dialogs without a header (Confirmar, the level sheet) close with their buttons, the backdrop, Escape or back.
        if (s.id === 'tapaConfirmar') { assert.deepEqual(s, { id: s.id, role: 'alertdialog', modal: 'true', label: true, inside: true, x: null, asa: false }, s.id); continue; }
        if (s.id === 'tapaNivel') { assert.deepEqual(s, { id: s.id, role: 'dialog', modal: 'true', label: true, inside: true, x: null, asa: false }, s.id); continue; }
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
    name: 'sheets: at 390x844 Hecho, Hoy, Mañana and the Prioridad and Apartado rows are on screen without scrolling',
    storage: seed(),
    async fn(page) {
      await openFirstItem(page);
      await sleep(450);
      const r = await page.eval(`(function(){var h=window.innerHeight,bad=[],ids=['#btnHecho','#btnDiaHoy','#btnDiaMan','#fichaProps .prop[data-prop="nivel"]','#fichaProps .prop[data-prop="ctx"]','#txtTituloItem'];
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
      // Measure the resting card: no first-run peek (covered by its own spec), and the entry
      // animation (scale) leaves sub-pixel boxes for ~200 ms.
      await page.eval("localStorage.setItem('kibco.pistas','{\"completar\":true}')");
      await toTasks(page);
      await sleep(250);
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
      for (const b of inbox) assert.equal(b, 'listo,parahoy,mas', 'check, Para hoy and the three dots');
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
    name: 'cards: swipe left opens the card tray; the quick menu (Hoy, Mañana, Prioridad, Mover a Compras, Borrar) stays for the context menu and keyboard',
    storage: seed(),
    async fn(page) {
      await toTasks(page);
      const id = await page.eval("document.querySelector('#lista li.item').getAttribute('data-id')");
      const c = await page.rect('#lista li.item');
      await page.drag(c.x + 320, c.y + c.h / 2, c.x + 60, c.y + c.h / 2);
      await sleep(300);
      assert.equal(await page.count(`#lista li.item[data-id="${id}"] .bandeja-swipe`), 1, 'swipe left opens the tray');
      assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa', 'not the quick-menu sheet');
      await page.eval(`document.querySelector('#segTareas').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
      // A context menu right after a row gesture is ignored on purpose (gestoReciente, 500 ms).
      await sleep(550);
      await openQuickMenu(page, `#lista li.item[data-id="${id}"]`);
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
      return { 'kibco.esquema': '5', 'kibco.apartados': LEGACY_SECTIONS, 'kibco.eventos': JSON.stringify(old) };
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
    name: 'capture bar: n focuses it and / the desktop search field; typing inside a field or with a sheet open is never hijacked',
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
      assert.equal(await active(), 'txtBuscaBarra', '/ focuses the visible search field on desktop (Cabina)');
      assert.equal(await page.eval("document.getElementById('txtBuscaBarra').value"), '');
      await page.eval('document.activeElement.blur()');
      await page.press('n');
      assert.equal(await active(), 'txtCaptura');
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
    name: 'sheets: a slow self-initiated history traversal (popstate after 600ms) never closes the sheet opened meanwhile',
    storage: seed(),
    async fn(page) {
      const isOpen = () => page.eval("document.getElementById('tapaItem').className.indexOf('on')>-1");
      await openFirstItem(page);
      await sleep(150);
      // Our own traversal lands late: history.go / back really run 600ms after the call.
      await page.eval(SLOW_HISTORY);
      const serie = () => page.eval('history.state && history.state.kcoSerie || null');
      const serieA = await serie();
      await page.key('Escape');
      assert.equal(await isOpen(), false, 'the first sheet closed');
      await page.click('#lista li.item:nth-child(2)');
      const serieB = await serie();
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), 'tapaItem');
      assert.ok(serieA && serieB && serieA !== serieB, 'each sheet has its own entry: ' + serieA + ' / ' + serieB);
      await sleep(900);
      assert.ok(await isOpen(), 'the sheet opened meanwhile survives the late popstate');
      // The late go(-1) landed on the first sheet's own residue, not on the second sheet's entry.
      assert.equal(await serie(), serieA, 'the late traversal settled on the first sheet entry');
      await page.eval('history.go=window.__go;history.back=window.__back');
      // The second sheet's own entry is still in history, right above.
      await page.eval('history.forward()');
      await sleep(200);
      assert.equal(await serie(), serieB, 'the second sheet entry is reachable');
      assert.ok(await isOpen(), 'landing on its own entry changes nothing');
      await page.eval('history.back()');
      await sleep(200);
      assert.equal(await isOpen(), false, 'one back closes it');
      assert.equal(await page.eval("document.getElementById('tabTareas').getAttribute('aria-selected')"), 'true', 'back only closed the sheet');
    }
  },
  {
    name: 'sheets: after a reload, one back from a tab reaches Ahora (entries from the previous load are not dead)',
    storage: seed(),
    async fn(page) {
      const tab = (id) => page.eval(`document.getElementById('${id}').getAttribute('aria-selected')`);
      // Before the reload: a tab anchor and a sheet entry from this load sit in history.
      await openFirstItem(page);
      await sleep(150);
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), 'tapaItem');
      await page.reload();
      assert.equal(await tab('tabAhora'), 'true', 'a reload starts on Ahora');
      await toTasks(page);
      assert.equal(await tab('tabTareas'), 'true');
      await page.eval('history.back()');
      await sleep(250);
      assert.equal(await tab('tabAhora'), 'true', 'one back returns to Ahora');
      // Again from a plain tab anchor (no sheet) left by the previous load.
      await toTasks(page);
      await page.reload();
      await openFirstItem(page);
      await sleep(150);
      await page.eval('history.back()');
      await sleep(250);
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa', 'one back closes the sheet');
      assert.equal(await tab('tabTareas'), 'true');
      await page.eval('history.back()');
      await sleep(250);
      assert.equal(await tab('tabAhora'), 'true', 'the next back returns to Ahora');
    }
  },
  {
    name: 'sheets: a foreign or stale kco history entry is treated as the base (visible progress on every back)',
    storage: seed(),
    async fn(page) {
      const isOpen = () => page.eval("document.getElementById('tapaItem').className.indexOf('on')>-1");
      const tab = (id) => page.eval(`document.getElementById('${id}').getAttribute('aria-selected')`);
      const pop = (state) => page.eval(`window.dispatchEvent(new PopStateEvent('popstate',{state:${JSON.stringify(state)}}))`);
      await openFirstItem(page);
      await sleep(150);
      assert.ok(await isOpen());
      // An entry from an earlier load: unknown serie.
      await pop({ kcoCapa: 'tapaItem', kcoNivel: 0, kcoSerie: 'otra-carga.1' });
      await sleep(100);
      assert.equal(await isOpen(), false, 'a foreign entry closes the open layers');
      assert.equal(await tab('tabTareas'), 'true', 'closing layers is the visible step; the tab stays');
      // An old-format entry (kco markers, no serie) with nothing open: back to Ahora.
      await pop({ kcoAncla: true, kcoNivel: 0 });
      await sleep(100);
      assert.equal(await tab('tabAhora'), 'true', 'a foreign anchor with nothing open returns to Ahora');
    }
  },
  {
    name: 'sheets: a stale history entry left by a lost traversal never breaks later back presses',
    storage: seed(),
    async fn(page) {
      const isOpen = () => page.eval("document.getElementById('tapaItem').className.indexOf('on')>-1");
      const tab = (id) => page.eval(`document.getElementById('${id}').getAttribute('aria-selected')`);
      await openFirstItem(page);
      await sleep(150);
      // The traversal that should drop the first sheet's entry never happens: that entry goes stale.
      await page.eval('window.__go=history.go;window.__back=history.back;history.go=function(){};history.back=function(){}');
      await page.key('Escape');
      await sleep(100);
      await page.click('#lista li.item:nth-child(2)');
      await sleep(150);
      assert.ok(await isOpen());
      assert.equal(await page.eval('history.state && history.state.kcoCapa || null'), 'tapaItem', 'the new sheet has its own entry');
      await page.eval('history.go=window.__go;history.back=window.__back');
      // The stale entry may absorb one back (it is indistinguishable from a late own traversal); never more.
      let backs = 0;
      while (await isOpen() && backs < 3) { await page.eval('history.back()'); await sleep(200); backs++; }
      assert.equal(await isOpen(), false, 'the sheet closes');
      assert.ok(backs <= 2, 'within two backs, took ' + backs);
      assert.equal(await tab('tabTareas'), 'true', 'no back leaked to the view');
      // After that, history is in step again: one back per sheet, then Tareas -> Ahora.
      await page.click('#lista li.item');
      await sleep(150);
      await page.eval('history.back()');
      await sleep(200);
      assert.equal(await isOpen(), false, 'one back closes the next sheet');
      assert.equal(await tab('tabTareas'), 'true');
      await page.eval('history.back()');
      await sleep(200);
      assert.equal(await tab('tabAhora'), 'true', 'the next back returns to Ahora');
    }
  },
  {
    name: 'sheets: a persisted pageshow while our own back is in flight keeps the next sheet and its history entry',
    storage: seed(),
    async fn(page) {
      const isOpen = () => page.eval("document.getElementById('tapaItem').className.indexOf('on')>-1");
      await openFirstItem(page);
      await sleep(150);
      await page.eval(SLOW_HISTORY);
      await page.key('Escape');
      // Restored from the bfcache before the traversal lands.
      await page.eval("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");
      await page.click('#lista li.item:nth-child(2)');
      await sleep(900);
      assert.ok(await isOpen(), 'the sheet opened after pageshow survives the late popstate');
      await page.eval('history.go=window.__go;history.back=window.__back');
      await page.eval('history.back()');
      await sleep(200);
      assert.equal(await isOpen(), false, 'one back closes it');
      assert.equal(await page.eval("document.getElementById('tabTareas').getAttribute('aria-selected')"), 'true');
    }
  },
  {
    name: 'capture bar: resizing the viewport while chips show re-measures --capbar-h',
    storage: seed(),
    width: 320, height: 700,
    async fn(page) {
      await page.type('#txtCaptura', 'turno medico @9:30 mañana !! #contenido');
      await sleep(50);
      const h = () => page.eval("[document.documentElement.style.getPropertyValue('--capbar-h'),Math.ceil(document.querySelector('.captura').getBoundingClientRect().height)+'px']");
      const [wide, wideReal] = await h();
      assert.equal(wide, wideReal, 'measured at 320px');
      await page.viewport(430, 700);
      await sleep(150);
      const [narrow, narrowReal] = await h();
      assert.equal(narrow, narrowReal, 'measured again after the resize');
      assert.notEqual(narrow, wide, 'chips wrap at 320px and fit one row at 430px');
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
    name: 'lists: long task lists render 50 rows plus "Ver más"; scroll stays, an edit keeps the chunk, a filter change resets it',
    storage: bigSeed(120),
    async fn(page) {
      const rows = () => page.count('#lista li.item');
      const more = '#lista [data-vermas]';
      await toTasks(page);
      assert.equal(await rows(), 50, 'first chunk');
      assert.match(await page.text(more), /Ver más/);
      assert.match(await page.text(more), /70/, 'says how many are left');
      await page.eval('window.scrollTo(0, 1500)');
      await sleep(50);
      const y0 = await page.eval('Math.round(window.scrollY)');
      await page.click(more);
      assert.equal(await rows(), 100, 'second chunk appended');
      assert.ok(Math.abs((await page.eval('Math.round(window.scrollY)')) - y0) <= 2, 'scroll position kept');
      // Completing a row re-renders the view: the chunk stays at 100.
      await page.click('#lista li.item .chk');
      await sleep(80);
      assert.equal(await rows(), 100, 'chunk kept after an edit');
      await page.click(more);
      assert.equal(await rows(), 119, 'the rest');
      assert.equal(await page.count(more), 0, 'no button once everything shows');
      // A different filter starts again at 50.
      await page.click('#chips [data-filtro="pendiente"]');
      assert.equal(await rows(), 50, 'filter change resets the chunk');
      await page.click(more);
      await page.click('#tabHoy');
      await toTasks(page);
      assert.equal(await rows(), 50, 'view change resets the chunk');
    }
  },
  {
    name: 'lists: Compras, Diario, Registro and search results are chunked as well',
    storage: bigSeed(60, { compras: 60, eventos: 70 }),
    async fn(page) {
      await page.click('#tabTareas');
      await page.click('#segBtnCompras');
      assert.equal(await page.count('#listaCompras li.item'), 50, 'compras first chunk');
      await page.click('#listaCompras [data-vermas]');
      assert.equal(await page.count('#listaCompras li.item'), 60, 'compras all');
      await page.click('#tabRegistro');
      await page.click('#btnModoDiario');
      assert.equal(await page.count('#diarioCuerpo .diario-ev'), 50, 'diario first chunk');
      await page.click('#diarioCuerpo [data-vermas]');
      assert.equal(await page.count('#diarioCuerpo .diario-ev'), 70, 'diario all');
      await page.click('#btnModoRegistro');
      assert.equal(await page.count('#timeline .ev'), 50, 'registro first chunk');
      await page.click('#timeline [data-vermas]');
      assert.ok(await page.count('#timeline .ev') > 50, 'registro grows');
      await page.click('#btnBuscar');
      await page.type('#txtBusca', 'tarea');
      await page.eval("document.getElementById('txtBusca').dispatchEvent(new Event('input'))");
      await sleep(80);
      assert.equal(await page.count('#resultados li.item'), 50, 'search first chunk');
      await page.click('#resultados [data-vermas]');
      assert.equal(await page.count('#resultados li.item'), 60, 'search all');
    }
  },
  {
    name: 'keyboard: j and k move a visible selection across rows, x toggles completion with undo, Enter opens the sheet',
    storage: seed(),
    width: 1366, height: 900, mobile: false,
    async fn(page) {
      await page.emulateFocus();
      const sel = () => page.eval("(function(){var a=document.activeElement;return a&&a.matches('li.item')?a.getAttribute('data-id'):null;})()");
      const ids = () => page.eval("Array.prototype.map.call(document.querySelectorAll('#lista li.item'),function(l){return l.getAttribute('data-id');})");
      await toTasks(page);
      await page.eval('document.activeElement&&document.activeElement.blur()');
      const list = await ids();
      await page.press('j');
      assert.equal(await sel(), list[0], 'j selects the first row');
      assert.equal(await page.eval("document.activeElement.className.indexOf('kbsel')>-1"), true, 'marked as selected');
      // Desktop (Cabina T6): the focus is an accent border with a 3px halo instead of an outline.
      assert.match(await page.eval('getComputedStyle(document.activeElement).boxShadow'), /0px 0px 0px 3px/, 'visible focus ring');
      await page.press('j');
      await page.press('j');
      assert.equal(await sel(), list[2]);
      await page.press('k');
      assert.equal(await sel(), list[1], 'k goes back up');
      await page.press('x');
      await sleep(80);
      assert.equal((await items(page)).find((i) => i.id === list[1]).estado, 'completado', 'x completes the selected row');
      assert.equal(await sel(), (await ids())[1], 'the selection stays in place on the next row');
      await page.click('#btnDeshacer');
      await sleep(80);
      assert.notEqual((await items(page)).find((i) => i.id === list[1]).estado, 'completado', 'undo restores');
      await page.eval(`document.querySelector('#lista li.item[data-id="${list[0]}"]').focus()`);
      await page.key('Enter');
      await sleep(120);
      assert.ok(await page.eval("document.getElementById('tapaItem').className.indexOf('on')>-1"), 'Enter opens the sheet');
      // Never hijacked: with a sheet open, j does nothing to the list.
      await page.press('j');
      assert.equal(await page.eval("document.getElementById('tapaItem').contains(document.activeElement)"), true, 'focus stays in the sheet');
      await page.key('Escape');
      await sleep(120);
      // Inside a field j, k and x are just letters.
      await page.eval("document.getElementById('txtCaptura').focus()");
      await page.press('j');
      await page.press('x');
      assert.equal(await page.eval("document.getElementById('txtCaptura').value"), 'jx', 'typed, not hijacked');
      assert.equal(await page.eval('document.activeElement.id'), 'txtCaptura');
      assert.equal((await items(page)).filter((i) => i.estado === 'completado').length, 1, 'nothing else completed');
    }
  },
  {
    name: 'motion: prefers-reduced-motion reduce turns every transition and animation into a 120ms fade without sliding',
    storage: seed(),
    async fn(page) {
      const PROBE = `(function(){var max=0,who='',l=document.querySelectorAll('*'),i,s,t;
        function secs(v){return Math.max.apply(null,v.split(',').map(function(x){x=x.trim();return x.indexOf('ms')>-1?parseFloat(x)/1000:parseFloat(x);}));}
        for(i=0;i<l.length;i++){s=getComputedStyle(l[i]);t=secs(s.transitionDuration);
          if(s.animationName!=='none'){t=Math.max(t,secs(s.animationDuration));}
          if(t>max){max=t;who=l[i].tagName+'#'+l[i].id+'.'+l[i].className;}}
        return {max:max,who:who};})()`;
      await toTasks(page);
      const normal = await page.eval(PROBE);
      assert.ok(normal.max > 0.1, 'motion exists by default: ' + normal.max);
      await page.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await sleep(80);
      await page.click('#lista li.item');
      await sleep(80);
      const r = await page.eval(PROBE);
      assert.ok(r.max <= 0.12, 'longest transition/animation ' + r.max + 's on ' + r.who);
      assert.equal(await page.eval("getComputedStyle(document.querySelector('#tapaItem .hoja')).transform"), 'none', 'the sheet does not slide');
    }
  },
  {
    name: 'empty: with no data Ahora, Hoy, Tareas, inbox, a filter and Compras show an icon, a short line and a working action',
    storage: { 'kibco.esquema': '4', 'kibco.contexto': 'apps' },
    async fn(page) {
      await page.emulateFocus();
      const active = () => page.eval('document.activeElement&&document.activeElement.id||""');
      const blur = () => page.eval('document.activeElement&&document.activeElement.blur()');
      // Ahora in a context with nothing pending: names the context, offers capture.
      const ahora = await emptyState(page, '#ahoraCuerpo [data-vacio="ahora"]');
      assert.match(ahora.text, /Apps/, 'names the context');
      await page.click('#ahoraCuerpo [data-vacio="ahora"] .vacio-acc');
      assert.equal(await active(), 'txtCaptura', 'Capturar focuses the bar');
      await blur();
      await page.click('#tabHoy');
      await emptyState(page, '#hoyCuerpo [data-vacio="hoy"]');
      await page.click('#hoyCuerpo [data-vacio="hoy"] .vacio-acc');
      assert.equal(await active(), 'txtCaptura');
      await blur();
      await toTasks(page);
      await emptyState(page, '#vacioTablero[data-vacio="tareas"]');
      await page.click('#vacioTablero .vacio-acc');
      assert.equal(await active(), 'txtCaptura');
      await blur();
      await page.click('#chips [data-filtro="entrada"]');
      const inbox = await emptyState(page, '#vacioTablero[data-vacio="inbox"]');
      assert.match(inbox.text, /Inbox/);
      await page.click('#chips [data-filtro="esperando"]');
      await emptyState(page, '#vacioTablero[data-vacio="filtro"]');
      await page.click('#vacioTablero .vacio-acc');
      assert.equal(await page.eval("document.querySelector('#chips [data-filtro=\"activos\"]').className.indexOf('on')>-1"), true, 'Ver activos resets the filter');
      assert.ok(await page.visible('#vacioTablero[data-vacio="tareas"]'));
      await page.click('#segBtnCompras');
      await emptyState(page, '#vacioCompras[data-vacio="compras"]');
      await page.screenshot(path.join(OUT, 'empty-tareas-mobile.png'));
    }
  },
  {
    name: 'empty: missions, diary, an empty campaign and search show an empty state whose action works',
    storage: { 'kibco.esquema': '5', 'kibco.contexto': 'trabajo' },
    async fn(page) {
      await page.click('#tabMisiones');
      await emptyState(page, '#misionesCuerpo [data-vacio="misiones"]');
      assert.equal(await page.count('#btnNuevaMision'), 1, 'one Nueva mision button');
      await page.click('#misionesCuerpo [data-vacio="misiones"] .vacio-acc');
      await sleep(150);
      assert.ok(await page.eval("document.getElementById('tapaMision').className.indexOf('on')>-1"), 'Nueva mision opens the sheet');
      await page.key('Escape');
      await sleep(150);
      await page.click('#tabRegistro');
      await page.click('#btnModoDiario');
      await emptyState(page, '#vacioRegistro[data-vacio="diario"]');
      await page.click('#vacioRegistro .vacio-acc');
      assert.equal(await page.eval("document.querySelector('#chipsRango [data-filtro=\"todo\"]').className.indexOf('on')>-1"), true, 'Ver todo widens the range');
      assert.equal(await page.count('#vacioRegistro .vacio-acc'), 0, 'no widen action once the range is Todo');
      await page.click('#btnModoRegistro');
      await emptyState(page, '#vacioRegistro[data-vacio="registro"]', false);
      const camp = await emptyState(page, '#campanaCuerpo [data-vacio="campana"]');
      assert.match(camp.text, /campa\u00F1a/i);
      assert.equal(await page.count('#campanaCuerpo .stats'), 0, 'no wall of zeros');
      await page.screenshot(path.join(OUT, 'empty-campaign-mobile.png'));
      await page.click('#campanaCuerpo [data-vacio="campana"] .vacio-acc');
      assert.equal(await page.eval("document.getElementById('tabAhora').getAttribute('aria-selected')"), 'true', 'Ir a Ahora');
      await page.click('#btnBuscar');
      await sleep(150);
      await emptyState(page, '#vacioBusca[data-vacio="buscar"]', false);
      await page.type('#txtBusca', 'zzz');
      await page.eval("document.getElementById('txtBusca').dispatchEvent(new Event('input'))");
      const none = await emptyState(page, '#vacioBusca[data-vacio="sin-resultados"]');
      assert.match(none.text, /zzz/, 'echoes the query');
      await page.click('#vacioBusca .vacio-acc');
      assert.equal(await page.eval("document.getElementById('txtBusca').value"), '', 'Borrar busqueda clears it');
      assert.ok(await page.visible('#vacioBusca[data-vacio="buscar"]'));
    }
  },
  {
    name: 'empty: at 1366px the empty state is centered in the column with its action',
    storage: { 'kibco.esquema': '4', 'kibco.contexto': 'trabajo' },
    width: 1366, height: 900, mobile: false,
    async fn(page) {
      await page.click('#navLateral [data-vista="tablero"]');
      await emptyState(page, '#vacioTablero[data-vacio="tareas"]');
      const r = await page.eval(`(function(){var v=document.getElementById('vacioTablero').getBoundingClientRect(),i=document.querySelector('#vacioTablero .vacio-ico').getBoundingClientRect();
        return {mid:v.left+v.width/2,ico:i.left+i.width/2,w:v.width};})()`);
      assert.ok(Math.abs(r.mid - r.ico) < 2, 'icon centered in the block');
      assert.ok(r.w <= 760, 'inside the content column');
      await page.screenshot(path.join(OUT, 'empty-tareas-desktop.png'));
    }
  },
  {
    name: 'settings: Ajustes opens with the backup card first and every setting is still reachable (in Ajustes or its sub-sheets)',
    storage: seed(),
    async fn(page) {
      await page.click('#btnAjustes');
      await sleep(150);
      const r = await page.eval(`(function(){var h=document.getElementById('tapaAjustes'),rot=h.querySelectorAll('.grupo-rot'),t=[],i;
        for(i=0;i<rot.length;i++){t.push(rot[i].textContent.trim());}
        function pos(id){var all=h.getElementsByTagName('*');for(var k=0;k<all.length;k++){if(all[k].id===id)return k;}return -1;}
        var sub={tapaApartados:['listaApartados'],tapaAvisos:['btnPermiso','vNotif2'],tapaSolic:['chipsSolic','txtNuevoSolic','btnSumarSolic'],tapaDest:['chipsDest','txtNuevoDest','btnSumarDest'],
          tapaAcerca:['vApp','vSw','vEsquema','vTotal','vEventos','pieVersion','pieEsquema']},bad=[];
        for(var k in sub){for(i=0;i<sub[k].length;i++){if(!document.getElementById(k).contains(document.getElementById(sub[k][i])))bad.push(k+':'+sub[k][i]);}}
        var ids=['vBackup','btnExportar','btnBackupTexto','btnEditarApartados','btnNuevoApartado','segTema','btnLuz','vNotif','btnAvisos','vSolic','btnSolicitantes','vDest','btnDestinos','btnImportar','archivoImport','btnAcerca'],p={};
        for(i=0;i<ids.length;i++){p[ids[i]]=pos(ids[i]);}
        return {rot:t,p:p,bad:bad};})()`);
      assert.deepEqual(r.rot, ['Apartados', 'Pantalla y avisos', 'Compras', 'Tus datos']);
      for (const [id, k] of Object.entries(r.p)) assert.ok(k > -1, id + ' is still in Ajustes');
      assert.deepEqual(r.bad, [], 'sub-sheet settings in place');
      assert.ok(r.p.vBackup < r.p.btnExportar && r.p.btnExportar < r.p.btnEditarApartados, 'backup comes first, with its last-backup date');
      assert.ok(r.p.btnAcerca > r.p.btnDestinos, 'Acerca de comes last');
      assert.equal(await page.visible('#btnExportar'), true);
      assert.ok((await page.rect('#btnExportar')).y < 844, 'backup reachable without scrolling at 390x844');
      await page.screenshot(path.join(OUT, 'ajustes-mobile.png'));
    }
  },
  {
    name: 'ux: mobile screenshot',
    async fn(page) {
      await capture(page, 'revisar bomba hidraulica');
      await capture(page, 'comprar guantes');
      await page.screenshot(path.join(OUT, 'mobile.png'));
    }
  },
  {
    name: 'notes: the Notas segment lists the active section notes (Todo = sections with notes), pinned first, archived on demand',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST(), 'kibco.contexto': 'todo' },
    async fn(page) {
      await page.click('#tabTareas');
      assert.ok(await page.visible('#segBtnNotas'), 'Todo offers Notas (some section uses notes)');
      await page.click('#segBtnNotas');
      assert.ok(await page.visible('#vistaNotas'));
      assert.equal(await page.text('#tituloVista'), 'Notas');
      assert.deepEqual(await noteRows(page), ['n2', 'n1', 'n3'], 'pinned first, then last edited; mercado (notes off) and archived left out');
      const card = await page.eval(`(function(){var c=document.querySelector('#listaNotas [data-nota="n2"]');
        return {tit:c.querySelector('.nota-tit').textContent,ext:c.querySelector('.nota-ext').textContent,
          tags:Array.prototype.map.call(c.querySelectorAll('.nota-tag'),function(t){return t.textContent;}),pin:!!c.querySelector('.nota-pin'),
          label:c.querySelector('button').getAttribute('aria-label')};})()`);
      assert.equal(card.tit, 'Pedido de rodamientos');
      assert.match(card.ext, /^Llamar a Juan/);
      assert.deepEqual(card.tags, ['Pedidos']);
      assert.ok(card.pin, 'pin indicator');
      assert.match(card.label, /fijada/i);
      await page.click('#btnNotasArchivo');
      assert.equal(await page.eval("document.getElementById('btnNotasArchivo').getAttribute('aria-pressed')"), 'true');
      assert.deepEqual(await noteRows(page), ['n5']);
      await page.click('#btnNotasArchivo');
      await page.click('#btnCtx');
      await page.click('#ctxsel [data-ctx="taller"]');
      assert.deepEqual(await noteRows(page), ['n2', 'n1'], 'a section shows only its own');
      await page.click('#btnCtx');
      await page.click('#ctxsel [data-ctx="mercado"]');
      assert.equal(await page.visible('#segBtnNotas'), false, 'hidden for a section with notes off');
      assert.equal(await page.visible('#vistaNotas'), false, 'falls back to Tareas');
      assert.ok(await page.visible('#vistaTablero'));
    }
  },
  {
    name: 'notes: create, edit and pin a note from its sheet; it persists in kibco.notas',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.contexto': 'taller' },
    async fn(page) {
      await page.click('#tabTareas');
      await page.click('#segBtnNotas');
      await emptyState(page, '#vacioNotas');
      await page.click('#btnNuevaNota');
      assert.ok(await isOpen(page, 'tapaNota'));
      await page.click('#btnNotaGuardar');
      assert.match(await page.text('#notaError'), /Título o texto/i, 'an empty note is refused');
      await page.type('#notaTit', 'Medidas del torno');
      await page.type('#notaTxt', 'Bancada 1,5 m\nVolteo 400 mm');
      assert.deepEqual(await page.eval("Array.prototype.map.call(document.querySelectorAll('#notaTags [data-tag]'),function(b){return b.getAttribute('data-tag');})"), ['tornos', 'pedidos'], 'tags come from the section');
      await page.click('#notaTags [data-tag="tornos"]');
      await page.click('#btnNotaFijar');
      assert.equal(await page.eval("document.getElementById('btnNotaFijar').getAttribute('aria-pressed')"), 'true');
      await page.click('#btnNotaGuardar');
      assert.equal(await isOpen(page, 'tapaNota'), false, 'the sheet closes');
      let stored = JSON.parse(await page.storage('kibco.notas'));
      assert.equal(stored.length, 1);
      assert.deepEqual([stored[0].tit, stored[0].txt, stored[0].ctx, stored[0].tags, stored[0].fijada, stored[0].archivada],
        ['Medidas del torno', 'Bancada 1,5 m\nVolteo 400 mm', 'taller', ['tornos'], true, false]);
      await page.reload();
      await page.click('#tabTareas');
      await page.click('#segBtnNotas');
      assert.equal(await noteRows(page).then((r) => r.length), 1, 'survives reload');
      await page.click('#listaNotas li button');
      assert.equal(await page.eval("document.getElementById('notaTit').value"), 'Medidas del torno', 'the sheet loads the note');
      await page.type('#notaTit', 'Medidas torno grande');
      await page.click('#notaCtxs [data-ctx="estudio"]');
      await page.click('#btnNotaGuardar');
      stored = JSON.parse(await page.storage('kibco.notas'));
      assert.equal(stored[0].tit, 'Medidas torno grande');
      assert.equal(stored[0].ctx, 'estudio', 'moved to another section');
      assert.deepEqual(stored[0].tags, [], 'tags the new section does not have are dropped');
      assert.ok(stored[0].editada >= stored[0].creada);
      assert.deepEqual(await noteRows(page), [], 'no longer in Taller');
    }
  },
  {
    name: 'notes: archive from the sheet, unarchive from the archived list, delete with undo',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST(), 'kibco.contexto': 'taller' },
    async fn(page) {
      await page.click('#tabTareas');
      await page.click('#segBtnNotas');
      await page.click('#listaNotas [data-nota="n1"] button');
      await page.click('#btnNotaArchivar');
      assert.equal(await isOpen(page, 'tapaNota'), false);
      assert.equal(JSON.parse(await page.storage('kibco.notas')).find((n) => n.id === 'n1').archivada, true);
      assert.deepEqual(await noteRows(page), ['n2']);
      await page.click('#btnNotasArchivo');
      await page.click('#listaNotas [data-nota="n1"] button');
      assert.equal(await page.text('#btnNotaArchivar'), 'Desarchivar');
      await page.click('#btnNotaArchivar');
      await page.click('#btnNotasArchivo');
      assert.deepEqual(await noteRows(page), ['n2', 'n1']);
      await page.click('#listaNotas [data-nota="n2"] button');
      await page.click('#btnNotaBorrar');
      assert.equal(await isOpen(page, 'tapaNota'), false);
      assert.equal(JSON.parse(await page.storage('kibco.notas')).some((n) => n.id === 'n2'), false, 'deleted');
      assert.match(await page.text('#qpaso'), /Pedido de rodamientos/);
      await page.click('#btnDeshacer');
      assert.equal(JSON.parse(await page.storage('kibco.notas')).some((n) => n.id === 'n2'), true, 'undo brings it back');
      assert.deepEqual(await noteRows(page), ['n2', 'n1']);
    }
  },
  {
    name: 'notes: search matches title and body ignoring accents and case',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST(), 'kibco.contexto': 'todo' },
    async fn(page) {
      await page.click('#tabTareas');
      await page.click('#segBtnNotas');
      await page.type('#txtBuscaNotas', 'REUNIÓN');
      assert.deepEqual(await noteRows(page), ['n3']);
      await page.type('#txtBuscaNotas', 'juan');
      assert.deepEqual(await noteRows(page), ['n2'], 'matches the body');
      await page.type('#txtBuscaNotas', 'zzz');
      assert.deepEqual(await noteRows(page), []);
      assert.match(await page.text('#vacioNotas'), /zzz/);
      await page.type('#txtBuscaNotas', '');
      assert.deepEqual(await noteRows(page), ['n2', 'n1', 'n3']);
    }
  },
  {
    name: 'notes: nota: in the capture bar saves a note in the tagged section, with a Nota chip',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.contexto': 'taller' },
    async fn(page) {
      await page.type('#txtCaptura', 'nota: idea para el parcial #estudio 18:00');
      assert.equal(await page.text('#capDia'), 'Nota', 'the chip says it is a note');
      assert.match(await page.text('#capCtx'), /Estudio/);
      await page.type('#txtCaptura', 'nota: idea para el parcial #estudio 18:00', true);
      const stored = JSON.parse(await page.storage('kibco.notas'));
      assert.deepEqual([stored.length, stored[0].tit, stored[0].ctx], [1, 'idea para el parcial 18:00', 'estudio']);
      assert.equal(await page.storage('kibco.items'), null, 'no item');
      assert.equal(await page.eval("document.getElementById('txtCaptura').value"), '', 'the bar clears');
      // A section with notes off refuses and keeps the text.
      await page.type('#txtCaptura', 'nota: precio yerba #mercado', true);
      assert.match(await page.text('#aviso'), /Mercado no usa notas/);
      assert.equal(JSON.parse(await page.storage('kibco.notas')).length, 1);
      assert.equal(await page.eval("document.getElementById('txtCaptura').value"), 'nota: precio yerba #mercado');
    }
  },
  {
    name: 'notes: the section editor toggles notes; off hides the Notas segment',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.contexto': 'estudio' },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="estudio"] .apfila-abrir');
      assert.match(await page.eval("document.querySelector('#segNotasAp [data-notas=\"si\"]').className"), /\bon\b/, 'on by default');
      await page.click('#segNotasAp [data-notas="no"]');
      await page.click('#btnApGuardar');
      assert.equal(JSON.parse(await page.storage('kibco.apartados')).find((a) => a.id === 'estudio').notas, false);
      await page.key('Escape');
      await page.click('#tabTareas');
      assert.equal(await page.visible('#segBtnNotas'), false);
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="mercado"] .apfila-abrir');
      assert.match(await page.eval("document.querySelector('#segNotasAp [data-notas=\"no\"]').className"), /\bon\b/);
    }
  },
  {
    name: 'notes: deleting a section moves its notes to the chosen section',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST() },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="taller"] .apfila-abrir');
      await page.click('#btnApBorrar');
      assert.match(await page.text('#apMoverPista'), /3 notas/, 'notes count as records');
      await page.click('#apDestinos [data-ctx="estudio"]');
      await page.click('#btnConfSi');
      await sleep(150);
      const stored = JSON.parse(await page.storage('kibco.notas'));
      assert.deepEqual(stored.filter((n) => n.ctx === 'estudio').map((n) => n.id).sort(), ['n1', 'n2', 'n3', 'n5']);
      assert.equal(stored.some((n) => n.ctx === 'taller'), false);
    }
  },
  {
    name: 'notes backup: export carries notes; restore brings them; without notas imports []; a bad notas field is refused',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST() },
    async fn(page) {
      await openAjustes(page);
      await page.click('#btnBackupTexto');
      const data = JSON.parse(await page.eval("document.getElementById('txtSalida').value"));
      assert.equal(data.notas.length, 5);
      await page.reload();
      const file = path.join(os.tmpdir(), 'kco-e2e-notas.json');
      const base = { app: 'kco', schema: 5, apartados: JSON.parse(NOTE_SECTIONS), items: [] };
      fs.writeFileSync(file, JSON.stringify({ ...base, notas: [{ id: 'b1', tit: 'Del backup', ctx: 'otro' }, { id: 'malo' }] }));
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      let stored = JSON.parse(await page.storage('kibco.notas'));
      assert.deepEqual(stored.map((n) => [n.id, n.ctx]), [['b1', 'otro']], 'normalized; an unknown section gets a generated one');
      assert.ok(await page.eval("!!KCOCore.infoContexto('otro')"));
      fs.writeFileSync(file, JSON.stringify(base));
      await page.reload();
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      assert.equal(await page.storage('kibco.notas'), '[]', 'a backup without notas restores none');
      const before = await page.storage('kibco.apartados');
      fs.writeFileSync(file, JSON.stringify({ ...base, notas: 'roto' }));
      await page.reload();
      await page.setFile('#archivoImport', file);
      assert.match(await page.text('#aviso'), /notas/);
      assert.equal(await isOpen(page, 'tapaConfirmar'), false, 'refused before confirming');
      assert.equal(await page.storage('kibco.apartados'), before);
    }
  },
  {
    name: 'notes backup: a failed notes write rolls the whole restore back',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST(),
      'kibco.items': JSON.stringify([{ id: 'v1', texto: 'viejo', contexto: 'taller', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      const before = { notas: await page.storage('kibco.notas'), items: await page.storage('kibco.items') };
      const file = path.join(os.tmpdir(), 'kco-e2e-notas-falla.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'kco', schema: 5, apartados: JSON.parse(NOTE_SECTIONS), items: [], notas: [{ id: 'b1', tit: 'x', ctx: 'taller' }] }));
      await failWrites(page, ['kibco.notas']);
      await page.setFile('#archivoImport', file);
      await page.click('#btnConfSi');
      assert.match(await page.text('#aviso'), /No se pudo restaurar/);
      assert.deepEqual({ notas: await page.storage('kibco.notas'), items: await page.storage('kibco.items') }, before);
    }
  },
  {
    name: 'notes: unreadable kibco.notas is quarantined and nothing is written over it',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': '{roto' },
    async fn(page) {
      assert.match(await page.text('#aviso'), /kibco\.notas/);
      assert.ok(await page.eval("Object.keys(localStorage).some(function(k){return k.indexOf('kibco.notas.roto.')===0;})"), 'quarantined copy');
      assert.equal(await page.storage('kibco.notas'), '{roto');
    }
  },
  {
    name: 'notes: a failed note write keeps the sheet open, says so and changes nothing',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST(), 'kibco.contexto': 'taller' },
    async fn(page) {
      const before = await page.storage('kibco.notas');
      await page.click('#tabTareas');
      await page.click('#segBtnNotas');
      await page.click('#btnNuevaNota');
      await page.type('#notaTit', 'no entra');
      await failWrites(page, ['kibco.notas']);
      await page.click('#btnNotaGuardar');
      assert.ok(await isOpen(page, 'tapaNota'));
      assert.match(await page.text('#notaError'), /No se pudo guardar la nota/);
      assert.equal(await page.storage('kibco.notas'), before);
      assert.deepEqual(await noteRows(page), ['n2', 'n1'], 'memory unchanged');
    }
  },
  {
    name: 'notes: item comments render in the item sheet, never in the Notas view',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST(), 'kibco.contexto': 'taller',
      'kibco.items': JSON.stringify([{ id: 'i1', texto: 'torno', contexto: 'taller', tipo: 'tarea', estado: 'pendiente',
        comentarios: [{ cuando: '2026-01-02T10:00:00.000Z', texto: 'pedir correa' }], creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await openFirstItem(page);
      await sleep(300);
      assert.match(await page.text('#tapaItem'), /pedir correa/, 'the comment shows in the item sheet');
      await page.key('Escape');
      await page.click('#segBtnNotas');
      assert.deepEqual(await noteRows(page), ['n2', 'n1']);
      assert.doesNotMatch(await page.text('#vistaNotas'), /pedir correa|Sin comentarios/, 'no comment leaks into Notas');
    }
  },
  {
    name: 'notes: a failed nota: capture says so and keeps the text in the bar',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST(), 'kibco.contexto': 'taller' },
    async fn(page) {
      const before = await page.storage('kibco.notas');
      await failWrites(page, ['kibco.notas']);
      await page.type('#txtCaptura', 'nota: no entra', true);
      assert.match(await page.text('#aviso'), /No se pudo guardar la nota/);
      assert.equal(await page.eval("document.getElementById('txtCaptura').value"), 'nota: no entra', 'text kept');
      assert.equal(await page.storage('kibco.notas'), before);
    }
  },
  {
    name: 'notes: deleting a section with only an archived note asks for a destination and moves it there',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS,
      'kibco.notas': JSON.stringify([{ id: 'na', tit: 'Guardada', ctx: 'mercado', archivada: true }, { id: 'nb', tit: 'Otra', ctx: 'estudio' }]) },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="mercado"] .apfila-abrir');
      await page.click('#btnApBorrar');
      assert.ok(await page.visible('#cajaApMover'), 'a note is a record: the confirmation asks for a target');
      assert.equal(await page.eval("document.getElementById('btnConfSi').disabled"), true, 'no straight delete');
      assert.match(await page.text('#apMoverPista'), /1 nota/);
      await page.click('#apDestinos [data-ctx="taller"]');
      await page.click('#btnConfSi');
      await sleep(150);
      const stored = JSON.parse(await page.storage('kibco.notas'));
      assert.deepEqual(stored.map((n) => [n.id, n.ctx, !!n.archivada]), [['na', 'taller', true], ['nb', 'estudio', false]]);
      assert.equal(stored.some((n) => !n.ctx), false, 'no note without a section');
    }
  },
  {
    name: 'backup: Escape on the export sheet over Ajustes, then a file restore, applies the restore',
    async fn(page) {
      await capture(page, 'item uno');
      await page.click('#btnAjustes');
      await page.click('#btnBackupTexto');
      const json = await page.eval("document.getElementById('txtSalida').value");
      const data = JSON.parse(json);
      data.items[0].texto = 'restaurado';
      const file = path.join(os.tmpdir(), 'kco-e2e-backup-escape.json');
      fs.writeFileSync(file, JSON.stringify(data));
      await page.key('Escape');
      await page.setFile('#archivoImport', file);
      assert.ok(await isOpen(page, 'tapaConfirmar'), 'restore asks first');
      await page.click('#btnConfSi');
      await sleep(150);
      assert.deepEqual((await items(page)).map((i) => i.texto), ['restaurado'], 'restore applied');
      assert.ok((await events(page)).some((e) => e.tipo === 'restauracion'));
    }
  },
  {
    name: 'notes ui: the Notas view and sheet fit 390px (dark) without horizontal overflow',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST(), 'kibco.contexto': 'todo' },
    async fn(page) {
      await scheme(page, 'dark');
      await page.click('#tabTareas');
      await page.click('#segBtnNotas');
      assert.equal(await page.eval('document.documentElement.scrollWidth <= window.innerWidth'), true, 'no horizontal scroll at 390px');
      assert.equal(await page.eval("Array.prototype.every.call(document.querySelectorAll('#listaNotas li'),function(l){return l.getBoundingClientRect().right<=window.innerWidth;})"), true);
      await page.screenshot(path.join(OUT, 'notes-mobile-dark.png'));
      await page.click('#listaNotas [data-nota="n2"] button');
      await sleep(450);
      assert.equal(await page.eval("document.querySelector('#tapaNota .hoja').scrollWidth <= document.querySelector('#tapaNota .hoja').clientWidth"), true, 'sheet fits');
      await page.screenshot(path.join(OUT, 'notes-sheet-mobile-dark.png'));
    }
  },
  {
    name: 'notes ui: the Notas view fits 1366px (light)',
    width: 1366,
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST(), 'kibco.contexto': 'todo' },
    async fn(page) {
      await scheme(page, 'light');
      await page.click('#tabTareas');
      await page.click('#segBtnNotas');
      assert.equal(await page.eval('document.documentElement.scrollWidth <= window.innerWidth'), true, 'no horizontal scroll at 1366px');
      assert.deepEqual(await noteRows(page), ['n2', 'n1', 'n3']);
      await page.screenshot(path.join(OUT, 'notes-desktop-light.png'));
    }
  },
  {
    name: 'sections ui: the template picker and the sections manager fit 390px (dark)',
    async fn(page) {
      await scheme(page, 'dark');
      await freshInstall(page);
      assert.ok(await isOpen(page, 'tapaPlantillas'));
      await sleep(400);
      assert.equal(await page.eval("(function(){var h=document.querySelector('#tapaPlantillas .hoja');return h.scrollWidth<=h.clientWidth;})()"), true, 'picker fits');
      await page.screenshot(path.join(OUT, 'plantillas-mobile-dark.png'));
      await page.click('[data-plantilla="trabajo-casa"]');
      await sleep(150);
      await openAjustes(page);
      await page.eval("document.getElementById('btnImportar').scrollIntoView()");
      await sleep(400);
      assert.equal(await page.eval('document.documentElement.scrollWidth <= window.innerWidth'), true, 'no horizontal scroll at 390px');
      await page.screenshot(path.join(OUT, 'apartados-ajustes-mobile-dark.png'));
    }
  },
  {
    name: 'sections ui: the template picker, the sections manager and the editor at 1366px (light)',
    width: 1366,
    height: 900,
    mobile: false,
    async fn(page) {
      await scheme(page, 'light');
      await freshInstall(page);
      assert.ok(await isOpen(page, 'tapaPlantillas'));
      await sleep(400);
      await page.screenshot(path.join(OUT, 'plantillas-desktop-light.png'));
      await page.click('[data-plantilla="estudiante"]');
      await sleep(150);
      await openAjustes(page);
      await page.eval("document.getElementById('btnImportar').scrollIntoView()");
      await sleep(400);
      assert.equal(await page.eval('document.documentElement.scrollWidth <= window.innerWidth'), true, 'no horizontal scroll at 1366px');
      await page.screenshot(path.join(OUT, 'apartados-ajustes-desktop-light.png'));
      await page.click('#listaApartados [data-ap="estudio"] .apfila-abrir');
      await sleep(400);
      assert.ok(await isOpen(page, 'tapaApartado'));
      await page.screenshot(path.join(OUT, 'apartado-editor-desktop-light.png'));
    }
  },
  {
    name: 'tab capture: on the Compras tab the bar saves a purchase of the section; a #tag to a section without purchases saves a task',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.contexto': 'mercado' },
    async fn(page) {
      await page.click('#tabTareas');
      await page.click('#segBtnCompras');
      assert.match(await page.eval("document.getElementById('txtCaptura').getAttribute('placeholder')"), /^Nueva compra en Mercado/, 'the hint says purchase');
      await page.type('#txtCaptura', 'yerba mate');
      assert.match(await page.text('#capDia'), /Compra/, 'the chip says purchase');
      await page.type('#txtCaptura', 'yerba mate', true);
      let list = await items(page);
      assert.deepEqual([list.length, list[0].tipo, list[0].estado, list[0].contexto], [1, 'compra', 'por_comprar', 'mercado']);
      assert.equal(await page.count('#listaCompras li.item'), 1, 'visible in the purchase list');
      // Factory-mode section: the purchase starts in its first column.
      await page.type('#txtCaptura', 'rodamientos #taller', true);
      list = await items(page);
      assert.deepEqual([list[1].tipo, list[1].estado, list[1].contexto], ['compra', 'cotizando', 'taller']);
      // A section whose purchase mode is 'no' gets a task (existing rule).
      await page.type('#txtCaptura', 'libro #estudio', true);
      list = await items(page);
      assert.deepEqual([list[2].tipo, list[2].estado, list[2].contexto], ['tarea', 'entrada', 'estudio']);
      // Back on Tareas the bar captures tasks again.
      await page.click('#segBtnTareas');
      assert.match(await page.eval("document.getElementById('txtCaptura').getAttribute('placeholder')"), /^Tarea en Mercado/);
      await page.type('#txtCaptura', 'llamar al proveedor', true);
      list = await items(page);
      assert.deepEqual([list[3].tipo, list[3].estado], ['tarea', 'entrada']);
    }
  },
  {
    name: 'tab capture: on the Notas tab the bar saves a note of the section without the nota: prefix',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.contexto': 'taller' },
    async fn(page) {
      await page.click('#tabTareas');
      await page.click('#segBtnNotas');
      assert.match(await page.eval("document.getElementById('txtCaptura').getAttribute('placeholder')"), /^Nota en Taller/);
      await page.type('#txtCaptura', 'medidas del torno 18:00');
      assert.equal(await page.text('#capDia'), 'Nota');
      await page.type('#txtCaptura', 'medidas del torno 18:00', true);
      const stored = JSON.parse(await page.storage('kibco.notas'));
      assert.deepEqual([stored.length, stored[0].tit, stored[0].ctx], [1, 'medidas del torno 18:00', 'taller']);
      assert.equal(await page.storage('kibco.items'), null, 'no item');
      assert.equal(await page.count('#listaNotas [data-nota]'), 1, 'visible in the notes list');
      assert.equal(await page.eval("document.getElementById('txtCaptura').value"), '', 'the bar clears');
    }
  },
  {
    name: 'ahora order: the Automatico/Manual switch is per section, persists after reload, and Todo has none',
    storage: ORDER_SEED(),
    async fn(page) {
      assert.ok(await page.visible('#ordenAhora'), 'switch shown in a section');
      assert.equal(await orderOn(page), 'auto', 'automatic by default');
      await page.click('#ordenAhora [data-orden="manual"]');
      assert.equal(await orderOn(page), 'manual');
      await page.screenshot(path.join(OUT, 'ahora-orden-switch.png'));
      const stored = JSON.parse(await page.storage('kibco.apartados'));
      assert.deepEqual(stored.map((a) => [a.id, a.ordenAhora]), [['taller', 'manual'], ['mercado', 'auto']]);
      await page.reload();
      assert.equal(await orderOn(page), 'manual', 'kept after reload');
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"mercado\"]').click()");
      assert.equal(await orderOn(page), 'auto', 'the other section keeps its own mode');
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"todo\"]').click()");
      assert.equal(await page.count('#ordenAhora'), 0, 'Todo is always automatic, no switch');
    }
  },
  {
    name: 'ahora order: in Manual a long-press drag reorders, the hero follows and it persists; a plain vertical drag does not; Automatico restores the score order',
    storage: ORDER_SEED('manual'),
    async fn(page) {
      assert.deepEqual(await orderRows(page), ['A', 'B', 'C', 'D'], 'manual list starts in score order, hero included');
      assert.equal(await page.text('.hero .hero-txt'), 'tarea A');
      const show = () => page.eval("document.getElementById('secSigue').scrollIntoView(true)");
      await show();
      // A quick vertical drag (no long-press) is a scroll: nothing changes.
      let b = await page.rect('#secSigue li.item[data-id="B"]');
      await page.drag(b.x + b.w / 2, b.y + b.h / 2, b.x + b.w / 2, b.y + b.h / 2 + 90, 8, 0);
      assert.deepEqual(await orderRows(page), ['A', 'B', 'C', 'D'], 'a plain drag is a scroll');
      // Long-press D and drag it above A.
      await show();
      const d = await page.rect('#secSigue li.item[data-id="D"]'), a = await page.rect('#secSigue li.item[data-id="A"]');
      await page.drag(d.x + d.w / 2, d.y + d.h / 2, d.x + d.w / 2, a.y + 4, 12, 500);
      assert.deepEqual(await orderRows(page), ['D', 'A', 'B', 'C'], 'long-press drag to the top');
      assert.equal(await page.text('.hero .hero-txt'), 'tarea D', 'the first one is the next move');
      const list = await items(page);
      assert.deepEqual(['A', 'B', 'C', 'D'].map((id) => list.find((i) => i.id === id).ordenManual), [2, 3, 4, 1]);
      assert.deepEqual(list.filter((i) => i.contexto === 'mercado').map((i) => i.ordenManual), [0, 0], 'other sections unaffected');
      assert.ok(list.every((i) => i.estado === 'pendiente' || i.id === 'B'), 'the drag did not complete anything');
      assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa', 'no quick menu');
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa', 'no item sheet');
      await page.reload();
      assert.deepEqual(await orderRows(page), ['D', 'A', 'B', 'C'], 'kept after reload');
      await page.click('#ordenAhora [data-orden="auto"]');
      assert.equal(await page.text('.hero .hero-txt'), 'tarea A', 'Automatico: score order again');
      assert.deepEqual(await orderRows(page), ['B', 'C', 'D']);
      await page.click('#ordenAhora [data-orden="manual"]');
      assert.deepEqual(await orderRows(page), ['D', 'A', 'B', 'C'], 'the manual order is remembered');
      await show();
      await page.screenshot(path.join(OUT, 'ahora-orden-manual.png'));
      // Swipe right on a manual row still completes it.
      const c = await page.rect('#secSigue li.item[data-id="C"]');
      await page.drag(c.x + 60, c.y + c.h / 2, c.x + 300, c.y + c.h / 2 + 6);
      assert.equal((await items(page)).find((i) => i.id === 'C').estado, 'completado', 'swipe still works');
    }
  },
  {
    name: 'ahora order: mouse long-press drag and Alt+Arrow keys reorder too (desktop)',
    storage: ORDER_SEED('manual'),
    width: 1366, height: 900, mobile: false,
    async fn(page) {
      // Cabina controls are 48px tall: bring the list into the window before pressing with the mouse.
      await page.eval("document.getElementById('secSigue').scrollIntoView(true)");
      const c = await page.rect('#secSigue li.item[data-id="C"]'), a = await page.rect('#secSigue li.item[data-id="A"]');
      await page.mouseDrag(c.x + c.w / 2, c.y + c.h / 2, c.x + c.w / 2, a.y + 4, 10, 500);
      assert.deepEqual(await orderRows(page), ['C', 'A', 'B', 'D']);
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa', 'the drop is not a click');
      // Keyboard: Alt+ArrowDown moves the focused row one place down, focus stays on it.
      await page.eval(`(function(){var l=document.querySelector('#secSigue li.item[data-id="C"]');l.focus();
        l.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',keyCode:40,altKey:true,bubbles:true,cancelable:true}));})()`);
      await sleep(80);
      assert.deepEqual(await orderRows(page), ['A', 'C', 'B', 'D']);
      assert.equal(await page.eval('document.activeElement && document.activeElement.getAttribute("data-id")'), 'C');
      assert.equal(await page.text('.hero .hero-txt'), 'tarea A');
    }
  },
  {
    name: 'ahora order: a repaint during the long-press hold cancels it and leaves no stuck drag',
    storage: ORDER_SEED('manual'),
    async fn(page) {
      // Touch B (the hold timer starts), then a keyboard move on C repaints the list before 350 ms.
      await page.eval(`(function(){var b=document.querySelector('#secSigue li.item[data-id="B"]'),r=b.getBoundingClientRect();
        var t=new Touch({identifier:41,target:b,clientX:r.left+r.width/2,clientY:r.top+r.height/2});
        b.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[t],targetTouches:[t],changedTouches:[t]}));
        var c=document.querySelector('#secSigue li.item[data-id="C"]');c.focus();
        c.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',keyCode:40,altKey:true,bubbles:true,cancelable:true}));})()`);
      await sleep(600);
      assert.deepEqual(await orderRows(page), ['A', 'B', 'D', 'C'], 'the keyboard move repainted the list');
      assert.equal(await page.eval("document.documentElement.hasAttribute('data-ordenando')"), false, 'no drag started on the replaced row');
      assert.equal(await page.count('#secSigue .orden-fantasma, #secSigue .orden-hueco'), 0, 'no floating copy or placeholder');
      // A new long-press drag still works.
      await page.eval("document.getElementById('secSigue').scrollIntoView(true)");
      const c = await page.rect('#secSigue li.item[data-id="C"]'), a = await page.rect('#secSigue li.item[data-id="A"]');
      await page.drag(c.x + c.w / 2, c.y + c.h / 2, c.x + c.w / 2, a.y + 4, 12, 500);
      assert.deepEqual(await orderRows(page), ['C', 'A', 'B', 'D'], 'a later long-press drag reorders');
      // And a row swipe still completes.
      const d = await page.rect('#secSigue li.item[data-id="D"]');
      await page.drag(d.x + 60, d.y + d.h / 2, d.x + 300, d.y + d.h / 2 + 6);
      assert.equal((await items(page)).find((i) => i.id === 'D').estado, 'completado', 'swipe still works');
    }
  },
  {
    name: 'ahora order: holding a touch drag near the bottom or top edge keeps scrolling main and the placeholder follows',
    storage: LONG_ORDER_SEED(),
    async fn(page) {
      assert.ok(await page.eval("(function(){var m=document.querySelector('main');return m.scrollHeight>m.clientHeight+200;})()"), 'main overflows');
      await page.eval("document.querySelector('#secSigue li.item[data-id=\"C\"]').scrollIntoView({block:'center'})");
      // Long-press C with touch events, then park the finger near the bottom edge without moving again.
      await page.eval(`(function(){var b=document.querySelector('#secSigue li.item[data-id="C"]'),r=b.getBoundingClientRect();
        var t=new Touch({identifier:21,target:b,clientX:r.left+r.width/2,clientY:r.top+r.height/2});
        b.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[t],targetTouches:[t],changedTouches:[t]}));})()`);
      await sleep(500);
      assert.equal(await page.eval("document.documentElement.hasAttribute('data-ordenando')"), true, 'the drag started');
      const park = (where) => page.eval(`(function(){var b=document.querySelector('#secSigue li.item[data-id="C"]'),m=document.querySelector('main').getBoundingClientRect();
        var bajo=Math.min(m.bottom,window.innerHeight),c=document.querySelector('.captura'),tb=document.querySelector('.tabs');
        [c,tb].forEach(function(e){if(!e)return;var s=getComputedStyle(e),r=e.getBoundingClientRect();if(s.position==='fixed'&&r.height>0&&r.top<bajo)bajo=r.top;});
        var y=${where === 'bottom' ? 'bajo-6' : 'Math.max(m.top,0)+6'};
        var t=new Touch({identifier:21,target:b,clientX:m.left+40,clientY:y});
        b.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[t],targetTouches:[t],changedTouches:[t]}));})()`);
      const state = () => page.eval(`(function(){var m=document.querySelector('main'),h=document.querySelector('#secSigue .orden-hueco');
        return {top:m.scrollTop,hole:h?Array.prototype.indexOf.call(h.parentNode.children,h):-1};})()`);
      await park('bottom');
      const s0 = await state();
      await sleep(700);
      const s1 = await state();
      assert.ok(s1.top > s0.top + 40, 'held at the bottom edge, main keeps scrolling down: ' + s0.top + ' -> ' + s1.top);
      assert.ok(s1.hole > s0.hole, 'the placeholder moved down with the scroll: ' + s0.hole + ' -> ' + s1.hole);
      await park('top');
      const s2 = await state();
      await sleep(700);
      const s3 = await state();
      assert.ok(s3.top < s2.top - 40, 'held at the top edge, main keeps scrolling up: ' + s2.top + ' -> ' + s3.top);
      assert.ok(s3.hole < s2.hole, 'the placeholder moved up with the scroll: ' + s2.hole + ' -> ' + s3.hole);
      // Releasing stops the scroll loop and drops C where the placeholder was.
      await page.eval(`(function(){var b=document.querySelector('#secSigue li.item[data-id="C"]');
        var t=new Touch({identifier:21,target:b,clientX:20,clientY:20});
        b.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[t]}));})()`);
      await sleep(120);
      assert.equal(await page.eval("document.documentElement.hasAttribute('data-ordenando')"), false, 'drag ended');
      assert.equal(await page.count('#secSigue .orden-fantasma, #secSigue .orden-hueco'), 0, 'no floating copy or placeholder');
      const after = await page.eval("document.querySelector('main').scrollTop");
      await sleep(300);
      assert.equal(await page.eval("document.querySelector('main').scrollTop"), after, 'no scrolling after the drop');
    }
  },
  {
    name: 'ahora order: a mouse drag held near the bottom edge scrolls main on desktop too',
    storage: LONG_ORDER_SEED(),
    width: 1366, height: 700, mobile: false,
    async fn(page) {
      assert.ok(await page.eval("(function(){var m=document.querySelector('main');return m.scrollHeight>m.clientHeight+200;})()"), 'main overflows');
      const ev = (type, where) => page.eval(`(function(){var b=document.querySelector('#secSigue li.item[data-id="B"]'),r=b.getBoundingClientRect(),m=document.querySelector('main').getBoundingClientRect();
        var y=${where === 'row' ? 'r.top+r.height/2' : 'Math.min(m.bottom,window.innerHeight)-6'};
        b.dispatchEvent(new PointerEvent('${type}',{bubbles:true,cancelable:true,isPrimary:true,pointerId:3,pointerType:'mouse',button:0,buttons:1,clientX:r.left+r.width/2,clientY:y}));})()`);
      await page.eval("document.querySelector('#secSigue li.item[data-id=\"B\"]').scrollIntoView({block:'center'})");
      await ev('pointerdown', 'row');
      await sleep(500);
      assert.equal(await page.eval("document.documentElement.hasAttribute('data-ordenando')"), true, 'the drag started');
      await ev('pointermove', 'edge');
      const t0 = await page.eval("document.querySelector('main').scrollTop");
      await sleep(600);
      const t1 = await page.eval("document.querySelector('main').scrollTop");
      assert.ok(t1 > t0 + 40, 'main scrolled down while held: ' + t0 + ' -> ' + t1);
      // pointercancel cancels the drop and stops the loop.
      await ev('pointercancel', 'edge');
      await sleep(80);
      const t2 = await page.eval("document.querySelector('main').scrollTop");
      await sleep(300);
      assert.equal(await page.eval("document.querySelector('main').scrollTop"), t2, 'no scrolling after cancel');
      assert.equal(await page.eval("document.documentElement.hasAttribute('data-ordenando')"), false);
      assert.equal(await page.count('#secSigue .orden-fantasma, #secSigue .orden-hueco'), 0);
    }
  },
  {
    name: 'ahora order: a failed save restores the previous manual ranks and order',
    storage: ORDER_SEED('manual'),
    async fn(page) {
      const altUp = `(function(){var l=document.querySelector('#secSigue li.item[data-id="C"]');l.focus();
        l.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',keyCode:38,altKey:true,bubbles:true,cancelable:true}));})()`;
      const before = await page.storage('kibco.items');
      await failWrites(page, ['kibco.items']);
      await page.eval(altUp);
      await sleep(80);
      assert.deepEqual(await orderRows(page), ['A', 'B', 'C', 'D'], 'the in-memory ranks were rolled back');
      assert.equal(await page.storage('kibco.items'), before, 'nothing stored');
      await restoreWrites(page);
      await page.eval(altUp);
      await sleep(80);
      assert.deepEqual(await orderRows(page), ['A', 'C', 'B', 'D'], 'the same move works once saving works');
      const list = await items(page);
      assert.deepEqual(['A', 'B', 'C', 'D'].map((id) => list.find((i) => i.id === id).ordenManual), [1, 3, 2, 4]);
      await page.reload();
      assert.deepEqual(await orderRows(page), ['A', 'C', 'B', 'D'], 'kept after reload');
    }
  },
  {
    name: 'kebab: every active card has a "more" button that opens the card tray (Ahora and Tareas) without opening the card',
    storage: Object.assign(ORDER_SEED(), { 'kibco.tema': 'claro' }),
    async fn(page) {
      await sleep(450); // measure the cards at rest (entry animation)
      const sel = '#secSigue li.item[data-id="B"] [data-acc="mas"]';
      assert.equal(await page.count(sel), 1, 'kebab on the Ahora card');
      assert.equal(await page.eval(`document.querySelector('${sel}').getAttribute('aria-expanded')`), 'false');
      assert.match(await page.eval(`document.querySelector('${sel}').getAttribute('aria-label')`), /^Más opciones: tarea B$/);
      const r = await page.rect(sel);
      assert.ok(r.w >= 44 && r.h >= 44, 'a 44px touch target: ' + JSON.stringify(r));
      const card = await page.rect('#secSigue li.item[data-id="B"]');
      assert.ok(r.r <= card.r + 0.5, 'inside the card');
      assert.equal(await page.eval('document.documentElement.scrollWidth <= window.innerWidth'), true, 'no horizontal overflow');
      await page.eval("document.getElementById('secSigue').scrollIntoView(true)");
      await page.screenshot(path.join(OUT, 'kebab-card-light.png'));
      await page.click(sel);
      await sleep(80);
      assert.equal(await page.count('#secSigue li.item[data-id="B"] .bandeja-swipe'), 1, 'tray open');
      assert.equal(await page.eval(`document.querySelector('${sel}').getAttribute('aria-expanded')`), 'true');
      assert.equal(await page.eval("document.querySelector('#secSigue li.item[data-id=\"B\"] .bandeja-swipe').getAttribute('aria-label')"), 'Acciones: tarea B');
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa', 'the card did not open');
      await page.emulateFocus();
      await page.eval("document.querySelector('#secSigue .bandeja-swipe button').focus()");
      await page.key('Escape');
      assert.equal(await page.count('#secSigue .bandeja-swipe'), 0, 'Escape closes the tray');
      assert.equal(await page.eval(`document.activeElement===document.querySelector('${sel}')`), true, 'focus back on the dots');
      await toTasks(page);
      const t = '#lista li.item [data-acc="mas"]';
      assert.ok(await page.count(t) >= 4, 'kebab on Tareas cards');
      await page.click(t);
      await sleep(80);
      assert.equal(await page.count('#lista .bandeja-swipe'), 1, 'tray open from Tareas');
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa');
    }
  },
  {
    name: 'kebab: in Manual a long-press (contextmenu, also after a pointercancel) never opens the quick menu; in Automatico it still does',
    storage: ORDER_SEED('manual'),
    async fn(page) {
      const closed = async (msg) => assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa', msg);
      // Android: the browser takes the touch (pointercancel) and then fires contextmenu.
      await page.eval(`(function(){var b=document.querySelector('#secSigue li.item[data-id="B"]'),r=b.getBoundingClientRect();
        var o={bubbles:true,cancelable:true,isPrimary:true,pointerId:51,pointerType:'touch',button:0,clientX:r.left+r.width/2,clientY:r.top+r.height/2};
        b.dispatchEvent(new PointerEvent('pointerdown',o));b.dispatchEvent(new PointerEvent('pointercancel',o));})()`);
      await sleep(550);
      await page.eval(`document.querySelector('#secSigue li.item[data-id="B"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
      await sleep(80);
      await closed('no quick menu after pointercancel + contextmenu');
      await page.eval(`document.querySelector('#secSigue li.item[data-id="C"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
      await sleep(80);
      await closed('no quick menu on a plain contextmenu');
      assert.equal(await page.eval("getComputedStyle(document.querySelector('#secSigue li.item[data-id=\"C\"]')).webkitUserSelect"), 'none', 'no text selection on draggable rows');
      // A touch hold survives a pointercancel: touch events drive the drag. The
      // pointerId deliberately equals the Touch.identifier (Chromium numbers them
      // separately, so they can collide on a real phone).
      await page.eval(`(function(){var b=document.querySelector('#secSigue li.item[data-id="D"]'),r=b.getBoundingClientRect();
        var t=new Touch({identifier:7,target:b,clientX:r.left+r.width/2,clientY:r.top+r.height/2});
        b.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[t],targetTouches:[t],changedTouches:[t]}));
        b.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,isPrimary:true,pointerId:7,pointerType:'touch'}));})()`);
      await sleep(500);
      assert.equal(await page.eval("document.documentElement.hasAttribute('data-ordenando')"), true, 'the drag started despite pointercancel');
      await page.eval(`document.querySelector('#secSigue li.item[data-id="D"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
      await closed('no quick menu while dragging');
      await page.eval(`(function(){var b=document.querySelector('#secSigue li.item[data-id="D"]'),a=document.querySelector('#secSigue li.item[data-id="A"]').getBoundingClientRect();
        var t=new Touch({identifier:7,target:b,clientX:a.left+20,clientY:a.top+4});
        b.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[t],targetTouches:[t],changedTouches:[t]}));
        b.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[t]}));})()`);
      await sleep(120);
      assert.deepEqual(await orderRows(page), ['D', 'A', 'B', 'C'], 'touch-event drag reorders');
      await closed('still no quick menu');
      // Automatico: long-press keeps opening the quick menu.
      await page.click('#ordenAhora [data-orden="auto"]');
      await openQuickMenu(page, '#secSigue li.item[data-id="B"]');
    }
  },
  {
    name: 'ahora order: in Manual the items that need attention join the draggable list (no separate section); Automatico keeps the alert section',
    storage: ATTENTION_SEED('manual'),
    async fn(page) {
      assert.equal(await page.count('#secAtencion'), 0, 'no separate attention section in Manual');
      const rows = await orderRows(page);
      assert.deepEqual(rows.slice(0, 2).sort(), ['V1', 'V2'], 'overdue items lead the manual list by score');
      assert.deepEqual(rows.slice(2), ['A', 'B', 'C', 'D']);
      assert.match(await page.text('#secSigue li.item[data-id="V1"]'), /Vencida hace 17 d/, 'the urgency label stays on the card');
      assert.equal(await page.eval("document.querySelector('.pulso .tile.rojo').getAttribute('data-tile')"), 'atencion', 'the Atencion chip filters');
      assert.equal(await page.eval("document.querySelector('.pulso .tile.rojo b').textContent"), '2', 'the Atencion count still works');
      // contextmenu on an overdue row never opens the quick menu in Manual.
      await page.eval(`document.querySelector('#secSigue li.item[data-id="V2"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
      await sleep(80);
      assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa', 'no quick menu on an overdue row');
      // Long-press drag A above the first overdue item.
      await page.eval("document.getElementById('secSigue').scrollIntoView(true)");
      const first = rows[0], second = rows[1];
      const a = await page.rect('#secSigue li.item[data-id="A"]'), v = await page.rect('#secSigue li.item[data-id="' + first + '"]');
      await page.drag(a.x + a.w / 2, a.y + a.h / 2, a.x + a.w / 2, v.y + 4, 12, 500);
      assert.deepEqual(await orderRows(page), ['A', first, second, 'B', 'C', 'D'], 'a task dragged above the overdue ones');
      assert.equal(await page.text('.hero .hero-txt'), 'tarea A', 'the hero follows');
      // An overdue item moves below another one (keyboard alternative of the drag).
      await page.eval(`(function(){var l=document.querySelector('#secSigue li.item[data-id="${first}"]');l.focus();
        l.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',keyCode:40,altKey:true,bubbles:true,cancelable:true}));})()`);
      await sleep(80);
      assert.deepEqual(await orderRows(page), ['A', second, first, 'B', 'C', 'D']);
      await page.reload();
      assert.deepEqual(await orderRows(page), ['A', second, first, 'B', 'C', 'D'], 'kept after reload');
      assert.equal(await page.count('#secAtencion'), 0);
      // Automatico: the alert section is back.
      await page.click('#ordenAhora [data-orden="auto"]');
      assert.equal(await page.count('#secAtencion'), 1, 'Automatico keeps Requiere atencion');
      assert.equal(await page.eval("document.querySelector('.pulso .tile.rojo').getAttribute('data-tile')"), 'atencion');
    }
  },
  {
    name: 'list order: in Manual a touch long-press drag in Tareas reorders, persists, and Ahora shares the same order both ways',
    storage: ORDER_SEED('manual'),
    async fn(page) {
      await toTasks(page);
      assert.equal(await listOrderOn(page, 'ordenTareas'), 'manual', 'the shared switch is shown in Tareas');
      assert.equal(await page.eval("document.querySelector('#ordenTareas .menu-chip-lista').getAttribute('aria-label')"), 'Orden en Taller');
      assert.deepEqual(await listRows(page, 'lista'), ['A', 'B', 'C', 'D']);
      assert.equal(await page.count('#lista.ordenable'), 1, 'the Tareas list is draggable');
      await page.eval("document.getElementById('lista').scrollIntoView(true)");
      const d = await page.rect('#lista li.item[data-id="D"]'), a = await page.rect('#lista li.item[data-id="A"]');
      await page.drag(d.x + d.w / 2, d.y + d.h / 2, d.x + d.w / 2, a.y + 4, 12, 500);
      assert.deepEqual(await listRows(page, 'lista'), ['D', 'A', 'B', 'C'], 'long-press drag to the top');
      await page.screenshot(path.join(OUT, 'tareas-orden-manual.png'));
      const list = await items(page);
      assert.deepEqual(['A', 'B', 'C', 'D'].map((id) => list.find((i) => i.id === id).ordenManual), [2, 3, 4, 1]);
      assert.deepEqual(list.filter((i) => i.contexto === 'mercado').map((i) => i.ordenManual), [0, 0], 'other sections unaffected');
      assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa', 'no quick menu');
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa', 'no item sheet');
      assert.equal(await page.count('#lista .orden-fantasma, #lista .orden-hueco'), 0, 'no floating copy or placeholder');
      await page.reload();
      await toTasks(page);
      assert.deepEqual(await listRows(page, 'lista'), ['D', 'A', 'B', 'C'], 'kept after reload');
      await page.click('#tabAhora');
      assert.deepEqual(await orderRows(page), ['D', 'A', 'B', 'C'], 'Ahora shows the order set in Tareas');
      await page.eval(`(function(){var l=document.querySelector('#secSigue li.item[data-id="C"]');l.focus();
        l.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',keyCode:38,altKey:true,bubbles:true,cancelable:true}));})()`);
      await sleep(80);
      assert.deepEqual(await orderRows(page), ['D', 'A', 'C', 'B']);
      await toTasks(page);
      assert.deepEqual(await listRows(page, 'lista'), ['D', 'A', 'C', 'B'], 'Tareas shows the order set in Ahora');
    }
  },
  {
    name: 'list order: in Manual a mouse long-press drag reorders Compras (desktop) without touching the Tareas order',
    storage: COMPRA_ORDER_SEED(),
    width: 1366, height: 900, mobile: false,
    async fn(page) {
      await page.eval("document.getElementById('tabTareas').click()");
      await page.eval("document.getElementById('segBtnCompras').click()");
      await sleep(80);
      assert.equal(await listOrderOn(page, 'ordenCompras'), 'manual', 'the shared switch is shown in Compras');
      assert.deepEqual(await listRows(page, 'listaCompras'), ['K1', 'K2', 'K3']);
      const k3 = await page.rect('#listaCompras li.item[data-id="K3"]'), k1 = await page.rect('#listaCompras li.item[data-id="K1"]');
      await page.mouseDrag(k3.x + k3.w / 2, k3.y + k3.h / 2, k3.x + k3.w / 2, k1.y + 4, 10, 500);
      assert.deepEqual(await listRows(page, 'listaCompras'), ['K3', 'K1', 'K2'], 'mouse drag to the top');
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa', 'the drop is not a click');
      await page.reload();
      await page.eval("document.getElementById('tabTareas').click()");
      await page.eval("document.getElementById('segBtnCompras').click()");
      await sleep(80);
      assert.deepEqual(await listRows(page, 'listaCompras'), ['K3', 'K1', 'K2'], 'kept after reload');
      await page.eval("document.getElementById('segBtnTareas').click()");
      await sleep(80);
      assert.deepEqual(await listRows(page, 'lista'), ['A', 'B', 'C', 'D'], 'the tasks keep their relative order');
    }
  },
  {
    name: 'list order: Alt+Arrow keys move the focused Tareas row in Manual and focus stays on it',
    storage: ORDER_SEED('manual'),
    async fn(page) {
      await toTasks(page);
      const key = (id, k, code) => page.eval(`(function(){var l=document.querySelector('#lista li.item[data-id="${id}"]');l.focus();
        l.dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',keyCode:${code},altKey:true,bubbles:true,cancelable:true}));})()`);
      assert.equal(await page.eval("document.querySelector('#lista li.item').getAttribute('aria-describedby')"), 'pistaTareas');
      assert.ok(await page.visible('#pistaTareas'), 'the drag hint is shown');
      await key('C', 'ArrowUp', 38);
      await sleep(80);
      assert.deepEqual(await listRows(page, 'lista'), ['A', 'C', 'B', 'D']);
      assert.equal(await page.eval("document.activeElement && document.activeElement.getAttribute('data-id')"), 'C');
      assert.equal(await page.eval("!!(document.activeElement && document.activeElement.closest('#lista'))"), true, 'focus stays in Tareas');
      await key('C', 'ArrowDown', 40);
      await sleep(80);
      assert.deepEqual(await listRows(page, 'lista'), ['A', 'B', 'C', 'D']);
    }
  },
  {
    name: 'list order: Automatico and Todo keep Tareas and Compras sorted and not draggable; the switch is shared with Ahora',
    storage: COMPRA_ORDER_SEED(''),
    async fn(page) {
      await toTasks(page);
      assert.equal(await listOrderOn(page, 'ordenTareas'), 'auto');
      assert.equal(await page.count('#lista.ordenable'), 0, 'not draggable in Automatico');
      assert.equal(await page.count('#lista li[data-ordenable]'), 0);
      assert.equal(await page.count('#pistaTareas'), 0, 'no drag hint');
      await openQuickMenu(page, '#lista li.item[data-id="B"]');
      await page.key('Escape');
      await sleep(80);
      await page.click('#ordenTareas [data-orden="manual"]');
      assert.equal(await page.count('#lista.ordenable'), 1, 'Manual makes it draggable');
      const stored = JSON.parse(await page.storage('kibco.apartados'));
      assert.deepEqual(stored.map((a) => [a.id, a.ordenAhora]), [['taller', 'manual'], ['mercado', 'auto']]);
      await page.click('#tabAhora');
      assert.equal(await orderOn(page), 'manual', 'the same switch as Ahora');
      await toTasks(page);
      await page.click('#ordenTareas [data-orden="auto"]');
      assert.equal(await page.count('#lista.ordenable'), 0, 'back to Automatico');
      await page.click('#segBtnCompras');
      assert.equal(await listOrderOn(page, 'ordenCompras'), 'auto');
      assert.equal(await page.count('#listaCompras.ordenable'), 0);
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"todo\"]').click()");
      await sleep(80);
      assert.equal(await page.count('#ordenCompras'), 0, 'Todo has no switch in Compras');
      assert.equal(await page.count('#listaCompras.ordenable'), 0);
      await page.click('#segBtnTareas');
      assert.equal(await page.count('#ordenTareas'), 0, 'Todo has no switch in Tareas');
      assert.equal(await page.count('#lista.ordenable'), 0);
    }
  },
  {
    name: 'list order: read-only data never makes Tareas draggable',
    storage: Object.assign(ORDER_SEED('manual'), { 'kibco.esquema': '6' }),
    async fn(page) {
      await toTasks(page);
      assert.ok((await page.count('#lista li.item')) > 0, 'rows shown');
      assert.equal(await page.count('#lista.ordenable'), 0, 'no drag while read-only');
      assert.equal(await page.count('#lista li[data-ordenable]'), 0);
    }
  },
  {
    name: 'list order: dragging inside a filtered Tareas list keeps the hidden items in their place',
    storage: ORDER_SEED('manual'),
    async fn(page) {
      await toTasks(page);
      await page.click('#chips [data-filtro="pendiente"]');
      assert.deepEqual(await listRows(page, 'lista'), ['A', 'C', 'D'], 'B (in progress) is filtered out');
      await page.eval("document.getElementById('lista').scrollIntoView(true)");
      const d = await page.rect('#lista li.item[data-id="D"]'), a = await page.rect('#lista li.item[data-id="A"]');
      await page.drag(d.x + d.w / 2, d.y + d.h / 2, d.x + d.w / 2, a.y + 4, 12, 500);
      assert.deepEqual(await listRows(page, 'lista'), ['D', 'A', 'C']);
      await page.click('#chips [data-filtro="activos"]');
      assert.deepEqual(await listRows(page, 'lista'), ['D', 'B', 'A', 'C'], 'B keeps its slot');
      await page.click('#tabAhora');
      assert.deepEqual(await orderRows(page), ['D', 'B', 'A', 'C'], 'Ahora agrees');
    }
  },
  {
    name: 'list order: with "Ver mas" only the shown rows move and the placeholder never goes below the button',
    storage: PAGED_ORDER_SEED(),
    async fn(page) {
      await toTasks(page);
      assert.equal(await page.count('#lista li.item'), 50);
      assert.equal(await page.count('#lista li.item[data-ordenable]'), 50, 'every shown row is draggable');
      assert.equal(await page.count('#lista .vermas'), 1);
      const key = (id, k, code) => page.eval(`(function(){var l=document.querySelector('#lista li.item[data-id="${id}"]');l.focus();
        l.dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',keyCode:${code},altKey:true,bubbles:true,cancelable:true}));})()`);
      await key('X46', 'ArrowDown', 40);
      await sleep(80);
      assert.ok((await items(page)).every((i) => !i.ordenManual), 'the last shown row cannot move into the hidden ones');
      await key('X46', 'ArrowUp', 38);
      await sleep(80);
      assert.deepEqual((await listRows(page, 'lista')).slice(47), ['X44', 'X46', 'X45']);
      // A mouse hold on the last shown row dragged over the button keeps the placeholder above it.
      const ev = (type, sel) => page.eval(`(function(){var b=document.querySelector('#lista li.item[data-id="X45"]'),t=document.querySelector('${sel}');
        t.scrollIntoView({block:'center'});var r=b.getBoundingClientRect(),q=t.getBoundingClientRect();
        b.dispatchEvent(new PointerEvent('${type}',{bubbles:true,cancelable:true,isPrimary:true,pointerId:4,pointerType:'mouse',button:0,buttons:1,clientX:r.left+20,clientY:q.top+q.height/2}));})()`);
      await ev('pointerdown', '#lista li.item[data-id="X45"]');
      await sleep(500);
      assert.equal(await page.eval("document.documentElement.hasAttribute('data-ordenando')"), true, 'the drag started');
      await ev('pointermove', '#lista .vermas');
      assert.equal(await page.eval("(function(){var h=document.querySelector('#lista .orden-hueco');return !!h&&!!h.nextElementSibling&&h.nextElementSibling.className.indexOf('vermas-fila')>-1;})()"), true, 'placeholder above Ver mas');
      await ev('pointercancel', '#lista .vermas');
      await sleep(80);
      await page.click('#lista .vermas');
      assert.deepEqual((await listRows(page, 'lista')).slice(47), ['X44', 'X46', 'X45', 'X47', 'X48', 'X49', 'X50'], 'the hidden rows keep their order');
    }
  },
  {
    name: 'list order: a move in Ahora renumbers the whole section, so ranks never collide with items Ahora does not show',
    storage: RANKED_ORDER_SEED({ A: 1, B: 2, W: 3, C: 4, D: 5 }),
    async fn(page) {
      await toTasks(page);
      assert.deepEqual(await listRows(page, 'lista'), ['A', 'B', 'C', 'D', 'E'], 'W (done) is hidden, E (inbox) last');
      await altKey(page, 'lista', 'D', 'ArrowUp', 38);
      assert.deepEqual(await listRows(page, 'lista'), ['A', 'B', 'D', 'C', 'E']);
      await page.click('#tabAhora');
      assert.deepEqual(await orderRows(page), ['A', 'B', 'D', 'C'], 'Ahora shows the Tareas order');
      assert.equal(await page.count('#secInbox li.item[data-id="E"]'), 1, 'the inbox item stays in Inbox');
      await altKey(page, 'secSigue', 'D', 'ArrowUp', 38);
      assert.deepEqual(await orderRows(page), ['A', 'D', 'B', 'C'], 'Ahora shows exactly the drop');
      assert.equal(await page.count('#secInbox li.item[data-id="E"]'), 1, 'a move never changes membership');
      assert.deepEqual(await ranks(page), { A: 1, D: 2, W: 3, B: 4, C: 5, E: 6 }, 'unique ranks; the hidden done item keeps its slot');
      await toTasks(page);
      assert.deepEqual(await listRows(page, 'lista'), ['A', 'D', 'B', 'C', 'E'], 'Tareas agrees with Ahora');
      await page.click('#tabAhora');
      await page.reload();
      assert.deepEqual(await orderRows(page), ['A', 'D', 'B', 'C'], 'kept after reload');
    }
  },
  {
    name: 'list order: tied ranks from older data heal on the next move in Ahora',
    storage: RANKED_ORDER_SEED({ A: 1, B: 1, W: 1, C: 2, D: 2 }),
    async fn(page) {
      assert.deepEqual(await orderRows(page), ['A', 'B', 'C', 'D'], 'ties fall back to the score order');
      await altKey(page, 'secSigue', 'D', 'ArrowUp', 38);
      assert.deepEqual(await orderRows(page), ['A', 'B', 'D', 'C']);
      const r = await ranks(page);
      assert.deepEqual(Object.values(r).sort((x, y) => x - y), [1, 2, 3, 4, 5, 6], 'every rank unique');
      assert.ok(r.A < r.B && r.B < r.D && r.D < r.C, 'ranks follow the shown order');
      await toTasks(page);
      assert.deepEqual(await listRows(page, 'lista'), ['A', 'B', 'D', 'C', 'E'], 'Tareas agrees');
    }
  },
  {
    name: 'capture state: on Compras with a state chip selected the new purchase is created in that state (hogar and fabrica); Activos keeps the default',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.contexto': 'mercado' },
    async fn(page) {
      await page.click('#tabTareas');
      await page.click('#segBtnCompras');
      await page.click('#chipsCompra [data-filtro="comprado"]');
      assert.match(await page.eval("document.getElementById('txtCaptura').getAttribute('placeholder')"), /^Nueva compra en Mercado · Comprado/, 'the hint names the state');
      await page.type('#txtCaptura', 'yerba mate');
      assert.match(await page.text('#capDia'), /Compra · Comprado/, 'the chip names the state');
      await page.type('#txtCaptura', 'yerba mate', true);
      let list = await items(page);
      assert.deepEqual([list[0].tipo, list[0].estado, list[0].contexto], ['compra', 'comprado', 'mercado']);
      assert.deepEqual(await listRows(page, 'listaCompras'), [list[0].id], 'shown in the list being looked at');
      const ev = (await events(page)).filter((e) => e.itemId === list[0].id).map((e) => [e.tipo, e.desde, e.hasta]);
      assert.deepEqual(ev, [['captura', '', 'por_comprar'], ['estado', 'por_comprar', 'comprado']], 'same history as capture + manual move');
      // Factory flow: its stage counters. A stage at 0 cannot be tapped, so a purchase is moved there first.
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"taller\"]').click()");
      await sleep(80);
      await page.click('#chipsCompra [data-filtro="activos"]');
      await page.type('#txtCaptura', 'rodamientos', true);
      list = await items(page);
      assert.equal(await page.eval("document.querySelector('#chipsCompra [data-filtro=\"oc_enviada\"]').disabled"), true, 'empty stage disabled');
      for (let k = 0; k < 3; k++) await page.click('#listaCompras li.item[data-id="' + list[1].id + '"] [data-acc="siguiente"]');
      assert.equal((await items(page))[1].estado, 'oc_enviada');
      await page.click('#chipsCompra [data-filtro="oc_enviada"]');
      await page.type('#txtCaptura', 'rodamientos 2', true);
      list = await items(page);
      assert.deepEqual([list[2].estado, list[2].contexto], ['oc_enviada', 'taller']);
      assert.deepEqual((await listRows(page, 'listaCompras')).sort(), [list[1].id, list[2].id].sort());
      // Todo mixes both flows: a state the target flow lacks keeps the default.
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"todo\"]').click()");
      await sleep(80);
      await page.click('#chipsCompra [data-filtro="comprado"]');
      assert.doesNotMatch(await page.eval("document.getElementById('txtCaptura').getAttribute('placeholder')"), /Comprado/, 'no state in the hint when it does not apply');
      await page.type('#txtCaptura', 'correas', true);
      list = await items(page);
      assert.deepEqual([list[3].estado, list[3].contexto], ['cotizando', 'taller'], 'never a hogar state in a factory section');
      await page.click('#chipsCompra [data-filtro="recibido"]');
      await page.type('#txtCaptura', 'bulones', true);
      list = await items(page);
      assert.deepEqual([list[4].estado, list[4].contexto], ['recibido', 'taller'], 'a valid state applies in Todo');
      // Activos: the default as always.
      await page.click('#chipsCompra [data-filtro="activos"]');
      await page.type('#txtCaptura', 'grasa', true);
      list = await items(page);
      assert.equal(list[5].estado, 'cotizando');
    }
  },
  {
    name: 'capture state: on Tareas with a state chip and a tag selected the new task lands in that list; Activos and Ahora keep the default',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.contexto': 'taller',
      'kibco.items': JSON.stringify([{ id: 'T0', texto: 'torno viejo', contexto: 'taller', tipo: 'tarea', estado: 'proceso', tag: 'tornos',
        nivel: 'normal', creado: '2026-10-01T12:00:00.000Z', actualizado: '2026-10-01T12:00:00.000Z', estadoDesde: '2026-10-01T12:00:00.000Z' }]) },
    async fn(page) {
      await toTasks(page);
      await page.click('#chips [data-filtro="proceso"]');
      assert.match(await page.eval("document.getElementById('txtCaptura').getAttribute('placeholder')"), /^Tarea en Taller · En proceso/);
      await page.type('#txtCaptura', 'pulir eje');
      assert.match(await page.text('#capDia'), /En proceso/, 'the chip names the state');
      await page.type('#txtCaptura', 'pulir eje', true);
      let list = await items(page);
      assert.deepEqual([list[1].tipo, list[1].estado, list[1].tag], ['tarea', 'proceso', '']);
      assert.ok((await listRows(page, 'lista')).includes(list[1].id), 'shown in the filtered list');
      // A tag filter: the task also gets the tag.
      await page.click('#chipsTag [data-tag-filtro="tornos"]');
      await page.type('#txtCaptura', 'cambiar correa', true);
      list = await items(page);
      assert.deepEqual([list[2].estado, list[2].tag], ['proceso', 'tornos']);
      assert.ok((await listRows(page, 'lista')).includes(list[2].id), 'shown with state and tag filters on');
      await page.click('#chipsTag [data-tag-filtro="tornos"]');
      // A closed state works the same as a manual completion (same events).
      await page.click('#chips [data-filtro="completado"]');
      await page.type('#txtCaptura', 'lubricar', true);
      list = await items(page);
      assert.equal(list[3].estado, 'completado');
      const ev = (await events(page)).filter((e) => e.itemId === list[3].id).map((e) => [e.tipo, e.desde, e.hasta]);
      assert.deepEqual(ev, [['captura', '', 'entrada'], ['estado', 'entrada', 'completado']]);
      // A #tag to another section never takes this view's state.
      await page.type('#txtCaptura', 'repasar #estudio', true);
      list = await items(page);
      assert.deepEqual([list[4].estado, list[4].contexto], ['entrada', 'estudio']);
      // Activos: inbox as always.
      await page.click('#chips [data-filtro="activos"]');
      await page.type('#txtCaptura', 'medir', true);
      list = await items(page);
      assert.equal(list[5].estado, 'entrada');
      // Capture from Ahora ignores the Tareas filter.
      await page.click('#chips [data-filtro="proceso"]');
      await page.click('#tabAhora');
      assert.doesNotMatch(await page.eval("document.getElementById('txtCaptura').getAttribute('placeholder')"), /En proceso/);
      await page.type('#txtCaptura', 'desde ahora', true);
      list = await items(page);
      assert.equal(list[6].estado, 'entrada', 'Ahora keeps the inbox default');
    }
  },
  {
    name: 'card tray: swipe left slides the card 224px over a .bandeja-swipe (Hoy, Mañana, Prioridad, Más); one at a time; outside tap and swipe back close it',
    storage: seed(),
    async fn(page) {
      await toTasks(page);
      const ids = await page.eval("Array.prototype.map.call(document.querySelectorAll('#lista li.item'),function(l){return l.getAttribute('data-id');})");
      const swipeLeft = async (id) => {
        const c = await page.rect(`#lista li.item[data-id="${ids[id]}"]`);
        await page.drag(c.x + 320, c.y + c.h / 2, c.x + 60, c.y + c.h / 2);
        await sleep(300);
      };
      await swipeLeft(0);
      assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa', 'no quick-menu sheet on swipe');
      const t = await page.eval(`(function(){var li=document.querySelector('#lista li.item[data-id="${ids[0]}"]'),b=li.querySelector('.bandeja-swipe');if(!b)return null;
        var r=b.getBoundingClientRect(),lr=li.getBoundingClientRect(),d=li.querySelector('.desliza').getBoundingClientRect();
        return {acc:Array.prototype.map.call(b.querySelectorAll('button'),function(x){return x.getAttribute('data-bandeja');}),
          txt:Array.prototype.map.call(b.querySelectorAll('button'),function(x){return x.textContent;}),
          w:Array.prototype.map.call(b.querySelectorAll('button'),function(x){return Math.round(x.getBoundingClientRect().width);}),
          tw:r.width,right:Math.round(lr.right-li.clientLeft-r.right),shift:Math.round(lr.left+li.clientLeft-d.left),mas:b.querySelector('[data-bandeja="mas"]').className};})()`);
      assert.ok(t, 'the tray is in the card');
      assert.deepEqual(t.acc, ['hoy', 'manana', 'prioridad', 'mas']);
      assert.deepEqual(t.txt, ['Hoy', 'Mañana', 'Prioridad', 'Más']);
      assert.deepEqual(t.w, [56, 56, 56, 56], 'four 56px buttons');
      assert.ok(Math.abs(t.tw - 224) < 1 && Math.abs(t.right) <= 1, 'a 224px tray on the right edge: ' + t.tw);
      assert.equal(t.shift, 224, 'the card slid 224px');
      assert.match(t.mas, /bandeja-mas/, 'Más is the accent button');
      await swipeLeft(1);
      assert.equal(await page.count('#lista .bandeja-swipe'), 1, 'only one tray open');
      assert.equal(await page.count(`#lista li.item[data-id="${ids[1]}"] .bandeja-swipe`), 1, 'the newest one');
      await page.eval(`document.querySelector('#segTareas').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',isPrimary:true}))`);
      await sleep(250);
      assert.equal(await page.count('#lista .bandeja-swipe'), 0, 'a tap outside closes it');
      await swipeLeft(0);
      assert.equal(await page.count('#lista .bandeja-swipe'), 1);
      const before = (await items(page)).find((i) => i.id === ids[0]).estado;
      const c = await page.rect(`#lista li.item[data-id="${ids[0]}"]`);
      await page.drag(c.x + 60, c.y + c.h / 2, c.x + 300, c.y + c.h / 2);
      await sleep(250);
      assert.equal(await page.count('#lista .bandeja-swipe'), 0, 'swiping back closes it');
      assert.equal((await items(page)).find((i) => i.id === ids[0]).estado, before, 'swiping back does not complete');
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa', 'no sheet opened');
    }
  },
  {
    name: 'card tray: the three dots open the same tray; Hoy and Mañana act; Prioridad lists the four levels inline; Más opens the item sheet; the menu key keeps the quick-menu sheet',
    storage: seed(),
    async fn(page) {
      await toTasks(page);
      const id = (await items(page)).find((i) => i.texto === 'Grabar video tutorial').id;
      const card = `#lista li.item[data-id="${id}"]`;
      const open = async () => {
        await page.click(card + ' [data-acc="mas"]');
        await sleep(250);
        assert.equal(await page.count(card + ' .bandeja-swipe'), 1, 'the dots open the tray');
        assert.equal(await page.eval("document.getElementById('tapaRapido').className"), 'tapa', 'not the sheet');
      };
      await open();
      assert.equal(await page.eval(`document.querySelector('${card} [data-acc="mas"]').getAttribute('aria-expanded')`), 'true');
      assert.equal(await page.eval("document.getElementById('tapaItem').className"), 'tapa', 'the card did not open');
      await page.click(card + ' .bandeja-swipe [data-bandeja="hoy"]');
      assert.equal((await items(page)).find((i) => i.id === id).fecha, ymd(0), 'Hoy');
      assert.equal(await page.count('#lista .bandeja-swipe'), 0, 'the tray closes after acting');
      await open();
      await page.click(card + ' .bandeja-swipe [data-bandeja="manana"]');
      assert.equal((await items(page)).find((i) => i.id === id).fecha, ymd(1), 'Mañana');
      await open();
      await page.click(card + ' .bandeja-swipe [data-bandeja="prioridad"]');
      const lv = await page.eval(`Array.prototype.map.call(document.querySelectorAll('${card} .bandeja-swipe [data-nivel]'),function(b){return b.getAttribute('data-nivel')+':'+b.getAttribute('aria-pressed');})`);
      assert.deepEqual(lv, ['urgente:false', 'importante:false', 'normal:true', 'baja:false'], 'four levels, the current one pressed');
      await page.click(card + ' .bandeja-swipe [data-nivel="urgente"]');
      assert.equal((await items(page)).find((i) => i.id === id).nivel, 'urgente');
      await open();
      await page.click(card + ' .bandeja-swipe [data-bandeja="mas"]');
      await sleep(200);
      assert.ok(await page.eval("document.getElementById('tapaItem').className.indexOf('on')>-1"), 'Más opens the item sheet');
      assert.equal(await page.count('#lista .bandeja-swipe'), 0);
      await page.key('Escape');
      await sleep(200);
      await page.eval(`document.querySelector('${card}').dispatchEvent(new KeyboardEvent('keydown',{key:'ContextMenu',keyCode:93,bubbles:true,cancelable:true}))`);
      await sleep(120);
      assert.ok(await page.eval("document.getElementById('tapaRapido').className.indexOf('on')>-1"), 'the menu key opens the quick-menu sheet');
      assert.equal(await page.count('#lista .bandeja-swipe'), 0, 'not the tray');
    }
  },
  {
    name: 'card: priority is the ring of the complete circle (urgent ring + inner dot, important ring, normal thin, low dotted) and a word in the metadata',
    storage: (() => {
      const s = ORDER_SEED();
      const l = JSON.parse(s['kibco.items']);
      l.find((i) => i.id === 'C').nivel = 'urgente';
      s['kibco.items'] = JSON.stringify(l);
      return s;
    })(),
    async fn(page) {
      await toTasks(page);
      const r = await page.eval(`(function(){var o={};['A','B','C','D'].forEach(function(id){var li=document.querySelector('#lista li.item[data-id="'+id+'"]'),c=li.querySelector('.chk-c'),s=getComputedStyle(c),
        p=li.querySelector('.chk-punto'),ls=getComputedStyle(li),w=li.querySelector('.linea2 [class*="niv-"]');
        o[id]={bw:parseFloat(s.borderTopWidth),bs:s.borderTopStyle,bc:s.borderTopColor,dot:p?Math.round(p.getBoundingClientRect().width):0,
          border:ls.borderTopColor,bg:ls.backgroundImage,word:w?w.textContent:'',wordVis:!!w&&getComputedStyle(w).display!=='none',txt:getComputedStyle(li.querySelector('.txt')).color};});
        var pr=document.createElement('span');pr.style.color='var(--muted)';document.body.appendChild(pr);o.muted=getComputedStyle(pr).color;pr.parentNode.removeChild(pr);return o;})()`);
      assert.ok(r.C.bw >= 2, 'urgent: thick ring ' + r.C.bw);
      assert.equal(r.C.dot, 8, 'urgent: 8px inner dot');
      assert.equal(r.C.word, 'Urgente');
      assert.ok(r.C.wordVis, 'urgent word visible');
      assert.match(r.C.border, /rgba\(\d+, \d+, \d+, 0\.45\)/, 'urgent card border at 45%: ' + r.C.border);
      assert.equal(r.C.bg, 'none', 'no gradient');
      assert.ok(r.A.bw >= 2 && r.A.dot === 0, 'important: thick ring, no dot');
      assert.equal(r.A.word, 'Importante');
      assert.notEqual(r.A.bc, r.C.bc, 'important and urgent rings differ in color');
      assert.ok(r.B.bw < 2 && r.B.bs === 'solid' && r.B.dot === 0, 'normal: thin solid ring');
      assert.equal(r.B.word, '', 'normal has no priority word');
      assert.ok(r.D.bw < 2 && r.D.bs === 'dotted', 'low: thin dotted ring');
      assert.equal(r.D.word, 'Baja');
      assert.equal(r.D.txt, r.muted, 'low: muted text');
    }
  },
  {
    name: 'manual order: a 6-dot drag handle sits at the left of each card only in Manual; dragging from it shows a "Soltá acá" placeholder and a rotated surface-3 ghost',
    storage: ORDER_SEED('manual'),
    async fn(page) {
      await toTasks(page);
      const r = await page.eval(`(function(){var l=document.querySelectorAll('#lista li.item'),n=0,left=0;for(var i=0;i<l.length;i++){var a=l[i].querySelector('.asa-orden');
        if(a){n++;if(a.getBoundingClientRect().right<=l[i].querySelector('.chk').getBoundingClientRect().left+1&&a.querySelectorAll('circle').length===6)left++;}}
        return {rows:l.length,n:n,left:left};})()`);
      assert.ok(r.rows >= 3);
      assert.equal(r.n, r.rows, 'every card has a handle');
      assert.equal(r.left, r.rows, 'six dots, left of the circle');
      const h = await page.rect('#lista li.item[data-id="A"] .asa-orden');
      await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: h.x + h.w / 2, y: h.y + h.h / 2 }] });
      await sleep(60);
      for (let i = 1; i <= 4; i++) {
        await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: h.x + h.w / 2, y: h.y + h.h / 2 + i * 10 }] });
        await sleep(30);
      }
      const d = await page.eval(`(function(){var hu=document.querySelector('#lista .orden-hueco'),f=document.querySelector('#lista .orden-fantasma');if(!hu||!f)return null;
        var s=getComputedStyle(f),sd=getComputedStyle(f.querySelector('.desliza'));return {txt:hu.textContent,hs:getComputedStyle(hu).borderTopStyle,tf:s.transform,sh:s.boxShadow,
        bg:sd.backgroundColor,s3:getComputedStyle(document.body).getPropertyValue('--surface-3').trim()};})()`);
      await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(150);
      assert.ok(d, 'dragging from the handle lifts the card at once');
      assert.equal(d.txt, 'Soltá acá');
      assert.equal(d.hs, 'dashed');
      assert.notEqual(d.tf, 'none', 'the ghost is rotated');
      const m = d.tf.match(/matrix\(([^,]+), ([^,]+)/);
      assert.ok(m && Math.abs(Math.asin(parseFloat(m[2])) * 180 / Math.PI + 1.5) < 0.2, 'rotated -1.5deg: ' + d.tf);
      assert.notEqual(d.sh, 'none', 'ghost shadow');
      assert.equal(await page.count('#lista .orden-fantasma, #lista .orden-hueco'), 0, 'cleaned up');
      await page.click('#ordenTareas [data-orden="auto"]');
      assert.equal(await page.count('#lista .asa-orden'), 0, 'no handle in Automatico');
    }
  },
  {
    name: 'first-run hint: the first list opened peeks its first card right and shows "Deslizá a la derecha para completar" once (kibco.pistas)',
    storage: Object.assign(seed(), { 'kibco.pistas': '{roto' }),
    async fn(page) {
      await toTasks(page);
      assert.equal(await page.text('#lista ~ .pista-gesto, .pista-gesto'), 'Deslizá a la derecha para completar');
      assert.ok(await page.visible('.pista-gesto'), 'the line is visible');
      assert.match(await page.eval("document.querySelector('#lista li.item').className"), /asoma/, 'the first card peeks');
      assert.equal(await page.eval("document.querySelectorAll('#lista li.item.asoma').length"), 1, 'only the first');
      assert.deepEqual(JSON.parse(await page.storage('kibco.pistas')), { completar: true }, 'flag saved (unreadable value replaced)');
      await page.click('#tabAhora');
      await toTasks(page);
      assert.equal(await page.count('.pista-gesto'), 0, 'shown once');
      assert.equal(await page.count('#lista li.item.asoma'), 0);
      await page.reload();
      await toTasks(page);
      assert.equal(await page.count('.pista-gesto'), 0, 'not after a reload either');
    }
  },
  {
    name: 'first-run hint: with reduced motion the line shows without the peek',
    storage: seed(),
    async fn(page) {
      await page.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await toTasks(page);
      assert.ok(await page.visible('.pista-gesto'), 'the line is visible');
      assert.equal(await page.count('#lista li.item.asoma'), 0, 'no peek');
      assert.deepEqual(JSON.parse(await page.storage('kibco.pistas')), { completar: true });
    }
  },
  {
    name: 'card tray: a routine occurrence offers only Prioridad and Más, the same choices as its quick menu (no Hoy/Mañana that would move the occurrence)',
    storage: Object.assign(rutinaSeed([[-1, 'completado']]), { 'kibco.pistas': '{"completar":true}' }),
    async fn(page) {
      await toTasks(page);
      const occ = (await items(page)).find((i) => i.rutinaId === 'rgata' && i.ocurrencia === ymd(0));
      const card = `#lista li.item[data-id="${occ.id}"]`;
      await page.click(card + ' [data-acc="mas"]');
      await sleep(450);
      const t = await page.eval(`(function(){var b=document.querySelector('${card} .bandeja-swipe');if(!b)return null;
        return {acc:Array.prototype.map.call(b.querySelectorAll('[data-bandeja]'),function(x){return x.getAttribute('data-bandeja');}),w:Math.round(b.getBoundingClientRect().width),
          shift:Math.round(document.querySelector('${card}').getBoundingClientRect().left+document.querySelector('${card}').clientLeft-document.querySelector('${card} .desliza').getBoundingClientRect().left)};})()`);
      assert.ok(t, 'tray open');
      assert.deepEqual(t.acc, ['prioridad', 'mas']);
      assert.equal(t.w, 112, 'two 56px buttons');
      assert.equal(t.shift, 112, 'the card slides by the tray width');
      await page.key('Escape');
      await sleep(120);
      await page.eval(`document.querySelector('${card}').dispatchEvent(new KeyboardEvent('keydown',{key:'ContextMenu',keyCode:93,bubbles:true,cancelable:true}))`);
      await sleep(150);
      assert.ok(await isOpen(page, 'tapaRapido'), 'quick menu open');
      const rap = await page.eval("Array.prototype.filter.call(document.querySelectorAll('#tapaRapido [data-rap]'),function(b){return b.style.display!=='none';}).map(function(b){return b.getAttribute('data-rap');})");
      assert.deepEqual(rap, ['prioridad', 'borrar'], 'the quick menu tailors the same way');
      assert.equal((await items(page)).find((i) => i.id === occ.id).fecha || '', '', 'the occurrence keeps its day');
    }
  },
  {
    name: 'card tray: read-only data leaves only Más in the tray and only the item sheet in the quick menu',
    storage: { 'kibco.esquema': '6', 'kibco.items': JSON.stringify([{ id: 'f1', texto: 'del futuro', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await toTasks(page);
      const card = '#lista li.item[data-id="f1"]';
      await page.click(card + ' [data-acc="mas"]');
      await sleep(200);
      const acc = await page.eval(`Array.prototype.map.call(document.querySelectorAll('${card} .bandeja-swipe [data-bandeja]'),function(x){return x.getAttribute('data-bandeja');})`);
      assert.deepEqual(acc, ['mas'], 'nothing that cannot be saved');
      await page.key('Escape');
      await sleep(120);
      await page.eval(`document.querySelector('${card}').dispatchEvent(new KeyboardEvent('keydown',{key:'ContextMenu',keyCode:93,bubbles:true,cancelable:true}))`);
      await sleep(150);
      const rap = await page.eval("Array.prototype.filter.call(document.querySelectorAll('#tapaRapido [data-rap]'),function(b){return b.style.display!=='none';}).map(function(b){return b.getAttribute('data-rap');})");
      assert.deepEqual(rap, []);
      assert.ok(await page.visible('#btnRapFicha'), 'Más opciones stays');
    }
  },
  {
    name: 'first-run hint: lists outside Listas (Ahora, Hoy, Misiones, Progreso) never consume kibco.pistas; Listas Tareas does',
    storage: seed(),
    async fn(page) {
      assert.ok(await page.count('#ahoraCuerpo li.item.fila') > 0, 'Ahora shows cards');
      for (const tab of ['#tabHoy', '#tabMisiones', '#tabRegistro', '#tabAhora']) { await page.click(tab); await sleep(60); }
      assert.equal(await page.storage('kibco.pistas'), null, 'flag untouched outside Listas');
      assert.equal(await page.count('.pista-gesto'), 0);
      await toTasks(page);
      assert.deepEqual(JSON.parse(await page.storage('kibco.pistas')), { completar: true });
      assert.ok(await page.visible('.pista-gesto'));
    }
  },
  {
    name: 'ahora (Cabina): the hero is the first block, the level card is gone and the chips Todo/Atención/Hoy/Inbox/Esperando filter the list',
    storage: seed(),
    async fn(page) {
      assert.match(await page.eval("document.getElementById('ahoraCuerpo').firstElementChild.className"), /\bhero\b/, 'hero first');
      assert.equal(await page.count('#ahoraCuerpo #tarjetaNivel, #ahoraCuerpo .progxp'), 0, 'no level card in Ahora');
      const chips = await page.eval("Array.prototype.map.call(document.querySelectorAll('#ahoraCuerpo .pulso [data-tile]'),function(b){return [b.getAttribute('data-tile'),+b.querySelector('b').textContent,b.getAttribute('aria-pressed'),Math.round(b.getBoundingClientRect().height)];})");
      const order = ['todo', 'atencion', 'hoy', 'inbox', 'esperando'];
      assert.deepEqual(chips.map((c) => c[0]), order.filter((id) => chips.some((c) => c[0] === id)), 'chips in order');
      assert.deepEqual(chips.map((c) => c[0]), order, 'the seed has something in every filter');
      assert.ok(chips.every((c) => c[1] > 0 && c[3] >= 44), 'counts and 44px chips: ' + JSON.stringify(chips));
      assert.equal(chips[0][2], 'true', 'Todo starts active');
      assert.ok(await page.count('#ahoraCuerpo .pulso .tile.rojo .tile-punto') === 1, 'Atención carries the red dot');
      const inboxN = chips.find((c) => c[0] === 'inbox')[1];
      await page.click('#ahoraCuerpo [data-tile="inbox"]');
      assert.equal(await page.eval("document.querySelector('[data-tile=\"inbox\"]').getAttribute('aria-pressed')"), 'true');
      const ids = await page.eval("Array.prototype.map.call(document.querySelectorAll('#secFiltro li.item'),function(l){return l.getAttribute('data-id');})");
      assert.equal(ids.length, inboxN, 'the list shows exactly the inbox');
      const list = await items(page);
      assert.ok(ids.every((id) => list.find((i) => i.id === id).estado === 'entrada'), 'only inbox items');
      assert.equal(await page.count('#secSigue, #secEsperando, #secMisiones'), 0, 'the other sections step aside');
      assert.match(await page.eval("document.getElementById('ahoraCuerpo').firstElementChild.className"), /\bhero\b/, 'the hero stays first');
      await page.click('#ahoraCuerpo [data-tile="esperando"]');
      assert.match(await page.text('#secFiltro'), /Respuesta de RRHH/);
      assert.equal(await page.count('#secFiltro li.item'), chips.find((c) => c[0] === 'esperando')[1]);
      await page.click('#ahoraCuerpo [data-tile="esperando"]');
      assert.equal(await page.eval("document.querySelector('[data-tile=\"todo\"]').getAttribute('aria-pressed')"), 'true', 'tapping the active chip goes back to Todo');
      assert.equal(await page.count('#secFiltro'), 0);
      assert.ok(await page.count('#secSigue') === 1);
    }
  },
  {
    name: 'ahora (Cabina): chips at 0 are not in the DOM and a filter that empties falls back to Todo',
    storage: ORDER_SEED(),
    async fn(page) {
      const tiles = await page.eval("Array.prototype.map.call(document.querySelectorAll('[data-tile]'),function(b){return b.getAttribute('data-tile');})");
      assert.deepEqual(tiles, ['todo'], 'nothing overdue, for today, in the inbox or waiting: only Todo');
      await capture(page, 'algo nuevo');
      assert.equal(await page.count('[data-tile="inbox"]'), 1, 'the inbox chip appears with its first item');
      await page.click('[data-tile="inbox"]');
      assert.equal(await page.count('#secFiltro li.item'), 1);
      await page.click('#secFiltro [data-acc="parahoy"]');
      assert.equal(await page.count('[data-tile="inbox"]'), 0, 'gone at 0');
      assert.equal(await page.eval("document.querySelector('[data-tile=\"todo\"]').getAttribute('aria-pressed')"), 'true', 'back to Todo');
    }
  },
  {
    name: 'ahora (Cabina): the hero has the reason at the right of its label, 48px buttons with Hecho widest, and the order switch is one compact Manual/Automático button',
    storage: ORDER_SEED(),
    async fn(page) {
      const h = await page.eval(`(function(){var c=document.querySelector('.hero'),s=getComputedStyle(c),r=c.querySelector('.hero-cab').children;
        var b=Array.prototype.map.call(c.querySelectorAll('.hero-accs button'),function(x){return [x.getAttribute('data-hero'),Math.round(x.getBoundingClientRect().height),x.getBoundingClientRect().width];});
        return {bg:s.backgroundColor,s2:getComputedStyle(document.body).getPropertyValue('--surface-2').trim(),sh:s.boxShadow,pad:s.paddingTop,rad:s.borderTopLeftRadius,
          rot:r[0].textContent,ico:!!r[0].querySelector('svg'),fs:getComputedStyle(c.querySelector('.hero-txt')).fontSize,fw:getComputedStyle(c.querySelector('.hero-txt')).fontWeight,b:b};})()`);
      assert.equal(h.rot, 'Siguiente movimiento');
      assert.ok(h.ico, 'zap icon');
      assert.equal(h.fs, '20px');
      assert.equal(h.fw, '650');
      assert.equal(h.pad, '16px');
      assert.equal(h.rad, '12px');
      assert.notEqual(h.sh, 'none', 'shadow 2');
      assert.deepEqual(h.b.map((x) => x[0]), ['hecho', 'empezar', 'manana']);
      assert.ok(h.b.every((x) => x[1] === 48), '48px buttons');
      assert.ok(h.b[0][2] > h.b[1][2], 'Hecho is the widest');
      await page.eval("document.querySelector('[data-tile]').scrollIntoView()");
      const o = await page.eval(`(function(){var b=document.querySelector('#ordenAhora .menu-chip-btn'),l=document.querySelector('#ordenAhora .menu-chip-lista');
        return {txt:b.textContent,exp:b.getAttribute('aria-expanded'),hidden:l.hidden,h:Math.round(b.getBoundingClientRect().height),segs:document.querySelectorAll('#ordenAhora .seg').length};})()`);
      assert.equal(o.txt, 'Automático');
      assert.equal(o.exp, 'false');
      assert.equal(o.hidden, true, 'options folded');
      assert.equal(o.segs, 0, 'no segmented control');
      assert.ok(o.h >= 44);
      await page.click('#ordenAhora .menu-chip-btn');
      assert.equal(await page.eval("document.querySelector('#ordenAhora .menu-chip-btn').getAttribute('aria-expanded')"), 'true');
      assert.ok(await page.visible('#ordenAhora [data-orden="manual"]'));
      await page.click('#ordenAhora [data-orden="manual"]');
      assert.equal(JSON.parse(await page.storage('kibco.apartados'))[0].ordenAhora, 'manual');
      assert.equal(await page.text('#ordenAhora .menu-chip-btn'), 'Manual');
    }
  },
  {
    name: 'hoy (Cabina): header with the date, "N de M hechas", a 52px ring and a 7-day strip; tapping a day shows its list; Hecho hoy and Más adelante fold with aria-expanded',
    storage: (() => {
      const s = seed();
      const l = JSON.parse(s['kibco.items']);
      const iso = new Date(Date.now() - 3 * 86400000).toISOString();
      l.push({ id: 'lejos', texto: 'Turno lejano', contexto: 'trabajo', tipo: 'tarea', estado: 'pendiente', nivel: 'normal', fecha: ymd(10), creado: iso, actualizado: iso, estadoDesde: iso });
      s['kibco.items'] = JSON.stringify(l);
      return s;
    })(),
    async fn(page) {
      await page.click('#tabHoy');
      const c = await page.eval(`(function(){var f=document.querySelector('.hoy-fecha'),a=document.querySelector('.anillo-hoy'),r=a.getBoundingClientRect();
        var t=Array.prototype.map.call(document.querySelectorAll('.tira-dias .tira-dia'),function(b){return [b.getAttribute('data-dia'),Math.round(b.getBoundingClientRect().height),b.className,b.querySelectorAll('.tira-punto').length];});
        return {fs:getComputedStyle(f).fontSize,fw:getComputedStyle(f).fontWeight,sub:document.querySelector('.hoy-sub').textContent,w:Math.round(r.width),h:Math.round(r.height),n:a.textContent,role:a.getAttribute('role'),t:t};})()`);
      assert.equal(c.fs, '24px');
      assert.equal(c.fw, '700');
      assert.match(c.sub, /^\d+ de \d+ hechas?/);
      assert.deepEqual([c.w, c.h], [52, 52], '52px ring');
      assert.match(c.n, /^\d+\/\d+$/);
      assert.equal(c.role, 'img');
      assert.equal(c.t.length, 7, 'seven days');
      assert.equal(c.t[0][0], ymd(0));
      assert.match(c.t[0][2], /\bhoy\b/, 'today is the filled one');
      assert.ok(c.t.every((d) => d[1] >= 56), '56px buttons');
      assert.ok(c.t.find((d) => d[0] === ymd(2))[3] >= 1, 'a day with something shows dots');
      assert.equal(await page.count('.sec-titulo-grande, [id^="dia-"]'), 0, 'no "Próximos días" sections');
      await page.click('.tira-dias [data-dia="' + ymd(2) + '"]');
      assert.match(await page.text('#dia-' + ymd(2)), /Grabar video/);
      assert.equal(await page.count('#secParaHoy'), 0, 'the chosen day replaces the sections');
      assert.equal(await page.eval("document.querySelector('[data-dia=\"" + ymd(2) + "\"]').getAttribute('aria-pressed')"), 'true');
      await page.click('.tira-dias [data-dia="' + ymd(0) + '"]');
      assert.equal(await page.count('#secParaHoy'), 1, 'today again');
      const fold = await page.eval("(function(){var b=document.querySelector('#secMasAdelante .sec-plegar');return [b.tagName,b.getAttribute('aria-expanded'),document.getElementById(b.getAttribute('aria-controls')).hidden];})()");
      assert.deepEqual(fold, ['BUTTON', 'false', true], 'Más adelante starts folded');
      await page.click('#secMasAdelante .sec-plegar');
      assert.equal(await page.eval("document.querySelector('#secMasAdelante .sec-plegar').getAttribute('aria-expanded')"), 'true');
      assert.ok(await page.visible('#secMasAdelante li.item[data-id="lejos"]'));
      const done0 = +(await page.text('.hoy-sub')).split(' ')[0];
      await page.click('#secParaHoy [data-acc="listo"]');
      await sleep(100);
      assert.equal(await page.eval("document.querySelector('#secHechasHoy .sec-plegar').getAttribute('aria-expanded')"), 'false', 'Hecho hoy folded');
      assert.equal(await page.eval("document.getElementById('secHechasHoyLista').hidden"), true);
      assert.match(await page.text('.hoy-sub'), new RegExp('^' + (done0 + 1) + ' de \\d+ hechas'));
      assert.match(await page.text('#secRutinasHoy .sec-tit'), /Crear rutina|Gestionar rutinas/, 'the routines link sits in its header');
    }
  },
  {
    name: 'progreso (Cabina): level card first, 2x2 stats, 12-week chart with the current week in brasa, Bitácora Diario · Detalle with range chips and a Reporte sheet',
    storage: (() => {
      const list = [];
      for (let d = 0; d < 9; d++) list.push({ id: 'c' + d, texto: 'avance ' + d, contexto: d % 2 ? 'apps' : 'personal', tipo: 'tarea', estado: 'completado',
        nivel: 'normal', creado: new Date(Date.now() - (d + 2) * 86400000).toISOString(), estadoDesde: (() => { const x = new Date(Date.now() - d * 86400000); x.setHours(12, 0, 0, 0); return x.toISOString(); })() });
      return { 'kibco.esquema': '4', 'kibco.items': JSON.stringify(list) };
    })(),
    async fn(page) {
      await capture(page, 'algo para el diario');
      await page.click('.hero [data-hero="hecho"]');
      await page.click('#tabRegistro');
      const p = await page.eval(`(function(){var c=document.getElementById('tarjetaNivel'),br=document.createElement('i');br.style.color='var(--brasa)';document.body.appendChild(br);var brasa=getComputedStyle(br).color;br.remove();
        var bar=c.querySelector('.nivel-barra'),st=document.querySelectorAll('#campanaCuerpo .stats .stat'),g=document.querySelector('.semanas');
        return {first:document.getElementById('campanaCuerpo').firstElementChild.id,nv:c.querySelector('.nivel-n').textContent,tit:getComputedStyle(c.querySelector('.nivel-tit')).fontSize,
          bh:Math.round(bar.getBoundingClientRect().height),bc:getComputedStyle(bar.querySelector('i')).backgroundColor,brasa:brasa,xp:c.querySelector('.nivel-xp').textContent,falta:c.querySelector('.nivel-falta').textContent,
          stats:st.length,sfs:getComputedStyle(st[0].querySelector('b')).fontSize,role:g.getAttribute('role'),lab:g.getAttribute('aria-label'),
          cur:getComputedStyle(g.querySelector('.sem.actual i')).backgroundColor,old:getComputedStyle(g.querySelector('.sem:not(.actual) i')).backgroundColor};})()`);
      assert.equal(p.first, 'tarjetaNivel');
      assert.match(p.nv, /^Nivel \d+$/);
      assert.equal(p.tit, '32px');
      assert.equal(p.bh, 8, '8px bar');
      assert.equal(p.bc, p.brasa, 'brasa bar');
      assert.match(p.xp, /^\d+ \/ \d+ XP/);
      assert.match(p.falta, /^\d+ para \S+/);
      assert.equal(p.stats, 4);
      assert.equal(p.sfs, '24px');
      assert.equal(p.role, 'img');
      assert.match(p.lab, /Completadas por semana/);
      assert.equal(p.cur, p.brasa, 'current week in brasa');
      assert.notEqual(p.old, p.brasa, 'other weeks neutral');
      assert.equal(await page.count('#btnModoCampana'), 0, 'Campaña is not a mode anymore');
      assert.equal(await page.text('#btnModoDiario'), 'Diario');
      assert.equal(await page.text('#btnModoRegistro'), 'Detalle');
      assert.equal(await page.eval("document.getElementById('btnModoDiario').getAttribute('aria-pressed')"), 'true');
      assert.deepEqual(await page.eval("Array.prototype.map.call(document.querySelectorAll('#chipsRango [data-filtro]'),function(b){return b.textContent.trim();})"), ['Hoy', '7 d', '30 d', 'Todo']);
      await page.click('#chipsRango [data-filtro="todo"]');
      assert.match(await page.text('#diarioCuerpo .diario-dia'), /\d+ completadas?/, 'day header counts in words');
      assert.equal(await page.eval("getComputedStyle(document.querySelector('#diarioCuerpo .diario-ev b')).fontSize"), '15px');
      await page.click('#btnModoRegistro');
      assert.ok(await page.visible('#timeline'));
      assert.equal(await page.visible('#diarioCuerpo'), false);
      await page.click('#btnReporte');
      await sleep(150);
      assert.ok(await isOpen(page, 'tapaReporte'), 'Reporte opens the share sheet');
      assert.deepEqual(await page.eval("Array.prototype.map.call(document.querySelectorAll('#tapaReporte .fila-acc'),function(b){return b.id+':'+b.textContent.trim();})"),
        ['btnRelevo:Reporte de turno', 'btnResumen:Resumen']);
      await page.click('#btnResumen');
      await sleep(150);
      assert.ok(await isOpen(page, 'tapaTexto'), 'the text sheet replaces it');
      assert.equal(await isOpen(page, 'tapaReporte'), false);
      assert.equal(await page.text('#textoTitulo'), 'Resumen');
      await page.key('Escape');
      await sleep(150);
      assert.equal(await isOpen(page, 'tapaTexto'), false);
      const lg = await page.eval(`(function(){var g=document.querySelector('.logro.ganado'),s=document.querySelector('.logro.secreto'),y=document.createElement('i');y.style.color='var(--gold)';document.body.appendChild(y);var gold=getComputedStyle(y).color;y.remove();
        return {gi:getComputedStyle(g.querySelector('.logro-ico')).color,gold:gold,ss:getComputedStyle(s).borderTopStyle,st:s.textContent,lock:!!s.querySelector('svg')};})()`);
      assert.equal(lg.gi, lg.gold, 'won: gold icon');
      assert.equal(lg.ss, 'dotted', 'secret: dotted border');
      assert.match(lg.st, /Seguí jugando/);
      assert.ok(lg.lock);
    }
  },
  {
    name: 'listas (Cabina): first-level 48px tabs Tareas N · Compras N · Notas N with a 2px accent underline; Compras/Notas only where the section uses them',
    storage: Object.assign(ORDER_SEED(), { 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST() }),
    async fn(page) {
      await page.click('#tabTareas');
      const t = await page.eval(`(function(){var a=document.createElement('i');a.style.color='var(--accent)';document.body.appendChild(a);var ac=getComputedStyle(a).color;a.remove();
        return {segs:document.querySelectorAll('#segTareas .segbtn').length,ac:ac,tabs:Array.prototype.map.call(document.querySelectorAll('#segTareas .lstab'),function(b){var s=getComputedStyle(b);
        return {id:b.id,txt:b.textContent,h:Math.round(b.getBoundingClientRect().height),bw:s.borderBottomWidth,bc:s.borderBottomColor,sel:b.getAttribute('aria-selected'),vis:b.offsetParent!==null};})};})()`);
      assert.equal(t.segs, 0, 'no internal segmented control');
      assert.deepEqual(t.tabs.map((x) => x.id), ['segBtnTareas', 'segBtnCompras', 'segBtnNotas']);
      assert.ok(t.tabs.every((x) => x.h === 48), '48px tabs');
      assert.match(t.tabs[0].txt, /^Tareas\d+$/);
      assert.match(t.tabs[2].txt, /^Notas2$/, 'taller has two live notes (one more archived)');
      assert.equal(t.tabs[0].sel, 'true');
      assert.equal(t.tabs[0].bw, '2px');
      assert.equal(t.tabs[0].bc, t.ac, 'accent underline on the active tab');
      await page.click('#segBtnNotas');
      assert.equal(await page.eval("document.getElementById('segBtnNotas').getAttribute('aria-selected')"), 'true');
      await page.eval("document.querySelector('#ctxsel [data-ctx=\"mercado\"]').click()");
      await sleep(80);
      assert.equal(await page.visible('#segBtnNotas'), false, 'Mercado has notes off');
    }
  },
  {
    name: 'listas (Cabina): Tareas has a 4px progress bar and one filter row: the state chip-menu (Activos with the 7 states), tag chips and the order button at the right',
    storage: ORDER_SEED(),
    async fn(page) {
      await toTasks(page);
      const r = await page.eval(`(function(){var row=document.querySelector('#vistaTablero .filtros-lista'),b=document.querySelector('#chips .menu-chip-btn'),o=document.querySelector('#ordenTareas .menu-chip-btn');
        return {bar:Math.round(document.querySelector('#vistaTablero .barra').getBoundingClientRect().height),txt:b.textContent,exp:b.getAttribute('aria-expanded'),
          ops:document.querySelectorAll('#chips .menu-op').length,hidden:document.querySelector('#chips .menu-chip-lista').hidden,
          right:Math.round(row.getBoundingClientRect().right-o.getBoundingClientRect().right),inRow:row.contains(o)&&row.contains(b),top:Math.abs(o.getBoundingClientRect().top-b.getBoundingClientRect().top)};})()`);
      assert.equal(r.bar, 4, '4px bar');
      assert.equal(r.txt, 'Activos');
      assert.equal(r.exp, 'false');
      assert.equal(r.ops, 7, 'Activos + the six states');
      assert.equal(r.hidden, true);
      assert.ok(r.inRow, 'state menu and order button share the row');
      assert.ok(r.right <= 1, 'order button at the right');
      assert.ok(r.top <= 2, 'same line');
      await page.click('#chips .menu-chip-btn');
      assert.ok(await page.visible('#chips [data-filtro="proceso"]'), 'the menu opens');
      await page.key('Escape');
      assert.equal(await page.eval("document.querySelector('#chips .menu-chip-lista').hidden"), true, 'Escape closes it');
      assert.equal(await page.eval("document.activeElement === document.querySelector('#chips .menu-chip-btn')"), true, 'focus back on the chip');
      await page.click('#chips .menu-chip-btn');
      await page.click('#chips [data-filtro="proceso"]');
      assert.equal(await page.text('#chips .menu-chip-btn'), 'En proceso');
      assert.deepEqual(await listRows(page, 'lista'), ['B'], 'filtered');
      await page.type('#txtCaptura', 'nueva en proceso', true);
      assert.equal((await items(page)).pop().estado, 'proceso', 'capture takes the active state');
    }
  },
  {
    name: 'compras (Cabina): six 56px stage counters filter (zero ones disabled); each card has a 6-segment stage bar and a 44px "Siguiente etapa" pill naming the destination that advances it',
    storage: (() => {
      const s = ORDER_SEED();
      const l = JSON.parse(s['kibco.items']);
      const iso = new Date(Date.now() - 86400000).toISOString();
      const c = (id, estado) => ({ id, texto: 'compra ' + id, contexto: 'taller', tipo: 'compra', estado, nivel: 'normal', creado: iso, actualizado: iso, estadoDesde: iso });
      l.push(c('P1', 'cotizando'), c('P2', 'cotizando'), c('P3', 'oc_enviada'));
      s['kibco.items'] = JSON.stringify(l);
      return s;
    })(),
    async fn(page) {
      await toTasks(page);
      await page.click('#segBtnCompras');
      const e = await page.eval(`Array.prototype.map.call(document.querySelectorAll('#chipsCompra .etapas .etapa'),function(b){return [b.getAttribute('data-filtro'),b.querySelector('b').textContent,b.disabled,Math.round(b.getBoundingClientRect().height)];})`);
      assert.deepEqual(e.map((x) => x[0]), ['cotizando', 'esperando_oc', 'esperando_aprob', 'oc_enviada', 'esperando_entrega', 'recibido']);
      assert.deepEqual(e.map((x) => x[1]), ['2', '0', '0', '1', '0', '0']);
      assert.deepEqual(e.map((x) => x[2]), [false, true, true, false, true, true], 'zero counters disabled');
      assert.ok(e.every((x) => x[3] >= 56), '56px counters');
      assert.match(await page.text('#chipsCompra'), /Abiertas/);
      await page.click('#chipsCompra [data-filtro="cotizando"]');
      assert.deepEqual((await listRows(page, 'listaCompras')).sort(), ['P1', 'P2'], 'the counter filters');
      await page.click('#chipsCompra [data-filtro="cotizando"]');
      assert.equal((await listRows(page, 'listaCompras')).length, 3, 'tapping it again: Abiertas');
      const card = '#listaCompras li.item[data-id="P3"]';
      const b = await page.eval(`(function(){var li=document.querySelector('${card}'),bar=li.querySelector('.etapas-barra'),p=li.querySelector('[data-acc="siguiente"]');
        return {seg:bar.querySelectorAll('i').length,done:bar.querySelectorAll('i.hecha').length,lab:bar.getAttribute('aria-label'),pill:p.textContent,aria:p.getAttribute('aria-label'),h:Math.round(p.getBoundingClientRect().height)};})()`);
      assert.equal(b.seg, 6);
      assert.equal(b.done, 4, 'OC enviada is stage 4');
      assert.match(b.lab, /Etapa 4 de 6/);
      assert.equal(b.pill, 'Esperando entrega');
      assert.equal(b.aria, 'Siguiente etapa: Esperando entrega');
      assert.ok(b.h >= 44, '44px pill');
      await page.click(card + ' [data-acc="siguiente"]');
      assert.equal((await items(page)).find((i) => i.id === 'P3').estado, 'esperando_entrega', 'the pill advances it');
    }
  },
  {
    name: 'notas (Cabina): a 2-column grid; pinned notes carry the pin and an accent border; search, Archivadas and Nueva nota share the top bar',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': NOTE_SECTIONS, 'kibco.contexto': 'taller', 'kibco.notas': NOTE_LIST() },
    async fn(page) {
      await page.click('#tabTareas');
      await page.click('#segBtnNotas');
      const g = await page.eval(`(function(){var c=document.querySelectorAll('#listaNotas li.notacard'),a=c[0].getBoundingClientRect(),b=c[1].getBoundingClientRect(),f=document.querySelector('#listaNotas li.notacard.fijada'),
        x=document.createElement('i');x.style.color='var(--accent)';document.body.appendChild(x);var ac=getComputedStyle(x).color;x.remove();var bar=document.querySelector('.notasbarra');
        return {n:c.length,sameRow:Math.abs(a.top-b.top)<1,side:b.left>a.right-1,pin:!!f.querySelector('.nota-pin svg'),bc:getComputedStyle(f.querySelector('.nota-abrir')).borderTopColor,ac:ac,
          tit:getComputedStyle(c[0].querySelector('.nota-tit')).fontSize,ext:getComputedStyle(c[0].querySelector('.nota-ext')).webkitLineClamp,
          bar:[bar.contains(document.getElementById('txtBuscaNotas')),bar.contains(document.getElementById('btnNotasArchivo')),bar.contains(document.getElementById('btnNuevaNota'))]};})()`);
      assert.equal(g.n, 2);
      assert.ok(g.sameRow && g.side, 'two columns');
      assert.ok(g.pin, 'pin icon');
      assert.equal(g.bc, g.ac, 'pinned: accent border');
      assert.equal(g.tit, '15px');
      assert.equal(g.ext, '2', 'two-line excerpt');
      assert.deepEqual(g.bar, [true, true, true]);
      assert.doesNotMatch(await page.text('.notasbarra'), EMOJI_UI);
    }
  },
  {
    name: 'misiones (Cabina): one segmented Activas N · Pausa N · Cumplidas N plus a 52px "+"; the card has the apartado-colored 6px bar, a tappable 44px Próxima row and Hitos/Tareas meta; no next action warns; paused is dotted',
    storage: (() => {
      const s = misionSeed(true);
      const ps = JSON.parse(s['kibco.proyectos']);
      const now = new Date().toISOString();
      ps.push({ id: 'pvac', nombre: 'Sin nada', objetivo: '', contexto: 'apps', estado: 'activo', hitos: [], creado: now, actualizado: now });
      ps.push({ id: 'ppau', nombre: 'Mudar el taller', objetivo: '', contexto: 'hogar', estado: 'pausado', hitos: [], creado: now, actualizado: now });
      s['kibco.proyectos'] = JSON.stringify(ps);
      return s;
    })(),
    async fn(page) {
      await page.click('#tabMisiones');
      const m = await page.eval(`(function(){var segs=document.querySelectorAll('#misionesCuerpo .seg'),n=document.getElementById('btnNuevaMision').getBoundingClientRect(),c=document.querySelector('#misLista [data-mision="pkco"]'),
        p=c.querySelector('.mis-proxima'),bar=c.querySelector('.mis-barra i'),y=document.createElement('i');y.style.color='var(--pal-violeta)';document.body.appendChild(y);var vi=getComputedStyle(y).color;y.remove();
        return {segs:segs.length,btns:Array.prototype.map.call(segs[0].querySelectorAll('button'),function(b){return b.textContent;}),nw:[Math.round(n.width),Math.round(n.height)],
          nom:getComputedStyle(c.querySelector('.mis-nom')).fontSize,pct:getComputedStyle(c.querySelector('.mis-pct')).fontSize,bh:Math.round(c.querySelector('.mis-barra').getBoundingClientRect().height),
          bc:getComputedStyle(bar).backgroundColor,vi:vi,ph:Math.round(p.getBoundingClientRect().height),ptxt:p.textContent,meta:c.querySelector('.mis-meta').textContent,
          warn:document.querySelector('#misLista [data-mision="pvac"] .mis-prox.vacia').textContent};})()`);
      assert.equal(m.segs, 1, 'one segmented');
      assert.deepEqual(m.btns, ['Activas2', 'Pausa1', 'Cumplidas0']);
      assert.deepEqual(m.nw, [52, 52], '52px + button');
      assert.equal(m.nom, '17px');
      assert.equal(m.pct, '20px');
      assert.equal(m.bh, 6, '6px bar');
      assert.equal(m.bc, m.vi, 'bar in the section color (apps is violeta)');
      assert.ok(m.ph >= 44, '44px Próxima row');
      assert.match(m.ptxt, /^Próxima.*tarea de mision/);
      assert.match(m.meta, /^Hitos 1\/2 · Tareas 0\/1 · Apps$/);
      assert.equal(m.warn, 'Sin próxima acción · definila');
      await page.click('#misLista [data-mision="pkco"] .mis-proxima');
      await sleep(150);
      assert.ok(await isOpen(page, 'tapaItem'), 'Próxima opens its task');
      await page.key('Escape');
      await sleep(150);
      await page.click('#misionesCuerpo [data-mis-filtro="pausado"]');
      assert.equal(await page.eval("getComputedStyle(document.querySelector('#misLista [data-mision=\"ppau\"]')).borderTopStyle"), 'dotted');
      assert.equal(await page.count('#misLista [data-mision="pkco"]'), 0, 'only paused ones');
    }
  },
  // ---------- T5 (Cabina sheets) ----------
  {
    name: 'ahora hero: a routine occurrence offers no Mañana (accionesRapidas), a loose task does',
    storage: Object.assign(rutinaSeed([[-1, 'completado']]), { 'kibco.pistas': '{"completar":true}' }),
    async fn(page) {
      const occ = (await items(page)).find((i) => i.rutinaId === 'rgata' && i.ocurrencia === ymd(0));
      assert.ok(occ, 'today occurrence generated');
      assert.equal(await page.eval("document.querySelector('#ahoraCuerpo .hero').getAttribute('data-id')"), occ.id, 'the occurrence is the hero');
      assert.equal(await page.count('#ahoraCuerpo .hero [data-hero="hecho"]'), 1);
      assert.equal(await page.count('#ahoraCuerpo .hero [data-hero="manana"]'), 0, 'no Mañana for an occurrence');
      await capture(page, 'suelta urgente !!');
      await sleep(80);
      const hero = await page.eval("(function(){var h=document.querySelector('#ahoraCuerpo .hero');return {t:h.querySelector('.hero-txt').textContent,m:h.querySelectorAll('[data-hero=\"manana\"]').length};})()");
      assert.equal(hero.t, 'suelta urgente');
      assert.equal(hero.m, 1, 'a loose task keeps Mañana');
    }
  },
  {
    name: 'compras chips: in Todo at 360px the state chips scroll sideways instead of overflowing the page',
    width: 360,
    storage: bigSeed(2, { compras: 3 }),
    async fn(page) {
      await page.click('#tabTareas');
      await page.click('#segBtnCompras');
      await sleep(80);
      const r = await page.eval(`(function(){var f=document.querySelector('#chipsCompra .chips'),st=getComputedStyle(f),b=f.getBoundingClientRect();
        var before=f.scrollLeft;f.scrollLeft=60;var after=f.scrollLeft;
        return {n:f.querySelectorAll('.chip').length,ox:st.overflowX,wrap:st.flexWrap,over:f.scrollWidth>f.clientWidth,right:b.right,w:window.innerWidth,
          page:document.documentElement.scrollWidth,moved:after>before};})()`);
      assert.ok(r.n >= 8, 'Todo joins both purchase flows: ' + r.n);
      assert.equal(r.wrap, 'nowrap', 'one row');
      assert.equal(r.ox, 'auto', 'scrolls sideways');
      assert.ok(r.over, 'the row is wider than the screen');
      assert.ok(r.moved, 'the row really scrolls');
      assert.ok(r.right <= r.w + 0.5, 'the row ends at the screen edge');
      assert.ok(r.page <= r.w, 'no horizontal page scroll: ' + r.page);
    }
  },
  {
    name: 'progreso: Actividad por contexto and Lo que terminaste come back after Logros, before the Bitácora',
    storage: (() => {
      const now = new Date().toISOString();
      const list = [{ id: 'a1', texto: 'hecha', contexto: 'apps', tipo: 'tarea', estado: 'completado', nivel: 'normal', creado: now, estadoDesde: now }];
      const p = { id: 'pfin', nombre: 'Mision lista', objetivo: '', contexto: 'apps', estado: 'terminado', terminado: now, hitos: [], creado: now, actualizado: now };
      return { 'kibco.esquema': '4', 'kibco.items': JSON.stringify(list), 'kibco.proyectos': JSON.stringify([p]) };
    })(),
    async fn(page) {
      await page.click('#tabRegistro');
      await sleep(80);
      const r = await page.eval(`(function(){var ids=Array.prototype.map.call(document.querySelectorAll('#campanaCuerpo > section'),function(s){return s.id;});
        var c=document.querySelector('#secPorCtx'),f=c&&c.querySelector('.ctxbar[data-ctx="apps"]');
        var y=document.createElement('i');y.style.color='var(--pal-violeta)';document.body.appendChild(y);var vi=getComputedStyle(y).color;y.remove();
        return {ids:ids,txt:c?c.textContent:'',bar:f?getComputedStyle(f.querySelector('.ctxbar-pista i')).backgroundColor:'',vi:vi,
          bh:f?Math.round(f.querySelector('.ctxbar-pista').getBoundingClientRect().height):0,
          fin:(document.querySelector('#secTerminadas')||{}).textContent||'',
          bit:!!(document.querySelector('#campanaCuerpo').compareDocumentPosition(document.querySelector('#secBitacora'))&4)};})()`);
      const iL = r.ids.indexOf('secLogros'), iC = r.ids.indexOf('secPorCtx'), iT = r.ids.indexOf('secTerminadas');
      assert.ok(iL > -1 && iC === iL + 1 && iT === iC + 1, 'order: ' + r.ids.join(','));
      assert.match(r.txt, /Actividad por contexto/);
      assert.match(r.txt, /Apps1 · [0-9]+ XP/);
      assert.equal(r.bar, r.vi, 'bar in the section color');
      assert.equal(r.bh, 4, '4px bar');
      assert.match(r.fin, /Lo que terminaste/);
      assert.match(r.fin, /Mision lista/);
      assert.ok(r.bit, 'the Bitácora comes after');
    }
  },
  {
    name: 'hero: the light theme keeps the level-2 shadow (light variant)',
    storage: { 'kibco.tema': 'claro', 'kibco.items': JSON.stringify([{ id: 'h1', texto: 'algo', contexto: 'trabajo', tipo: 'tarea', estado: 'pendiente', nivel: 'normal', creado: new Date(Date.now() - 3600000).toISOString() }]) },
    async fn(page) {
      const r = await page.eval(`(function(){var h=document.querySelector('#ahoraCuerpo .hero'),y=document.createElement('i');y.style.boxShadow='var(--sh-2)';document.body.appendChild(y);
        var s=getComputedStyle(y).boxShadow;y.remove();return {h:getComputedStyle(h).boxShadow,s:s,tema:document.documentElement.getAttribute('data-tema')};})()`);
      assert.equal(r.tema, 'claro');
      assert.equal(r.h, r.s, 'hero uses --sh-2');
    }
  },
  {
    name: 'sheets skeleton: top radius 20, a 40x5 handle, a 48-52px header with a 17/700 title and a 44px X',
    async fn(page) {
      await page.click('#btnAjustes');
      await sleep(450);
      const r = await page.eval(`(function(){var h=document.querySelector('#tapaAjustes .hoja'),a=h.querySelector('.asa'),f=h.querySelector('.hoja-fila'),t=f.querySelector('h2'),x=f.querySelector('.hoja-x'),
        hs=getComputedStyle(h),ab=a.getBoundingClientRect(),xb=x.getBoundingClientRect(),y=document.createElement('i');y.style.background='var(--overlay)';document.body.appendChild(y);
        var ov=getComputedStyle(y).backgroundColor;y.remove();
        return {rad:hs.borderTopLeftRadius,aw:ab.width,ah:ab.height,fh:Math.round(f.getBoundingClientRect().height),ts:getComputedStyle(t).fontSize,tw:getComputedStyle(t).fontWeight,
          xw:xb.width,xh:xb.height,ov:ov,tapa:getComputedStyle(document.getElementById('tapaAjustes')).backgroundColor,dur:hs.transitionDuration};})()`);
      assert.equal(r.rad, '20px');
      assert.deepEqual([r.aw, r.ah], [40, 5], 'handle 40x5');
      assert.ok(r.fh >= 48 && r.fh <= 52, 'header ' + r.fh);
      assert.deepEqual([r.ts, r.tw], ['17px', '700']);
      assert.deepEqual([r.xw, r.xh], [44, 44]);
      assert.equal(r.tapa, r.ov, 'overlay token');
      assert.match(r.dur, /0\.32s/, 'enter 320ms');
    }
  },
  {
    name: 'confirm: an alertdialog with a trash icon, a title naming what goes, undo note, Cancelar outline left and Sí, borrar filled danger right',
    storage: seed(),
    async fn(page) {
      await openFirstItem(page);
      const texto = await page.eval("document.getElementById('txtTituloItem').value");
      await page.click('#btnBorrar');
      await sleep(400);
      assert.ok(await isOpen(page, 'tapaConfirmar'));
      const r = await page.eval(`(function(){var t=document.getElementById('tapaConfirmar'),i=t.querySelector('.conf-ico'),no=document.getElementById('btnConfNo'),si=document.getElementById('btnConfSi'),
        ib=i.getBoundingClientRect(),nb=no.getBoundingClientRect(),sb=si.getBoundingClientRect(),y=document.createElement('i');y.style.background='var(--danger-soft)';y.style.color='var(--danger)';document.body.appendChild(y);
        var ds=getComputedStyle(y).backgroundColor,dc=getComputedStyle(y).color;y.remove();
        return {role:t.getAttribute('role'),desc:t.getAttribute('aria-describedby'),svg:!!i.querySelector('svg'),iw:ib.width,ih:ib.height,ibg:getComputedStyle(i).backgroundColor,ds:ds,
          tit:document.getElementById('confTitulo').textContent,det:document.getElementById('confDetalle').textContent,
          no:no.textContent,si:si.textContent,left:nb.right<=sb.left,row:Math.abs(nb.top-sb.top)<1,nh:nb.height,sh:sb.height,
          nbg:getComputedStyle(no).backgroundColor,nbd:getComputedStyle(no).borderTopColor,sbg:getComputedStyle(si).backgroundColor,dc:dc};})()`);
      assert.equal(r.role, 'alertdialog');
      assert.equal(r.desc, 'confDetalle');
      assert.ok(r.svg, 'trash icon');
      assert.deepEqual([r.iw, r.ih], [56, 56]);
      assert.equal(r.ibg, r.ds, 'danger-soft circle');
      assert.equal(r.tit, '¿Borrar «' + texto + '»?');
      assert.match(r.det, /Vas a poder deshacerlo durante 9 segundos/);
      assert.deepEqual([r.no, r.si], ['Cancelar', 'Sí, borrar']);
      assert.ok(r.left && r.row, 'side by side, Cancelar on the left');
      assert.deepEqual([r.nh, r.sh], [52, 52]);
      assert.equal(r.nbg, 'rgba(0, 0, 0, 0)', 'Cancelar is outline');
      assert.equal(r.sbg, r.dc, 'Sí, borrar is filled danger');
      await page.click('#btnConfSi');
      await sleep(150);
      assert.ok(!(await items(page)).some((i) => i.texto === texto), 'deleted');
    }
  },
  {
    name: 'confirm: deleting a section with data picks "Mover sus datos a" inside the confirmation',
    storage: { 'kibco.esquema': '5', 'kibco.apartados': CUSTOM_SECTIONS,
      'kibco.items': JSON.stringify([{ id: 'm1', texto: 'yerba', contexto: 'mercado', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await openAjustes(page);
      await page.click('#listaApartados [data-ap="mercado"] .apfila-abrir');
      await page.click('#btnApBorrar');
      await sleep(400);
      assert.ok(await isOpen(page, 'tapaConfirmar'), 'the confirmation opens at once');
      assert.equal(await page.text('#confTitulo'), '¿Borrar el apartado Mercado?');
      assert.ok(await page.eval("document.getElementById('tapaConfirmar').contains(document.getElementById('cajaApMover'))"), 'selector inside the confirmation');
      assert.equal(await page.text('#rotApMover'), 'Mover sus datos a');
      assert.equal(await page.eval("document.getElementById('btnConfSi').disabled"), true, 'pick a target first');
      await page.click('#apDestinos [data-ctx="estudio"]');
      assert.equal(await page.eval("document.getElementById('btnConfSi').disabled"), false);
      assert.match(await page.text('#confDetalle'), /Estudio/);
      await page.click('#btnConfSi');
      await sleep(150);
      assert.equal((await items(page))[0].contexto, 'estudio');
    }
  },
  {
    name: 'ficha: empty sections stay out of the sheet until their .ficha-agregar chip is tapped; one Agregar field adds a step on Enter',
    storage: seed(),
    async fn(page) {
      await page.emulateFocus();
      await toTasks(page);
      await page.clickText('#lista li.item .txt', 'Ordenar placard');
      await sleep(400);
      const r = await page.eval(`(function(){var h=document.querySelector('#tapaItem .hoja');function vis(s){var e=h.querySelector(s);return !!(e&&e.offsetParent!==null);}
        var q=h.querySelectorAll('.rapidas .rbtn'),qb=q[0].getBoundingClientRect();
        return {props:Array.prototype.map.call(h.querySelectorAll('.ficha-props .prop:not([hidden])'),function(p){return p.getAttribute('data-prop');}),
          chips:Array.prototype.map.call(h.querySelectorAll('.ficha-agregar [data-agregar]'),function(c){return c.getAttribute('data-agregar');}),
          chipH:Math.round(h.querySelector('.ficha-agregar [data-agregar]').getBoundingClientRect().height),
          pasos:vis('[data-sec="pasos"]'),com:vis('[data-sec="comentarios"]'),hid:h.querySelector('[data-sec="pasos"]').hidden,
          nq:q.length,qh:Math.round(qb.height),pri:q[0].className.indexOf('pri')>-1,qtxt:Array.prototype.map.call(q,function(b){return b.textContent;}),
          propH:Math.round(h.querySelector('.ficha-props .prop').getBoundingClientRect().height),
          mas:h.querySelector('#btnFichaMas').textContent,sub:h.querySelector('#itemSub svg')?1:0};})()`);
      assert.deepEqual(r.props, ['nivel', 'ctx'], 'only Prioridad and Apartado for a plain task');
      for (const c of ['comentario', 'pasos', 'rec', 'estado', 'anclar']) assert.ok(r.chips.includes(c), 'chip ' + c + ' in ' + r.chips);
      assert.equal(r.chipH, 44);
      assert.equal(r.pasos, false, 'no Pasos section');
      assert.equal(r.hid, true, 'hidden, not just scrolled away');
      assert.equal(r.com, false, 'no Comentarios section');
      assert.equal(r.nq, 4);
      assert.equal(r.qh, 56);
      assert.ok(r.pri, 'Hecho is the primary');
      assert.deepEqual(r.qtxt, ['Hecho', 'Hoy', 'Mañana', 'Elegir día']);
      assert.equal(r.propH, 52);
      assert.match(r.mas, /^Más: mover, repetir, compartir, borrar/);
      assert.equal(r.sub, 1, 'state icon in the subtitle');
      await page.click('#tapaItem .ficha-agregar [data-agregar="pasos"]');
      await sleep(80);
      assert.ok(await page.visible('#tapaItem [data-sec="pasos"]'), 'the chip reveals Pasos');
      assert.equal(await page.eval("document.activeElement.id"), 'txtPaso', 'its Agregar field takes the focus');
      assert.equal(await page.count('#tapaItem .ficha-agregar [data-agregar="pasos"]'), 0, 'the chip leaves');
      const f = await page.eval(`(function(){var c=document.getElementById('txtPaso').parentNode,b=c.getBoundingClientRect(),ic=c.querySelector('.campo-agregar-mas'),st=getComputedStyle(c);
        return {cls:c.className,h:Math.round(b.height),rad:st.borderTopLeftRadius,ico:!!ic&&ic.getBoundingClientRect().left<document.getElementById('txtPaso').getBoundingClientRect().left};})()`);
      assert.match(f.cls, /campo-agregar/);
      assert.equal(f.h, 48);
      assert.equal(f.rad, '12px');
      assert.ok(f.ico, '+ icon on the left');
      await page.type('#txtPaso', 'desmontar tapa', true);
      assert.ok((await items(page)).some((i) => (i.pasos || []).some((p) => p.texto === 'desmontar tapa')), 'Enter saved the step');
      assert.ok(await page.visible('#tapaItem [data-sec="pasos"]'), 'the section with content stays');
    }
  },
  {
    name: 'ficha: a property with a value shows its row; tapping a row opens its editor; Más opens a grouped sub-sheet with Borrar in red',
    storage: (() => { const s = seed(); const l = JSON.parse(s['kibco.items']); l[0].recordatorio = new Date(Date.now() + 3600000).toISOString(); l[0].anclado = true;
      s['kibco.items'] = JSON.stringify(l); s['kibco.contexto'] = 'trabajo'; return s; })(),
    async fn(page) {
      const first = JSON.parse(seed()['kibco.items'])[0];
      await toTasks(page);
      await page.click(`#lista li.item[data-id="${first.id}"]`);
      await sleep(400);
      const props = await page.eval("Array.prototype.map.call(document.querySelectorAll('#tapaItem .ficha-props .prop:not([hidden])'),function(p){return p.getAttribute('data-prop');})");
      assert.ok(props.includes('rec') && props.includes('anclado'), 'rows for set values: ' + props);
      assert.equal(await page.visible('#gridNivel'), false, 'editors stay folded');
      await page.click('#tapaItem .prop[data-prop="nivel"]');
      assert.ok(await page.visible('#gridNivel'), 'the row opens its editor');
      assert.equal(await page.eval("document.querySelector('#tapaItem .prop[data-prop=\"nivel\"]').getAttribute('aria-expanded')"), 'true');
      await page.click('#gridNivel [data-nivel="urgente"]');
      assert.equal((await items(page)).find((i) => i.id === first.id).nivel, 'urgente', 'saves at once');
      await page.click('#btnFichaMas');
      await sleep(400);
      assert.ok(await isOpen(page, 'tapaMasItem'));
      const m = await page.eval(`(function(){var t=document.getElementById('tapaMasItem'),b=document.getElementById('btnBorrar'),y=document.createElement('i');y.style.color='var(--danger-ink-2)';document.body.appendChild(y);
        var red=getComputedStyle(y).color;y.remove();
        return {grupos:t.querySelectorAll('.grupo').length,inside:t.contains(b),last:b===t.querySelector('.grupo:last-of-type').lastElementChild,col:getComputedStyle(b).color,red:red};})()`);
      assert.ok(m.grupos >= 2, 'grouped');
      assert.ok(m.inside && m.last, 'Borrar closes the list');
      assert.equal(m.col, m.red, 'Borrar in red');
      await page.click('#btnBorrar');
      await sleep(400);
      assert.ok(await isOpen(page, 'tapaConfirmar'));
    }
  },
  {
    name: 'ficha: a routine occurrence leaves Hoy, Mañana and Elegir día out of the quick actions (accionesRapidas)',
    storage: Object.assign(rutinaSeed([[-1, 'completado']]), { 'kibco.pistas': '{"completar":true}' }),
    async fn(page) {
      await toTasks(page);
      const occ = (await items(page)).find((i) => i.rutinaId === 'rgata' && i.ocurrencia === ymd(0));
      await page.click(`#lista li.item[data-id="${occ.id}"] .txt`);
      await sleep(300);
      const q = await page.eval("Array.prototype.filter.call(document.querySelectorAll('#tapaItem .rapidas .rbtn'),function(b){return b.offsetParent!==null;}).map(function(b){return b.id;})");
      assert.deepEqual(q, ['btnHecho']);
      assert.ok(await page.eval("Array.prototype.some.call(document.querySelectorAll('#tapaItem .ficha-props .prop:not([hidden])'),function(p){return p.getAttribute('data-prop')==='rutina';})"), 'Rutina row');
    }
  },
  {
    name: 'toast: role status, one action with ellipsis, Deshacer in the accent and a 3px countdown bar',
    storage: seed(),
    async fn(page) {
      await page.click('.hero [data-hero="hecho"]');
      await sleep(250);
      const r = await page.eval(`(function(){var d=document.getElementById('barraDeshacer'),q=document.getElementById('qpaso'),b=document.getElementById('btnDeshacer'),c=d.querySelector('.deshacer-cuenta'),
        st=getComputedStyle(d),y=document.createElement('i');y.style.color='var(--accent)';y.style.background='var(--surface-3)';document.body.appendChild(y);var ac=getComputedStyle(y).color,s3=getComputedStyle(y).backgroundColor;y.remove();
        return {role:d.getAttribute('role'),h:Math.round(d.getBoundingClientRect().height),rad:st.borderTopLeftRadius,bg:st.backgroundColor,s3:s3,ico:!!d.querySelector('.deshacer-ico svg'),
          txt:q.textContent,ell:getComputedStyle(q).textOverflow,b:b.textContent,bc:getComputedStyle(b).color,ac:ac,
          ch:c?Math.round(c.getBoundingClientRect().height):0,anim:c?getComputedStyle(c.firstElementChild||c).animationDuration:''};})()`);
      assert.equal(r.role, 'status');
      assert.equal(r.h, 52);
      assert.equal(r.rad, '12px');
      assert.equal(r.bg, r.s3, '--surface-3');
      assert.ok(r.ico, 'an icon');
      assert.match(r.txt, /^Completado: /);
      assert.ok(!/XP|Nivel|Logro/.test(r.txt), 'one action only: ' + r.txt);
      assert.equal(r.ell, 'ellipsis');
      assert.equal(r.b, 'Deshacer');
      assert.equal(r.bc, r.ac, 'Deshacer in the accent');
      assert.equal(r.ch, 3, '3px countdown');
      assert.equal(r.anim, '9s');
    }
  },
  {
    name: 'xp: a "+N XP" brasa pill flies to the ring and the ring pulses',
    async fn(page) {
      await capture(page, 'tarea de valor');
      await page.eval(`(function(){var l=JSON.parse(localStorage.getItem('kibco.items'));l[0].creado=new Date(Date.now()-3600000).toISOString();localStorage.setItem('kibco.items',JSON.stringify(l));})()`);
      await page.reload();
      await page.click('.hero [data-hero="hecho"]');
      await sleep(30);
      const r = await page.eval(`(function(){var p=document.querySelector('.xp-vuelo'),y=document.createElement('i');y.style.color='var(--brasa)';document.body.appendChild(y);var br=getComputedStyle(y).color;y.remove();
        return {p:p?p.textContent:'',c:p?getComputedStyle(p).color:'',br:br,pulso:document.getElementById('btnNivel').className.indexOf('pulso')>-1};})()`);
      assert.match(r.p, /^\+[0-9]+ XP$/);
      assert.equal(r.c, r.br, 'brasa pill');
      assert.ok(r.pulso, 'the ring pulses');
      await sleep(800);
      assert.equal(await page.count('.xp-vuelo'), 0, 'the pill is gone after its 600ms flight');
    }
  },
  {
    name: 'level sheet: a level-up and an achievement come after the toast in one .hoja-nivel sheet',
    storage: (() => {
      const list = [];
      for (let i = 0; i < 4; i++) list.push({ id: 'x' + i, texto: 'imp ' + i, contexto: 'trabajo', tipo: 'tarea', estado: 'completado', nivel: 'importante',
        creado: new Date(Date.now() - 86400000 * 2).toISOString(), estadoDesde: new Date(Date.now() - 86400000).toISOString() });
      list.push({ id: 'y', texto: 'la que sube', contexto: 'trabajo', tipo: 'tarea', estado: 'pendiente', nivel: 'normal', creado: new Date(Date.now() - 86400000).toISOString() });
      return { 'kibco.esquema': '4', 'kibco.items': JSON.stringify(list), 'kibco.progreso': JSON.stringify({ nivelVisto: 1, logros: {} }) };
    })(),
    async fn(page) {
      await page.click('.hero [data-hero="hecho"]');
      await sleep(200);
      assert.match(await page.text('#qpaso'), /^Completado: la que sube$/, 'the toast stays short');
      assert.equal(await isOpen(page, 'tapaNivel'), false, 'queued after the toast');
      await sleep(9300);
      assert.ok(await isOpen(page, 'tapaNivel'), 'the level sheet follows the toast');
      const r = await page.eval(`(function(){var h=document.querySelector('#tapaNivel .hoja');return {cls:h.className,n:h.querySelector('.nivel-aro').textContent,
        txt:h.textContent,logros:h.querySelectorAll('.nivel-logro').length,aro:Math.round(h.querySelector('.nivel-aro').getBoundingClientRect().width),rad:getComputedStyle(h).borderTopLeftRadius,seguir:document.getElementById('btnSeguirNivel').textContent};})()`);
      assert.match(r.cls, /hoja-nivel/);
      const lr = await page.rect('#tapaNivel .hoja');
      assert.ok(Math.abs(lr.y + lr.h / 2 - 422) < 2, 'centered: ' + lr.y);
      assert.equal(r.n, '2');
      assert.equal(r.aro, 88);
      assert.equal(r.rad, '20px');
      assert.match(r.txt, /Subiste de nivel/);
      // Completing between 04:00 and 07:00 also wins the early-bird achievement (clock-dependent, kco-core madrugadas).
      const h = new Date().getHours();
      assert.equal(r.logros, h >= 4 && h < 7 ? 2 : 1, 'the achievement rides in the same sheet');
      assert.match(r.txt, /Logro: Primer paso/);
      assert.equal(r.seguir, 'Seguir');
      await page.click('#btnSeguirNivel');
      await sleep(300);
      assert.equal(await isOpen(page, 'tapaNivel'), false);
    }
  },
  {
    name: 'ajustes: backup card first, grouped 52px rows, theme segmented, luz switch and sub-sheets for Apartados and catalogs',
    storage: Object.assign(seed(), { 'kibco.ultimoBackup': new Date(Date.now() - 20 * 86400000).toISOString(), 'kibco.solicitantes': JSON.stringify(['Juan']) }),
    async fn(page) {
      await openAjustes(page);
      await sleep(350);
      const r = await page.eval(`(function(){var h=document.querySelector('#tapaAjustes .hoja'),c=h.querySelector('.backup-card'),y=document.createElement('i');y.style.background='var(--warning-soft)';document.body.appendChild(y);
        var ws=getComputedStyle(y).backgroundColor;y.remove();var cab=h.querySelector('.hoja-cab');
        return {first:!!c&&cab.nextElementSibling===c,warn:c.className.indexOf('aviso-backup')>-1,bg:getComputedStyle(c).backgroundColor,ws:ws,txt:c.textContent,
          grupos:Array.prototype.map.call(h.querySelectorAll('.grupo-rot'),function(g){return g.textContent;}),
          rows:Array.prototype.map.call(h.querySelectorAll('.grupo .fila-ajuste'),function(f){return Math.round(f.getBoundingClientRect().height);}),
          luz:document.getElementById('btnLuz').getAttribute('role'),ed:document.getElementById('btnEditarApartados').textContent,
          sol:document.getElementById('btnSolicitantes').textContent};})()`);
      assert.ok(r.first, 'backup card on top');
      assert.ok(r.warn, 'over the threshold');
      assert.equal(r.bg, r.ws, 'warning-soft');
      assert.match(r.txt, /Último backup hace 20 días/);
      assert.match(r.txt, /Descargar/);
      assert.match(r.txt, /Compartir/);
      assert.deepEqual(r.grupos, ['Apartados', 'Pantalla y avisos', 'Compras', 'Tus datos']);
      assert.ok(r.rows.length >= 7 && r.rows.every((x) => x === 52), 'rows ' + r.rows);
      assert.equal(r.luz, 'switch');
      assert.match(r.ed, /Editar y ordenar\s*5/);
      assert.match(r.sol, /Solicitantes\s*1/);
      await page.click('#btnEditarApartados');
      await sleep(400);
      assert.ok(await isOpen(page, 'tapaApartados'));
      assert.ok(await page.eval("document.getElementById('tapaApartados').contains(document.getElementById('listaApartados'))"));
      assert.ok(await page.eval("!!document.querySelector('#listaApartados .asa-orden')"), 'drag handle');
      await page.key('Escape');
      await sleep(300);
      await page.click('#btnSolicitantes');
      await sleep(400);
      assert.ok(await isOpen(page, 'tapaSolic'));
      const x = await page.rect('#chipsSolic [data-borrar="Juan"]');
      assert.deepEqual([x.w, x.h], [44, 44], '44px remove');
      await page.type('#txtNuevoSolic', 'Pedro', true);
      assert.deepEqual(JSON.parse(await page.storage('kibco.solicitantes')).sort(), ['Juan', 'Pedro']);
      await page.key('Escape');
      await sleep(300);
      await page.click('#btnAcerca');
      await sleep(400);
      assert.ok(await isOpen(page, 'tapaAcerca'));
      assert.match(await page.text('#tapaAcerca'), /Kevin Vásquez/);
    }
  },
  {
    name: 'search: full-screen sheet, input focused, results grouped by section with a state icon; a result opens its sheet',
    storage: seed(),
    async fn(page) {
      await page.emulateFocus();
      await page.click('#btnBuscar');
      await sleep(400);
      assert.equal(await page.eval('document.activeElement.id'), 'txtBusca');
      await page.type('#txtBusca', 'a');
      const r = await page.eval(`(function(){var h=document.querySelector('#tapaBuscar .hoja'),b=h.getBoundingClientRect();
        return {h:Math.round(b.height),wh:window.innerHeight,grupos:h.querySelectorAll('.busca-grupo .punto').length,ico:h.querySelectorAll('#resultados .busca-res svg').length,res:h.querySelectorAll('#resultados .busca-res').length};})()`);
      assert.ok(r.h >= r.wh - 1, 'full screen: ' + r.h + '/' + r.wh);
      assert.ok(r.grupos >= 2, 'grouped by section');
      assert.equal(r.ico, r.res, 'one state icon per result');
      await page.click('#resultados .busca-res');
      await sleep(300);
      assert.ok(await isOpen(page, 'tapaItem'));
    }
  },
  {
    name: 'ficha (read-only): the Más sub-sheet hides the Borrar group from the first paint (R3-001)',
    storage: { 'kibco.esquema': '6', 'kibco.items': JSON.stringify([{ id: 'f1', texto: 'del futuro', estado: 'pendiente', creado: '2026-01-01T10:00:00.000Z' }]) },
    async fn(page) {
      await toTasks(page);
      await page.click('#lista li.item[data-id="f1"]');
      await sleep(300);
      assert.ok(await isOpen(page, 'tapaItem'));
      const r = await page.eval(`(function(){var b=document.getElementById('btnBorrar');return {disp:b.style.display,grupo:b.parentNode.hidden};})()`);
      assert.equal(r.disp, 'none', 'no Borrar while read-only');
      assert.equal(r.grupo, true, 'its group is hidden on the first paint, not one repaint later');
    }
  },
  {
    name: 'desktop (Cabina): sidebar with K in brasa, 44px view rows with counts, Listas sub-rows Tareas/Compras/Notas that navigate, NV badge in brasa and an Apartados section with Nuevo apartado',
    width: 1366, height: 900, mobile: false,
    storage: Object.assign(ORDER_SEED(), { 'kibco.apartados': NOTE_SECTIONS, 'kibco.notas': NOTE_LIST(), 'kibco.contexto': 'taller' }),
    async fn(page) {
      const brasa = await page.eval("(function(){var y=document.createElement('i');y.style.color='var(--brasa)';document.body.appendChild(y);var c=getComputedStyle(y).color;y.remove();return c;})()");
      assert.equal(await page.eval("getComputedStyle(document.querySelector('.lat-logo')).backgroundColor"), brasa, 'K in brasa');
      assert.equal(await page.text('.lat-nom'), 'KCOCentro operativo');
      const rows = await page.eval("Array.prototype.map.call(document.querySelectorAll('#navLateral .lat-item, #navLateral .lat-sub'),function(b){return [b.getAttribute('data-vista')||b.getAttribute('data-lista'),Math.round(b.getBoundingClientRect().height)];})");
      assert.deepEqual(rows.map((r) => r[0]), ['ahora', 'hoy', 'tablero', 'tablero', 'compras', 'notas', 'misiones', 'registro'], 'Listas, then its three sub-rows');
      assert.ok(rows.every((r) => r[1] === 44), '44px rows: ' + JSON.stringify(rows));
      const sub = await page.eval("(function(){var a=document.querySelector('#navLateral .lat-item[data-vista=\"tablero\"]').getBoundingClientRect(),b=document.querySelector('#navLateral .lat-sub[data-lista=\"compras\"] .lat-sub-nom').getBoundingClientRect(),c=document.querySelector('#navLateral .lat-item[data-vista=\"tablero\"] .lat-item-nom').getBoundingClientRect();return b.left-c.left;})()");
      assert.ok(sub >= 0, 'sub-rows are indented under Listas');
      await page.click('#navLateral [data-lista="compras"]');
      assert.ok(await page.visible('#vistaCompras'), 'Compras sub-row opens Compras');
      assert.equal(await page.eval("document.querySelector('#navLateral [data-lista=\"compras\"]').getAttribute('aria-current')"), 'page');
      await page.click('#navLateral [data-lista="notas"]');
      assert.ok(await page.visible('#vistaNotas'), 'Notas sub-row opens Notas');
      assert.match(await page.text('#navLateral [data-lista="notas"]'), /^Notas2$/, 'with its count');
      await page.click('#navLateral [data-lista="tablero"]');
      assert.ok(await page.visible('#vistaTablero'), 'Tareas sub-row opens Tareas');
      await page.click('#ctxLateral [data-ctx="mercado"]');
      assert.equal(await page.visible('#navLateral [data-lista="notas"]'), false, 'Mercado has notes off: no Notas sub-row');
      assert.equal(await page.visible('#navLateral [data-lista="compras"]'), true);
      await page.click('#ctxLateral [data-ctx="estudio"]');
      assert.equal(await page.visible('#navLateral [data-lista="compras"]'), false, 'Estudio has no purchases: no Compras sub-row');
      const nv = await page.eval("(function(){var b=document.getElementById('navNivel');return {t:b.textContent,c:getComputedStyle(b).color,in:document.querySelector('#navLateral [data-vista=\"registro\"]').contains(b)};})()");
      assert.match(nv.t, /^NV \d+$/);
      assert.equal(nv.c, brasa, 'NV badge in brasa');
      assert.ok(nv.in, 'on the Progreso row');
      assert.equal(await page.text('#rotCtxLateral'), 'Apartados');
      assert.ok(await page.visible('#btnLatNuevoAp'), 'Nuevo apartado row');
      assert.match(await page.text('#btnLatNuevoAp'), /Nuevo apartado/);
      await page.click('#btnLatNuevoAp');
      await sleep(300);
      assert.ok(await isOpen(page, 'tapaApartado'), 'opens the section editor');
    }
  },
  {
    name: 'desktop (Cabina): the right rail (level card, Pulso 2x2, Misiones activas) shows at 1280+ and hides at 1024-1279, where the Ahora chips come back',
    width: 1366, height: 900, mobile: false,
    storage: Object.assign(seed(), { 'kibco.proyectos': misionSeed(false)['kibco.proyectos'] }),
    async fn(page) {
      const r = await page.eval(`(function(){var a=document.getElementById('rail'),b=a.getBoundingClientRect(),m=document.getElementById('vistaAhora').getBoundingClientRect(),l=document.getElementById('lateral').getBoundingClientRect();
        return {d:getComputedStyle(a).display,w:b.width,r:b.right,ml:m.left,mr:m.right,lw:l.width,niv:(a.querySelector('.rail-nivel')||{}).textContent||'',
          tiles:Array.prototype.map.call(a.querySelectorAll('[data-rail-tile]'),function(t){return t.getAttribute('data-rail-tile');}),
          cols:getComputedStyle(a.querySelector('.rail-pulso')).gridTemplateColumns.split(' ').length,mis:a.querySelectorAll('.rail-mision').length,
          chips:document.querySelector('#ahoraCuerpo .pulso').offsetParent!==null};})()`);
      assert.notEqual(r.d, 'none', 'rail shown at 1366');
      assert.equal(r.w, 320);
      assert.equal(r.r, 1366, 'docked right');
      assert.ok(r.mr <= 1366 - 320, 'the column ends before the rail');
      assert.ok(Math.abs((r.ml + r.mr) / 2 - (r.lw + (1366 - r.lw - 320) / 2)) <= 10, 'column centered between sidebar and rail');
      assert.match(r.niv, /Nivel \d+/);
      assert.deepEqual(r.tiles, ['atencion', 'hoy', 'inbox', 'esperando']);
      assert.equal(r.cols, 2, '2x2');
      assert.equal(r.mis, 1, 'the active mission');
      assert.equal(r.chips, false, 'the rail Pulso replaces the Ahora chips row at 1280+');
      assert.equal(await page.count('[data-tile]') > 0, true, 'the Ahora chips stay in the DOM (unique data-tile)');
      await page.click('#rail .rail-mision');
      await sleep(300);
      assert.ok(await isOpen(page, 'tapaMision'), 'a mission opens its sheet');
      await page.key('Escape');
      await sleep(300);
      await page.viewport(1100, 900, false);
      await sleep(150);
      assert.equal(await page.eval("getComputedStyle(document.getElementById('rail')).display"), 'none', 'no rail at 1100');
      assert.ok(await page.visible('#ahoraCuerpo .pulso'), 'the chips row is back');
      await page.viewport(390, 844, true);
      await sleep(150);
      assert.equal(await page.eval("getComputedStyle(document.getElementById('rail')).display"), 'none', 'no rail on the phone');
    }
  },
  {
    name: 'desktop (Cabina): the rail Pulso filters Ahora with the same in-memory filter as the chips, from any view',
    width: 1366, height: 900, mobile: false,
    storage: seed(),
    async fn(page) {
      const pressed = (sel) => page.eval(`document.querySelector(${JSON.stringify(sel)}).getAttribute('aria-pressed')`);
      const n = await page.eval("+document.querySelector('#rail [data-rail-tile=\"inbox\"] b').textContent");
      assert.equal(n, 2, 'two inbox items');
      await page.click('#rail [data-rail-tile="inbox"]');
      assert.equal(await pressed('#rail [data-rail-tile="inbox"]'), 'true');
      assert.equal(await page.eval("document.querySelector('[data-filtro-ahora]').getAttribute('data-filtro-ahora')"), 'inbox');
      assert.equal(await page.count('#secFiltro li.item'), 2);
      await page.click('#rail [data-rail-tile="inbox"]');
      assert.equal(await page.count('#secFiltro'), 0, 'tapping the active tile goes back to Todo');
      assert.equal(await pressed('#rail [data-rail-tile="inbox"]'), 'false');
      await page.click('#navLateral [data-vista="hoy"]');
      assert.equal(await pressed('#rail [data-rail-tile="hoy"]'), 'false', 'outside Ahora no tile is pressed');
      await page.click('#rail [data-rail-tile="hoy"]');
      assert.ok(await page.visible('#vistaAhora'), 'a tile brings Ahora');
      assert.equal(await page.eval("document.querySelector('[data-filtro-ahora]').getAttribute('data-filtro-ahora')"), 'hoy');
      await page.viewport(1100, 900, false);
      await sleep(150);
      assert.equal(await pressed('#ahoraCuerpo [data-tile="hoy"]'), 'true', 'the chips share the state');
    }
  },
  {
    name: 'desktop (Cabina): a visible search field with a / hint in the header; / focuses it and typing opens the search with the text',
    width: 1366, height: 900, mobile: false,
    storage: seed(),
    async fn(page) {
      await page.emulateFocus();
      assert.ok(await page.visible('#txtBuscaBarra'), 'search field visible');
      assert.equal(await page.visible('#btnBuscar'), false, 'no icon-only search button on desktop');
      assert.equal(await page.text('.buscar-barra kbd'), '/');
      await page.eval('document.activeElement&&document.activeElement.blur()');
      await page.press('/');
      assert.equal(await page.eval('document.activeElement.id'), 'txtBuscaBarra', '/ focuses the search field');
      assert.equal(await page.eval("document.getElementById('txtBuscaBarra').value"), '', 'the key is not typed');
      await page.type('#txtBuscaBarra', 'presu');
      await sleep(300);
      assert.ok(await isOpen(page, 'tapaBuscar'), 'typing opens the search');
      assert.equal(await page.eval('document.activeElement.id'), 'txtBusca', 'typing continues in the search sheet');
      assert.equal(await page.eval("document.getElementById('txtBusca').value"), 'presu');
      assert.match(await page.text('#resultados'), /Enviar presupuesto bomba/);
      await page.key('Escape');
      await sleep(300);
      assert.equal(await page.eval("document.getElementById('txtBuscaBarra').value"), '', 'the header field is left clean');
      await page.viewport(390, 844, true);
      await sleep(150);
      assert.equal(await page.visible('#txtBuscaBarra'), false, 'phone: icon button only');
      assert.ok(await page.visible('#btnBuscar'));
    }
  },
  {
    name: 'desktop (Cabina): the +XP pill flies to the sidebar NV badge; with reduced motion it fades in place',
    width: 1366, height: 900, mobile: false,
    storage: Object.assign(seed(), { 'kibco.pistas': '{"completar":true}' }),
    async fn(page) {
      await page.click('.hero [data-hero="hecho"]');
      await sleep(30);
      const r = await page.eval(`(function(){var p=document.querySelector('.xp-vuelo'),b=document.getElementById('navNivel').getBoundingClientRect();
        return {cls:p.className,tr:p.style.transform,x0:parseFloat(p.style.left),y0:parseFloat(p.style.top),bx:b.left+b.width/2,by:b.top+b.height/2,
          late:document.getElementById('navNivel').className.indexOf('latido')>-1};})()`);
      assert.equal(r.cls, 'xp-vuelo', 'it flies');
      const m = r.tr.match(/translate3d\((-?\d+)px, ?(-?\d+)px/);
      assert.ok(m, 'translated: ' + r.tr);
      assert.ok(Math.abs(r.x0 + +m[1] - r.bx) <= 2 && Math.abs(r.y0 + +m[2] - r.by) <= 2, 'lands on the NV badge');
      assert.ok(r.late, 'the badge beats');
      await sleep(800);
      await page.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.click('.hero [data-hero="hecho"]');
      await sleep(30);
      assert.equal(await page.eval("document.querySelector('.xp-vuelo').className"), 'xp-vuelo quieto', 'reduced motion: fade in place');
    }
  },
  {
    name: 'desktop (Cabina): central column with a 24/700 title, a 56px capture (radius 12, shadow), the hero in one row and a visible keyboard focus on the list',
    width: 1366, height: 900, mobile: false,
    storage: Object.assign(seed(), { 'kibco.pistas': '{"completar":true}' }),
    async fn(page) {
      await page.emulateFocus();
      const r = await page.eval(`(function(){var t=getComputedStyle(document.getElementById('tituloVista')),c=document.getElementById('txtCaptura'),cs=getComputedStyle(c),
        tx=document.querySelector('.hero-txt').getBoundingClientRect(),ac=document.querySelector('.hero-accs').getBoundingClientRect(),ca=document.querySelector('.hero-cab').getBoundingClientRect();
        return {fs:t.fontSize,fw:t.fontWeight,h:Math.round(c.getBoundingClientRect().height),rad:cs.borderTopLeftRadius,sh:cs.boxShadow,
          accLeft:ac.left,txtRight:tx.right,accTop:ac.top,txtBottom:tx.bottom,cabTop:ca.top};})()`);
      assert.equal(r.fs, '24px');
      assert.equal(r.fw, '700');
      assert.equal(r.h, 56, '56px capture');
      assert.equal(r.rad, '12px');
      assert.notEqual(r.sh, 'none', 'shadow 2');
      assert.ok(r.accLeft >= r.txtRight, 'hero buttons right of the text');
      assert.ok(r.accTop < r.txtBottom, 'in the same row');
      await page.eval('document.activeElement&&document.activeElement.blur()');
      await page.press('j');
      await sleep(60);
      const f = await page.eval(`(function(){var l=document.querySelector('li.item.kbsel'),s=getComputedStyle(l),y=document.createElement('i');y.style.color='var(--accent)';document.body.appendChild(y);var a=getComputedStyle(y).color;y.remove();
        return {focus:document.activeElement===l,bc:s.borderTopColor,ac:a,sh:s.boxShadow};})()`);
      assert.ok(f.focus, 'j focuses a card');
      assert.equal(f.bc, f.ac, 'accent border');
      assert.match(f.sh, /0px 0px 0px 3px/, '3px halo: ' + f.sh);
    }
  },
  {
    name: 'tablet (Cabina): at 900px the phone shell stays, with a centered 720 column and sheets up to 640',
    width: 900, height: 1200,
    storage: seed(),
    async fn(page) {
      const r = await page.eval(`(function(){var m=document.querySelector('main'),s=getComputedStyle(m),w=m.getBoundingClientRect().width-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight);
        return {tabs:getComputedStyle(document.querySelector('.tabs')).display,lat:getComputedStyle(document.getElementById('lateral')).display,rail:getComputedStyle(document.getElementById('rail')).display,
          w:w,pl:parseFloat(s.paddingLeft),pr:parseFloat(s.paddingRight)};})()`);
      assert.notEqual(r.tabs, 'none', 'bottom tabs');
      assert.equal(r.lat, 'none');
      assert.equal(r.rail, 'none');
      assert.ok(r.w <= 720 && r.w >= 680, 'about a 720 column: ' + r.w);
      assert.ok(Math.abs(r.pl - r.pr) <= 1, 'centered');
      await page.click('#btnAjustes');
      await sleep(400);
      const h = await page.eval("document.querySelector('#tapaAjustes .hoja').getBoundingClientRect().width");
      assert.ok(h <= 640, 'sheet up to 640: ' + h);
    }
  },
  // ---------- T7: review fixes (T6 R3-001, T6 R3-003, T2 R3-004) ----------
  {
    name: 'rail (T7): a repaint keeps the keyboard focus on the same mission, tile or level card, not the first mission',
    width: 1366, height: 900, mobile: false,
    storage: (() => {
      const s = seed();
      const mk = (id, nombre) => ({ id, nombre, objetivo: '', contexto: 'apps', estado: 'activo', hitos: [{ id: id + 'h', texto: 'hito' }],
        creado: new Date().toISOString(), actualizado: new Date().toISOString() });
      s['kibco.proyectos'] = JSON.stringify([mk('m1', 'Uno'), mk('m2', 'Dos'), mk('m3', 'Tres')]);
      return s;
    })(),
    async fn(page) {
      await page.emulateFocus();
      assert.equal(await page.count('#rail .rail-mision'), 3);
      const repaint = () => page.eval("window.dispatchEvent(new StorageEvent('storage',{key:'kibco.apartados'}))");
      for (const k of [1, 2]) {
        const want = await page.eval(`(function(){var b=document.querySelectorAll('#rail .rail-mision')[${k}];b.focus();return b.getAttribute('aria-label');})()`);
        await repaint();
        assert.equal(await page.eval("document.activeElement.getAttribute('aria-label')"), want, 'focus stays on mission ' + (k + 1));
        assert.ok(await page.eval('document.getElementById(\'rail\').contains(document.activeElement)'));
      }
      await page.eval("document.querySelector('#rail [data-rail-tile=\"hoy\"]').focus()");
      await repaint();
      assert.equal(await page.eval("document.activeElement.getAttribute('data-rail-tile')"), 'hoy', 'a tile keeps its focus');
      await page.eval("document.querySelector('#rail .rail-nivel').focus()");
      await repaint();
      assert.ok(await page.eval("document.activeElement.classList.contains('rail-nivel')"), 'the level card keeps its focus');
    }
  },
  {
    name: 'desktop search (T7): typing mid IME composition stays in the header field; compositionend hands the text to the search sheet',
    width: 1366, height: 900, mobile: false,
    storage: seed(),
    async fn(page) {
      await page.emulateFocus();
      await page.eval(`(function(){var b=document.getElementById('txtBuscaBarra');b.focus();b.value='pre';
        b.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'pre'}));})()`);
      await cerrada(page, 'tapaBuscar');
      assert.equal(await isOpen(page, 'tapaBuscar'), false, 'no hand-off while composing');
      assert.equal(await page.eval("document.getElementById('txtBuscaBarra').value"), 'pre', 'the composed text stays');
      await page.eval("document.getElementById('txtBuscaBarra').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'pre'}))");
      await esperarHasta(() => isOpen(page, 'tapaBuscar'), 2000, 'the search sheet');
      assert.equal(await page.eval("document.getElementById('txtBusca').value"), 'pre');
      assert.equal(await page.eval("document.getElementById('txtBuscaBarra').value"), '', 'the header field is left clean');
      assert.match(await page.text('#resultados'), /Enviar presupuesto bomba/);
    }
  },
  {
    name: 'xp (T7): total XP is computed once per paint and every XP view stays right after completing and undoing',
    width: 1366, height: 900, mobile: false,
    storage: seed(),
    async fn(page) {
      await page.eval("(function(){var o=KCOCore.calcularXP;window.__xpN=0;KCOCore.calcularXP=function(){window.__xpN++;return o.apply(this,arguments);};})()");
      const views = () => page.eval(`(function(){var it=JSON.parse(localStorage.getItem('kibco.items')||'[]'),pr=JSON.parse(localStorage.getItem('kibco.proyectos')||'[]');
        var nv=KCOCore.nivelPorXP(KCOCore.calcularXP(it,pr).total),rn=document.querySelector('#rail .rail-nivel');
        return {want:nv.nivel+'|'+nv.pct+'|'+nv.enNivel+' de '+nv.tramo,ring:document.getElementById('anilloNivel').textContent+'|'+document.getElementById('btnNivel').style.getPropertyValue('--pct'),
          nav:document.querySelector('#navLateral [data-vista="registro"]').textContent,nivel:nv.nivel,pct:nv.pct,rail:rn?rn.getAttribute('aria-label'):'',
          card:(document.getElementById('tarjetaNivel')||{}).textContent||''};})()`);
      const check = (v, label) => {
        const [n, pct, en] = v.want.split('|');
        assert.equal(v.ring, n + '|' + pct, label + ': ring');
        assert.match(v.nav, new RegExp('NV ' + n + '(\\D|$)'), label + ': sidebar badge');
        assert.ok(v.rail.indexOf(en + ' XP') > -1, label + ': rail level card ' + v.rail + ' / ' + en);
      };
      await page.eval('window.__xpN=0');
      await page.click('#navLateral [data-vista="registro"]');
      assert.equal(await page.eval('window.__xpN'), 1, 'one XP computation for the whole Progreso paint (ring, sidebar, rail, level card)');
      const v0 = await views();
      check(v0, 'start');
      assert.match(v0.card, new RegExp('Nivel ' + v0.nivel));
      await page.click('#navLateral [data-vista="ahora"]');
      await page.click('.hero [data-hero="hecho"]');
      await sleep(150);
      const v1 = await views();
      check(v1, 'after completing');
      assert.notEqual(v1.want, v0.want, 'completing changed the XP');
      await page.click('#btnDeshacer');
      await sleep(150);
      const v2 = await views();
      check(v2, 'after undo');
      assert.equal(v2.want, v0.want, 'undo restores the XP');
      await page.eval('window.__xpN=0');
      await page.click('#navLateral [data-vista="hoy"]');
      assert.equal(await page.eval('window.__xpN'), 1, 'one XP computation per paint');
    }
  }
];

// ORDER_SEED('manual') plus W (done) and E (inbox), with the given manual ranks.
function RANKED_ORDER_SEED(rk) {
  const s = ORDER_SEED('manual');
  const list = JSON.parse(s['kibco.items']);
  const base = list[2];
  list.push(Object.assign({}, base, { id: 'W', texto: 'tarea W', estado: 'completado' }));
  list.push(Object.assign({}, base, { id: 'E', texto: 'tarea E', estado: 'entrada', nivel: 'baja' }));
  for (const it of list) { if (rk[it.id]) { it.ordenManual = rk[it.id]; } }
  s['kibco.items'] = JSON.stringify(list);
  return s;
}
const ranks = async (page) => {
  const r = {};
  for (const it of await items(page)) { if (it.contexto === 'taller') { r[it.id] = it.ordenManual; } }
  return r;
};
async function altKey(page, listId, id, k, code) {
  await page.eval(`(function(){var l=document.querySelector('#${listId} li.item[data-id="${id}"]');l.focus();
    l.dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',keyCode:${code},altKey:true,bubbles:true,cancelable:true}));})()`);
  await sleep(80);
}

// ORDER_SEED plus three Taller purchases in a clear automatic order (K1 > K2 > K3).
function COMPRA_ORDER_SEED(mode = 'manual') {
  const s = ORDER_SEED(mode);
  const list = JSON.parse(s['kibco.items']);
  const base = list[0];
  list.push(Object.assign({}, base, { id: 'K1', texto: 'compra K1', tipo: 'compra', estado: 'cotizando', nivel: 'importante' }));
  list.push(Object.assign({}, base, { id: 'K2', texto: 'compra K2', tipo: 'compra', estado: 'cotizando', nivel: 'normal' }));
  list.push(Object.assign({}, base, { id: 'K3', texto: 'compra K3', tipo: 'compra', estado: 'cotizando', nivel: 'baja' }));
  s['kibco.items'] = JSON.stringify(list);
  return s;
}
// ORDER_SEED('manual') plus 50 low-priority Taller tasks: Tareas shows 50 rows and "Ver mas".
function PAGED_ORDER_SEED() {
  const s = ORDER_SEED('manual');
  const list = JSON.parse(s['kibco.items']);
  const base = list[3];
  for (let i = 1; i <= 50; i++) {
    const id = 'X' + String(i).padStart(2, '0');
    list.push(Object.assign({}, base, { id, texto: 'extra ' + id }));
  }
  s['kibco.items'] = JSON.stringify(list);
  return s;
}
const listRows = (page, id) => page.eval(`Array.prototype.map.call(document.querySelectorAll('#${id} li.item'),function(l){return l.getAttribute('data-id');})`);
const listOrderOn = (page, id) => page.eval(`(function(){var b=document.querySelector('#${id} .menu-op.on');return b?b.getAttribute('data-orden'):null;})()`);

// ORDER_SEED plus two overdue Taller tasks (17 and 3 days).
function ATTENTION_SEED(mode) {
  const s = ORDER_SEED(mode);
  const list = JSON.parse(s['kibco.items']);
  const base = list[0];
  list.push(Object.assign({}, base, { id: 'V1', texto: 'vencida vieja', nivel: 'normal', fecha: ymd(-17) }));
  list.push(Object.assign({}, base, { id: 'V2', texto: 'vencida nueva', nivel: 'normal', fecha: ymd(-3) }));
  s['kibco.items'] = JSON.stringify(list);
  return s;
}

// Ahora manual order: Taller with four tasks in a clear score order (A > B > C > D), Mercado with two.
function ORDER_SEED(mode) {
  const iso = new Date(Date.now() - 86400000).toISOString();
  const it = (id, ctx, o) => Object.assign({ id, texto: 'tarea ' + id, contexto: ctx, tipo: 'tarea', estado: 'pendiente',
    nivel: 'normal', creado: iso, actualizado: iso, estadoDesde: iso }, o);
  return {
    'kibco.esquema': '5',
    'kibco.contexto': 'taller',
    'kibco.apartados': JSON.stringify([
      Object.assign({ id: 'taller', nom: 'Taller', ico: 'settings', color: 'naranja', orden: 0, compras: 'fabrica' }, mode ? { ordenAhora: mode } : {}),
      { id: 'mercado', nom: 'Mercado', ico: 'cart', color: 'verde', orden: 1 }
    ]),
    'kibco.items': JSON.stringify([
      it('A', 'taller', { nivel: 'importante' }), it('B', 'taller', { estado: 'proceso' }), it('C', 'taller'),
      it('D', 'taller', { nivel: 'baja' }), it('M1', 'mercado'), it('M2', 'mercado')
    ]),
    'kibco.eventos': '[]'
  };
}
// ORDER_SEED('manual') plus 30 low-priority Taller tasks, enough to overflow main.
function LONG_ORDER_SEED() {
  const s = ORDER_SEED('manual');
  const list = JSON.parse(s['kibco.items']);
  const base = list[3];
  for (let i = 1; i <= 30; i++) {
    const id = 'E' + String(i).padStart(2, '0');
    list.push(Object.assign({}, base, { id, texto: 'extra ' + id }));
  }
  s['kibco.items'] = JSON.stringify(list);
  return s;
}
const orderRows = (page) => page.eval("Array.prototype.map.call(document.querySelectorAll('#secSigue li.item'),function(l){return l.getAttribute('data-id');})");
const orderOn = (page) => page.eval("(function(){var b=document.querySelector('#ordenAhora .menu-op.on');return b?b.getAttribute('data-orden'):null;})()");

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

// A long list: n pending tasks in Trabajo; optional compras (Casa) and completion events (diary/log).
function bigSeed(n, extra = {}) {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const list = [];
  for (let i = 0; i < n; i++) list.push({ id: 't' + i, texto: 'tarea larga ' + i, contexto: 'trabajo', tipo: 'tarea', estado: 'pendiente',
    nivel: 'normal', creado: iso(now - 86400000 - i * 1000), estadoDesde: iso(now - 86400000 - i * 1000) });
  for (let i = 0; i < (extra.compras || 0); i++) list.push({ id: 'c' + i, texto: 'compra ' + i, contexto: 'hogar', tipo: 'compra',
    estado: 'pendiente', nivel: 'normal', creado: iso(now - i * 1000), estadoDesde: iso(now - i * 1000) });
  const ev = [];
  for (let i = 0; i < (extra.eventos || 0); i++) {
    const id = 'e' + i, ts = iso(now - 3600000 - i * 60000);
    list.push({ id, texto: 'hecha ' + i, contexto: 'trabajo', tipo: 'tarea', estado: 'completado', nivel: 'normal', creado: ts, estadoDesde: ts });
    ev.push({ ts, tipo: 'estado', itemId: id, texto: 'hecha ' + i, contexto: 'trabajo', desde: 'pendiente', hasta: 'completado' });
  }
  ev.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return { 'kibco.esquema': '4', 'kibco.contexto': 'todo', 'kibco.items': JSON.stringify(list), 'kibco.eventos': JSON.stringify(ev) };
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

// An empty state: visible, one SVG icon, a title and (unless withAction is false) one action button.
async function emptyState(page, sel, withAction = true) {
  const r = await page.eval(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;
    var st=getComputedStyle(e),b=e.getBoundingClientRect();
    return {vis:st.display!=='none'&&b.height>0,svg:e.querySelectorAll('.vacio-ico svg').length,tit:(e.querySelector('.vacio-tit')||{}).textContent||'',
      acc:e.querySelectorAll('.vacio-acc').length,text:e.textContent};})()`);
  assert.ok(r, 'empty state present: ' + sel);
  assert.ok(r.vis, 'empty state visible: ' + sel);
  assert.equal(r.svg, 1, 'one icon: ' + sel);
  assert.ok(r.tit.length > 0, 'a title: ' + sel);
  if (withAction) assert.equal(r.acc, 1, 'one action: ' + sel);
  return r;
}

async function openFirstItem(page, estado) {
  await toTasks(page);
  if (estado) {
    await page.eval(`(function(){var c=document.querySelector('#chips [data-filtro="${estado}"]');if(c)c.click();})()`);
  }
  await page.click('#lista li.item');
}
