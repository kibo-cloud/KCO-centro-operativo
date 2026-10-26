'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

const NOW = new Date(2026, 9, 7, 10, 0);
const HOY = '2026-10-07'; // miercoles
const at = (k, h) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), h || 12).toISOString();
let n = 0;
const done = (k, o) => Object.assign({ id: 'i' + (++n), texto: 't' + n, contexto: 'trabajo', tipo: 'tarea', estado: 'completado',
  nivel: 'normal', creado: at(C.sumarDias(k, -1)), estadoDesde: at(k) }, o);

const restaurar = () => C.fijarApartados(C.apartadosLegado());

test('legacy seed: the five sections keep ids, names, colors, purchase modes and tags', () => {
  const l = C.apartadosLegado();
  assert.deepEqual(l.map((a) => a.id), ['trabajo', 'hogar', 'apps', 'contenido', 'personal']);
  assert.deepEqual(l.map((a) => a.nom), ['Trabajo', 'Casa', 'Apps', 'Contenido', 'Personal']);
  assert.deepEqual(l.map((a) => a.color), ['naranja', 'cian', 'violeta', 'rosa', 'verde']);
  assert.deepEqual(l.map((a) => a.compras), ['fabrica', 'lista', 'lista', 'lista', 'lista']);
  assert.deepEqual(l.map((a) => a.orden), [0, 1, 2, 3, 4]);
  for (const a of l) {
    assert.ok(C.COLORES.indexOf(a.color) >= 0, a.id + ' color is a palette key');
    assert.equal(typeof a.ico, 'string');
    assert.ok(a.ico.length > 0);
    assert.equal(a.activo, true);
    assert.equal(a.meta, null);
  }
  assert.deepEqual(l[0].tags.map((t) => t.id), ['relevamiento', 'limpieza', 'adm', 'proveedor', 'panol', 'gestion']);
  assert.deepEqual(l[1].tags.map((t) => t.id), ['comida', 'limpieza', 'higiene', 'mantenimiento', 'hogar']);
  assert.deepEqual(l[2].tags, []);
  assert.deepEqual(l[1].alias, ['casa']);
  assert.deepEqual(l[2].alias, ['app']);
  assert.notEqual(C.apartadosLegado()[0], l[0], 'every call returns fresh copies');
});

test('normalizarApartado: sanitizes fields and rejects missing id or name', () => {
  assert.equal(C.normalizarApartado(null), null);
  assert.equal(C.normalizarApartado({ id: '', nom: 'X' }), null);
  assert.equal(C.normalizarApartado({ id: 'x', nom: '   ' }), null);
  assert.equal(C.normalizarApartado({ id: 'todo', nom: 'Todo' }), null, 'todo is the synthetic view');
  const a = C.normalizarApartado({ id: 'gym', nom: '  Gimnasio  ', ico: 7, color: 'fucsia', orden: 'x',
    desc: 5, meta: { n: '4', periodo: 'semana' }, alias: ['Pesas', 'pesas', '', 3], compras: 'raro',
    tags: [{ id: 'Fuerza Max', nom: 'Fuerza' }, { nom: 'Fuerza max' }, { id: '', nom: '' }, 'x'] });
  assert.equal(a.id, 'gym');
  assert.equal(a.nom, 'Gimnasio');
  assert.equal(a.ico, 'layers');
  assert.equal(a.color, 'gris');
  assert.equal(a.orden, 0);
  assert.equal(a.desc, '');
  assert.deepEqual(a.meta, { n: 4, periodo: 'semana' });
  assert.deepEqual(a.alias, ['pesas']);
  assert.equal(a.compras, 'lista');
  assert.deepEqual(a.tags, [{ id: 'fuerza-max', nom: 'Fuerza' }]);
  assert.equal(a.activo, true);
  assert.equal(C.normalizarApartado({ id: 'g', nom: 'G', meta: { n: 0, periodo: 'semana' } }).meta, null);
  assert.equal(C.normalizarApartado({ id: 'g', nom: 'G', meta: { n: 3, periodo: 'anio' } }).meta, null);
  assert.equal(C.normalizarApartado({ id: 'g', nom: 'G', activo: false }).activo, false);
  assert.equal(C.normalizarApartado({ id: 'g', nom: 'G', compras: 'no' }).compras, 'no');
  assert.equal(C.normalizarApartado({ id: 'g', nom: 'x'.repeat(200) }).nom.length, 40);
  assert.ok(C.normalizarApartado({ id: 'g', nom: 'G', desc: 'd'.repeat(2000) }).desc.length <= 280);
});

test('normalizarApartados: drops invalid, dedupes ids, sorts by orden and renumbers', () => {
  const l = C.normalizarApartados([{ id: 'b', nom: 'B', orden: 9 }, null, { id: 'a', nom: 'A', orden: 2 },
    { id: 'b', nom: 'B2', orden: 1 }, { id: '', nom: 'x' }]);
  assert.deepEqual(l.map((a) => a.id + ':' + a.orden), ['a:0', 'b:1']);
  assert.equal(l[1].nom, 'B', 'first occurrence wins');
  assert.deepEqual(C.normalizarApartados('nope'), []);
});

test('registry: fijarApartados drives contexts, purchases mode, tags and the shared CONTEXTOS array', () => {
  const ref = C.CONTEXTOS;
  try {
    C.fijarApartados([{ id: 'gym', nom: 'Gimnasio', orden: 1, compras: 'no' },
      { id: 'taller', nom: 'Taller', orden: 0, compras: 'fabrica', tags: [{ id: 'torno', nom: 'Torno' }] },
      { id: 'viejo', nom: 'Viejo', orden: 2, activo: false }]);
    assert.equal(C.CONTEXTOS, ref, 'same array object');
    assert.deepEqual(C.CONTEXTOS.map((a) => a.id), ['taller', 'gym']);
    assert.deepEqual(C.apartados().map((a) => a.id), ['taller', 'gym']);
    assert.deepEqual(C.todosApartados().map((a) => a.id), ['taller', 'gym', 'viejo']);
    assert.equal(C.contextoValido('gym'), true);
    assert.equal(C.contextoValido('trabajo'), false);
    assert.equal(C.infoContexto('viejo').nom, 'Viejo', 'archived sections still resolve');
    assert.equal(C.normalizarContexto('marte'), 'taller');
    assert.equal(C.esFabrica('taller'), true);
    assert.equal(C.esFabrica('trabajo'), false);
    assert.equal(C.modoCompras('gym'), 'no');
    assert.equal(C.modoCompras('nada'), 'lista');
    assert.deepEqual(C.tagsDe('taller'), [{ id: 'torno', nom: 'Torno' }]);
    assert.deepEqual(C.tagsDe('nada'), []);
    C.fijarApartados([]);
    assert.equal(C.CONTEXTOS.length, 0);
    assert.equal(C.normalizarContexto('x'), '');
  } finally { restaurar(); }
  assert.equal(C.normalizarContexto('marte'), 'trabajo');
});

test('tags: catalog spans every section and keeps the legacy emoji', () => {
  assert.deepEqual(C.todosTags().map((t) => t.id),
    ['relevamiento', 'limpieza', 'adm', 'proveedor', 'panol', 'gestion', 'comida', 'higiene', 'mantenimiento', 'hogar']);
  assert.equal(C.infoTag('panol').nom, 'Pañol');
  assert.equal(C.infoTag('panol').ico, '🧰');
  assert.equal(C.infoTag('nada'), null);
  try {
    C.fijarApartados([{ id: 'x', nom: 'X', tags: [{ id: 'nuevo', nom: 'Nuevo' }] }]);
    assert.equal(typeof C.infoTag('nuevo').ico, 'string');
    assert.ok(C.infoTag('nuevo').ico.length > 0);
  } finally { restaurar(); }
});

test('capture: aliases come from id, slugged name and alias list, accent-insensitive', () => {
  try {
    C.fijarApartados([{ id: 'a1', nom: 'Diseño 3D', alias: ['arte'] }, { id: 'musica', nom: 'Música' }]);
    assert.equal(C.parsearCaptura('boceto #diseno-3d', NOW).contexto, 'a1');
    assert.equal(C.parsearCaptura('boceto #Diseño-3D', NOW).contexto, 'a1');
    assert.equal(C.parsearCaptura('boceto #a1', NOW).contexto, 'a1');
    assert.equal(C.parsearCaptura('boceto #arte', NOW).contexto, 'a1');
    assert.equal(C.parsearCaptura('tema #MÚSICA nuevo', NOW).contexto, 'musica');
    assert.equal(C.parsearCaptura('tema #musica nuevo', NOW).texto, 'tema nuevo');
    assert.equal(C.parsearCaptura('ver #trabajo', NOW).contexto, '', 'unknown sections are plain hashtags');
    assert.equal(C.quitarContextoCaptura('tema #musica nuevo'), 'tema nuevo');
    assert.equal(C.resumenCaptura('ver #hashtag #musica', NOW).contexto, 'musica');
  } finally { restaurar(); }
  assert.equal(C.parsearCaptura('barrer #casa', NOW).contexto, 'hogar');
  assert.equal(C.parsearCaptura('barrer #Casa', NOW).contexto, 'hogar');
  assert.equal(C.parsearCaptura('arreglar #app', NOW).contexto, 'apps');
});

test('stats: per-section counts follow the registry; balance needs min(3, sections)', () => {
  try {
    C.fijarApartados([{ id: 'a', nom: 'A' }, { id: 'b', nom: 'B' }]);
    const items = [];
    for (const c of ['a', 'b']) for (let i = 0; i < 5; i++) items.push(done(HOY, { contexto: c }));
    const s = C.estadisticas(items, [], [], HOY);
    assert.deepEqual(Object.keys(s.porContexto), ['a', 'b']);
    assert.equal(s.contextosEquilibrio, 2);
    assert.equal(s.metaEquilibrio, 2);
    assert.ok(C.logrosNuevos(s, {}).some((l) => l.id === 'equilibrio'));
    C.fijarApartados([{ id: 'a', nom: 'A' }]);
    const s1 = C.estadisticas(items, [], [], HOY);
    assert.equal(s1.metaEquilibrio, 3, 'one section can never be balanced');
    assert.ok(!C.logrosNuevos(s1, {}).some((l) => l.id === 'equilibrio'));
  } finally { restaurar(); }
  const eq = C.LOGROS.filter((l) => l.id === 'equilibrio')[0];
  assert.equal(C.metaLogro(eq, { metaEquilibrio: 2 }), 2);
  assert.equal(C.metaLogro(eq, {}), 3);
});

test('compaction summary is attributed to the first active section', () => {
  try {
    C.fijarApartados([{ id: 'z', nom: 'Z' }]);
    const iso = (d) => new Date(Date.UTC(2026, 0, 1) - d * 86400000).toISOString();
    const evs = [];
    for (let i = 0; i < 3; i++) evs.push({ id: 'e' + i, ts: iso(40 + i), tipo: 'captura', itemId: 'x', texto: 't', contexto: 'z', desde: '', hasta: '' });
    const resumen = C.compactarEventos(evs, iso(0)).filter((e) => e.tipo === 'compactado');
    assert.equal(resumen.length, 1);
    assert.equal(resumen[0].contexto, 'z');
  } finally { restaurar(); }
});

test('progresoMeta: counts completions of the section in the current ISO week or month', () => {
  assert.equal(C.progresoMeta({ id: 'trabajo', meta: null }, [], HOY), null);
  assert.equal(C.progresoMeta(null, [], HOY), null);
  const items = [
    done('2026-10-05'), done(HOY), done('2026-10-04'), // lunes, hoy, domingo anterior
    done('2026-10-01'), done(HOY, { contexto: 'hogar' }),
    done(HOY, { estado: 'pendiente' }), done('2026-09-30')
  ];
  assert.deepEqual(C.progresoMeta({ id: 'trabajo', meta: { n: 3, periodo: 'semana' } }, items, HOY),
    { hechas: 2, meta: 3, periodo: 'semana', desde: '2026-10-05' });
  assert.deepEqual(C.progresoMeta({ id: 'trabajo', meta: { n: 10, periodo: 'mes' } }, items, HOY),
    { hechas: 4, meta: 10, periodo: 'mes', desde: '2026-10-01' });
  assert.equal(C.progresoMeta({ id: 'trabajo', meta: { n: 1, periodo: 'semana' } }, items, '2026-10-05').desde, '2026-10-05');
  assert.equal(C.progresoMeta({ id: 'trabajo', meta: { n: 1, periodo: 'semana' } }, items, '2026-10-11').desde, '2026-10-05');
});

test('archived section: not contextoValido and #id, #name or #alias capture never routes to it', () => {
  try {
    C.fijarApartados([{ id: 'taller', nom: 'Taller' },
      { id: 'viejo', nom: 'Estudio Viejo', alias: ['antiguo'], activo: false }]);
    assert.equal(C.contextoValido('viejo'), false);
    assert.equal(C.contextoValido('taller'), true);
    assert.equal(C.normalizarContexto('viejo'), 'taller');
    for (const k of ['#viejo', '#estudio-viejo', '#antiguo']) {
      assert.equal(C.parsearCaptura('algo ' + k, NOW).contexto, '', k + ' is a plain hashtag');
      assert.equal(C.resumenCaptura('algo ' + k, NOW).contexto, '', k + ' summary');
    }
  } finally { restaurar(); }
});

test('infoTag: a section resolves its own tag name first, then the global catalog', () => {
  try {
    C.fijarApartados([{ id: 'a', nom: 'A', tags: [{ id: 'compartido', nom: 'Nombre A' }, { id: 'panol', nom: 'Deposito' }] },
      { id: 'b', nom: 'B', tags: [{ id: 'compartido', nom: 'Nombre B' }, { id: 'solo-b', nom: 'Solo B' }] }]);
    assert.equal(C.infoTag('compartido').nom, 'Nombre A', 'global lookup: first section wins');
    assert.equal(C.infoTag('compartido', 'a').nom, 'Nombre A');
    assert.equal(C.infoTag('compartido', 'b').nom, 'Nombre B');
    assert.equal(C.infoTag('solo-b', 'a').nom, 'Solo B', 'falls back to another section');
    assert.equal(C.infoTag('compartido', 'nada').nom, 'Nombre A');
    assert.equal(C.infoTag('panol', 'a').ico, '🧰', 'legacy emoji kept with a custom name');
    assert.equal(C.infoTag('panol', 'a').nom, 'Deposito');
    assert.equal(C.infoTag('nada', 'a'), null);
  } finally { restaurar(); }
});

test('emojiApartado: legacy sections keep their emoji, others derive it from the icon', () => {
  assert.deepEqual(['trabajo', 'hogar', 'apps', 'contenido', 'personal'].map((id) => C.emojiApartado(id)),
    ['🏭', '🏠', '💻', '🎬', '🏋']);
  try {
    C.fijarApartados([{ id: 'est', nom: 'Estudio', ico: 'book' }, { id: 'trabajo', nom: 'Trabajo', ico: 'cart' },
      { id: 'raro', nom: 'Raro', ico: 'chevron-down' }]);
    assert.equal(C.emojiApartado('est'), '📖');
    assert.equal(C.emojiApartado('trabajo'), '🛒', 'a changed icon wins over the legacy emoji');
    assert.equal(C.emojiApartado('raro'), '📋', 'generic fallback');
    assert.equal(C.emojiApartado('nada'), '📋');
  } finally { restaurar(); }
});

test('records keep an archived section id; unknown ids fall back to the first active section', () => {
  try {
    C.fijarApartados([{ id: 'taller', nom: 'Taller' }, { id: 'viejo', nom: 'Viejo', activo: false }]);
    assert.equal(C.contextoDeRegistro('viejo'), 'viejo', 'archived id kept for records');
    assert.equal(C.contextoDeRegistro('taller'), 'taller');
    assert.equal(C.contextoDeRegistro('nada'), 'taller', 'unknown id -> first active');
    assert.equal(C.contextoDeRegistro('todo'), 'taller', 'todo is never a record section');
    assert.equal(C.normalizarContexto('viejo'), 'taller', 'capture/pickers still use active ones');
    assert.equal(C.normalizarRutina({ id: 'r1', texto: 'regar', contexto: 'viejo' }, HOY).contexto, 'viejo');
    assert.equal(C.normalizarProyecto({ id: 'p1', nombre: 'Mision', contexto: 'viejo' }).contexto, 'viejo');
  } finally { restaurar(); }
});

test('idUnico: slug of the name, unique among the used ids, never "todo"', () => {
  assert.equal(C.idUnico('Taller', [], 'apartado'), 'taller');
  assert.equal(C.idUnico('Taller', ['taller'], 'apartado'), 'taller-2');
  assert.equal(C.idUnico('Taller', ['taller', 'taller-2'], 'apartado'), 'taller-3');
  assert.equal(C.idUnico('Todo', [], 'apartado'), 'todo-2', 'todo is reserved for the aggregate view');
  assert.equal(C.idUnico('!!!', [], 'apartado'), 'apartado', 'a name without letters falls back');
  assert.equal(C.idUnico('', ['apartado'], 'apartado'), 'apartado-2');
  const largo = C.idUnico('a'.repeat(60), ['a'.repeat(30)], 'apartado');
  assert.ok(/^[a-z0-9-]{1,40}$/.test(largo), 'a valid id: ' + largo);
  assert.notEqual(largo, 'a'.repeat(30));
  assert.ok(C.normalizarApartado({ id: C.idUnico('Diseño 3D', [], 'apartado'), nom: 'x' }), 'accepted by the registry');
});

test('estadoTareaDeCompra: open purchases become pending, bought ones completed, cancelled stays cancelled', () => {
  for (const e of ['cotizando', 'esperando_oc', 'esperando_aprob', 'oc_enviada', 'esperando_entrega', 'por_comprar', 'raro']) {
    assert.equal(C.estadoTareaDeCompra(e), 'pendiente', e);
  }
  assert.equal(C.estadoTareaDeCompra('recibido'), 'completado');
  assert.equal(C.estadoTareaDeCompra('comprado'), 'completado');
  assert.equal(C.estadoTareaDeCompra('cancelado'), 'cancelado');
});
