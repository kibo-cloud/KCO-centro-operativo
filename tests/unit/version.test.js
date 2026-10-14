'use strict';
/* A release bumps one version and the service worker cache follows it:
   sw.js, kco-app.js and package.json must agree, and the cache name must be
   derived from the version (never hand-bumped). */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');

var ROOT = path.resolve(__dirname, '..', '..');
function leer(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

test('sw.js VERSION equals kco-app.js VERSION_APP and package.json version', function () {
  var sw = /var VERSION = '([^']+)';/.exec(leer('sw.js'));
  var app = /var VERSION_APP = '([^']+)';/.exec(leer('kco-app.js'));
  var pkg = JSON.parse(leer('package.json')).version;
  assert.ok(sw, 'sw.js declares VERSION');
  assert.ok(app, 'kco-app.js declares VERSION_APP');
  assert.equal(sw[1], app[1]);
  assert.equal(sw[1], pkg);
});

test('the service worker cache name is derived from VERSION', function () {
  assert.match(leer('sw.js'), /var CACHE = 'kibco-' \+ VERSION;/);
});

test('every manifest icon and the apple-touch-icon are precached', function () {
  var sw = leer('sw.js');
  var man = JSON.parse(leer('manifest.webmanifest'));
  var srcs = man.icons.map(function (i) { return i.src; });
  var apple = /<link rel="apple-touch-icon"[^>]*href="([^"]+)"/.exec(leer('index.html'));
  assert.ok(apple, 'index.html links an apple-touch-icon');
  srcs.push(apple[1]);
  srcs.forEach(function (s) {
    assert.ok(fs.existsSync(path.join(ROOT, s)), s + ' exists');
    assert.ok(sw.indexOf("'" + s + "'") > -1, s + ' is in the SW precache list');
  });
});

test('manifest: maskable icon is its own file, shortcut Capturar uses ?capturar=1', function () {
  var man = JSON.parse(leer('manifest.webmanifest'));
  var mask = man.icons.filter(function (i) { return /maskable/.test(i.purpose); });
  assert.equal(mask.length, 1);
  assert.notEqual(mask[0].src, './icono-512.png');
  man.icons.forEach(function (i) {
    if (i.src === './icono-512.png') { assert.equal(i.purpose, 'any'); }
  });
  var cap = (man.shortcuts || []).filter(function (s) { return s.name === 'Capturar'; });
  assert.equal(cap.length, 1);
  assert.equal(cap[0].url, './?capturar=1');
  assert.ok(man.id && man.description && Array.isArray(man.categories));
});

test('the stylesheet is external: kco.css is linked, precached, and index.html has no style block', function () {
  var html = leer('index.html');
  assert.ok(fs.existsSync(path.join(ROOT, 'kco.css')), 'kco.css exists');
  assert.match(html, /<link rel="stylesheet" href="\.\/kco\.css">/);
  assert.equal(html.indexOf('<style'), -1, 'no inline <style> block left');
  assert.ok(leer('sw.js').indexOf("'./kco.css'") > -1, 'kco.css is in the SW precache list');
});

test('kco.css declares the design token layer in :root', function () {
  var css = leer('kco.css');
  var root = /:root\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(root, 'kco.css has a :root block');
  ['--bg', '--surface', '--surface-2', '--border', '--text', '--text-muted', '--accent', '--accent-contrast',
    '--danger', '--warning', '--success', '--focus', '--font-sans', '--font-mono', '--fs-xs', '--fs-3xl',
    '--sp-1', '--sp-8', '--r-sm', '--r-pill', '--shadow-1', '--shadow-3', '--dur-fast', '--dur', '--ease',
    '--z-sheet', '--tap', '--safe-top', '--safe-bottom'].forEach(function (t) {
    assert.ok(new RegExp('\\s' + t + ':').test(root[1]), t + ' is declared in :root');
  });
});

test('tema.js runs in <head> before first paint, is precached and is ES5-checked', function () {
  var html = leer('index.html');
  var head = html.slice(0, html.indexOf('</head>'));
  assert.ok(fs.existsSync(path.join(ROOT, 'tema.js')), 'tema.js exists');
  assert.match(head, /<script src="\.\/tema\.js"><\/script>/, 'tema.js is a blocking script in <head>');
  assert.ok(head.lastIndexOf('name="theme-color"') < head.indexOf('<script src="./tema.js"'), 'theme-color metas come before tema.js');
  assert.ok(leer('sw.js').indexOf("'./tema.js'") > -1, 'tema.js is in the SW precache list');
  assert.ok(leer('tests/check-es5.mjs').indexOf("'tema.js'") > -1, 'tema.js is in the ES5 gate');
});

test('iconos.js loads before kco-app.js, is precached and is ES5-checked', function () {
  var html = leer('index.html');
  assert.ok(fs.existsSync(path.join(ROOT, 'iconos.js')), 'iconos.js exists');
  var ico = html.indexOf('<script src="./iconos.js"></script>');
  assert.ok(ico > -1, 'index.html loads iconos.js');
  assert.ok(ico < html.indexOf('<script src="./kco-app.js"></script>'), 'iconos.js comes before kco-app.js');
  assert.ok(leer('sw.js').indexOf("'./iconos.js'") > -1, 'iconos.js is in the SW precache list');
  assert.ok(leer('tests/check-es5.mjs').indexOf("'iconos.js'") > -1, 'iconos.js is in the ES5 gate');
});
