'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

const HOY = '2026-10-07';
const AHORA = new Date(2026, 9, 7, 10, 0).getTime();
const item = (o) => Object.assign({ id: 'x', texto: 't', contexto: 'trabajo', tipo: 'tarea', estado: 'pendiente',
  creado: new Date(2026, 9, 7, 9, 0).toISOString(), recordatorio: '', fecha: '' }, o);

test('contexts: only Trabajo runs the factory purchase flow', () => {
  assert.equal(C.esFabrica('trabajo'), true);
  for (const c of ['hogar', 'apps', 'contenido', 'personal']) assert.equal(C.esFabrica(c), false);
  assert.equal(C.normalizarContexto('marte'), 'trabajo');
  assert.equal(C.infoContexto('hogar').nom, 'Casa');
});

test('priority: legacy boolean maps to urgent, explicit level wins', () => {
  assert.equal(C.nivelDe({ prioridad: true }), 'urgente');
  assert.equal(C.nivelDe({ prioridad: false }), 'normal');
  assert.equal(C.nivelDe({ prioridad: true, nivel: 'baja' }), 'baja');
  assert.equal(C.nivelDe({ nivel: 'bogus' }), 'normal');
});

test('situation: each of the five states has real triggers', () => {
  assert.equal(C.situacion(item({ estado: 'completado' }), HOY, AHORA), 'hecho');
  assert.equal(C.situacion(item({ estado: 'comprado', tipo: 'compra', contexto: 'hogar' }), HOY, AHORA), 'hecho');
  assert.equal(C.situacion(item({ estado: 'cancelado' }), HOY, AHORA), 'cancelado');
  assert.equal(C.situacion(item({ fecha: '2026-10-06' }), HOY, AHORA), 'atencion');
  assert.equal(C.situacion(item({ nivel: 'urgente' }), HOY, AHORA), 'atencion');
  assert.equal(C.situacion(item({ recordatorio: new Date(2026, 9, 7, 8).toISOString() }), HOY, AHORA), 'atencion');
  assert.equal(C.situacion(item({ estado: 'esperando' }), HOY, AHORA), 'esperando');
  assert.equal(C.situacion(item({ tipo: 'compra', estado: 'oc_enviada' }), HOY, AHORA), 'esperando');
  assert.equal(C.situacion(item({ fecha: '2026-10-09' }), HOY, AHORA), 'programado');
  assert.equal(C.situacion(item({ fecha: HOY }), HOY, AHORA), 'proximo');
  assert.equal(C.situacion(item({}), HOY, AHORA), 'proximo');
});

test('situation: +48h factory delivery needs attention, unless paused', () => {
  const desde = new Date(AHORA - 50 * 3600000).toISOString();
  const c = item({ tipo: 'compra', estado: 'esperando_entrega', estadoDesde: desde });
  assert.equal(C.situacion(c, HOY, AHORA), 'atencion');
  assert.equal(C.situacion(Object.assign({}, c, { pausado: true }), HOY, AHORA), 'esperando');
});

test('next move: overdue and urgent beat plain pending; waiting is never proposed', () => {
  const lista = [
    item({ id: 'plain' }),
    item({ id: 'wait', estado: 'esperando' }),
    item({ id: 'future', fecha: '2026-10-20' }),
    item({ id: 'today', fecha: HOY }),
    item({ id: 'urgent', nivel: 'urgente' }),
    item({ id: 'late', fecha: '2026-10-01' }),
    item({ id: 'done', estado: 'completado' })
  ];
  const r = C.priorizar(lista, HOY, AHORA);
  assert.deepEqual(r.map((x) => x.item.id), ['urgent', 'late', 'today', 'plain']);
  assert.equal(r[1].motivo, 'Vencida hace 6 d');
  assert.equal(r[2].motivo, 'Para hoy');
});

test('next move: low priority sinks below normal', () => {
  const r = C.priorizar([item({ id: 'low', nivel: 'baja' }), item({ id: 'n' })], HOY, AHORA);
  assert.deepEqual(r.map((x) => x.item.id), ['n', 'low']);
});

test('capture: legacy time rules unchanged', () => {
  const now = new Date(2026, 9, 7, 10, 0);
  let p = C.parsearCaptura('llamar proveedor @9:30', now);
  assert.equal(p.texto, 'llamar proveedor');
  assert.equal(new Date(p.recordatorio).getDate(), 8, 'past time goes to tomorrow');
  p = C.parsearCaptura('presion 3.50', now);
  assert.equal(p.recordatorio, '');
  p = C.parsearCaptura('escala 1:50', now);
  assert.equal(p.recordatorio, '');
  assert.equal(p.texto, 'escala 1:50');
  p = C.parsearCaptura('reunion 18:00', now);
  assert.equal(new Date(p.recordatorio).getHours(), 18);
  assert.equal(new Date(p.recordatorio).getDate(), 7);
  p = C.parsearCaptura('turno 10:30 hoy medico', now);
  assert.equal(p.texto, 'turno medico');
  p = C.parsearCaptura('18:00', now);
  assert.equal(p.recordatorio, '', 'time alone is not a task');
  assert.equal(p.texto, '18:00');
});

test('capture: date words, context tags and priority marks', () => {
  const now = new Date(2026, 9, 7, 10, 0);
  let p = C.parsearCaptura('comprar pan mañana', now);
  assert.equal(p.texto, 'comprar pan');
  assert.equal(p.fecha, '2026-10-08');
  p = C.parsearCaptura('pagar luz hoy', now);
  assert.equal(p.fecha, HOY);
  p = C.parsearCaptura('rutina de mañana temprano', now);
  assert.equal(p.fecha, '', 'only as last word');
  p = C.parsearCaptura('mañana', now);
  assert.equal(p.fecha, '');
  assert.equal(p.texto, 'mañana');
  p = C.parsearCaptura('editar video #contenido !!', now);
  assert.equal(p.texto, 'editar video');
  assert.equal(p.contexto, 'contenido');
  assert.equal(p.nivel, 'urgente');
  p = C.parsearCaptura('#casa barrer !', now);
  assert.equal(p.contexto, 'hogar');
  assert.equal(p.nivel, 'importante');
  p = C.parsearCaptura('ver #hashtag raro', now);
  assert.equal(p.contexto, '');
  assert.equal(p.texto, 'ver #hashtag raro');
});
