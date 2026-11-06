'use strict';
/* Section colors are a curated palette (KCOCore.COLORES). kco.css declares,
   per key, a dark and a light tone (--pal-<key>, --pal-<key>-soft) that keep
   the 4.5:1 rule as text over every surface and over its own soft tint, plus
   body.pal-<key> (accent) and .punto.pal-<key> (dot). No rule is bound to a
   section id any more. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../../kco-core.js');

const css = fs.readFileSync(path.resolve(__dirname, '..', '..', 'kco.css'), 'utf8');
const bloque = (sel) => {
  const i = css.indexOf(sel + '{');
  assert.ok(i > -1, sel + ' block exists');
  return css.slice(i, css.indexOf('\n}', i));
};
const DARK = bloque(':root');
const LIGHT = bloque(':root[data-tema="claro"]');

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => {
  const l = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (rgba, base) => base.map((v, i) => Math.round(rgba[i] * rgba[3] + v * (1 - rgba[3])));
const token = (blk, n) => {
  const m = new RegExp('\\s' + n + ':([^;]+);').exec(blk);
  assert.ok(m, n + ' declared');
  const v = m[1].trim();
  // An alias (--pal-gris: var(--pal-todo)) resolves inside the same theme block.
  const a = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  return a ? token(blk, a[1]) : v;
};
const rgba = (s) => {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(s.replace(/\s/g, ''));
  assert.ok(m, 'soft tint is rgba(): ' + s);
  return [+m[1], +m[2], +m[3], +m[4]];
};

for (const [tema, blk] of [['dark', DARK], ['light', LIGHT]]) {
  test('palette: every color key has a ' + tema + ' tone with 4.5:1 over the surfaces and its soft tint', () => {
    const surfaces = ['--bg', '--surface', '--surface-2'].map((n) => hex(token(blk, n)));
    for (const k of C.COLORES) {
      const c = hex(token(blk, '--pal-' + k));
      const soft = rgba(token(blk, '--pal-' + k + '-soft'));
      for (const s of surfaces) {
        assert.ok(ratio(c, s) >= 4.5, tema + ' ' + k + ' over surface: ' + ratio(c, s).toFixed(2));
        assert.ok(ratio(c, over(soft, s)) >= 4.5, tema + ' ' + k + ' over its soft tint: ' + ratio(c, over(soft, s)).toFixed(2));
      }
    }
  });
}

for (const [tema, blk, tono] of [['dark', DARK, '#E6E8EB'], ['light', LIGHT, '#1A1D23']]) {
  test('palette: pal-todo (chalk, the Todo view) is ' + tono + ' in ' + tema + ' with 4.5:1 over surfaces and its soft tint', () => {
    const c = token(blk, '--pal-todo');
    assert.equal(c.toUpperCase(), tono);
    const soft = rgba(token(blk, '--pal-todo-soft'));
    for (const n of ['--bg', '--surface', '--surface-2', '--surface-3']) {
      const s = hex(token(blk, n));
      assert.ok(ratio(hex(c), s) >= 4.5, tema + ' todo over ' + n + ': ' + ratio(hex(c), s).toFixed(2));
      assert.ok(ratio(hex(c), over(soft, s)) >= 4.5, tema + ' todo over its soft tint on ' + n);
    }
    assert.equal(token(blk, '--pal-gris'), c, 'pal-gris is an alias of pal-todo');
  });
}

test('palette: accent-soft tints are 16% in dark and 12% in light (rosa and naranja lighter to keep AA)', () => {
  const claroTenue = { rosa: 0.09, naranja: 0.08 };
  for (const k of C.COLORES.concat(['todo'])) {
    assert.equal(rgba(token(DARK, '--pal-' + k + '-soft'))[3], 0.16, 'dark ' + k);
    assert.equal(rgba(token(LIGHT, '--pal-' + k + '-soft'))[3], claroTenue[k] || 0.12, 'light ' + k);
  }
});

test('palette: pal-todo has body and dot rules; the Todo view uses it', () => {
  assert.match(css, /body\.pal-todo\{--accent:var\(--pal-todo\);--accent-soft:var\(--pal-todo-soft\)\}/);
  assert.match(css, /\.punto\.pal-todo\{background:var\(--pal-todo\)\}/);
  const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'index.html'), 'utf8');
  assert.match(html, /<body class="pal-todo"/);
});

test('palette: body accent and dot rules exist per key; no rule is bound to a section id', () => {
  for (const k of C.COLORES) {
    assert.match(css, new RegExp('body\\.pal-' + k + '\\{--accent:var\\(--pal-' + k + '\\);--accent-soft:var\\(--pal-' + k + '-soft\\)\\}'));
    assert.match(css, new RegExp('\\.punto\\.pal-' + k + '\\{background:var\\(--pal-' + k + '\\)\\}'));
  }
  assert.doesNotMatch(css, /--ctx-|body\.ctx-|\.p-(todo|trabajo|hogar|apps|contenido|personal)\b/);
});

test('palette: the legacy sections keep their hues', () => {
  const dark = { naranja: '#FF6B2B', cian: '#00E5FF', violeta: '#A78BFA', rosa: '#FF5FA2', verde: '#3DDC84' };
  const light = { naranja: '#B53A09', cian: '#0B6880', violeta: '#6D28D9', rosa: '#BE185D', verde: '#126E37' };
  for (const k of Object.keys(dark)) {
    assert.equal(token(DARK, '--pal-' + k).toUpperCase(), dark[k]);
    assert.equal(token(LIGHT, '--pal-' + k).toUpperCase(), light[k]);
  }
});
