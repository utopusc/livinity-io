---
phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows
reviewed: 2026-06-02T00:00:00Z
depth: standard
review_type: gap-closure
diff_base: cbf4365e83bc3a385b43bc9e107b53dbf4a4bd62
files_reviewed: 6
files_reviewed_list:
  - livos/packages/livinityd/source/modules/computer-use/trpc-router.ts
  - livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts
  - livos/packages/livinityd/source/modules/computer-use/displays/types.ts
  - livos/packages/livinityd/source/index.ts
  - livos/packages/livinityd/source/modules/computer-use/__tests__/trpc-router-authz.test.ts
  - livos/packages/livinityd/source/modules/computer-use/displays/__tests__/display-manager.test.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 254: Code Review Report (Gap-Closure Re-Review)

**Reviewed:** 2026-06-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found
**Scope:** gap-closure diff since `cbf4365e` (254-05 registerExisting + boot wiring; 254-06 canAccessDisplay admin-bypass authz)

## Summary

This is a gap-closure re-review covering only the two plans executed after `cbf4365e`:

- **254-05** — `DisplayManager.registerExisting()` plus boot wiring in `index.ts` to adopt the running `:1` host Xvfb into Redis (record-only, no spawn) so it surfaces in `displays.list` and resolves via `getVncUrl(':1')`.
- **254-06** (CR-01 fix) — extracted a pure `canAccessDisplay({ownerSession, callerSession, callerRole})` predicate and wired it into `getVncUrl`, replacing the broken `ctx.currentUser.id` (UUID) vs `owner_session` (luse session string) comparison with an admin-role bypass.

**Security assessment of the 254-06 authorization change: SOUND, no escalation hole.**

The admin bypass keys on `ctx.currentUser.role === 'admin'`, and `role` is exclusively server-derived: `is-authenticated.ts` and `context.ts` set `currentUser` from a DB lookup (`findUserById`/`getAdminUser`) keyed off a server-verified JWT payload, never from any client-supplied field. There is no input path through which a member/guest can present `role: 'admin'`. `canAccessDisplay` short-circuits the shared case (`!ownerSession → true`) correctly, denies a non-admin caller whose session does not equal a non-empty `owner_session`, and the matrix test (`trpc-router-authz.test.ts`) pins all four corners (shared, admin-bypass, owner-match, foreign-deny incl. guest). The returned `wsUrl` (a capability token) is never logged — only `user=<id> display=<id>` (trpc-router.ts:146). The prior **CR-01 is RESOLVED**.

**254-05 `registerExisting` correctness: SOUND.** The idempotent no-op branch (display-manager.ts:309-324) returns the existing record without HSET, so a livinityd restart neither duplicates nor clobbers a user-renamed/re-owned `:1` record (pinned by test Case 17). It never calls `allocateNext()` and registering `:1` cannot perturb the `:10+` allocator: even via the construction-time SCAN seed, the guard `existingMax + 1 > nextDisplayNum` (display-manager.ts:192) is `2 > 10 === false` for `:1`, so the allocator stays at 10 (pinned by Case 18). The boot wiring is guarded (`if (this.displayManager)`), try/caught, and non-fatal (index.ts:963-982).

**WR-01 from the prior review (double Redis round-trip in `getVncUrl`) is mostly resolved:** the second `dm.isOwner()` HGETALL is gone — the gate now reuses `record.owner_session` already in hand from the single `dm.list()` call. One full SCAN remains per call (see IN-03 below), now downgraded to info.

Remaining findings are one warning (a benign-but-misleading `running_apps: []` in the no-op return) and three info items. No critical issues.

## Warnings

### WR-01: registerExisting no-op branch returns `running_apps: []` instead of the display's actual attached apps

**File:** `livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts:314-323`

**Issue:** When `registerExisting` finds an already-recorded display, it returns a `DisplayRecord` reconstructed from the existing HGETALL fields but hardcodes `running_apps: []`, even though the display may have apps RPUSH'd into `luse:display:<display>:apps`. It also drops `last_app_at`. The fresh-write branch (line 350) and the no-op branch both return `[]`, which is correct for the genuinely-new `:1` case but is a silent inaccuracy for the idempotent re-adoption of a display that already has attached apps. This contrasts with `list()` (line 362-368) which always reads the apps LIST.

This is currently latent: the only caller (`index.ts:965`) ignores the return value entirely, and `list()` (the path the UI actually reads) recomputes `running_apps` correctly. So there is no user-visible bug today. The risk is a future caller trusting the `registerExisting` return value as an accurate record and seeing stale/empty `running_apps`.

**Fix (either):**
```typescript
// Option A — make the no-op branch authoritative by reading the apps LIST,
// mirroring list():
const running_apps = (await redis.lrange(redisKeyForDisplayApps(input.display), 0, -1))
	.map((s) => Number(s))
	.filter((n) => Number.isFinite(n))
return {
	display: input.display,
	name: existing.name ?? input.name ?? `display-${input.display.slice(1)}`,
	mode: (existing.mode as DisplayMode | undefined) ?? input.mode,
	created_at: existing.created_at ?? '',
	owner_session: existing.owner_session ?? input.ownerSession,
	width: Number(existing.width ?? input.width),
	height: Number(existing.height ?? input.height),
	running_apps,
	...(existing.last_app_at ? {last_app_at: existing.last_app_at} : {}),
}
```
```typescript
// Option B — if registerExisting's contract is "registration ack, not a live
// record", document that running_apps is always [] (registration-time view)
// and rename/return a narrower RegisterExistingResult to make the limited
// guarantee explicit, so a future caller does not mistake it for list()'s record.
```

## Info

### IN-01: getVncUrl still runs a full `dm.list()` (SCAN + N×HGETALL) to fetch one record

**File:** `livos/packages/livinityd/source/modules/computer-use/trpc-router.ts:103`

**Issue:** The prior WR-01 (a *second* `dm.isOwner()` HGETALL) is fixed — the authz gate now reuses `record.owner_session` from the single `list()` call. But resolving one display id still goes through `dm.list()`, which executes a full `luse:display:*` SCAN plus one HGETALL per existing display (display-manager.ts:354-385), just to `.find()` one entry. On a box with many displays this is an avoidable N+1 on every VNC-window open. Out of strict v1 perf scope, flagged as info for the record since the surrounding code was just touched.

**Fix:** Add a `getRecord(display): Promise<DisplayRecord | null>` to `DisplayManager` doing a single targeted `hgetall(redisKeyForDisplay(display))` (+ the one apps `lrange`), and use it in `getVncUrl` instead of `list().find()`. The display-id is already Zod-validated (`displayIdSchema`), so the key is safe to construct directly.

### IN-02: getVncUrl has no test for the legacy single-user (`currentUser === undefined`) path

**File:** `livos/packages/livinityd/source/modules/computer-use/trpc-router.ts:92-93,113`

**Issue:** The new authz matrix test (`trpc-router-authz.test.ts`) thoroughly covers the pure `canAccessDisplay` predicate, but not its integration in `getVncUrl`. In legacy single-user mode `ctx.currentUser` is `undefined` (is-authenticated.ts:90-91 explicitly allows this), so `getVncUrl` throws `UNAUTHORIZED` at line 93 before reaching `canAccessDisplay`. This is the pre-existing behavior (unchanged by this diff) and is arguably correct (a legacy install has no per-user identity to scope a capability token to), but it means a legacy single-user box cannot open a VNC window for any display — including the `:1` host display, despite its empty `owner_session` making it "shared". The `callerRole` default `'member'` (line 113) is therefore unreachable in practice, since a present `currentUser` always carries a `role`.

**Fix:** No code change required if legacy single-user VNC is out of scope; if it is in scope, note that the `if (!userId) throw UNAUTHORIZED` guard (line 93) — not `canAccessDisplay` — is what blocks it, and a legacy fallback userId (e.g. `'admin'`) would be needed before the gate. Recommend a one-line comment at line 93 stating the legacy-mode consequence so it is not mistaken for a bug later.

### IN-03: boot wiring relies on `displayManager` being constructed before the Xvfb/fluxbox block; ordering is implicit

**File:** `livos/packages/livinityd/source/index.ts:963-982`

**Issue:** The `registerExisting(':1')` call is guarded by `if (this.displayManager)` and is non-fatal, so a not-yet-constructed `displayManager` degrades gracefully (the strip simply omits `:1`, per the warning string at line 978). That is the correct fail-soft behavior. The implicit contract is that `this.displayManager` is assigned earlier in `start()` than this Xvfb block; if a future refactor moves `displayManager` construction after this point, `:1` registration silently stops happening with no error — only the absence of `:1` in the strip would reveal it.

**Fix:** Add a brief comment at line 963 noting the ordering dependency (`displayManager` must be constructed earlier in `start()`), or assert it once at the top of the block. Purely a maintainability note — current ordering is correct.

---

_Reviewed: 2026-06-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard (gap-closure)_
