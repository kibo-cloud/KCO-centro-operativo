'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

let n = 0;
const ev = (ts, tipo, itemId, extra) => Object.assign({ id: 'e' + (++n), ts: new Date(ts).toISOString(), tipo, itemId,
  texto: 'item ' + itemId, contexto: 'trabajo', desde: '', hasta: '' }, extra);

test('journal: only meaningful activity, grouped by day, newest first', () => {
  const evs = [
    ev(2026, 'captura', 'a'),
    ev('2026-10-06T10:00', 'estado', 'a', { desde: 'pendiente', hasta: 'completado' }),
    ev('2026-10-06T11:00', 'tag', 'a', { hasta: 'adm' }),
    ev('2026-10-07T09:00', 'hito', 'p1', { texto: 'KCO', hasta: 'QA', desde: '75' }),
    ev('2026-10-07T09:30', 'mision_fin', 'p1', { texto: 'KCO' })
  ];
  const d = C.diario(evs, [{ id: 'a', tipo: 'tarea' }], {});
  assert.equal(d.length, 2);
  assert.equal(d[0].dia, '2026-10-07');
  assert.deepEqual(d[0].entradas.map((e) => e.ico), ['🏁', '🎯']);
  assert.equal(d[0].entradas[1].sub, 'KCO · 75%');
  assert.equal(d[1].entradas.length, 1, 'tag change and capture are not journal material');
  assert.equal(d[1].cuenta.hechas, 1);
});

test('journal: a completion later reopened or undone is not claimed', () => {
  const evs = [
    ev('2026-10-05T10:00', 'estado', 'a', { hasta: 'completado' }),
    ev('2026-10-05T10:01', 'deshacer', 'a', { hasta: 'pendiente' }),
    ev('2026-10-05T12:00', 'estado', 'b', { hasta: 'completado' }),
    ev('2026-10-06T08:00', 'estado', 'b', { hasta: 'pendiente' }),
    ev('2026-10-07T08:00', 'estado', 'b', { hasta: 'completado' })
  ];
  const d = C.diario(evs, [], {});
  assert.equal(d.length, 1, 'only the last real completion of b');
  assert.equal(d[0].dia, '2026-10-07');
});

test('journal: routines and purchases are labelled; delegated counts', () => {
  const evs = [
    ev('2026-10-07T08:00', 'estado', 'r', { hasta: 'completado' }),
    ev('2026-10-07T09:00', 'excepcion', 'r2', { hasta: 'delegada' }),
    ev('2026-10-07T09:10', 'excepcion', 'r3', { hasta: 'omitida' }),
    ev('2026-10-07T10:00', 'estado', 'c', { hasta: 'recibido' })
  ];
  const items = [{ id: 'r', rutinaId: 'x' }, { id: 'r2', rutinaId: 'x' }, { id: 'r3', rutinaId: 'x' }, { id: 'c', tipo: 'compra' }];
  const [d] = C.diario(evs, items, {});
  assert.equal(d.cuenta.rutinas, 2);
  assert.equal(d.entradas.find((e) => e.itemId === 'c').sub, 'material recibido');
  assert.equal(d.entradas.find((e) => e.itemId === 'r2').sub, 'delegada');
  assert.ok(!d.entradas.some((e) => e.itemId === 'r3'), 'skipped is not an achievement');
});

test('journal: context filter keeps global achievements; range cuts old days', () => {
  const evs = [
    ev('2026-10-01T10:00', 'estado', 'a', { hasta: 'completado' }),
    ev('2026-10-07T10:00', 'estado', 'h', { hasta: 'completado', contexto: 'hogar' }),
    ev('2026-10-07T11:00', 'logro', '', { hasta: 'Primer paso', contexto: 'hogar' })
  ];
  const d = C.diario(evs, [], { contexto: 'trabajo', desde: new Date('2026-10-03').toISOString() });
  assert.equal(d.length, 1);
  assert.equal(d[0].entradas.length, 1);
  assert.equal(d[0].entradas[0].clase, 'logro');
});
