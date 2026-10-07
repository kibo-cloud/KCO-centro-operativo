'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

test('claveDia / deClave round-trip', () => {
  assert.equal(C.claveDia(new Date(2026, 9, 7, 23, 59)), '2026-10-07');
  assert.equal(C.claveDia(C.deClave('2026-02-28')), '2026-02-28');
});

test('esClave rejects malformed or impossible dates', () => {
  assert.equal(C.esClave('2026-10-07'), true);
  assert.equal(C.esClave('2026-02-30'), false);
  assert.equal(C.esClave('2026-1-7'), false);
  assert.equal(C.esClave(''), false);
  assert.equal(C.esClave(null), false);
});

test('sumarDias crosses months, years and leap days', () => {
  assert.equal(C.sumarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(C.sumarDias('2028-02-28', 1), '2028-02-29');
  assert.equal(C.sumarDias('2026-03-01', -1), '2026-02-28');
});

test('difDias is stable across daylight-saving transitions', () => {
  // Spans every month boundary of a year, including DST switches in any TZ.
  let k = '2026-01-01';
  for (let i = 0; i < 400; i++) {
    const next = C.sumarDias(k, 1);
    assert.equal(C.difDias(k, next), 1, k);
    k = next;
  }
  assert.equal(C.difDias('2026-01-01', '2027-01-01'), 365);
});

test('diasDelMes knows February', () => {
  assert.equal(C.diasDelMes(2026, 1), 28);
  assert.equal(C.diasDelMes(2028, 1), 29);
  assert.equal(C.diasDelMes(2026, 9), 31);
});
