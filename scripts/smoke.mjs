import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const outDir = '/opt/cursor/artifacts';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

await page.getByTestId('tracking-gate').waitFor();
await page.getByTestId('accept-tracking').click();
await page.getByTestId('app-shell').waitFor();

const before = await page.getByTestId('job-list').locator('button.job-item').count();

async function createViaForm(typeTestId, title) {
  await page.getByTestId(typeTestId).click();
  await page.getByTestId('new-incident-form').waitFor();
  await page.getByTestId('form-title').fill(title);
  await page.getByTestId('form-submit-create').click();
  await page.getByTestId('new-incident-form').waitFor({ state: 'hidden' });
}

await createViaForm('new-cordon', 'Smoke Cordon');
await createViaForm('new-land_sar', 'Smoke Land SAR');
await createViaForm('new-marine_sar', 'Smoke Marine');
await createViaForm('new-public_order', 'Smoke Public Order');
await createViaForm('new-road_block', 'Smoke Road Block');

const after = await page.getByTestId('job-list').locator('button.job-item').count();
if (after < before + 5) {
  throw new Error(`Expected at least ${before + 5} jobs, got ${after}`);
}

await page.getByText('Siege — Ann St commercial').click();
await page.getByText('Resources placed').waitFor();
await page.screenshot({ path: `${outDir}/bugfix-01-form-and-cordon.png`, fullPage: true });

await page.getByText('Public order — CBD march').click();
await page.getByText('Snapped features:').waitFor();
const snapped = await page.locator('text=Snapped features:').first().innerText();
if (!/Bridge|Victoria|Queen|Ann|George/i.test(snapped)) {
  throw new Error(`Public order route did not snap to streets/bridges: ${snapped}`);
}
await page.screenshot({ path: `${outDir}/bugfix-02-public-order-snapped.png`, fullPage: true });

await page.getByTestId('toggle-lights').click();
await page.getByTestId('lights-status').waitFor();
const lightsOn = await page.getByTestId('lights-status').innerText();
if (!/Lights ON/i.test(lightsOn)) {
  throw new Error(`Street lights did not turn on: ${lightsOn}`);
}
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/bugfix-03-street-lights-on.png`, fullPage: true });

await page.getByTestId('toggle-map-dark').click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/bugfix-04-map-light.png`, fullPage: true });
await page.getByTestId('toggle-map-dark').click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/bugfix-05-map-dark.png`, fullPage: true });

await page.getByTestId('probe-egress').click();
const blocked = await page.getByTestId('egress-blocked-count').innerText();
if (!/Blocked attempts this session: [1-9]/.test(blocked)) {
  throw new Error(`Egress counter did not increment: ${blocked}`);
}

console.log(JSON.stringify({ ok: true, jobsBefore: before, jobsAfter: after, snapped, lightsOn, blocked }, null, 2));
await browser.close();
