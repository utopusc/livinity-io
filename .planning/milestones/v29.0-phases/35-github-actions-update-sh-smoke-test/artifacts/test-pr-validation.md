# Phase 35 — Workflow Validation Procedure (SC-3 opt-in)

The smoke workflow's automatic PR-trigger PROVES SC-1 (workflow exists, fires on the right paths) and SC-2 (build pipeline runs, dist verified) on every clean PR. SC-3 ("a PR with intentional break is BLOCKED") requires opening a deliberately-broken PR. This is an **opt-in operator action** — not part of the automated phase execution.

## When to run

Once after the workflow ships, then never again unless you change the workflow itself or want to re-baseline confidence.

## Procedure (5 minutes)

1. From master, branch off:
   ```bash
   git checkout -b phase35-smoke-validation-canary
   ```

2. Introduce an obvious TypeScript error in `nexus/packages/core/src/index.ts` (or any file the workflow builds). For example, append:
   ```typescript
   const broken: number = "this is a string";  // Phase 35 canary — TS2322
   ```

3. Commit + push + open PR:
   ```bash
   git add nexus/packages/core/src/index.ts
   git commit -m "test(35): canary — intentional TS error to validate smoke gate"
   git push -u origin phase35-smoke-validation-canary
   gh pr create --title "test(35): canary — DO NOT MERGE" \
                --body "Phase 35 smoke-gate validation. Should FAIL the smoke workflow."
   ```

4. Watch the PR's GitHub Actions tab. Within ~3-8 minutes:
   - **EXPECTED:** `update.sh build smoke test` workflow fires, runs to the "Build @nexus/core" step, FAILS with TS2322
   - **GREEN MERGE BUTTON:** disabled (assuming branch protection rules require this check to pass)

5. Close the PR without merging:
   ```bash
   gh pr close phase35-smoke-validation-canary
   git push origin --delete phase35-smoke-validation-canary
   git checkout master
   git branch -D phase35-smoke-validation-canary
   ```

6. Document the validation result in this file (append a `## Validation Log` section with date + result).

## Required GitHub repository setup (one-time)

For SC-3 to be fully enforced (PR cannot merge if smoke fails), branch protection rules must require this status check:

```bash
gh api -X PUT repos/utopusc/livinity-io/branches/master/protection \
  -f required_status_checks='{"strict":true,"contexts":["update.sh build smoke test / Build pipeline smoke (mirrors update.sh)"]}'
```

Or via GitHub UI: Settings → Branches → master → Protect matching branches → Require status checks to pass before merging → Add "update.sh build smoke test" check.

## Validation Log

(Append entries after each validation run)

- (none yet — first run pending operator opt-in)
