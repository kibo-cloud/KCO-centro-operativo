'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

const NOW = new Date(2026, 9, 7, 10, 0);

test('capture chips: the summary carries exactly what parsearCaptura stores', () => {
  const entrada = 'pagar luz #casa !! mañana';
  const r = C.resumenCaptura(entrada, NOW);
  const p = C.parsearCaptura(entrada, NOW);
  assert.equal(r.texto, p.texto);
  assert.equal(r.contexto, p.contexto);
  assert.equal(r.nivel, p.nivel);
  assert.equal(r.fecha, p.fecha);
  assert.equal(r.recordatorio, p.recordatorio);
  assert.equal(r.contexto, 'hogar');
  assert.equal(r.nivel, 'urgente');
  assert.equal(r.dia, 'Mañana');
});

test('capture chips: day label for date words and reminders', () => {
  assert.equal(C.resumenCaptura('pagar luz hoy', NOW).dia, 'Hoy');
  assert.equal(C.resumenCaptura('reunion 18:00', NOW).dia, 'Hoy 18:00');
  assert.equal(C.resumenCaptura('llamar @9:30', NOW).dia, 'Mañana 09:30', 'past time rolls to tomorrow');
  assert.equal(C.resumenCaptura('turno @9:30 mañana', NOW).dia, 'Mañana 09:30');
  assert.equal(C.resumenCaptura('escala 1:50', NOW).dia, '');
  assert.equal(C.resumenCaptura('18:00', NOW).dia, '', 'time alone is not a task, so no chip');
});

test('capture chips: nothing detected gives empty fields', () => {
  const r = C.resumenCaptura('ver #hashtag raro', NOW);
  assert.equal(r.contexto, '');
  assert.equal(r.nivel, '');
  assert.equal(r.dia, '');
  assert.equal(C.resumenCaptura('', NOW).dia, '');
});

test('capture target: quitarContextoCaptura removes only a known context tag', () => {
  assert.equal(C.quitarContextoCaptura('barrer #casa patio'), 'barrer patio');
  assert.equal(C.quitarContextoCaptura('#apps fix login !'), 'fix login !');
  assert.equal(C.quitarContextoCaptura('editar video #contenido'), 'editar video');
  assert.equal(C.quitarContextoCaptura('ver #hashtag raro'), 'ver #hashtag raro');
  assert.equal(C.quitarContextoCaptura('sin etiqueta'), 'sin etiqueta');
  // After removing it the parser no longer sees a context.
  assert.equal(C.parsearCaptura(C.quitarContextoCaptura('barrer #casa'), NOW).contexto, '');
});
