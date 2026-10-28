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
      assert.equal(await tok('--sp-4'), '16px');
      assert.equal(await tok('--tap'), '44px');
      assert.equal(await tok('--fs-xs'), '12px');
      // Rules use the tokens: dark background; the focus ring follows the context accent.
      await scheme(page, 'dark');
      assert.equal(await page.eval('getComputedStyle(document.body).backgroundColor'), 'rgb(13, 15, 18)');
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
      // Todo is the neutral aggregate.
      await page.click('#btnCtx');
      await page.click('#ctxsel [data-ctx="todo"]');
      assert.equal(await page.eval("document.body.getAttribute('data-ctx')"), 'todo');
      assert.match(await page.eval('document.body.className'), /\bpal-gris\b/);
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
      assert.equal(await page.eval("document.querySelector('#listaApartados [data-ap=\"gym\"] svg').getAttribute('data-ico-nom')"), 'trophy');
      assert.ok(await page.visible('#btnNuevoApartado'));
      const order = await page.eval("(function(){var h=document.getElementById('tapaAjustes'),a=h.getElementsByTagName('*'),p={},k;for(k=0;k<a.length;k++){if(a[k].id)p[a[k].id]=k;}return p;})()");
      assert.ok(order.btnImportar < order.listaApartados && order.listaApartados < order.segTema, 'between Backup and Pantalla');
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
      await page.click('#btnModoCampana');
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
      assert.equal(await page.eval('getComputedStyle(document.body).backgroundColor'), 'rgb(242, 243, 246)');
      assert.equal(await page.eval('getComputedStyle(document.body).color'), 'rgb(21, 24, 30)');
      assert.equal(await page.eval('getComputedStyle(document.documentElement).colorScheme'), 'light');
      assert.deepEqual(await themeColors(page), ['#F2F3F6', '#F2F3F6'], 'every theme-color meta follows the active theme');
      await page.eval("document.body.className='pal-violeta'");
      assert.equal((await cssVar(page, 'document.body', '--accent')).toUpperCase(), '#6D28D9', 'palette accent has a light variant');
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
      assert.notEqual(await page.eval('getComputedStyle(document.activeElement).outlineStyle'), 'none', 'visible focus ring');
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
    name: 'motion: prefers-reduced-motion reduce brings every transition and animation to about 0',
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
      assert.ok(r.max <= 0.01, 'longest transition/animation ' + r.max + 's on ' + r.who);
      assert.ok(parseFloat(await page.eval("getComputedStyle(document.querySelector('#tapaItem .hoja')).transitionDuration")) <= 0.01, 'the sheet does not slide');
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
      await emptyState(page, '#vacioRegistro[data-vacio="diario"]');
      await page.click('#vacioRegistro .vacio-acc');
      assert.equal(await page.eval("document.querySelector('#chipsRango [data-filtro=\"todo\"]').className.indexOf('on')>-1"), true, 'Ver todo widens the range');
      assert.equal(await page.count('#vacioRegistro .vacio-acc'), 0, 'no widen action once the range is Todo');
      await page.click('#btnModoRegistro');
      await emptyState(page, '#vacioRegistro[data-vacio="registro"]', false);
      await page.click('#btnModoCampana');
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
    name: 'settings: Ajustes opens with Backup first and Info last, and every setting is still there',
    storage: seed(),
    async fn(page) {
      await page.click('#btnAjustes');
      await sleep(150);
      const r = await page.eval(`(function(){var h=document.getElementById('tapaAjustes'),rot=h.querySelectorAll('.rot'),t=[],i;
        for(i=0;i<rot.length;i++){t.push(rot[i].textContent.trim());}
        function pos(id){var all=h.getElementsByTagName('*');for(var k=0;k<all.length;k++){if(all[k].id===id)return k;}return -1;}
        var ids=['vBackup','btnExportar','btnBackupTexto','btnImportar','archivoImport','segTema','btnLuz','vNotif','btnPermiso','vSolic','chipsSolic','txtNuevoSolic','btnSumarSolic','vDest','chipsDest','txtNuevoDest','btnSumarDest','vApp','vSw','vEsquema','vTotal','vEventos','pieVersion','pieEsquema'],p={};
        for(i=0;i<ids.length;i++){p[ids[i]]=pos(ids[i]);}
        var pie=h.querySelector('.pie');return {rot:t,p:p,pieLast:!!pie&&pie===h.querySelector('.hoja').lastElementChild};})()`);
      assert.deepEqual(r.rot, ['Backup', 'Apartados', 'Pantalla', 'Recordatorios', 'Cat\u00E1logos de compras', 'Info']);
      for (const [id, k] of Object.entries(r.p)) assert.ok(k > -1, id + ' is still in Ajustes');
      assert.ok(r.p.btnExportar < r.p.segTema && r.p.vBackup < r.p.btnExportar, 'backup comes first, with its last-backup date');
      assert.ok(r.p.vApp > r.p.btnSumarDest, 'version info comes after every setting');
      assert.ok(r.pieLast, 'the footer closes the sheet');
      // The backup action still works from its new place.
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
      assert.equal(await isOpen(page, 'tapaConfirmar'), false, 'a note is a record: no straight confirmation');
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
