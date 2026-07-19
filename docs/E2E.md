# Deterministic browser release gate

## Prerequisites

Docker and local Supabase must be running. Reset to the repository migrations before a release run:

```text
npx supabase start
npx supabase db reset
```

The suite reads local keys from `npx supabase status -o env`. Both browser helpers reject any Supabase URL that is not plain HTTP on `127.0.0.1` or `localhost`. Hosted Auth and hosted Supabase are not exercised.

## Commands

```text
npm run test:e2e
npm run test:e2e:mobile
npm run test:e2e:stale
npm run test:e2e:headed
```

The desktop project uses Chromium at 1440×900. The mobile project uses a real Playwright context at 390×844 with touch and mobile behavior enabled.

## Isolation and authentication

Global setup creates a unique confirmed owner and clean workspace through `scripts/browser-test-owner.mjs`. Credentials are written with mode 0600 to ignored `test-results/e2e-owner.json`, read only by the Node test process, and entered through the normal `AuthGate`. No Auth bypass or service-role credential enters browser code.

Playwright owns the Vite process through `scripts/browser-test-server.mjs`. Global teardown deletes the owner, which cascades its isolated workspace, and removes the runtime credential file only after deletion succeeds. Playwright stops the server even after a failing test. Tests use unique run-scoped names, one worker, no retries, and do not depend on execution order.

## Coverage

Desktop coverage creates two Workspace Ingredients; edits Identity and a bounded measurement; creates Evidence, a Role, and canonical Compatibility; links both children to Evidence; exercises Stay, focus trapping, Escape, save, refresh, deletion blocking, unlinking, deletion, and an operational-table no-write check.

Validation coverage verifies the page summary, associated field error, first-invalid focus, retained input, dirty guard, deliberate discard, and absence after returning.

The `@stale` flow signs the same ephemeral owner into two isolated contexts, saves context A, rejects context B’s stale aggregate, retains its local value and navigation guard, and confirms that reloading reveals A’s remote value without force-overwrite or internal error disclosure.

Mobile coverage exercises the linked aggregate, mobile navigation, leave dialog, save, refresh, evidence links, deletion warning, account/header navigation, below-fold destructive-action reachability, and page-level overflow at 390×844.

## Failure artifacts

Successful runs retain no media. Failures are written below `test-results/playwright/` with screenshot, video, trace, and an accessibility-oriented error snapshot. The HTML report is written to `test-results/playwright-report/`. Inspect a trace with:

```text
npx playwright show-trace test-results/playwright/<test>/trace.zip
```
