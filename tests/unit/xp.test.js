'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

let n = 0;
const T = (o) => Object.assign({ id: 'i' + (++n), texto: 'tarea ' + n, contexto: 'trabajo', tipo: 'tarea', estado: 'completado',
  nivel: 'normal', creado: '2026-10-06T08:00:00.000Z', estadoDesde: '2026-10-07T10:00:00.000Z' }, o);

test('xp: rewards by importance, urgency labels pay no extra', () => {
  assert.equal(C.xpItem(T({})), 10);
  assert.equal(C.xpItem(T({ nivel: 'baja' })), 5);
  assert.equal(C.xpItem(T({ nivel: 'importante' })), 25);
  assert.equal(C.xpItem(T({ nivel: 'urgente' })), 25);
  assert.equal(C.xpItem(T({ estado: 'pendiente' })), 0);
  assert.equal(C.xpItem(T({ estado: 'cancelado' })), 0);
});

test('xp: create-and-complete instantly is a quick log, delegated work is not yours', () => {
  assert.equal(C.xpItem(T({ nivel: 'importante', creado: '2026-10-07T10:00:00.000Z', estadoDesde: '2026-10-07T10:01:00.000Z' })), 2);
  assert.equal(C.xpItem(T({ motivo: 'delegada' })), 0);
});

test('xp: routines and purchases', () => {
  assert.equal(C.xpItem(T({ rutinaId: 'r', ocurrencia: '2026-10-07' })), 5);
  assert.equal(C.xpItem(T({ rutinaId: 'r', ocurrencia: '2026-10-07', motivo: 'delegada' })), 2);
  assert.equal(C.xpItem(T({ tipo: 'compra', estado: 'recibido' })), 15);
  assert.equal(C.xpItem(T({ tipo: 'compra', contexto: 'hogar', estado: 'comprado' })), 5);
});

test('anti-farming: duplicates of the same day count once; daily cap on small stuff', () => {
  const dup = [T({ texto: 'Lavar platos' }), T({ texto: 'lavar  platos' })];
  assert.equal(C.calcularXP(dup, []).total, 10);
  const spam = [];
  for (let i = 0; i < 60; i++) spam.push(T({}));
  const r = C.calcularXP(spam, []);
  assert.equal(r.total, C.XP.topeDiarioChico);
  const otherDay = spam.concat([T({ estadoDesde: '2026-10-08T10:00:00.000Z' })]);
  assert.equal(C.calcularXP(otherDay, []).total, C.XP.topeDiarioChico + 10, 'cap is per day');
});

test('xp is derived: reopening removes it, recompleting does not double it', () => {
  const a = T({});
  assert.equal(C.calcularXP([a], []).total, 10);
  a.estado = 'pendiente';
  assert.equal(C.calcularXP([a], []).total, 0);
  a.estado = 'completado';
  assert.equal(C.calcularXP([a], []).total, 10);
});

test('milestones and missions: substance required for the big reward', () => {
  const hitos = (k, done) => Array.from({ length: k }, (_, i) => ({ id: 'h' + i, texto: 'h' + i, hecho: done, cuando: done ? '2026-10-0' + (1 + (i % 7)) + 'T10:00:00.000Z' : '' }));
  const big = { id: 'p', nombre: 'P', contexto: 'apps', estado: 'terminado', hitos: hitos(5, true), creado: '2026-09-01T00:00:00Z', terminado: '2026-10-07T12:00:00Z' };
  assert.equal(C.xpMision(big, []), 500, 'great mission');
  const light = { id: 'q', nombre: 'Q', contexto: 'apps', estado: 'terminado', hitos: [], creado: '2026-10-07T10:00:00Z', terminado: '2026-10-07T10:05:00Z' };
  assert.equal(C.xpMision(light, []), 25, 'empty one-day mission pays little');
  const res = C.calcularXP([], [big]);
  assert.equal(res.total, 5 * 100 + 500);
});

test('milestones: at most 3 per day count', () => {
  const p = { id: 'p', nombre: 'P', contexto: 'apps', estado: 'activo', terminado: '',
    hitos: Array.from({ length: 6 }, (_, i) => ({ id: 'h' + i, texto: 'h', hecho: true, cuando: '2026-10-07T10:00:00Z' })) };
  assert.equal(C.calcularXP([], [p]).total, 300);
});

test('levels: thresholds, titles and progress within the level', () => {
  assert.deepEqual([0, 99, 100, 299, 300, 1000].map((x) => C.nivelPorXP(x).nivel), [1, 1, 2, 2, 3, 5]);
  const l = C.nivelPorXP(450);
  assert.equal(l.nivel, 3);
  assert.equal(l.titulo, 'Operador');
  assert.equal(l.enNivel, 150);
  assert.equal(l.tramo, 300);
  assert.equal(l.pct, 50);
  assert.equal(l.falta, 150);
});
