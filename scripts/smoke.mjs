import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const outDir = '/opt/cursor/artifacts';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

// Clear prior consent and reload for a clean gate check
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

await page.getByTestId('tracking-gate').waitFor();
await page.screenshot({ path: `${outDir}/preserve-01-consent-gate.png`, fullPage: true });
await page.getByTestId('accept-tracking').click();
await page.getByTestId('app-shell').waitFor();
await page.screenshot({ path: `${outDir}/preserve-02-shell.png`, fullPage: true });

const before = await page.getByTestId('job-list').locator('button.job-item').count();
await page.getByTestId('new-cordon').click();
await page.getByTestId('new-cordon').click();
await page.getByTestId('new-land_sar').click();
await page.getByTestId('new-marine_sar').click();
await page.getByTestId('new-public_order').click();
await page.getByTestId('new-road_block').click();
const after = await page.getByTestId('job-list').locator('button.job-item').count();
if (after < before + 6) {
  throw new Error(`Expected at least ${before + 6} jobs, got ${after}`);
}

await page.getByText('Siege — Ann St commercial').click();
await page.getByText('Resources placed').waitFor();
await page.screenshot({ path: `${outDir}/preserve-03-cordon.png`, fullPage: true });

await page.getByText('MP — West End river precinct').click();
await page.getByTestId('land-sar-briefing').waitFor();
await page.screenshot({ path: `${outDir}/preserve-04-land-sar.png`, fullPage: true });

await page.getByTestId('probe-egress').click();
const blocked = await page.getByTestId('egress-blocked-count').innerText();
if (!/Blocked attempts this session: [1-9]/.test(blocked)) {
  throw new Error(`Egress counter did not increment: ${blocked}`);
}

await page.getByTestId('toggle-3d').click();
await page.getByTestId('toggle-lights').click();
await page.getByTestId('user-select').selectOption('u-sert1');
await page.getByTestId('user-select').selectOption('u-gd1');
await page.screenshot({ path: `${outDir}/preserve-05-toggles-user.png`, fullPage: true });

console.log(JSON.stringify({ ok: true, jobsBefore: before, jobsAfter: after, blocked }, null, 2));
await browser.close();
