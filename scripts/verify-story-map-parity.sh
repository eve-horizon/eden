#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_BROWSER="$ROOT_DIR/private-skills/dev-browser-verification/scripts/dev-browser-workspace"
PROJECT_URL="${1:-${EDEN_PARITY_URL:-https://eden.eh1.incept5.dev/projects/c9d332fc-be0e-425b-b40f-f4b463da4f75/map}}"
ORG_ID="${EDEN_ORG_ID:-org_Incept5}"
BROWSER_NAME="${EDEN_PARITY_BROWSER:-eden-sandbox}"
PAGE_NAME="${EDEN_PARITY_PAGE:-story-map-parity}"
TOKEN="$(eve auth token --raw)"
TOKEN_JSON="$(node -p 'JSON.stringify(process.argv[1])' "$TOKEN")"
ORG_ID_JSON="$(node -p 'JSON.stringify(process.argv[1])' "$ORG_ID")"
PROJECT_URL_JSON="$(node -p 'JSON.stringify(process.argv[1])' "$PROJECT_URL")"
PAGE_NAME_JSON="$(node -p 'JSON.stringify(process.argv[1])' "$PAGE_NAME")"

"$DEV_BROWSER" \
  --browser "$BROWSER_NAME" \
  --headless \
  --timeout 120 <<EOF
const token = $TOKEN_JSON;
const orgId = $ORG_ID_JSON;
const projectUrl = $PROJECT_URL_JSON;
const pageName = $PAGE_NAME_JSON;

function fail(message) {
  console.error(`PARITY CHECK FAILED: ${message}`);
  throw new Error(message);
}

async function expectVisible(locator, message) {
  if (await locator.count() === 0) fail(message);
  await locator.first().waitFor({ state: 'visible', timeout: 10000 });
}

const page = await browser.getPage(pageName);
await page.goto('https://eden.eh1.incept5.dev', { waitUntil: 'domcontentloaded' });
await page.evaluate(({ token, orgId }) => {
  sessionStorage.setItem('eve_access_token', token);
  localStorage.setItem('eve_active_org_id', orgId);
}, { token, orgId });

await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

await expectVisible(page.locator('[data-testid="persona-tabs"]'), 'Persona tabs missing');
await expectVisible(page.locator('[data-testid="story-map-legend"]'), 'Legend missing');
await expectVisible(page.locator('[data-testid="role-filter-pills"]'), 'Role filters missing');

const cards = page.locator('[data-testid^="task-card-"]');
const cardCount = await cards.count();
if (cardCount === 0) fail('No task cards found');

const firstCard = cards.first();
const firstCardTestId = await firstCard.getAttribute('data-testid');
if (!firstCardTestId) fail('First task card missing data-testid');
const firstDisplayId = firstCardTestId.replace(/^task-card-/, '');

await expectVisible(firstCard.locator('[data-testid^="task-device-"]'), 'Device badge missing on first task card');

await firstCard.click({ position: { x: 20, y: 20 } });
const expanded = page.locator(\`[data-testid="task-card-expanded-\${firstDisplayId}"]\`);
await expectVisible(expanded, 'Task card did not expand on single click');

const acRows = expanded.locator('[data-testid^="acceptance-criterion-"]');
const acCount = await acRows.count();
if (acCount === 0) fail('Expanded task card is missing acceptance criteria');
const acIds = await acRows.evaluateAll((nodes) =>
  nodes.map((node) => (node.getAttribute('data-testid') || '').replace('acceptance-criterion-', ''))
);

const roleButtons = page.locator('[data-testid^="role-filter-"]');
const roleCount = await roleButtons.count();
let roleCheck = null;
if (roleCount > 1) {
  const firstCardOpacityBefore = await firstCard.evaluate((el) => getComputedStyle(el).opacity);
  for (let i = 0; i < roleCount; i += 1) {
    const button = roleButtons.nth(i);
    const testId = await button.getAttribute('data-testid');
    if (!testId || testId === 'role-filter-clear') continue;
    await button.click();
    await page.waitForTimeout(300);
    const opacity = await firstCard.evaluate((el) => getComputedStyle(el).opacity);
    if (opacity !== firstCardOpacityBefore) {
      roleCheck = {
        button: testId,
        before: firstCardOpacityBefore,
        after: opacity,
      };
      break;
    }
    await page.locator('[data-testid="role-filter-clear"]').click().catch(() => {});
    await page.waitForTimeout(150);
  }

  if (!roleCheck) fail('Role highlight did not dim the first task card');
}

await page.getByRole('button', { name: 'Filter ▾' }).click();
const activityButtons = page.locator('[data-testid^="activity-filter-ACT-"]');
const activityCount = await activityButtons.count();
let activityCheck = null;
if (activityCount > 1) {
  for (let i = 0; i < activityCount; i += 1) {
    const button = activityButtons.nth(i);
    const testId = await button.getAttribute('data-testid');
    if (!testId) continue;
    const displayId = testId.replace('activity-filter-', '');
    const header = page.locator(\`[data-testid="activity-\${displayId}"]\`);
    const before = await header.evaluate((el) => getComputedStyle(el).opacity);
    await button.click();
    await page.waitForTimeout(300);
    const after = await header.evaluate((el) => getComputedStyle(el).opacity);
    if (before !== after) {
      activityCheck = { displayId, before, after };
      break;
    }
  }
  if (!activityCheck) fail('Activity filter did not dim any activity column');
}

const screenshotPath = await saveScreenshot(
  await page.screenshot({ fullPage: true }),
  'story-map-parity.png',
);
const snapshot = await page.snapshotForAI({ depth: 4, timeout: 20000 });

console.log(JSON.stringify({
  url: page.url(),
  title: await page.title(),
  screenshotPath,
  firstDisplayId,
  taskCardCount: cardCount,
  acceptanceCriteria: acIds,
  roleCheck,
  activityCheck,
  snapshot: snapshot.full.slice(0, 8000),
}, null, 2));
EOF
