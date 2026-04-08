---
name: dev-browser-verification
description: Verify Eden sandbox with dev-browser using a workspace-local state directory and CLI-token login. Default target is the Estm8 project map on staging.
---

# Dev Browser Verification

Use this skill when you need repeatable browser verification against Eden sandbox with `dev-browser`.

This repo keeps `dev-browser` state inside the workspace instead of `~/.dev-browser`. Use the bundled wrapper:

`private-skills/dev-browser-verification/scripts/dev-browser-workspace`

The wrapper redirects `dev-browser` into:

`<repo>/.tmp/dev-browser-home/.dev-browser`

That keeps browser state gitignored and avoids the home-directory write assumptions that can break in agent runtimes.
The wrapper also bootstraps the daemon directly instead of relying on `dev-browser`'s auto-start path.

## First Run

Install the embedded runtime and Chromium into the workspace-local home:

```bash
private-skills/dev-browser-verification/scripts/dev-browser-workspace install
```

Smoke-check the local daemon:

```bash
private-skills/dev-browser-verification/scripts/dev-browser-workspace status
private-skills/dev-browser-verification/scripts/dev-browser-workspace browsers
private-skills/dev-browser-verification/scripts/dev-browser-workspace log-file
```

## Default Target

- Base URL: `https://eden.eh1.incept5.dev`
- Default project: `Estm8`
- Project ID: `b3db32f2-4d81-42fc-80b0-7406a810dc3e`
- Default page: `https://eden.eh1.incept5.dev/projects/b3db32f2-4d81-42fc-80b0-7406a810dc3e/map`

Unless the user says otherwise, verify against the Estm8 project first.

## Auth Flow

Use the token-paste flow for deterministic browser runs:

1. Fetch a token in the normal shell:

```bash
TOKEN="$(eve auth token --raw)"
```

2. Open Eden with the wrapper-backed `dev-browser`
3. Click `Paste CLI token`
4. Fill `#token`
5. Click `Sign in`
6. Wait for the target project URL

Do not run `eve auth token` through the wrapper. The wrapper overrides `HOME` specifically for `dev-browser`.

## Estm8 Smoke Template

```bash
TOKEN="$(eve auth token --raw)"

private-skills/dev-browser-verification/scripts/dev-browser-workspace \
  --browser eden-sandbox \
  --headless \
  --timeout 60 <<EOF
const page = await browser.getPage("estm8");
await page.goto(
  "https://eden.eh1.incept5.dev/projects/b3db32f2-4d81-42fc-80b0-7406a810dc3e/map",
  { waitUntil: "domcontentloaded" }
);

await page.getByRole("button", { name: "Paste CLI token" }).click();
await page.locator("#token").fill("$TOKEN");
await page.getByRole("button", { name: "Sign in" }).click();

await page.waitForURL(
  "**/projects/b3db32f2-4d81-42fc-80b0-7406a810dc3e/map",
  { timeout: 30000 }
);
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

const snapshot = await page.snapshotForAI({ depth: 3, timeout: 15000 });
const screenshotPath = await saveScreenshot(
  await page.screenshot({ fullPage: true }),
  "estm8-map.png"
);

console.log(JSON.stringify({
  url: page.url(),
  title: await page.title(),
  screenshotPath,
  snapshot: snapshot.full.slice(0, 4000)
}, null, 2));
EOF
```

Artifacts land under:

`<repo>/.tmp/dev-browser-home/.dev-browser/tmp`

## Working Pattern

- Keep one browser name per target environment, usually `eden-sandbox`
- Keep stable page names like `estm8`, `projects`, or `wizard`
- Reuse named pages across scripts instead of redoing login every time
- End each script with URL, title, and screenshot path
- Use `snapshotForAI()` after major UI changes and before describing visible state
- If `dev-browser` gets into a bad state, run:

```bash
private-skills/dev-browser-verification/scripts/dev-browser-workspace stop
private-skills/dev-browser-verification/scripts/dev-browser-workspace status
sed -n '1,200p' "$(private-skills/dev-browser-verification/scripts/dev-browser-workspace log-file)"
```
