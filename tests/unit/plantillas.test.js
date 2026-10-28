'use strict';
/* First-run templates (K.plantillas): pure data the fresh-install picker offers.
   Every section must survive normalization unchanged, use a real icon from
   iconos.js and a palette color, and ids must be unique inside a template. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../../kco-core.js');

const iconos = fs.readFileSync(path.resolve(__dirname, '..', '..', 'iconos.js'), 'utf8');
const ICONOS = new Set((iconos.match(/^\s+'?[a-z][a-z0-9-]*'?:\s*\[/gm) || []).map((s) => s.replace(/[\s':[]/g, '')));

test('plantillas: several presets plus "Empezar de cero" last', () => {
  const l = C.plantillas();
  assert.ok(l.length >= 4, 'at least three presets plus starting from scratch');
  const ids = l.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'template ids are unique');
  const cero = l[l.length - 1];
  assert.equal(cero.id, 'cero');
  assert.equal(cero.nom, 'Empezar de cero');
  assert.equal(cero.editar, true, 'starting from scratch opens the editor');
  assert.equal(cero.apartados.length, 1, 'exactly one generic section');
  for (const p of l) {
    assert.equal(typeof p.nom, 'string');
    assert.ok(p.nom.length > 0, p.id + ' has a name');
    assert.equal(typeof p.desc, 'string');
    assert.ok(p.desc.length > 0, p.id + ' has a description');
    assert.ok(p.apartados.length >= 1, p.id + ' has sections');
  }
});

test('plantillas: every section is valid, normalized and uses real icons and palette colors', () => {
  assert.ok(ICONOS.has('layers') && ICONOS.has('users'), 'icon names parsed from iconos.js');
  for (const p of C.plantillas()) {
    const ids = p.apartados.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length, p.id + ': section ids are unique');
    assert.deepEqual(C.normalizarApartados(p.apartados), p.apartados, p.id + ': already normalized');
    p.apartados.forEach((a, i) => {
      assert.equal(a.orden, i, a.id + ' order');
      assert.ok(ICONOS.has(a.ico), p.id + '/' + a.id + ' icon ' + a.ico + ' exists in iconos.js');
      assert.ok(C.COLORES.indexOf(a.color) >= 0, a.id + ' color is a palette key');
      assert.ok(['no', 'lista', 'fabrica'].indexOf(a.compras) >= 0, a.id + ' purchases mode');
      assert.equal(a.activo, true);
      const tagIds = a.tags.map((t) => t.id);
      assert.equal(new Set(tagIds).size, tagIds.length, a.id + ': tag ids are unique');
    });
    // Registering a template yields that many active sections.
    C.fijarApartados(p.apartados);
    assert.equal(C.apartados().length, p.apartados.length, p.id + ': all sections active');
  }
  C.fijarApartados(C.apartadosLegado());
});

test('plantillas: the work and home preset is the legacy set; calls return fresh copies', () => {
  const l = C.plantillas();
  const legado = l.find((p) => p.id === 'trabajo-casa');
  assert.ok(legado, 'work and home preset exists');
  assert.deepEqual(legado.apartados, C.apartadosLegado());
  const otra = C.plantillas();
  assert.notEqual(otra[0], l[0]);
  assert.notEqual(otra[0].apartados[0], l[0].apartados[0]);
  l[0].apartados[0].nom = 'cambiado';
  assert.notEqual(C.plantillas()[0].apartados[0].nom, 'cambiado');
});
