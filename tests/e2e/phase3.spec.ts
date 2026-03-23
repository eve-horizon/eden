// tests/e2e/phase3.spec.ts — Phase 3 E2E against staging sandbox
import { test, expect } from '@playwright/test';

const BASE = `https://eden-app.${process.env.ORG_SLUG}-eden-sandbox.eh1.incept5.dev`;

test.describe('Phase 3 — Intelligence Layer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate((token) => {
      sessionStorage.setItem('eve_access_token', token);
    }, process.env.TOKEN);
    await page.reload();
  });

  test('V3.7 — Cross-cutting questions panel opens', async ({ page }) => {
    await page.goto(`${BASE}/projects/test-project/map`);
    await page.click('[data-testid="cross-cutting-qs-btn"]');
    const panel = page.locator('[data-testid="cross-cutting-panel"]');
    await expect(panel).toBeVisible();
  });

  test('V3.8 — Question modal opens from task card', async ({ page }) => {
    await page.goto(`${BASE}/projects/test-project/map`);
    await page.click('[data-testid="question-pill"]');
    const modal = page.locator('[data-testid="question-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-testid="evolve-btn"]')).toBeVisible();
  });

  test('V3.8b — Evolve Map button triggers evolution', async ({ page }) => {
    await page.goto(`${BASE}/projects/test-project/map`);
    await page.click('[data-testid="question-pill"]');
    const modal = page.locator('[data-testid="question-modal"]');
    await modal.locator('textarea').fill('Yes, add guest checkout support');
    await modal.locator('[data-testid="evolve-btn"]').click();
    await expect(page.locator('[data-testid="toast"]')).toContainText(/evolve|triggered/i);
  });

  test('V3.9 — Chat panel opens and sends message', async ({ page }) => {
    await page.goto(`${BASE}/projects/test-project/map`);
    await page.click('[data-testid="chat-toggle-btn"]');
    const panel = page.locator('[data-testid="chat-panel"]');
    await expect(panel).toBeVisible();

    await panel.locator('[data-testid="chat-input"]').fill('What tasks are in the onboarding flow?');
    await panel.locator('[data-testid="chat-send-btn"]').click();

    await expect(panel.locator('[data-testid="typing-indicator"]')).toBeVisible();

    const aiMessage = panel.locator('[data-testid="chat-message-assistant"]').first();
    await expect(aiMessage).toBeVisible({ timeout: 60_000 });
  });

  test('V3.11 — Chat response with changeset link opens review modal', async ({ page }) => {
    await page.goto(`${BASE}/projects/test-project/map`);
    await page.click('[data-testid="chat-toggle-btn"]');
    const panel = page.locator('[data-testid="chat-panel"]');

    await panel.locator('[data-testid="chat-input"]').fill('Add a password reset flow');
    await panel.locator('[data-testid="chat-send-btn"]').click();

    const changesetBtn = panel.locator('[data-testid="review-changeset-btn"]');
    await expect(changesetBtn).toBeVisible({ timeout: 90_000 });

    await changesetBtn.click();
    await expect(page.locator('[data-testid="changeset-review-modal"]')).toBeVisible();
  });

  test('V3.1 — Changes page shows agent-created changesets', async ({ page }) => {
    await page.goto(`${BASE}/projects/test-project/changes`);
    const rows = page.locator('[data-testid="changeset-row"]');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });
});
