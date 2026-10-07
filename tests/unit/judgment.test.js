'use strict';
// Regressions for the Judgment Day ledger (odd/reviews/judgment-day-1f8a47e.md): L6, L7, L8, S3, S7.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

const HOY = '2026-10-07'; // Wednesday

let n = 0;
const ev = (ts, tipo, itemId, extra) => Object.assign({ id: 'e' + (++n), ts: new Date(ts).toISOString(), tipo, itemId,
  texto: 'item ' + itemId, contexto: 'trabajo', desde: '', hasta: '' }, extra);
const R = (o) => C.normalizarRutina(Object.assign({ id: 'r1', texto: 'Dar de comer a la gata', inicio: '2026-10-01' }, o), HOY);
const occ = (fecha, estado, motivo) => ({ id: 'o' + fecha, rutinaId: 'r1', ocurrencia: fecha, estado, motivo: motivo || '' });
const T = (o) => Object.assign({ id: 'i' + (++n), texto: 'tarea ' + n, contexto: 'trabajo', tipo: 'tarea', estado: 'completado',
  nivel: 'normal', creado: '2026-10-06T08:00:00.000Z', estadoDesde: '2026-10-07T10:00:00.000Z' }, o);

/* ---------- L6: diario ---------- */

test('L6 journal: undoing a reopen back to done closes the task again', () => {
  const evs = [
    ev('2026-10-05T10:00', 'estado', 'a', { desde: 'pendiente', hasta: 'completado' }),
    ev('2026-10-06T09:00', 'estado', 'a', { desde: 'completado', hasta: 'pendiente' }),
    ev('2026-10-06T09:01', 'deshacer', 'a', { desde: 'estado', hasta: 'completado' })
  ];
  const d = C.diario(evs, [{ id: 'a', tipo: 'tarea' }], {});
  assert.equal(d.length, 1);
  assert.equal(d[0].dia, '2026-10-06');
  assert.equal(d[0].cuenta.hechas, 1);
  assert.equal(d[0].entradas[0].itemId, 'a');
});

test('L6 journal: events with the same timestamp keep their recorded order', () => {
  const ts = '2026-10-06T09:00';
  const evs = [
    ev(ts, 'estado', 'a', { hasta: 'completado' }),
    ev(ts, 'estado', 'a', { hasta: 'pendiente' }),
    ev(ts, 'estado', 'b', { hasta: 'pendiente' }),
    ev(ts, 'estado', 'b', { hasta: 'completado' })
  ];
  const d = C.diario(evs, [], {});
  assert.deepEqual(d[0].entradas.map((e) => e.itemId), ['b']);
});

/* ---------- L7: recurrencia ---------- */

test('L7a long intervals are found past the old 800-day search limit', () => {
  const sem = R({ tipo: 'semana', dias: [1], cada: 200, inicio: '2026-01-05' });
  assert.equal(C.proximaFecha(sem, '2026-01-06'), C.sumarDias('2026-01-05', 1400));
  const mes = R({ tipo: 'mes', diaMes: 15, cada: 36, inicio: '2024-01-15' });
  assert.equal(C.ultimaFecha(mes, HOY), '2024-01-15');
  assert.equal(C.proximaFecha(mes, '2024-01-16'), '2027-01-15');
});

test('L7b paused routine closes its stale open occurrence, keeps today', () => {
  const r = R({ activa: false });
  const plan = C.planificarOcurrencias([r], [occ('2026-10-05', 'pendiente'), occ(HOY, 'pendiente')], HOY);
  assert.deepEqual(plan.vencer, ['o2026-10-05']);
  assert.equal(plan.crear.length, 0);
});

test('L7b ended routine closes its last open occurrence and creates nothing', () => {
  const r = R({ fin: '2026-10-05' });
  const plan = C.planificarOcurrencias([r], [occ('2026-10-05', 'pendiente')], HOY);
  assert.deepEqual(plan.vencer, ['o2026-10-05']);
  assert.equal(C.planificarOcurrencias([r], [], HOY).crear.length, 0, 'no past occurrence for an ended routine');
});

test('L7c desdeGeneracion: normalized, and no occurrence is created before it', () => {
  assert.equal(R({}).desdeGeneracion, '');
  assert.equal(R({ desdeGeneracion: 'nope' }).desdeGeneracion, '');
  assert.equal(R({ desdeGeneracion: HOY }).desdeGeneracion, HOY);
  const lunes = R({ tipo: 'semana', dias: [1], desdeGeneracion: HOY }); // due Monday 10-05
  assert.equal(C.planificarOcurrencias([lunes], [], HOY).crear.length, 0);
  const diaria = R({ desdeGeneracion: HOY });
  const plan = C.planificarOcurrencias([diaria], [], HOY);
  assert.equal(plan.crear.length, 1);
  assert.equal(plan.crear[0].fecha, HOY);
});

/* ---------- L8: XP de misiones e hitos ---------- */

const hitos = (k) => Array.from({ length: k }, (_, i) => ({ id: 'h' + i, texto: 'h' + i, hecho: true, cuando: '2026-10-0' + (1 + i) + 'T10:00:00.000Z' }));
const mision = (id, terminado) => ({ id, nombre: id, contexto: 'apps', estado: 'terminado', hitos: hitos(3),
  creado: '2026-09-01T00:00:00Z', terminado });

test('L8 only one full mission reward per day', () => {
  const a = mision('pa', '2026-10-07T10:00:00Z');
  const b = mision('pb', '2026-10-07T11:00:00Z');
  const c = mision('pc', '2026-10-08T11:00:00Z');
  const hitosXP = 3 * C.XP.hito * 3;
  assert.equal(C.calcularXP([], [a, b]).total, 3 * C.XP.hito * 2 + C.XP.mision + C.XP.misionLiviana);
  assert.equal(C.calcularXP([], [b, a, c]).total, hitosXP + 2 * C.XP.mision + C.XP.misionLiviana);
});

test('L8 a milestone completed minutes after creating it pays nothing', () => {
  const t0 = Date.parse('2026-10-07T10:00:00Z');
  const p = { id: 'p', nombre: 'P', contexto: 'apps', estado: 'activo', terminado: '', hitos: [
    { id: 'h' + t0 + '-123', texto: 'rapido', hecho: true, cuando: new Date(t0 + 60000).toISOString() },
    { id: 'h' + (t0 - 3600000) + '-9', texto: 'maduro', hecho: true, cuando: new Date(t0 + 60000).toISOString() },
    { id: 'h1', texto: 'legado', hecho: true, cuando: new Date(t0 + 60000).toISOString() }
  ] };
  assert.equal(C.calcularXP([], [p]).total, 2 * C.XP.hito);
});

/* ---------- S3 y S7 ---------- */

test('S3 a purchase logged and closed in under 2 minutes is a quick log', () => {
  assert.equal(C.xpItem(T({ tipo: 'compra', estado: 'recibido', creado: '2026-10-07T10:00:00.000Z', estadoDesde: '2026-10-07T10:01:00.000Z' })), C.XP.registroRapido);
  assert.equal(C.xpItem(T({ tipo: 'compra', contexto: 'hogar', estado: 'comprado', creado: '2026-10-07T10:00:00.000Z', estadoDesde: '2026-10-07T10:00:30.000Z' })), C.XP.registroRapido);
});

test('S7 xp is deterministic for ties: same result whatever the input order', () => {
  const ts = '2026-10-07T10:00:00.000Z';
  const list = [T({ id: 'a0', texto: 'casa', contexto: 'hogar', estadoDesde: ts })];
  for (let i = 1; i <= 20; i++) list.push(T({ id: 'b' + (i < 10 ? '0' + i : i), texto: 'trabajo ' + i, estadoDesde: ts }));
  const ida = C.calcularXP(list, []);
  const vuelta = C.calcularXP(list.slice().reverse(), []);
  assert.deepEqual(vuelta.porContexto, ida.porContexto);
  assert.equal(ida.porContexto['#hogar'], 10, 'lowest id is counted first');
});

test('L8 the age check reads ids in the exact format the app generates', () => {
  // Same expression as nuevoId('h') in kco-app.js.
  const nuevoId = (p) => (p || 'i') + Date.now() + '-' + Math.floor(Math.random() * 100000);
  const id = nuevoId('h');
  const t0 = parseInt(id.slice(1, id.indexOf('-')), 10);
  const hito = (cuando) => ({ id: 'p', nombre: 'P', contexto: 'apps', estado: 'activo', terminado: '',
    hitos: [{ id, texto: 'real', hecho: true, cuando: new Date(t0 + cuando).toISOString() }] });
  assert.equal(C.calcularXP([], [hito(60000)]).total, 0, 'ticked one minute after creating it');
  assert.equal(C.calcularXP([], [hito(11 * 60000)]).total, C.XP.hito, 'ticked eleven minutes later');
});
