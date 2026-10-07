// Static gate: browser files must stay ES5 (old Android WebViews) and must
// never build HTML from strings. Zero dependencies: a small scanner strips
// comments, strings and regex literals, then looks for forbidden syntax.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['kco-core.js', 'kco-app.js', 'sw.js'];
const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REGEX_KW = /(?:return|typeof|case|in|of|new|delete|void|throw)$/;

function strip(src) {
  let out = '', i = 0, last = '';
  const problems = [];
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (c === '`') { problems.push(['template literal', i]); }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') break; j++; }
      out += '""'; last = '"'; i = j + 1; continue;
    }
    if (c === '/' && (REGEX_PREV.has(last) || REGEX_KW.test(out.trimEnd()) || last === '')) {
      let j = i + 1, inClass = false;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        else if (src[j] === '\n') break;
        j++;
      }
      j++;
      while (/[a-z]/i.test(src[j] || '')) j++;
      out += '/r/'; last = '/'; i = j; continue;
    }
    out += c;
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return { code: out, problems };
}

let bad = 0;
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const { code, problems } = strip(src);
  const rules = [
    [/=>/, 'arrow function'],
    [/\b(let|const|class|async|await|yield|import|export)\b/, 'ES2015+ keyword'],
    [/\?\.(?!\d)/, 'optional chaining'],
    [/\?\?/, 'nullish coalescing'],
    [/\.\.\./, 'spread/rest'],
    [/\bfor\s*\([^;)]*\bof\b/, 'for...of'],
    [/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\b/, 'HTML string sink'],
    [/\beval\s*\(|new\s+Function\b/, 'dynamic code']
  ];
  const lines = code.split('\n');
  lines.forEach((line, idx) => {
    for (const [re, label] of rules) {
      if (re.test(line)) { bad++; console.log(`${f}:${idx + 1}: ${label}: ${line.trim().slice(0, 100)}`); }
    }
  });
  for (const [label] of problems) { bad++; console.log(`${f}: ${label}`); }
}
if (bad) { console.log(`es5 check: ${bad} problem(s)`); process.exit(1); }
console.log('es5 check: ok (' + FILES.join(', ') + ')');
