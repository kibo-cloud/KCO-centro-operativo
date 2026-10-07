// E2E runner: `node tests/e2e/run.mjs [filter]`
// Screenshots land in tests/e2e/out/ (git-ignored) for visual review.
import { startServer, launchBrowser, openPage } from './harness.mjs';
import { tests } from './app.e2e.mjs';

const filter = process.argv[2] || '';
// A stray rejection must fail loudly as a test failure, never kill the run silently.
let stray = 0;
process.on('unhandledRejection', (e) => { stray++; console.log('  UNHANDLED ' + (e && e.stack || e)); });
const { server, port } = await startServer();
const browser = await launchBrowser();
const base = `http://127.0.0.1:${port}`;
let pass = 0, fail = 0;
const failures = [];

try {
  for (const t of tests) {
    if (filter && !t.name.includes(filter)) continue;
    const page = await openPage(browser, base);
    try {
      await page.viewport(t.width || 390, t.height || 844, t.mobile !== false);
      await page.goto('/');
      if (!t.keepStorage) { await page.setStorage(t.storage || {}); await page.reload(); }
      await t.fn(page);
      const errs = page.errors.filter((e) => !(t.allowErrors || []).some((a) => e.includes(a)));
      if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
      pass++;
      console.log('  ok   ' + t.name);
    } catch (e) {
      fail++;
      failures.push(t.name);
      console.log('  FAIL ' + t.name + '\n       ' + String(e.stack || e).split('\n').slice(0, 4).join('\n       '));
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\ne2e: ${pass} passed, ${fail} failed` + (failures.length ? ' -> ' + failures.join(', ') : ''));
if (stray) console.log('e2e: ' + stray + ' unhandled rejection(s)');
process.exit(fail || stray ? 1 : 0);
