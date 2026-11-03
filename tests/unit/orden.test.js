'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

const restaurar = () => C.fijarApartados(C.apartadosLegado());
// A priorizar-like ranking: entries in score order, each with its item.
const rk = (...items) => items.map((it, i) => ({ item: it, puntos: 100 - i, motivo: '', situacion: 'proximo' }));
const ids = (r) => r.map((x) => x.item.id);

test('sections: ordenAhora is auto by default, manual only when stored as manual', () => {
  assert.equal(C.normalizarApartado({ id: 'a', nom: 'A' }).ordenAhora, 'auto');
  assert.equal(C.normalizarApartado({ id: 'a', nom: 'A', ordenAhora: 'manual' }).ordenAhora, 'manual');
  assert.equal(C.normalizarApartado({ id: 'a', nom: 'A', ordenAhora: 'MANUAL' }).ordenAhora, 'auto');
  assert.equal(C.normalizarApartado({ id: 'a', nom: 'A', ordenAhora: 3 }).ordenAhora, 'auto');
  for (const a of C.apartadosLegado()) assert.equal(a.ordenAhora, 'auto', a.id);
  // Survives the registry round trip (storage and backups store todosApartados()).
  C.fijarApartados([{ id: 'a', nom: 'A', ordenAhora: 'manual' }, { id: 'b', nom: 'B' }]);
  const copia = JSON.parse(JSON.stringify(C.todosApartados()));
  C.fijarApartados(copia);
  assert.deepEqual(C.todosApartados().map((a) => a.ordenAhora), ['manual', 'auto']);
  restaurar();
});

test('ordenAhora(ctx): per section; Todo and unknown sections are always auto', () => {
  C.fijarApartados([{ id: 'a', nom: 'A', ordenAhora: 'manual' }, { id: 'b', nom: 'B' }]);
  assert.equal(C.ordenAhora('a'), 'manual');
  assert.equal(C.ordenAhora('b'), 'auto');
  assert.equal(C.ordenAhora('todo'), 'auto');
  assert.equal(C.ordenAhora('zzz'), 'auto');
  restaurar();
});

test('rangoManual: a positive integer rank, 0 (unranked) for anything else', () => {
  assert.equal(C.rangoManual({ ordenManual: 3 }), 3);
  assert.equal(C.rangoManual({ ordenManual: '2' }), 0, 'strings are not ranks');
  for (const v of [0, -1, 1.5, NaN, Infinity, null, undefined, {}]) assert.equal(C.rangoManual({ ordenManual: v }), 0, String(v));
  assert.equal(C.rangoManual({}), 0);
  assert.equal(C.rangoManual(null), 0);
});

test('ordenarManual: ranked items first by rank, unranked after in score order; stable and non-mutating', () => {
  const a = { id: 'a' }, b = { id: 'b', ordenManual: 2 }, c = { id: 'c' }, d = { id: 'd', ordenManual: 1 }, e = { id: 'e', ordenManual: 2 };
  const r = rk(a, b, c, d, e);
  assert.deepEqual(ids(C.ordenarManual(r)), ['d', 'b', 'e', 'a', 'c'], 'rank ties keep score order');
  assert.deepEqual(ids(r), ['a', 'b', 'c', 'd', 'e'], 'the input is not reordered');
  assert.equal(C.ordenarManual(r)[0], r[3], 'entries are the same objects (motivo, puntos kept)');
  // Explicit ranks are the whole source: the items' own field is ignored.
  assert.deepEqual(ids(C.ordenarManual(r, { c: 1, a: 2 })), ['c', 'a', 'b', 'd', 'e']);
  // Nothing ranked: the score order stays.
  assert.deepEqual(ids(C.ordenarManual(rk({ id: 'x' }, { id: 'y' }))), ['x', 'y']);
  assert.deepEqual(C.ordenarManual([]), []);
  assert.deepEqual(C.ordenarManual(null), []);
});

test('rangosTrasMover: moving an item to an index ranks the whole list 1..n', () => {
  assert.deepEqual(C.rangosTrasMover(['a', 'b', 'c', 'd'], 'd', 0), { d: 1, a: 2, b: 3, c: 4 });
  assert.deepEqual(C.rangosTrasMover(['a', 'b', 'c', 'd'], 'a', 2), { b: 1, c: 2, a: 3, d: 4 });
  assert.deepEqual(C.rangosTrasMover(['a', 'b', 'c'], 'b', 99), { a: 1, c: 2, b: 3 }, 'index clamps to the end');
  assert.deepEqual(C.rangosTrasMover(['a', 'b', 'c'], 'b', -5), { b: 1, a: 2, c: 3 }, 'and to the start');
  assert.deepEqual(C.rangosTrasMover(['a', 'b'], 'zzz', 0), { a: 1, b: 2 }, 'unknown id: same order');
});

test('rangosTrasMover: with a visible sublist only those slots are reshuffled; hidden items keep their place', () => {
  // Full order a b c d e; visible (draggable) rows are a c e.
  const r = C.rangosTrasMover(['a', 'b', 'c', 'd', 'e'], 'e', 0, ['a', 'c', 'e']);
  assert.deepEqual(r, { e: 1, b: 2, a: 3, d: 4, c: 5 });
  // Applied back through ordenarManual the visible rows read e a c.
  const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const orden = C.ordenarManual(rk(...items), r).map((x) => x.item.id).filter((id) => ['a', 'c', 'e'].includes(id));
  assert.deepEqual(orden, ['e', 'a', 'c']);
});

test('ordenConSub: the sublist takes its own order inside the slots it already held; the rest stays put', () => {
  // Full order a b c d e; Ahora shows d before b (ranking order), c and e are not in Ahora.
  assert.deepEqual(C.ordenConSub(['a', 'b', 'c', 'd', 'e'], ['d', 'a', 'b']), ['d', 'a', 'c', 'b', 'e']);
  assert.deepEqual(C.ordenConSub(['a', 'b', 'c'], []), ['a', 'b', 'c'], 'empty sublist: same order');
  assert.deepEqual(C.ordenConSub(['a', 'b', 'c'], ['zzz', 'c', 'a']), ['c', 'b', 'a'], 'ids not in the order are ignored');
  assert.deepEqual(C.ordenConSub(['a', 'b', 'c'], ['c', 'c', 'a']), ['c', 'b', 'a'], 'a repeated id counts once');
  const src = ['a', 'b'];
  C.ordenConSub(src, ['b', 'a']);
  assert.deepEqual(src, ['a', 'b'], 'the input is not touched');
});

test('ordenConSub + rangosTrasMover: a move in a sublist gives unique ranks 1..n for the whole order, even from tied ranks', () => {
  // Whole section a b w c d (w is done, hidden from Ahora); Ahora shows a b c d.
  const orden = C.ordenConSub(['a', 'b', 'w', 'c', 'd'], ['a', 'b', 'c', 'd']);
  const r = C.rangosTrasMover(orden, 'c', 1, ['a', 'b', 'c', 'd']);
  assert.deepEqual(r, { a: 1, c: 2, w: 3, b: 4, d: 5 });
  assert.deepEqual(Object.values(r).sort(), [1, 2, 3, 4, 5], 'no tie left');
});
