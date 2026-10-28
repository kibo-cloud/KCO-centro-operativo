'use strict';
/* index.html: every id is unique. getElementById returns the first match, so a
   repeated id makes the app paint into the wrong element (T08b reused
   listaNotas for the Notas view while the item sheet comments already had it). */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');

var ROOT = path.resolve(__dirname, '..', '..');

test('index.html has no repeated id', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  var re = /\sid="([^"]+)"/g, visto = {}, repetidos = [], m;
  while ((m = re.exec(html)) !== null) {
    if (visto[m[1]] && repetidos.indexOf(m[1]) < 0) { repetidos.push(m[1]); }
    visto[m[1]] = true;
  }
  assert.deepEqual(repetidos, []);
});
