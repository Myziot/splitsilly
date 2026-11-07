// Playwright proof: the Record Settlement modal prefills the amount from the
// SAME "Who owes who" legs the card renders (optimizer transactions), and
// pairs with no leg stay blank. Every name/id/amount is looked up from live
// data at runtime — nothing is hardcoded, so the proof survives fixture and
// member changes.
//
// Usage: node scripts/prefill-proof.playwright.cjs <session-token> <group-id>
//   - Requires the server on :3002 and a session cookie-capable admin account.
//   - Pass any group you belong to that has at least one unsettled leg.
const os = require('os');
const path = require('path');
const { chromium } = require(path.join(os.homedir(), '.hermes/hermes-agent/node_modules/playwright'));

const TOKEN = process.argv[2];
const BASE = 'http://localhost:3002';
const GID = process.argv[3];
const EPS = 0.005;
let failures = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

(async () => {
  if (!TOKEN) {
    console.error('usage: node scripts/prefill-proof.playwright.cjs <session-token> [group-id]');
    process.exit(2);
  }
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ||
      path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'),
    headless: true,
  });
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'cost_sharing_session', value: TOKEN, url: BASE }]);
  const page = await ctx.newPage();

  // Live legs straight from the endpoint the "Who owes who" card reads
  // (context.request shares the cookie jar; a page-context fetch would die on CORS).
  const opt = await ctx.request.get(`${BASE}/api/v1/groups/${GID}/balances/optimize`);
  if (!opt.ok()) throw new Error(`optimizer fetch ${opt.status()} (bad token? wrong group-id?)`);
  const legs = (await opt.json()).transactions;
  const legOf = {};
  legs.forEach((tx) => { if (tx.amount > EPS) legOf[`${tx.from_user_id}>${tx.to_user_id}`] = tx.amount; });
  const first = Object.entries(legOf)[0];
  if (!first) throw new Error('no unsettled legs in this group — settle/create one first or pass another [group-id]');
  const [FROM, TO] = first[0].split('>');
  const AMOUNT = first[1];
  const members = new Set(legs.flatMap((t) => [t.from_user_id, t.to_user_id]));
  const OTHER = [...members].find((id) => id !== FROM && id !== TO);
  const fmt = (v) => v.toFixed(2);

  await page.goto(`${BASE}/groups/${GID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=/Logout|Sign in/i', { timeout: 15000 });
  await page.click('text=Balances');
  await page.waitForSelector('text=Who owes who', { timeout: 10000 });

  await page.click('button:has-text("Record Settlement")');
  await page.waitForSelector('select', { timeout: 5000 });
  const payerSel = page.locator('select').first();
  const recvSel = page.locator('select').nth(1);
  const amountInput = page.locator('input[type="number"]').first();

  check('T0 fresh form is blank', await amountInput.inputValue(), '');

  await payerSel.selectOption({ value: FROM });
  const optMap = await recvSel.evaluate((sel) =>
    Object.fromEntries([...sel.options].map((o) => [o.value, o.text])));
  check(`T1 receiver '${TO}' option annotated with owed amount`,
    optMap[TO] !== undefined && optMap[TO].includes('owes') && optMap[TO].includes(fmt(AMOUNT)), true);

  await recvSel.selectOption({ value: TO });
  check(`T2 picking the owing receiver prefills ${fmt(AMOUNT)}`, await amountInput.inputValue(), fmt(AMOUNT));

  if (OTHER && legOf[`${FROM}>${OTHER}`] === undefined) {
    await recvSel.selectOption({ value: OTHER });
    check('T3 switching to a no-leg receiver clears the amount', await amountInput.inputValue(), '');
  } else {
    console.log('SKIP  T3 (no suitable no-leg pair in this fixture)');
  }

  await browser.close();
  console.log(failures ? `DONE (${failures} FAILURES)` : 'DONE — all checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
