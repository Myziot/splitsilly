// Playwright proof: Record Settlement modal prefills amount from the
// "Who owes who" legs; pairs with no leg stay blank.
const path = require('path');
const { chromium } = require(path.join(process.env.HOME, '.hermes/hermes-agent/node_modules/playwright'));

const TOKEN = process.argv[2];
const GID = '26186ae3-50a9-4a16-a255-301889d7b4f2';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/captain/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    headless: true,
  });
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'cost_sharing_session', value: TOKEN, url: 'http://localhost:3002' }]);
  const page = await ctx.newPage();
  await page.goto(`http://localhost:3002/groups/${GID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=/Logout|Sign in/i', { timeout: 15000 });

  // Balances tab
  await page.click('text=Balances');
  await page.waitForSelector('text=Who owes who', { timeout: 10000 });
  const cardText = await page.locator('text=Who owes who').locator('..').locator('..').innerText().catch(() => '');
  console.log('CARD:', cardText.replace(/\n/g, ' | ').slice(0, 300));

  // Open Record Settlement
  await page.click('button:has-text("Record Settlement")');
  await page.waitForSelector('text=Record Settlement', { timeout: 5000 });

  const amountInput = page.locator('input[type="number"]').first();
  console.log('T0 initial amount (expect blank):', JSON.stringify(await amountInput.inputValue()));

  // Admin payer select = first select in modal
  const payerSel = page.locator('select').first();
  const recvSel = page.locator('select').nth(1);

  // Receiver options as viewer (Captain owes nobody -> no annotations)
  console.log('T1 viewer options:', (await recvSel.locator('option').allInnerTexts()).join(' / '));

  // Switch payer to Sailor
  await payerSel.selectOption({ label: 'Sailor' });
  console.log('T2 payer=Sailor options:', (await recvSel.locator('option').allInnerTexts()).join(' / '));

  // Pick receiver Captain -> expect prefill 94.17
  await recvSel.selectOption('eec07007-b234-472a-b2fe-cbf7f4d6945b');
  console.log('T3 payer=Sailor recv=Captain amount (expect 94.17):', JSON.stringify(await amountInput.inputValue()));
  const hint = await page.locator('text=full amount').innerText().catch(() => '(no hint)');
  console.log('T3 hint:', hint.replace(/\n/g, ' '));

  // Switch receiver to Kraken -> no Sailor->Kraken leg -> expect blank
  await recvSel.selectOption('14d8c754-42d9-4472-a50a-865e23439075');
  console.log('T4 payer=Sailor recv=Kraken amount (expect blank):', JSON.stringify(await amountInput.inputValue()));

  // Switch payer to Kraken, receiver stays -> Kraken->Kraken impossible; re-pick Captain -> 94.17
  await payerSel.selectOption({ label: 'Kraken' });
  await recvSel.selectOption('eec07007-b234-472a-b2fe-cbf7f4d6945b');
  console.log('T5 payer=Kraken recv=Captain amount (expect 94.17):', JSON.stringify(await amountInput.inputValue()));

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
