import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const outDir = '/opt/cursor/artifacts';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByTestId('accept-tracking').click();
await page.getByTestId('app-shell').waitFor();

async function create(typeId, title) {
  await page.getByTestId('new-incident-menu').click();
  await page.getByTestId(typeId).click();
  await page.getByTestId('new-incident-form').waitFor();
  await page.getByTestId('form-title').fill(title);
  await page.getByTestId('form-next').click();
  await page.getByTestId('form-next').click();
  await page.getByTestId('form-submit-create').click();
  await page.getByTestId('new-incident-form').waitFor({ state: 'hidden' });
}

const before = await page.getByTestId('job-list').locator('button.job-row').count();
await create('new-cordon', 'Smoke Cordon');
await page.getByTestId('return-home').click();
await create('new-public_order', 'Smoke PO');
await page.getByTestId('return-home').click();
const after = await page.getByTestId('job-list').locator('button.job-row').count();
if (after < before + 2) throw new Error(`jobs ${before} -> ${after}`);

await page.getByText('Public order — CBD march').click();
await page.getByTestId('duty-panel').waitFor();
await page.getByTestId('open-incident-workspace').click();
await page.getByTestId('detail-panel').waitFor();
const snapped = await page.locator('text=Snapped features:').first().innerText();
if (!/Victoria Bridge/i.test(snapped)) throw new Error(snapped);

await page.getByTestId('toggle-lights').click();
const lights = await page.getByTestId('lights-status').innerText();
if (!/street_lamp/i.test(lights) || !/\d+/.test(lights)) throw new Error(lights);

await page.screenshot({ path: `${outDir}/rebuild-smoke.png`, fullPage: true });
console.log(JSON.stringify({ ok: true, before, after, snapped: snapped.slice(0, 120), lights }, null, 2));
await browser.close();
