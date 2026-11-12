'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

const HOY = '2026-10-07';
const AHORA = new Date(2026, 9, 7, 10, 0).getTime();
const item = (o) => Object.assign({ id: 'x', texto: 't', contexto: 'trabajo', tipo: 'tarea', estado: 'pendiente',
  creado: new Date(2026, 9, 7, 9, 0).toISOString(), recordatorio: '', fecha: '' }, o);

test('contexts: in the legacy seed only Trabajo runs the factory purchase flow', () => {
  assert.equal(C.esFabrica('trabajo'), true);
  assert.equal(C.modoCompras('trabajo'), 'fabrica');
  for (const c of ['hogar', 'apps', 'contenido', 'personal']) {
    assert.equal(C.esFabrica(c), false);
    assert.equal(C.modoCompras(c), 'lista');
  }
  // 'trabajo' only because it is the first legacy section.
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

test('approval: a purchase waiting for approval is never attention, whatever its level, date or reminder', () => {
  const aprob = (o) => item(Object.assign({ tipo: 'compra', estado: 'esperando_aprob' }, o));
  const vencido = new Date(2026, 9, 7, 8).toISOString();
  assert.equal(C.esperaAprobacion(aprob()), true);
  assert.equal(C.esperaAprobacion(item({ tipo: 'compra', estado: 'esperando_oc' })), false);
  assert.equal(C.esperaAprobacion(item({ estado: 'esperando' })), false, 'a waiting task is not an approval');
  assert.equal(C.esperaAprobacion(null), false);
  assert.equal(C.situacion(aprob(), HOY, AHORA), 'esperando');
  assert.equal(C.situacion(aprob({ nivel: 'urgente' }), HOY, AHORA), 'esperando');
  assert.equal(C.situacion(aprob({ fecha: '2026-10-01' }), HOY, AHORA), 'esperando');
  assert.equal(C.situacion(aprob({ recordatorio: vencido }), HOY, AHORA), 'esperando');
  assert.equal(C.situacion(aprob({ fecha: '2026-10-20' }), HOY, AHORA), 'esperando', 'a future day does not move it out of waiting');
  assert.equal(C.situacion(aprob({ nivel: 'urgente', fecha: '2026-10-01', recordatorio: vencido, anclado: true }), HOY, AHORA), 'esperando');
  // Never proposed as the next move.
  assert.equal(C.puntaje(aprob({ nivel: 'urgente', fecha: '2026-10-01' }), HOY, AHORA), null);
  const r = C.priorizar([aprob({ id: 'ap', nivel: 'urgente', fecha: '2026-10-01' }), item({ id: 'plain' })], HOY, AHORA);
  assert.deepEqual(r.map((x) => x.item.id), ['plain']);
  // The other waiting stages and waiting tasks keep their rules.
  assert.equal(C.situacion(item({ tipo: 'compra', estado: 'esperando_oc', nivel: 'urgente' }), HOY, AHORA), 'atencion');
  assert.equal(C.situacion(item({ tipo: 'compra', estado: 'oc_enviada', fecha: '2026-10-01' }), HOY, AHORA), 'atencion');
  assert.equal(C.situacion(item({ estado: 'esperando', nivel: 'urgente' }), HOY, AHORA), 'atencion');
  // A day that already passed is only "overdue" when the owner can act on it.
  assert.equal(C.vencido(item({ fecha: '2026-10-06' }), HOY), true);
  assert.equal(C.vencido(aprob({ fecha: '2026-10-06' }), HOY), false);
  assert.equal(C.vencido(item({ fecha: HOY }), HOY), false);
  assert.equal(C.vencido(item({ fecha: '2026-10-06', estado: 'completado' }), HOY), false);
});

test('list order (Automatic): approval purchases sink below every other open item, even pinned or urgent', () => {
  const t = (h) => new Date(2026, 9, 7, h, 0).toISOString();
  const lista = [
    item({ id: 'apUrg', tipo: 'compra', estado: 'esperando_aprob', nivel: 'urgente', anclado: true, creado: t(9) }),
    item({ id: 'low', tipo: 'compra', estado: 'cotizando', nivel: 'baja', creado: t(1) }),
    item({ id: 'apNorm', tipo: 'compra', estado: 'esperando_aprob', creado: t(8) }),
    item({ id: 'oc', tipo: 'compra', estado: 'esperando_oc', creado: t(2) }),
    item({ id: 'pin', tipo: 'compra', estado: 'cotizando', anclado: true, creado: t(3) }),
    item({ id: 'urg', tipo: 'compra', estado: 'oc_enviada', nivel: 'urgente', creado: t(4) })
  ];
  const copia = lista.slice();
  assert.deepEqual(C.ordenarLista(lista).map((x) => x.id), ['pin', 'urg', 'oc', 'low', 'apUrg', 'apNorm']);
  assert.deepEqual(lista, copia, 'the input is not reordered');
  // Among themselves approvals keep the usual order: pinned, level, newest first.
  const dos = [
    item({ id: 'a1', tipo: 'compra', estado: 'esperando_aprob', creado: t(1) }),
    item({ id: 'a2', tipo: 'compra', estado: 'esperando_aprob', creado: t(2) }),
    item({ id: 'a3', tipo: 'compra', estado: 'esperando_aprob', nivel: 'importante', creado: t(0) })
  ];
  assert.deepEqual(C.ordenarLista(dos).map((x) => x.id), ['a3', 'a2', 'a1']);
  assert.deepEqual(C.ordenarLista([]), []);
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
