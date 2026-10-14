'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

// Deterministic PRNG so the seeded log is the same on every run.
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const HOY = '2026-10-13';
const DIA = 86400000;
const BASE = new Date(2026, 9, 13, 12).getTime();
const iso = (diasAtras, minuto) => new Date(BASE - diasAtras * DIA + (minuto || 0) * 60000).toISOString();
const CORTE = iso(180);

const RUIDO = ['captura', 'edicion', 'prioridad', 'fecha', 'tag', 'recordatorio', 'anclado', 'pausa', 'contexto', 'espera'];
const CIERRES = ['completado', 'recibido', 'comprado'];
const ABIERTOS = ['pendiente', 'entrada', 'en_curso'];
const CTX = ['trabajo', 'hogar', 'apps'];

// A 400-day log: noise, completions, reopenings, undos, delegations, back-to-task,
// milestones, missions, comments, achievements and levels, plus items and missions
// for XP, achievements and streaks.
function sembrar(seed) {
  const r = prng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const eventos = [], items = [];
  let n = 0;
  const ev = (dias, min, tipo, itemId, extra) => {
    eventos.push(Object.assign({ id: 'e' + (++n), ts: iso(dias, min), tipo, itemId,
      texto: 'item ' + itemId, contexto: pick(CTX), desde: '', hasta: '' }, extra));
  };
  for (let k = 0; k < 120; k++) {
    const id = 'i' + k;
    let dias = Math.floor(r() * 400), min = 0;
    const tipo = r() < 0.2 ? 'compra' : 'tarea';
    const it = { id, texto: 'item ' + id, contexto: pick(CTX), tipo, estado: 'entrada', nivel: pick(['baja', 'normal', 'importante']),
      creado: iso(dias), estadoDesde: iso(dias), rutinaId: r() < 0.2 ? 'r1' : '', ocurrencia: '' };
    if (it.rutinaId) { it.ocurrencia = C.claveDeIso(iso(dias)); }
    ev(dias, min++, 'captura', id);
    const pasos = 1 + Math.floor(r() * 7);
    for (let p = 0; p < pasos; p++) {
      if (r() < 0.3 && dias > 0) { dias = Math.max(0, dias - Math.floor(r() * 60)); min = 0; }
      const x = r();
      if (x < 0.3) { ev(dias, min++, pick(RUIDO), id, { hasta: 'algo' }); }
      else if (x < 0.55) { const h = pick(CIERRES); ev(dias, min++, 'estado', id, { desde: it.estado, hasta: h }); it.estado = h; it.estadoDesde = iso(dias, min); }
      else if (x < 0.7) { const h = pick(ABIERTOS); ev(dias, min++, 'estado', id, { desde: it.estado, hasta: h }); it.estado = h; }
      else if (x < 0.8) { const h = r() < 0.5 ? pick(CIERRES) : pick(ABIERTOS); ev(dias, min++, 'deshacer', id, { desde: 'estado', hasta: h }); it.estado = h; }
      else if (x < 0.88) { ev(dias, min++, 'excepcion', id, { hasta: r() < 0.5 ? 'delegada' : 'omitida' }); }
      else if (x < 0.93) { ev(dias, min++, 'vuelta', id, { desde: 'compra', hasta: 'pendiente' }); }
      else { ev(dias, min++, 'comentario', id, { hasta: 'nota' }); }
    }
    items.push(it);
  }
  for (let k = 0; k < 15; k++) {
    const dias = Math.floor(r() * 400);
    ev(dias, 30, pick(['hito', 'mision_alta', 'mision_fin', 'mision_reabre', 'rutina_alta', 'logro', 'nivel', 'restauracion', 'migracion', 'borrado']),
      'p' + k, { hasta: 'H' + k, desde: '50' });
  }
  // The real log is append-only, so it is ordered by time with ties in insertion order.
  eventos.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const proyectos = [C.normalizarProyecto({ id: 'pkco', nombre: 'KCO', objetivo: 'x', contexto: 'apps', estado: 'terminado',
    terminado: iso(300), creado: iso(330), hitos: [{ id: 'h1', texto: 'a', hecho: true, cuando: iso(310) }] })];
  return { eventos, items, proyectos, rutinas: [] };
}

function derivados(d) {
  const xp = C.calcularXP(d.items, d.proyectos);
  const st = C.estadisticas(d.items, d.proyectos, d.rutinas, HOY);
  const vistas = {};
  for (const contexto of ['todo'].concat(CTX)) {
    for (const desde of ['', iso(30), iso(180), iso(365)]) {
      vistas[contexto + '|' + desde] = C.diario(d.eventos, d.items, { desde, contexto });
    }
  }
  return {
    xp: xp.total,
    nivel: C.nivelPorXP(xp.total),
    logros: C.logrosNuevos(st, {}).map((l) => l.id),
    racha: C.rachaGlobal(d.items, d.proyectos, HOY),
    stats: st,
    diario: vistas
  };
}

test('compaction: derived XP, level, achievements, streaks, campaign and journal are identical', () => {
  for (const seed of [1, 7, 42, 2026, 99991]) {
    const d = sembrar(seed);
    const antes = derivados(d);
    const compactos = C.compactarEventos(d.eventos, CORTE);
    assert.ok(compactos.length < d.eventos.length, 'seed ' + seed + ': the log shrinks');
    const despues = derivados(Object.assign({}, d, { eventos: compactos }));
    assert.deepEqual(despues, antes, 'seed ' + seed + ': every derived view is unchanged');
  }
});

test('compaction: events appended after compaction read the same as on the full log', () => {
  const tipos = [['estado', 'completado'], ['estado', 'pendiente'], ['deshacer', 'completado'], ['deshacer', 'pendiente'],
    ['excepcion', 'delegada'], ['excepcion', 'omitida'], ['vuelta', 'pendiente']];
  for (const seed of [2, 8, 31]) {
    const d = sembrar(seed);
    const r = prng(seed + 1);
    const nuevos = [];
    for (let k = 0; k < 200; k++) {
      const [tipo, hasta] = tipos[Math.floor(r() * tipos.length)];
      nuevos.push({ id: 'n' + k, ts: iso(0, k), tipo, itemId: 'i' + Math.floor(r() * 120), texto: 'nuevo',
        contexto: 'trabajo', desde: '', hasta });
    }
    const completo = C.diario(d.eventos.concat(nuevos), d.items, {});
    const compacto = C.diario(C.compactarEventos(d.eventos, CORTE).concat(nuevos), d.items, {});
    assert.deepEqual(compacto, completo, 'seed ' + seed);
  }
});

test('compaction: idempotent and does not mutate its input', () => {
  const d = sembrar(5);
  const copia = JSON.parse(JSON.stringify(d.eventos));
  const una = C.compactarEventos(d.eventos, CORTE);
  assert.deepEqual(d.eventos, copia, 'input untouched');
  const dos = C.compactarEventos(una, CORTE);
  assert.deepEqual(dos, una, 'a second pass changes nothing');
});

test('compaction: recent events are all kept, old kept events are byte-identical', () => {
  const d = sembrar(11);
  const compactos = C.compactarEventos(d.eventos, CORTE);
  const porId = {};
  for (const e of compactos) porId[e.id] = e;
  for (const e of d.eventos) {
    if (e.ts >= CORTE) assert.deepEqual(porId[e.id], e, 'recent event kept as is');
    else if (porId[e.id]) assert.deepEqual(porId[e.id], e, 'old kept event unchanged');
  }
  for (const e of d.eventos) {
    if (e.ts < CORTE && ['hito', 'mision_alta', 'mision_fin', 'logro', 'nivel', 'comentario', 'restauracion'].indexOf(e.tipo) > -1) {
      assert.ok(porId[e.id], 'old journal material is never dropped: ' + e.tipo);
    }
  }
});

test('compaction: leaves one summary record readable as a plain event', () => {
  const d = sembrar(3);
  const compactos = C.compactarEventos(d.eventos, CORTE);
  const resumen = compactos.filter((e) => e.tipo === 'compactado');
  assert.equal(resumen.length, 1);
  const r = resumen[0];
  const quitados = d.eventos.length - (compactos.length - 1);
  assert.equal(r.texto, quitados + ' movimientos viejos resumidos');
  assert.ok(r.ts < CORTE);
  assert.equal(r.itemId, '');
  for (const k of ['id', 'ts', 'tipo', 'itemId', 'texto', 'contexto', 'desde', 'hasta']) {
    assert.equal(typeof r[k], 'string', k + ' is a string, like every stored event');
  }
  assert.ok(C.esClave(r.desde) && C.esClave(r.hasta) && r.desde <= r.hasta, 'summary covers a day range');
});

test('compaction: nothing old, nothing dropped, no summary', () => {
  const evs = [
    { id: 'a', ts: iso(10), tipo: 'captura', itemId: 'x', texto: 't', contexto: 'trabajo', desde: '', hasta: '' },
    { id: 'b', ts: iso(5), tipo: 'estado', itemId: 'x', texto: 't', contexto: 'trabajo', desde: 'entrada', hasta: 'completado' }
  ];
  assert.deepEqual(C.compactarEventos(evs, CORTE), evs);
  assert.deepEqual(C.compactarEventos([], CORTE), []);
});

test('compaction: unknown types and unreadable dates are never dropped', () => {
  const evs = [
    { id: 'a', ts: iso(300), tipo: 'algo_futuro', itemId: 'x', texto: 't', contexto: 'trabajo', desde: '', hasta: '' },
    { id: 'b', ts: 'no es fecha', tipo: 'captura', itemId: 'x', texto: 't', contexto: 'trabajo', desde: '', hasta: '' },
    { id: 'c', ts: iso(300), tipo: 'captura', itemId: 'y', texto: 't', contexto: 'trabajo', desde: '', hasta: '' },
    { id: 'd', ts: iso(299), tipo: 'edicion', itemId: 'y', texto: 't', contexto: 'trabajo', desde: '', hasta: '' }
  ];
  const ids = C.compactarEventos(evs, CORTE).map((e) => e.id);
  assert.ok(ids.indexOf('a') > -1 && ids.indexOf('b') > -1);
  assert.ok(ids.indexOf('c') === -1 && ids.indexOf('d') === -1);
});

test('compaction: the latest closure of an item survives, superseded ones go', () => {
  const e = (id, dias, tipo, hasta) => ({ id, ts: iso(dias), tipo, itemId: 'x', texto: 't', contexto: 'trabajo', desde: '', hasta });
  const evs = [e('1', 300, 'estado', 'completado'), e('2', 299, 'estado', 'pendiente'), e('3', 298, 'estado', 'completado'),
    e('4', 297, 'deshacer', 'completado')];
  const ids = C.compactarEventos(evs, CORTE).map((x) => x.id);
  assert.ok(ids.indexOf('3') > -1, 'the closure the journal shows is kept');
  assert.ok(ids.indexOf('1') === -1 && ids.indexOf('2') === -1);
});
