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

test('capture target: the resolved context tag is removed wherever it sits', () => {
  // An unknown #tag first does not hide a known one after it.
  assert.equal(C.parsearCaptura('ver #hashtag #casa', NOW).contexto, 'hogar');
  assert.equal(C.parsearCaptura('ver #hashtag #casa', NOW).texto, 'ver #hashtag');
  assert.equal(C.resumenCaptura('ver #hashtag #casa', NOW).contexto, 'hogar');
  assert.equal(C.quitarContextoCaptura('ver #hashtag #casa'), 'ver #hashtag');
  assert.equal(C.quitarContextoCaptura('#idea grabar #contenido hoy'), '#idea grabar hoy');
  // Only the tag the parser resolved goes; a second known tag stays as text.
  assert.equal(C.parsearCaptura('mover #apps a #casa', NOW).contexto, 'apps');
  assert.equal(C.quitarContextoCaptura('mover #apps a #casa'), 'mover a #casa');
  // After removing it the parser sees no context from that tag.
  assert.equal(C.parsearCaptura(C.quitarContextoCaptura('ver #hashtag #casa'), NOW).contexto, '');
});

test('capture by tab: Compras captures a purchase, Notas a note, every other view a task', () => {
  assert.equal(C.tipoCaptura('compras'), 'compra');
  assert.equal(C.tipoCaptura('notas'), 'nota');
  for (const v of ['tablero', 'ahora', 'hoy', 'misiones', 'registro', '', undefined]) {
    assert.equal(C.tipoCaptura(v), 'tarea', String(v));
  }
});

test('capture by tab: on the Notas tab the text is a note without the nota: prefix', () => {
  C.fijarApartados(C.apartadosLegado());
  assert.equal(C.parsearNota('idea para el video #apps'), null, 'not forced: still needs the prefix');
  assert.deepEqual(C.parsearNota('idea para el video #apps 18:00', true), { texto: 'idea para el video 18:00', contexto: 'apps' });
  assert.deepEqual(C.parsearNota('nota: con prefijo #casa', true), { texto: 'con prefijo', contexto: 'hogar' }, 'the prefix is still removed');
  const r = C.resumenCaptura('precio yerba #casa mañana', NOW, 'nota');
  assert.equal(r.nota, true);
  assert.equal(r.compra, false);
  assert.deepEqual([r.texto, r.contexto, r.dia], ['precio yerba mañana', 'hogar', '']);
});

test('capture by tab: on the Compras tab the summary is a purchase and keeps day, priority and section', () => {
  C.fijarApartados(C.apartadosLegado());
  const r = C.resumenCaptura('lija al agua #casa !! mañana', NOW, 'compra');
  assert.equal(r.compra, true);
  assert.equal(r.nota, false);
  assert.deepEqual([r.texto, r.contexto, r.nivel, r.dia], ['lija al agua', 'hogar', 'urgente', 'Mañana']);
  // The nota: prefix still wins on any tab.
  const n = C.resumenCaptura('nota: precio #casa', NOW, 'compra');
  assert.equal(n.nota, true);
  assert.equal(n.compra, false);
  // Without a tab type nothing changes.
  assert.equal(C.resumenCaptura('lija', NOW).compra, false);
  assert.equal(C.resumenCaptura('lija', NOW, 'tarea').compra, false);
});

test('capture chips: quitarNivelCaptura removes only the priority mark', () => {
  C.fijarApartados(C.apartadosLegado());
  assert.equal(C.quitarNivelCaptura('pagar luz #casa !! mañana'), 'pagar luz #casa mañana');
  assert.equal(C.quitarNivelCaptura('! llamar'), 'llamar');
  assert.equal(C.quitarNivelCaptura('hola!! sin marca'), 'hola!! sin marca');
  assert.equal(C.parsearCaptura(C.quitarNivelCaptura('fix ! login'), NOW).nivel, '');
});

test('capture chips: quitarDiaCaptura removes the parsed time and day words, nothing else', () => {
  C.fijarApartados(C.apartadosLegado());
  assert.equal(C.quitarDiaCaptura('turno medico @9:30 mañana !! #casa', NOW), 'turno medico !! #casa');
  assert.equal(C.quitarDiaCaptura('llamar 18:00', NOW), 'llamar');
  assert.equal(C.quitarDiaCaptura('pagar luz hoy', NOW), 'pagar luz');
  assert.equal(C.quitarDiaCaptura('pagar luz mañana #casa', NOW), 'pagar luz #casa');
  assert.equal(C.quitarDiaCaptura('medir 10:30 cm ya', NOW), 'medir 10:30 cm ya', 'no day parsed: unchanged');
  assert.equal(C.quitarDiaCaptura('sin dia', NOW), 'sin dia');
  const r = C.resumenCaptura(C.quitarDiaCaptura('turno @9:30 hoy !', NOW), NOW);
  assert.equal(r.dia, '');
  assert.equal(r.nivel, 'importante');
  assert.equal(r.texto, 'turno');
});

test('capture chips: quitarDiaCaptura removes exactly the time and day tokens the parser consumed', () => {
  C.fijarApartados(C.apartadosLegado());
  // The parser reads "@  9:30" (any spacing after @); the clear button must remove that same token.
  assert.equal(C.quitarDiaCaptura('llamar @  9:30 mañana', NOW), 'llamar');
  // With a time, the parser takes the first "mañana" (it wins over "hoy"); a later "hoy" stays as text.
  assert.equal(C.quitarDiaCaptura('ver mañana 18:00 hoy', NOW), 'ver hoy');
  // Without a time only the trailing day word is a date; an earlier one is just text.
  assert.equal(C.quitarDiaCaptura('pagar hoy mañana', NOW), 'pagar hoy');
  assert.equal(C.quitarDiaCaptura('MAÑANA comprar pan HOY #casa !', NOW), 'MAÑANA comprar pan #casa !');
});

test('capture chips: every date form the parser reads is cleared by quitarDiaCaptura, the rest is kept', () => {
  C.fijarApartados(C.apartadosLegado());
  const forms = [
    'pagar luz hoy', 'pagar  luz   mañana', 'pagar luz manana #casa', 'pagar luz HOY !!',
    'turno @9:30', 'turno @ 9:30 hoy', 'turno @  9:30', 'turno  @\t9:30   mañana #casa',
    'llamar 18:00', 'medir 10:30 cm hoy', 'ver 18:00 mañana !'
  ];
  for (const f of forms) {
    const p = C.parsearCaptura(f, NOW);
    assert.ok(p.fecha !== '' || p.recordatorio !== '', 'the parser reads a date in: ' + f);
    const q = C.parsearCaptura(C.quitarDiaCaptura(f, NOW), NOW);
    assert.equal(q.fecha, '', 'no day left in: ' + f);
    assert.equal(q.recordatorio, '', 'no time left in: ' + f);
    assert.equal(q.texto, p.texto, 'text kept: ' + f);
    assert.equal(q.contexto, p.contexto, 'section kept: ' + f);
    assert.equal(q.nivel, p.nivel, 'priority kept: ' + f);
    assert.equal(C.resumenCaptura(C.quitarDiaCaptura(f, NOW), NOW).dia, '', 'the day chip clears: ' + f);
  }
});
