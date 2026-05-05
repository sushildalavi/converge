const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(__dirname, '../docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';
const WAIT_MS = 4000;

async function waitForData(page, selector, timeout = 8000) {
  try { await page.waitForSelector(selector, { timeout }); } catch {}
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ── 1. Dashboard
  console.log('📸 dashboard...');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(WAIT_MS);
  await page.screenshot({ path: `${OUT}/dashboard.png`, fullPage: false });

  // ── 2. Dashboard scrolled to show charts + table
  console.log('📸 dashboard-charts...');
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/dashboard-charts.png`, fullPage: false });
  await page.evaluate(() => window.scrollTo(0, 0));

  // ── 3. Command palette
  console.log('📸 command-palette...');
  await page.keyboard.down('Meta');
  await page.keyboard.press('k');
  await page.keyboard.up('Meta');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/command-palette.png`, fullPage: false });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ── 4. Dead Letters
  console.log('📸 dead-letters...');
  await page.goto(`${BASE}/deadletters`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(WAIT_MS);
  await page.screenshot({ path: `${OUT}/dead-letters.png`, fullPage: false });

  // ── 5. Workers
  console.log('📸 workers...');
  await page.goto(`${BASE}/workers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(WAIT_MS);
  await page.screenshot({ path: `${OUT}/workers.png`, fullPage: false });

  // ── 6. Workflow Detail — grab first workflow ID from API
  console.log('📸 workflow-detail...');
  try {
    const resp = await page.evaluate(async () => {
      const r = await fetch('http://localhost:8000/api/workflows?limit=1');
      return r.json();
    });
    const wfId = resp[0]?.workflow_id;
    if (wfId) {
      await page.goto(`${BASE}/workflows/${wfId}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(WAIT_MS);
      await page.screenshot({ path: `${OUT}/workflow-detail.png`, fullPage: false });

      // Expand first timeline item
      const firstEvent = await page.$('[class*="cursor-pointer"]');
      if (firstEvent) {
        await firstEvent.click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${OUT}/workflow-timeline-expanded.png`, fullPage: false });
      }
    }
  } catch (e) {
    console.log('  workflow detail skipped:', e.message);
  }

  // ── 7. Full dashboard screenshot
  console.log('📸 dashboard-full...');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(WAIT_MS);
  await page.screenshot({ path: `${OUT}/dashboard-full.png`, fullPage: true });

  await browser.close();
  console.log('\n✓ Screenshots saved to docs/screenshots/');
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  files.forEach(f => {
    const size = (fs.statSync(`${OUT}/${f}`).size / 1024).toFixed(0);
    console.log(`  ${f} (${size} KB)`);
  });
})();
