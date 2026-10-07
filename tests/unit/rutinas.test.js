'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

const HOY = '2026-10-07'; // Wednesday
const R = (o) => C.normalizarRutina(Object.assign({ id: 'r1', texto: 'Dar de comer a la gata', inicio: '2026-10-01' }, o), HOY);
const occ = (fecha, estado, motivo) => ({ id: 'o' + fecha, rutinaId: 'r1', ocurrencia: fecha, estado, motivo: motivo || '' });

test('normalize: rejects junk, fills safe defaults', () => {
  assert.equal(C.normalizarRutina(null, HOY), null);
  assert.equal(C.normalizarRutina({ id: 'r1', texto: '   ' }, HOY), null);
  assert.equal(C.normalizarRutina({ id: '<x>', texto: 'a' }, HOY), null);
  const r = C.normalizarRutina({ id: 'r1', texto: 'a', cada: 'abc', tipo: 'weird', dias: [9, 1, 1, 'x'] }, HOY);
  assert.equal(r.tipo, 'dias');
  assert.equal(r.cada, 1);
  assert.equal(r.inicio, HOY);
  assert.deepEqual(r.dias, [1]);
  assert.equal(r.activa, true);
  assert.equal(C.normalizarRutina({ id: 'r', texto: 'a', tipo: 'semana', inicio: HOY }, HOY).dias[0], 3, 'weekly defaults to start weekday');
});

test('daily and every-N-days', () => {
  const d = R({});
  assert.equal(C.tocaEnDia(d, '2026-09-30'), false, 'before start');
  assert.equal(C.tocaEnDia(d, HOY), true);
  const n3 = R({ cada: 3 });
  assert.deepEqual(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-07'].map((k) => C.tocaEnDia(n3, k)), [true, false, true, true]);
  assert.equal(C.proximaFecha(n3, '2026-10-08'), '2026-10-10');
  assert.equal(C.ultimaFecha(n3, '2026-10-09'), '2026-10-07');
});

test('specific weekdays, and every two weeks', () => {
  const lmv = R({ tipo: 'semana', dias: [1, 3, 5] });
  assert.equal(C.tocaEnDia(lmv, '2026-10-05'), true); // Mon
  assert.equal(C.tocaEnDia(lmv, '2026-10-06'), false); // Tue
  assert.equal(C.proximaFecha(lmv, '2026-10-08'), '2026-10-09'); // Fri
  assert.equal(C.describirRutina(lmv), 'Cada semana: Lun, Mie, Vie');
  const q = R({ tipo: 'semana', dias: [4], cada: 2 }); // Thursdays, biweekly from week of Oct 1
  assert.equal(C.tocaEnDia(q, '2026-10-01'), true);
  assert.equal(C.tocaEnDia(q, '2026-10-08'), false);
  assert.equal(C.tocaEnDia(q, '2026-10-15'), true);
});

test('monthly clamps day 31 to the last day of short months', () => {
  const m = R({ tipo: 'mes', diaMes: 31, inicio: '2026-01-31' });
  assert.equal(C.tocaEnDia(m, '2026-02-28'), true);
  assert.equal(C.tocaEnDia(m, '2026-04-30'), true);
  assert.equal(C.tocaEnDia(m, '2026-05-31'), true);
  assert.equal(C.tocaEnDia(m, '2026-05-30'), false);
  const each2 = R({ tipo: 'mes', diaMes: 15, cada: 2, inicio: '2026-01-15' });
  assert.equal(C.tocaEnDia(each2, '2026-02-15'), false);
  assert.equal(C.tocaEnDia(each2, '2026-03-15'), true);
  assert.equal(C.describirRutina(each2), 'Cada 2 meses el dia 15');
});

test('end date stops the routine', () => {
  const r = R({ fin: '2026-10-05' });
  assert.equal(C.tocaEnDia(r, '2026-10-06'), false);
  assert.equal(C.ultimaFecha(r, HOY), '2026-10-05');
  assert.equal(C.proximaFecha(r, HOY), '');
});

test('plan: creates only the latest due occurrence, never a backlog', () => {
  const plan = C.planificarOcurrencias([R({})], [], HOY);
  assert.equal(plan.crear.length, 1);
  assert.equal(plan.crear[0].fecha, HOY);
});

test('plan: idempotent once today exists', () => {
  const plan = C.planificarOcurrencias([R({})], [occ(HOY, 'pendiente')], HOY);
  assert.equal(plan.crear.length, 0);
  assert.equal(plan.vencer.length, 0);
});

test('plan: an older open occurrence is closed as unrecorded, history kept', () => {
  const plan = C.planificarOcurrencias([R({})], [occ('2026-10-06', 'pendiente'), occ('2026-10-05', 'completado')], HOY);
  assert.deepEqual(plan.vencer, ['o2026-10-06']);
  assert.equal(plan.crear[0].fecha, HOY);
});

test('plan: inactive routines and routines not due yet generate nothing', () => {
  assert.equal(C.planificarOcurrencias([R({ activa: false })], [], HOY).crear.length, 0);
  assert.equal(C.planificarOcurrencias([R({ inicio: '2026-10-20' })], [], HOY).crear.length, 0);
});

test('streak: done and delegated count, not-applicable is neutral, skip breaks', () => {
  const items = [
    occ('2026-10-01', 'completado'),
    occ('2026-10-02', 'cancelado', 'omitida'),
    occ('2026-10-03', 'completado'),
    occ('2026-10-04', 'completado', 'delegada'),
    occ('2026-10-05', 'cancelado', 'no_corresponde'),
    occ('2026-10-06', 'completado'),
    occ(HOY, 'pendiente')
  ];
  const s = C.rachaRutina(R({}), items, HOY);
  assert.equal(s.actual, 3, 'today still open does not break it');
  assert.equal(s.mejor, 3);
  assert.equal(s.hechas, 4);
});

test('streak: an unrecorded (expired) day resets the current streak', () => {
  const items = [occ('2026-10-05', 'completado'), occ('2026-10-06', 'cancelado', 'vencida'), occ(HOY, 'completado')];
  const s = C.rachaRutina(R({}), items, HOY);
  assert.equal(s.actual, 1);
  assert.equal(s.mejor, 1);
});
