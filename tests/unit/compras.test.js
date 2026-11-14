'use strict';
/* Compras v2: Reabrir a closed factory purchase goes back to the stage it had
   before closing, read from the event log (KCOCore.estadoAntesDeCerrar). */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

const ABIERTAS = ['cotizando', 'esperando_oc', 'esperando_aprob', 'oc_enviada', 'esperando_entrega'];
const ev = (itemId, tipo, desde, hasta) => ({ id: 'e' + Math.random(), ts: '2026-11-01T12:00:00.000Z', tipo, itemId, texto: 'x', contexto: 'taller', desde, hasta });

test('compras reabrir: the stage before the last close of that item', () => {
  const log = [
    ev('A', 'captura', '', 'cotizando'),
    ev('A', 'estado', 'cotizando', 'esperando_oc'),
    ev('B', 'estado', 'oc_enviada', 'cancelado'),
    ev('A', 'estado', 'esperando_oc', 'cancelado')
  ];
  assert.equal(C.estadoAntesDeCerrar(log, 'A', 'cancelado', ABIERTAS), 'esperando_oc');
  assert.equal(C.estadoAntesDeCerrar(log, 'B', 'cancelado', ABIERTAS), 'oc_enviada');
});

test('compras reabrir: closed, reopened, moved on and closed again reads the latest close', () => {
  const log = [
    ev('A', 'estado', 'esperando_oc', 'cancelado'),
    ev('A', 'estado', 'cancelado', 'esperando_oc'),
    ev('A', 'estado', 'esperando_oc', 'esperando_aprob'),
    ev('A', 'estado', 'esperando_aprob', 'cancelado')
  ];
  assert.equal(C.estadoAntesDeCerrar(log, 'A', 'cancelado', ABIERTAS), 'esperando_aprob');
});

test('compras reabrir: an undo back to the closed state does not hide the original close', () => {
  const log = [
    ev('A', 'estado', 'oc_enviada', 'cancelado'),
    ev('A', 'estado', 'cancelado', 'oc_enviada'),
    ev('A', 'deshacer', 'Cotizando: x', 'cancelado')
  ];
  assert.equal(C.estadoAntesDeCerrar(log, 'A', 'cancelado', ABIERTAS), 'oc_enviada');
});

test('compras reabrir: received ones read their own close; no data or a non-stage gives an empty answer', () => {
  const log = [ev('A', 'estado', 'esperando_entrega', 'recibido'), ev('C', 'estado', 'por_comprar', 'cancelado')];
  assert.equal(C.estadoAntesDeCerrar(log, 'A', 'recibido', ABIERTAS), 'esperando_entrega');
  assert.equal(C.estadoAntesDeCerrar(log, 'A', 'cancelado', ABIERTAS), '', 'it was never cancelled');
  assert.equal(C.estadoAntesDeCerrar(log, 'C', 'cancelado', ABIERTAS), '', 'not a factory stage');
  assert.equal(C.estadoAntesDeCerrar([], 'A', 'recibido', ABIERTAS), '');
  assert.equal(C.estadoAntesDeCerrar(null, 'A', 'recibido', ABIERTAS), '');
  assert.equal(C.estadoAntesDeCerrar([null, {}], 'A', 'recibido', ABIERTAS), '');
});
