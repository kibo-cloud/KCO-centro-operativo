'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../kco-core.js');

const restaurar = () => C.fijarApartados(C.apartadosLegado());
const ISO = (d, h) => new Date(2026, 9, d, h || 12).toISOString();

test('sections: notas defaults to true (legacy seed, templates, missing field) and can be turned off', () => {
  assert.equal(C.normalizarApartado({ id: 'x', nom: 'X' }).notas, true);
  assert.equal(C.normalizarApartado({ id: 'x', nom: 'X', notas: false }).notas, false);
  assert.equal(C.normalizarApartado({ id: 'x', nom: 'X', notas: 'no' }).notas, true, 'only false turns it off');
  for (const a of C.apartadosLegado()) assert.equal(a.notas, true, a.id);
  for (const p of C.plantillas()) for (const a of p.apartados) assert.equal(a.notas, true, p.id + '/' + a.id);
});

test('normalizarNota: sanitizes the shape and rejects empty or id-less notes', () => {
  restaurar();
  try {
    assert.equal(C.normalizarNota(null), null);
    assert.equal(C.normalizarNota({ id: 'n1', tit: '  ', txt: ' \n ' }), null, 'no title and no body');
    assert.equal(C.normalizarNota({ id: 'bad id!', tit: 'x' }), null, 'unusable id');
    const n = C.normalizarNota({ id: 'n1', tit: '  Idea   de  video ', txt: '  linea 1\nlinea 2  ', ctx: 'apps',
      tags: ['Guion', 'guion', '', 5, 'Edición'], fijada: 1, archivada: 'si', creada: ISO(1), editada: ISO(2) });
    assert.deepEqual(n, { id: 'n1', tit: 'Idea de video', txt: 'linea 1\nlinea 2', ctx: 'apps', tags: ['guion', 'edicion'],
      fijada: false, archivada: false, creada: ISO(1), editada: ISO(2) });
    const b = C.normalizarNota({ id: 'n2', txt: 'solo cuerpo', ctx: 'nadie', creada: 'ayer', fijada: true, archivada: true }, ISO(5));
    assert.equal(b.tit, '');
    assert.equal(b.ctx, 'trabajo', 'unknown section falls to the first active one');
    assert.equal(b.creada, ISO(5), 'unreadable date takes now');
    assert.equal(b.editada, b.creada, 'edited defaults to created');
    assert.deepEqual([b.fijada, b.archivada], [true, true]);
    assert.equal(C.normalizarNota({ id: 'n3', tit: 'x'.repeat(300) }).tit.length, 120);
    assert.equal(C.normalizarNota({ id: 'n4', tit: 'x', txt: 'y'.repeat(30000) }).txt.length, 20000);
  } finally { restaurar(); }
});

test('normalizarNota: a note keeps an archived section id (records keep their section)', () => {
  const l = C.apartadosLegado();
  l[2].activo = false;
  C.fijarApartados(l);
  try {
    assert.equal(C.normalizarNota({ id: 'n1', tit: 'x', ctx: 'apps' }).ctx, 'apps');
  } finally { restaurar(); }
});

test('usaNotas: per section and for Todo', () => {
  C.fijarApartados([{ id: 'a', nom: 'A' }, { id: 'b', nom: 'B', notas: false }]);
  try {
    assert.equal(C.usaNotas('a'), true);
    assert.equal(C.usaNotas('b'), false);
    assert.equal(C.usaNotas('todo'), true);
    C.fijarApartados([{ id: 'b', nom: 'B', notas: false }]);
    assert.equal(C.usaNotas('todo'), false, 'no section uses notes');
  } finally { restaurar(); }
});

test('notasVisibles: filters by section (Todo = sections with notes), archived toggle and sorts pinned first, then last edited', () => {
  C.fijarApartados([{ id: 'a', nom: 'A' }, { id: 'b', nom: 'B', notas: false }, { id: 'c', nom: 'C', activo: false }]);
  try {
    const l = [
      { id: 'n1', tit: 'vieja', ctx: 'a', editada: ISO(1) },
      { id: 'n2', tit: 'nueva', ctx: 'a', editada: ISO(5) },
      { id: 'n3', tit: 'fijada vieja', ctx: 'a', editada: ISO(2), fijada: true },
      { id: 'n4', tit: 'de b', ctx: 'b', editada: ISO(9) },
      { id: 'n5', tit: 'archivada', ctx: 'a', editada: ISO(8), archivada: true },
      { id: 'n6', tit: 'de c', ctx: 'c', editada: ISO(3) }
    ].map((n) => C.normalizarNota(n));
    const ids = (r) => r.map((n) => n.id);
    assert.deepEqual(ids(C.notasVisibles(l, { ctx: 'a' })), ['n3', 'n2', 'n1']);
    assert.deepEqual(ids(C.notasVisibles(l, { ctx: 'todo' })), ['n3', 'n2', 'n6', 'n1'], 'Todo skips sections without notes');
    assert.deepEqual(ids(C.notasVisibles(l, { ctx: 'b' })), [], 'a section with notes off shows none');
    assert.deepEqual(ids(C.notasVisibles(l, { ctx: 'a', archivadas: true })), ['n5']);
    assert.deepEqual(ids(l), ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'], 'the input is not mutated');
  } finally { restaurar(); }
});

test('notasVisibles: search is accent and case insensitive across title and body, every word must match', () => {
  restaurar();
  const l = [
    { id: 'n1', tit: 'Reunión con proveedor', txt: 'precio del rodamiento', ctx: 'trabajo', editada: ISO(1) },
    { id: 'n2', tit: 'Lista', txt: 'REUNION de padres', ctx: 'hogar', editada: ISO(2) },
    { id: 'n3', tit: 'Otra', txt: 'nada', ctx: 'hogar', editada: ISO(3) }
  ].map((n) => C.normalizarNota(n));
  const ids = (q) => C.notasVisibles(l, { ctx: 'todo', q }).map((n) => n.id);
  assert.deepEqual(ids('reunion'), ['n2', 'n1']);
  assert.deepEqual(ids('  REUNIÓN  rodamiento '), ['n1']);
  assert.deepEqual(ids('précio'), ['n1']);
  assert.deepEqual(ids('zzz'), []);
  assert.deepEqual(ids(''), ['n3', 'n2', 'n1']);
});

test('capture: the nota: prefix makes a note; the #section tag still routes it and nothing else is parsed', () => {
  restaurar();
  const now = new Date(2026, 9, 7, 10, 0);
  assert.equal(C.parsearNota('comprar pan'), null);
  assert.equal(C.parsearNota('notas del dia'), null, 'only the exact prefix with a colon');
  assert.deepEqual(C.parsearNota('nota: idea para el video #apps 18:00 !'), { texto: 'idea para el video 18:00 !', contexto: 'apps' });
  assert.deepEqual(C.parsearNota('  Nota:llamar a #casa'), { texto: 'llamar a', contexto: 'hogar' });
  assert.deepEqual(C.parsearNota('nota:'), { texto: '', contexto: '' });
  const r = C.resumenCaptura('nota: precio #trabajo mañana', now);
  assert.equal(r.nota, true);
  assert.deepEqual([r.texto, r.contexto, r.dia, r.nivel, r.recordatorio, r.fecha], ['precio mañana', 'trabajo', '', '', '', '']);
  assert.equal(C.resumenCaptura('tarea mañana', now).nota, false);
});
