# Scenario 07: Q&A, Changes & Sources Pages

**Time:** ~5 minutes
**Parallel Safe:** No
**LLM Required:** No

Verifies the remaining UI pages render correctly with data from earlier scenarios.

## Prerequisites

- Scenarios 01–04 passed — project has questions, changesets, releases

## Test Script

`tests/e2e/manual-07-pages.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const EDEN_URL = process.env.EDEN_URL || 'https://eden.incept5-eden-sandbox.eh1.incept5.dev';
const PROJECT_SLUG = process.env.PROJECT_SLUG || 'manual-test';

test.describe('Scenario 07: Application Pages', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(EDEN_URL);
    await page.waitForURL('**/projects/**', { timeout: 15000 });
    await page.click(`text=${PROJECT_SLUG}`);
  });

  test('Q&A page shows questions with status', async ({ page }) => {
    await page.click('text=Q&A');
    await page.waitForSelector('[data-testid="qa-page"]', { timeout: 10000 });

    await expect(page.locator('text=file size limit')).toBeVisible();
    await expect(page.locator('text=expert panel run')).toBeVisible();
    await expect(page.locator('text=answered').first()).toBeVisible();
  });

  test('Changes page shows accepted and rejected changesets', async ({ page }) => {
    await page.click('text=Changes');
    await page.waitForSelector('[data-testid="changes-page"]', { timeout: 10000 });

    await expect(page.locator('text=Add security review step')).toBeVisible();
    await expect(page.locator('text=Remove all personas')).toBeVisible();

    await page.click('text=Accepted');
    await expect(page.locator('text=Add security review step')).toBeVisible();

    await page.click('text=Rejected');
    await expect(page.locator('text=Remove all personas')).toBeVisible();
  });

  test('Releases page shows MVP Release with assigned tasks', async ({ page }) => {
    await page.click('text=Releases');
    await page.waitForSelector('[data-testid="releases-page"]', { timeout: 10000 });

    await expect(page.locator('text=MVP Release')).toBeVisible();
    await expect(page.locator('text=planning')).toBeVisible();
  });

  test('Audit page shows operation history', async ({ page }) => {
    await page.click('text=Audit');
    await page.waitForSelector('[data-testid="audit-page"]', { timeout: 10000 });

    const rows = page.locator('[data-testid^="audit-entry-"]');
    const count = await rows.count();
    expect(count).toBeGreaterThan(10);
  });

  test('Sources page allows document upload', async ({ page }) => {
    await page.click('text=Sources');
    await page.waitForSelector('[data-testid="sources-page"]', { timeout: 10000 });

    const uploadZone = page.locator('[data-testid="upload-zone"]')
      .or(page.locator('text=upload').or(page.locator('text=drag')));
    await expect(uploadZone.first()).toBeVisible();
  });
});
```

## Running

```bash
cd apps/web
npx playwright test tests/e2e/manual-07-pages.spec.ts --reporter=list
```

  test('Reviews page shows expert panel reviews', async ({ page }) => {
    await page.click('text=Reviews');
    await page.waitForTimeout(3000);

    // Page should load without errors (no 404 banner)
    await expect(page.locator('text=Reviews').first()).toBeVisible();
    await expect(page.locator('text=Expert panel reviews')).toBeVisible();

    // Should show either review cards or the empty state — not a 404 error
    const errorBanner = page.locator('.bg-red-50');
    await expect(errorBanner).not.toBeVisible();

    // Should show either reviews list or empty state message
    const content = page.locator('text=No reviews yet').or(page.locator('text=expert'));
    await expect(content.first()).toBeVisible();
  });
});
```

## Running

```bash
cd apps/web
npx playwright test tests/e2e/manual-07-pages.spec.ts --reporter=list
```

## Success Criteria

- [ ] Q&A page displays questions with open/answered status
- [ ] Changes page shows accepted and rejected changesets
- [ ] Changes page status tabs filter correctly
- [ ] Releases page shows MVP Release
- [ ] Audit page shows 10+ historical entries
- [ ] Sources page has document upload area
- [ ] Reviews page loads without 404 error
- [ ] Reviews page shows review cards or empty state (not error)
