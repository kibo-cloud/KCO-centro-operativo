'use strict';
/* "Cabina" base rules for the interface layer (handoff sections 2, 3 and 8):
   no emoji in UI strings (stroke icon + word instead), every icon the UI asks
   the core for exists in iconos.js, and kco.css sticks to the type, spacing and
   radius scales. The plain-text share report (textoRelevo) is an export, not UI,
   and is the only place in kco-app.js allowed to carry emoji. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../../kco-core.js');

const leer = (f) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const app = leer('kco-app.js');
const html = leer('index.html');
const css = leer('kco.css');
const ICONOS = new Set((leer('iconos.js').match(/^\s+'?[a-z][a-z0-9-]*'?:\s*\[/gm) || []).map((s) => s.replace(/[\s':[]/g, '')));

/* Emoji and pictographic symbols, written as \uXXXX escapes (JS) or as real
   characters (HTML). Arrows used as text (→, ›), the bullet and the
   middle dot are typography, not emoji. */
const ESCAPE_EMOJI = /\\u(?:D83[C-E]|2(?:3[0-9A-F]{2}|5[A-F][0-9A-F]|6[0-9A-F]{2}|7[0-9A-B][0-9A-F]|B[0-9A-F]{2})|203C|2049|2193|21A9|FE0F)/i;
const CHAR_EMOJI = /[\u{1F000}-\u{1FAFF}⌀-⏿■-◿☀-➿⬀-⯿‼⁉↓↩️]/u;

function sinFuncion(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  assert.ok(i > -1, nombre + ' exists');
  const fin = src.indexOf('\n  }\n', i);
  assert.ok(fin > -1, nombre + ' has a closing marker');
  return src.slice(0, i) + src.slice(fin);
}

/* ---------- copy (handoff section 10) ---------- */
const ENTIDADES = { aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É',
  Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', iquest: '¿', iexcl: '¡', middot: '·', amp: '&', nbsp: ' ', quot: '"', rarr: '→' };
const decodificar = (s) => s.replace(/\\u([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&([A-Za-z]+);/g, (m, n) => (ENTIDADES[n] !== undefined ? ENTIDADES[n] : m));
/* UI strings of a JS file: string literals (comments removed) that read as copy,
   i.e. contain a space or start with a capital; one-word lowercase literals are
   internal tokens ('mision', 'dias' as a routine type). */
function textosJs(src) {
  const sin = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const r = [];
  const re = /'((?:[^'\\\n]|\\.)*)'/g;
  let m;
  while ((m = re.exec(sin))) {
    const t = decodificar(m[1]);
    if (/\s/.test(t.trim()) || /^[A-ZÁÉÍÓÚÑ¿¡]/.test(t)) { r.push(t); }
  }
  return r;
}
/* Visible text and accessible attributes of index.html (no comments, scripts or styles). */
function textosHtml(src) {
  const sin = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  const r = [];
  let m;
  const attr = /(?:placeholder|aria-label|title|alt)="([^"]*)"/g;
  while ((m = attr.exec(sin))) { r.push(decodificar(m[1])); }
  for (const t of sin.replace(/<[^>]*>/g, '\n').split('\n')) { if (t.trim()) { r.push(decodificar(t.trim())); } }
  return r;
}
/* Whole words only: class names and selectors (rail-mision) are not copy. Plural
   "misiones" has no accent. */
const palabra = (w, f) => new RegExp('(^|[^\\w-])(' + w + ')(?![\\w-])', f);
const SIN_TILDE = [palabra('Busqueda', 'i'), palabra('mision', 'i'), palabra('aca'), palabra('Mas'), palabra('dias', 'i'),
  // Also fixed with the T7 editors.
  palabra('accion', 'i'), palabra('proxima', 'i'), palabra('Escribi'), palabra('definicion', 'i'), palabra('Dia')];

test('copy: UI strings carry the accents of handoff section 10 (Búsqueda, misión, acá, Más, días)', () => {
  const malas = [];
  for (const [f, textos] of [['kco-app.js', textosJs(app)], ['kco-core.js', textosJs(leer('kco-core.js'))], ['index.html', textosHtml(html)]]) {
    for (const t of textos) { if (SIN_TILDE.some((re) => re.test(t))) { malas.push(f + ': ' + t.slice(0, 80)); } }
  }
  assert.deepEqual(malas, []);
});

test('copy: the checker sees escaped accents as accents and flags the plain words', () => {
  assert.deepEqual(textosJs("var a = 'Misi\\u00F3n nueva'; var b = 'mision'; var c = 'Sin mision';"), ['Misión nueva', 'Sin mision']);
  assert.ok(SIN_TILDE.some((re) => re.test('Sin mision')));
  assert.ok(!SIN_TILDE.some((re) => re.test('Misión nueva')));
  assert.deepEqual(textosHtml('<p>Cada cuantos d&iacute;as</p><input placeholder="Busqueda">'), ['Busqueda', 'Cada cuantos días']);
});

test('ui: kco-app.js has no emoji outside the plain-text share report', () => {
  const ui = sinFuncion(app, 'textoRelevo').split('\n');
  const malas = ui.filter((l) => ESCAPE_EMOJI.test(l) && !/^\s*(\/\*|\*|\/\/)/.test(l));
  assert.deepEqual(malas.map((l) => l.trim().slice(0, 100)), []);
});

test('ui: index.html has no emoji', () => {
  const malas = html.split('\n').filter((l) => CHAR_EMOJI.test(l) || ESCAPE_EMOJI.test(l));
  assert.deepEqual(malas.map((l) => l.trim().slice(0, 100)), []);
});

test('ui: every achievement maps to a stroke icon (its emoji stays as data only)', () => {
  for (const l of C.LOGROS) {
    assert.equal(typeof l.icono, 'string', l.id + ' has an icon');
    assert.ok(ICONOS.has(l.icono), l.id + ' icon ' + l.icono + ' exists in iconos.js');
  }
  assert.ok(ICONOS.has('lock'), 'secret achievements use the lock icon');
});

test('ui: every journal entry carries a stroke icon', () => {
  let n = 0;
  const ev = (tipo, extra) => Object.assign({ id: 'e' + (++n), ts: '2026-10-07T10:00:00.000Z', tipo, itemId: 'a',
    texto: 'x', contexto: 'trabajo', desde: '', hasta: 'h' }, extra);
  const evs = [ev('estado', { hasta: 'completado' }), ev('hito'), ev('mision_alta'), ev('mision_fin'), ev('mision_reabre'),
    ev('rutina_alta'), ev('comentario'), ev('logro'), ev('nivel'), ev('restauracion')];
  const d = C.diario(evs, [{ id: 'a', tipo: 'tarea' }], {});
  const entradas = d.reduce((a, g) => a.concat(g.entradas), []);
  assert.ok(entradas.length >= 9);
  for (const e of entradas) { assert.ok(ICONOS.has(e.icono), e.clase + ' icon ' + e.icono); }
});

test('ui: state, achievement, diary and checklist icons exist in iconos.js', () => {
  for (const n of ['inbox', 'circle', 'circle-half', 'circle-clock', 'circle-pause', 'check-circle', 'circle-slash',
    'zap', 'flag', 'lock', 'star', 'flame', 'target', 'repeat', 'check', 'checkbox', 'checkbox-on', 'x']) {
    assert.ok(ICONOS.has(n), n);
  }
});

/* ---------- kco.css scales ---------- */
const decls = (prop) => {
  const re = new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*([^;}]+)', 'g');
  const r = [];
  let m;
  while ((m = re.exec(css))) { r.push(m[1].trim()); }
  return r;
};

test('css: font sizes come from the scale (13/15/17/20/24/32; 16 only for inputs); nothing under 13px', () => {
  const ok = new Set(['13', '15', '16', '17', '20', '24', '32']);
  const malas = [];
  for (const v of decls('font-size').concat(decls('--fs-[a-z0-9]+'))) {
    for (const px of v.match(/-?\d+(?:\.\d+)?px/g) || []) { if (!ok.has(px.replace('px', ''))) { malas.push(v); } }
  }
  assert.deepEqual(malas, []);
  assert.doesNotMatch(css, /--fs-xs\s*:\s*12px/);
});

test('css: padding, margin and gap only use the spacing scale (hairlines of 1-2px allowed)', () => {
  const ok = new Set(['0', '1', '2', '4', '8', '12', '16', '20', '24', '32', '40']);
  const malas = [];
  for (const p of ['padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'gap', 'row-gap', 'column-gap']) {
    for (const v of decls(p)) {
      for (const px of v.match(/-?\d+(?:\.\d+)?px/g) || []) {
        const n = px.replace(/^-|px$/g, '');
        // Column widths inside calc() (720px) are layout, not spacing.
        if (+n <= 40 && !ok.has(n)) { malas.push(p + ':' + v); }
      }
    }
  }
  assert.deepEqual(malas, []);
});

test('css: border radius only uses the radius tokens (or a circle)', () => {
  const malas = decls('border-radius').filter((v) => /\d+px/.test(v.replace(/var\([^)]*\)/g, '')));
  assert.deepEqual(malas, []);
  for (const t of ['--r-ctl:8px', '--r-card:12px', '--r-sheet:20px', '--r-pill:999px']) { assert.ok(css.indexOf(t) > -1, t); }
});

test('css: new Cabina tokens exist in dark and light', () => {
  const claro = css.slice(css.indexOf(':root[data-tema="claro"]{'));
  for (const t of ['--surface-3', '--faint', '--brasa', '--brasa-soft', '--tabbar-bg', '--muted']) {
    assert.match(css, new RegExp('\\s' + t + ':'), t + ' dark');
    assert.match(claro, new RegExp('\\s' + t + ':'), t + ' light');
  }
  for (const t of ['--s-1:4px', '--s-10:40px', '--sh-1:', '--dur-1:', '--dur-fest:', '--fs-13:13px', '--fs-32:32px']) {
    assert.ok(css.indexOf(t) > -1, t);
  }
});

test('css: reduced motion turns every motion into a 120ms fade without translate or scale', () => {
  const i = css.indexOf('@media (prefers-reduced-motion: reduce){');
  assert.ok(i > -1);
  const blk = css.slice(i, css.indexOf('\n}', i));
  assert.match(blk, /transition-duration:\.12s!important/);
  assert.match(blk, /transform:none!important/);
});
