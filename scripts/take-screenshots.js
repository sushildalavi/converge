const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const OUT = path.resolve(__dirname, '../docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5171';
const API_BASE = process.env.REPLAYFORGE_BASE_URL || 'http://127.0.0.1:8101';
const WAIT_MS = 4000;

async function seedWorkload(count = 40) {
  const r = await fetch(`${API_BASE}/api/demo/generate-workload?count=${count}`, {
    method: 'POST',
  });
  if (!r.ok) {
    throw new Error(`failed to seed workload: ${r.status}`);
  }
}

async function waitForNonEmptyData(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const m = await fetch(`${API_BASE}/api/metrics`);
      const w = await fetch(`${API_BASE}/api/workflows?limit=1`);
      if (m.ok && w.ok) {
        const metrics = await m.json();
        const workflows = await w.json();
        if ((metrics?.total_events || 0) > 0 && Array.isArray(workflows) && workflows.length > 0) {
          return;
        }
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error('timeout waiting for non-empty metrics/workflows');
}

function hydrateShowcaseData() {
  const sql = `
BEGIN;

-- Ensure worker cards and worker table are populated for screenshots.
INSERT INTO workers (id, worker_name, status, last_heartbeat_at, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'go-worker-a', 'active', NOW(), NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'go-worker-b', 'busy', NOW(), NOW(), NOW()),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'go-worker-c', 'active', NOW(), NOW(), NOW()),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'go-worker-drained', 'stopped', NOW() - INTERVAL '5 minutes', NOW(), NOW())
ON CONFLICT (worker_name)
DO UPDATE SET
  status = EXCLUDED.status,
  last_heartbeat_at = EXCLUDED.last_heartbeat_at,
  updated_at = NOW();

-- Create deterministic-looking production metrics mix.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
  FROM events
)
UPDATE events e
SET
  status = CASE
    WHEN r.rn <= 260 THEN 'succeeded'
    WHEN r.rn <= 305 THEN 'failed'
    WHEN r.rn <= 340 THEN 'dead_lettered'
    WHEN r.rn <= 420 THEN 'retrying'
    WHEN r.rn <= 470 THEN 'processing'
    ELSE 'queued'
  END,
  attempt_count = CASE
    WHEN r.rn <= 260 THEN 1 + (r.rn % 2)
    WHEN r.rn <= 305 THEN 2 + (r.rn % 2)
    WHEN r.rn <= 340 THEN 4
    WHEN r.rn <= 420 THEN 2 + (r.rn % 2)
    WHEN r.rn <= 470 THEN 1
    ELSE 0
  END,
  max_attempts = 4,
  last_error = CASE
    WHEN r.rn <= 340 AND r.rn > 260 THEN 'downstream timeout from payment-service'
    WHEN r.rn <= 420 AND r.rn > 340 THEN 'transient network reset'
    ELSE NULL
  END,
  updated_at = NOW() - ((r.rn % 120) || ' seconds')::interval
FROM ranked r
WHERE e.id = r.id;

-- Ensure dead letter rows exist for dead_lettered events.
INSERT INTO dead_letters (id, event_id, reason, last_error, created_at, replay_status)
SELECT
  (
    substr(md5(e.id::text || '-dlq'), 1, 8) || '-' ||
    substr(md5(e.id::text || '-dlq'), 9, 4) || '-' ||
    substr(md5(e.id::text || '-dlq'), 13, 4) || '-' ||
    substr(md5(e.id::text || '-dlq'), 17, 4) || '-' ||
    substr(md5(e.id::text || '-dlq'), 21, 12)
  )::uuid AS id,
  e.id,
  'max attempts exhausted after repeated retries',
  COALESCE(e.last_error, 'transient failure'),
  NOW() - ((ROW_NUMBER() OVER (ORDER BY e.updated_at DESC)) || ' minutes')::interval,
  NULL
FROM events e
WHERE e.status = 'dead_lettered'
ON CONFLICT (id) DO NOTHING;

-- Create realistic event attempts for timeline and latency sections.
INSERT INTO event_attempts (
  id, event_id, attempt_number, worker_id, worker_name, status, error_message,
  metadata_json, started_at, finished_at, duration_ms
)
SELECT
  (
    substr(md5(e.id::text || '-a' || gs.n::text), 1, 8) || '-' ||
    substr(md5(e.id::text || '-a' || gs.n::text), 9, 4) || '-' ||
    substr(md5(e.id::text || '-a' || gs.n::text), 13, 4) || '-' ||
    substr(md5(e.id::text || '-a' || gs.n::text), 17, 4) || '-' ||
    substr(md5(e.id::text || '-a' || gs.n::text), 21, 12)
  )::uuid AS id,
  e.id,
  gs.n,
  CASE (gs.n % 3)
    WHEN 0 THEN '11111111-1111-1111-1111-111111111111'::uuid
    WHEN 1 THEN '22222222-2222-2222-2222-222222222222'::uuid
    ELSE '33333333-3333-3333-3333-333333333333'::uuid
  END AS worker_id,
  CASE (gs.n % 3)
    WHEN 0 THEN 'go-worker-a'
    WHEN 1 THEN 'go-worker-b'
    ELSE 'go-worker-c'
  END AS worker_name,
  CASE
    WHEN gs.n < e.attempt_count THEN 'failed'
    ELSE CASE WHEN e.status = 'succeeded' THEN 'succeeded' ELSE e.status END
  END AS status,
  CASE
    WHEN gs.n < e.attempt_count THEN 'transient upstream timeout'
    WHEN e.status = 'dead_lettered' THEN 'exhausted retry budget'
    ELSE NULL
  END AS error_message,
  '{}'::jsonb,
  NOW() - (((e.attempt_count - gs.n + 1) * 2) || ' minutes')::interval,
  NOW() - (((e.attempt_count - gs.n + 1) * 2) || ' minutes')::interval + ((120 + (gs.n * 55)) || ' milliseconds')::interval,
  (120 + (gs.n * 55))
FROM events e
JOIN LATERAL generate_series(1, GREATEST(e.attempt_count, 1)) gs(n) ON true
ON CONFLICT (id) DO NOTHING;

COMMIT;
`;

  execSync(
    `docker compose exec -T postgres psql -U replayforge_cp -d replayforge -v ON_ERROR_STOP=1 <<'SQL'\n${sql}\nSQL`,
    { stdio: 'inherit', cwd: path.resolve(__dirname, '..') }
  );
}

function refreshWorkerHeartbeats() {
  const sql = `
UPDATE workers
SET
  status = CASE
    WHEN worker_name = 'go-worker-b' THEN 'busy'
    WHEN worker_name = 'go-worker-drained' THEN 'active'
    ELSE 'active'
  END,
  last_heartbeat_at = NOW(),
  updated_at = NOW()
WHERE worker_name IN ('go-worker-a', 'go-worker-b', 'go-worker-c', 'go-worker-drained');
`;
  execSync(
    `docker compose exec -T postgres psql -U replayforge_cp -d replayforge -v ON_ERROR_STOP=1 -c "${sql.replace(/\n/g, ' ')}"`,
    { stdio: 'inherit', cwd: path.resolve(__dirname, '..') }
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  console.log('🧪 seeding workload...');
  await seedWorkload(50);
  await waitForNonEmptyData();
  console.log('🧩 hydrating showcase metrics...');
  hydrateShowcaseData();

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
  refreshWorkerHeartbeats();
  await page.goto(`${BASE}/workers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(WAIT_MS);
  await page.screenshot({ path: `${OUT}/workers.png`, fullPage: false });

  // ── 6. Workflow Detail — grab first workflow ID from API
  console.log('📸 workflow-detail...');
  try {
    const r = await fetch(`${API_BASE}/api/workflows?limit=1`);
    const resp = await r.json();
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
      }
      await page.screenshot({ path: `${OUT}/workflow-timeline-expanded.png`, fullPage: false });
    } else {
      // Fallback: capture workflows listing when no detail ID is available.
      await page.goto(`${BASE}/workflows`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(WAIT_MS);
      await page.screenshot({ path: `${OUT}/workflow-detail.png`, fullPage: false });
      await page.screenshot({ path: `${OUT}/workflow-timeline-expanded.png`, fullPage: false });
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
