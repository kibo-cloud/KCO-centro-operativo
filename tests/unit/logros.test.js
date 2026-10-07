'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

const HOY = '2026-10-07';
const at = (k, h) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), h || 12).toISOString();
let n = 0;
const done = (k, o) => Object.assign({ id: 'i' + (++n), texto: 't' + n, contexto: 'trabajo', tipo: 'tarea', estado: 'completado',
  nivel: 'normal', creado: at(C.sumarDias(k, -1)), estadoDesde: at(k) }, o);

test('streak: consecutive active days; today not done yet keeps it alive', () => {
  const items = [done('2026-10-04'), done('2026-10-05'), done('2026-10-06')];
  const r = C.rachaGlobal(items, [], HOY);
  assert.equal(r.actual, 3);
  assert.equal(r.hoyActivo, false);
  assert.equal(C.rachaGlobal(items.concat([done(HOY)]), [], HOY).actual, 4);
});

test('streak: a missed day resets current but not best nor total active days', () => {
  const items = [done('2026-09-20'), done('2026-09-21'), done('2026-09-22'), done('2026-10-06')];
  const r = C.rachaGlobal(items, [], HOY);
  assert.equal(r.actual, 1);
  assert.equal(r.mejor, 3);
  assert.equal(r.diasActivos, 4);
  assert.equal(r.primerDia, '2026-09-20');
  assert.equal(C.rachaGlobal([done('2026-10-01')], [], HOY).actual, 0);
});

test('streak: milestones and finished missions count as progress days', () => {
  const p = { id: 'p', nombre: 'P', contexto: 'apps', estado: 'terminado', terminado: at('2026-10-06'),
    hitos: [{ id: 'h', texto: 'x', hecho: true, cuando: at('2026-10-05') }] };
  assert.equal(C.rachaGlobal([], [p], HOY).actual, 2);
});

test('stats: separates tasks, routines and purchases; counts balance across contexts', () => {
  const items = [
    done(HOY), done(HOY, { rutinaId: 'r', ocurrencia: HOY }), done(HOY, { tipo: 'compra', estado: 'recibido' }),
    { id: 'in', tipo: 'tarea', estado: 'entrada', contexto: 'apps' }
  ];
  for (const c of ['hogar', 'apps', 'personal']) for (let i = 0; i < 5; i++) items.push(done(HOY, { contexto: c }));
  const s = C.estadisticas(items, [], [], HOY);
  assert.equal(s.tareasHechas, 16);
  assert.equal(s.rutinasHechas, 1);
  assert.equal(s.comprasHechas, 1);
  assert.equal(s.inboxAbierto, 1);
  assert.equal(s.contextosEquilibrio, 3);
  assert.equal(s.semanas.length, 12);
  assert.equal(s.semanas[11].avances, 18);
});

test('achievements: thresholds unlock once; secret ones exist; unlocked ones are not re-reported', () => {
  const items = [done(HOY, { creado: at('2026-08-01'), estadoDesde: at(HOY, 6) })];
  const s = C.estadisticas(items, [], [], HOY);
  const ids = C.logrosNuevos(s, {}).map((l) => l.id);
  assert.ok(ids.includes('primer_paso'));
  assert.ok(ids.includes('retomaste'), 'old task finally done');
  assert.ok(ids.includes('madrugador'), 'done at 06:00');
  assert.ok(!ids.includes('en_marcha'));
  assert.deepEqual(C.logrosNuevos(s, { primer_paso: 'x', retomaste: 'x', madrugador: 'x' }), []);
  assert.ok(C.LOGROS.some((l) => l.secreto));
});

test('achievements: Primera Alfa and great milestone come from missions', () => {
  const hitos = Array.from({ length: 5 }, (_, i) => ({ id: 'h' + i, texto: i === 4 ? 'Release Alfa' : 'h' + i, hecho: true, cuando: at(HOY) }));
  const p = { id: 'p', nombre: 'TU GASTO', contexto: 'apps', estado: 'terminado', terminado: at(HOY), hitos };
  const ids = C.logrosNuevos(C.estadisticas([], [p], [], HOY), {}).map((l) => l.id);
  assert.ok(ids.includes('primera_alfa'));
  assert.ok(ids.includes('gran_hito'));
  assert.ok(ids.includes('primera_mision'));
  assert.ok(!C.logrosNuevos(C.estadisticas([], [Object.assign({}, p, { hitos: [{ id: 'z', texto: 'alfabeto', hecho: true, cuando: at(HOY) }], nombre: 'X' })], [], HOY), {})
    .some((l) => l.id === 'primera_alfa'), 'word match, not substring');
});
