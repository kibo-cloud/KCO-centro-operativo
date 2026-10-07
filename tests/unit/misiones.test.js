'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

const HOY = '2026-10-07';
const AHORA = new Date(2026, 9, 7, 10).getTime();
const P = (o) => C.normalizarProyecto(Object.assign({ id: 'p1', nombre: 'TU GASTO - ALFA' }, o));
const T = (o) => Object.assign({ id: 't' + Math.random(), texto: 't', proyectoId: 'p1', tipo: 'tarea', contexto: 'apps',
  estado: 'pendiente', creado: new Date(2026, 9, 1).toISOString() }, o);

test('normalize: needs id and name; sanitizes milestones', () => {
  assert.equal(C.normalizarProyecto({ id: 'p', nombre: '  ' }), null);
  assert.equal(C.normalizarProyecto({ id: '../x', nombre: 'a' }), null);
  const p = P({ estado: 'raro', hitos: [{ id: 'a', texto: 'Auditoria', hecho: true, cuando: 'x' }, { texto: '' }, 'junk', { id: 'a', texto: 'Dup id' }] });
  assert.equal(p.estado, 'activo');
  assert.equal(p.hitos.length, 2);
  assert.notEqual(p.hitos[1].id, 'a', 'duplicate milestone ids are re-keyed');
  assert.equal(p.terminado, '');
});

test('progress: milestones define the shape when present', () => {
  const p = P({ hitos: [{ id: 'a', texto: 'Auditoria', hecho: true }, { id: 'b', texto: 'QA', hecho: true },
    { id: 'c', texto: 'Release' }, { id: 'd', texto: 'Validacion' }] });
  const pr = C.progresoProyecto(p, [T({ estado: 'completado' }), T({})]);
  assert.equal(pr.pct, 50);
  assert.equal(pr.tareasHechas, 1);
});

test('progress: falls back to tasks, ignores cancelled; finished is 100', () => {
  const p = P({});
  assert.equal(C.progresoProyecto(p, [T({ estado: 'completado' }), T({}), T({ estado: 'cancelado' })]).pct, 50);
  assert.equal(C.progresoProyecto(p, []).pct, 0);
  assert.equal(C.progresoProyecto(P({ estado: 'terminado' }), []).pct, 100);
});

test('next action: the best actionable task, with its reason', () => {
  const p = P({ hitos: [{ id: 'a', texto: 'Preparar release' }] });
  const a = C.proximaAccion(p, [T({ texto: 'menor' }), T({ texto: 'Revisar resultado del audit', estado: 'proceso' })], HOY, AHORA);
  assert.equal(a.tipo, 'tarea');
  assert.equal(a.item.texto, 'Revisar resultado del audit');
  assert.equal(a.motivo, 'En proceso');
});

test('next action: no actionable task -> next pending milestone', () => {
  const p = P({ hitos: [{ id: 'a', texto: 'Auditoria', hecho: true }, { id: 'b', texto: 'Preparar release' }] });
  const a = C.proximaAccion(p, [T({ estado: 'esperando' })], HOY, AHORA);
  assert.equal(a.tipo, 'hito');
  assert.equal(a.hito.texto, 'Preparar release');
});

test('next action: only waiting work left -> shows what it waits on; nothing -> null', () => {
  const p = P({});
  assert.equal(C.proximaAccion(p, [T({ estado: 'esperando', texto: 'feedback' })], HOY, AHORA).tipo, 'espera');
  assert.equal(C.proximaAccion(p, [], HOY, AHORA), null);
});
