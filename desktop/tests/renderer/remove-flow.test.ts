import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { visibleChoices, goesList, staysList, stepCaptions, finalButton } from '../../src/renderer/screens/remove-flow';
import type { RemoveChoices, RemoveOffer } from '../../shared/ipc-contract';

/**
 * Flat table, one `it` per <behavior> row (mirrors tests/renderer/update-flow.test.ts /
 * tests/renderer/settings-flow.test.ts). Copy is asserted verbatim against 07-UI-SPEC §8 --
 * these exact strings are what the Remove flow's R1/R2 screens render, no paraphrase.
 */
function offer(partial: Partial<RemoveOffer>): RemoveOffer {
  return { offerCfTeardown: false, apexHost: null, ...partial };
}

function choices(partial: Partial<RemoveChoices>): RemoveChoices {
  return { cf: false, distro: false, clear: false, ...partial };
}

describe('visibleChoices (D-12)', () => {
  it('offerCfTeardown=false => cf:false (Pro/legacy-managed users never see the CF checkbox)', () => {
    expect(visibleChoices(offer({ offerCfTeardown: false }))).toEqual({ cf: false, distro: true, clear: true });
  });

  it('offerCfTeardown=true => cf:true', () => {
    expect(visibleChoices(offer({ offerCfTeardown: true, apexHost: 'bruce.example.com' }))).toEqual({
      cf: true,
      distro: true,
      clear: true,
    });
  });

  it('distro + clear are ALWAYS visible, regardless of offerCfTeardown', () => {
    expect(visibleChoices(offer({ offerCfTeardown: false })).distro).toBe(true);
    expect(visibleChoices(offer({ offerCfTeardown: false })).clear).toBe(true);
    expect(visibleChoices(offer({ offerCfTeardown: true })).distro).toBe(true);
    expect(visibleChoices(offer({ offerCfTeardown: true })).clear).toBe(true);
  });
});

describe('goesList (UI-SPEC §8 WHAT GOES, exact copy)', () => {
  it('zero-opt removal => always just ["The Livinity Desktop app"]', () => {
    expect(goesList(choices({}), offer({}))).toEqual(['The Livinity Desktop app']);
  });

  it('cf:true => adds the exact CF line, interpolating apexHost', () => {
    expect(goesList(choices({ cf: true }), offer({ offerCfTeardown: true, apexHost: 'bruce.example.com' }))).toEqual([
      'The Livinity Desktop app',
      'The Cloudflare tunnel and DNS records for bruce.example.com',
    ]);
  });

  it('distro:true => adds the exact distro line', () => {
    expect(goesList(choices({ distro: true }), offer({}))).toEqual([
      'The Livinity Desktop app',
      'The Livinity system and all its data on this PC',
    ]);
  });

  it('clear:true => adds the exact clear line', () => {
    expect(goesList(choices({ clear: true }), offer({}))).toEqual([
      'The Livinity Desktop app',
      'Your saved sign-in and settings on this PC',
    ]);
  });

  it('all three selected => all four lines, in choice order (cf, distro, clear)', () => {
    expect(
      goesList(choices({ cf: true, distro: true, clear: true }), offer({ offerCfTeardown: true, apexHost: 'x.example.com' }))
    ).toEqual([
      'The Livinity Desktop app',
      'The Cloudflare tunnel and DNS records for x.example.com',
      'The Livinity system and all its data on this PC',
      'Your saved sign-in and settings on this PC',
    ]);
  });
});

describe('staysList (UI-SPEC §8 WHAT STAYS, exact complement)', () => {
  it('zero-opt removal, no CF offered => the always-present account line + all three complements', () => {
    expect(staysList(choices({}), offer({ offerCfTeardown: false }))).toEqual([
      'Your Livinity account',
      'Your server and everything stored on it',
      'Your saved sign-in and settings on this PC',
    ]);
  });

  it('CF offered but NOT chosen => the CF stays-line appears (byod only)', () => {
    expect(staysList(choices({}), offer({ offerCfTeardown: true, apexHost: 'bruce.example.com' }))).toEqual([
      'Your Livinity account',
      'The Cloudflare tunnel and DNS records for bruce.example.com',
      'Your server and everything stored on it',
      'Your saved sign-in and settings on this PC',
    ]);
  });

  it('CF offered AND chosen => the CF stays-line is absent (it went, not stayed)', () => {
    expect(staysList(choices({ cf: true }), offer({ offerCfTeardown: true, apexHost: 'bruce.example.com' }))).toEqual([
      'Your Livinity account',
      'Your server and everything stored on it',
      'Your saved sign-in and settings on this PC',
    ]);
  });

  it('CF never offered (Pro/legacy-managed) => the CF stays-line never appears, chosen or not', () => {
    expect(staysList(choices({}), offer({ offerCfTeardown: false, apexHost: null }))).not.toContain(
      expect.stringContaining('Cloudflare')
    );
  });

  it('distro:true => the distro stays-line is absent (clear stays-line still present since clear:false)', () => {
    expect(staysList(choices({ distro: true }), offer({}))).toEqual([
      'Your Livinity account',
      'Your saved sign-in and settings on this PC',
    ]);
  });

  it('all three selected + CF offered => stays is JUST the account line', () => {
    expect(staysList(choices({ cf: true, distro: true, clear: true }), offer({ offerCfTeardown: true, apexHost: 'x.example.com' }))).toEqual(
      ['Your Livinity account']
    );
  });

  it('goes + stays partition the offered options: for every combination, each offered option appears in exactly one list', () => {
    for (const offerCfTeardown of [true, false]) {
      for (const cf of offerCfTeardown ? [true, false] : [false]) {
        for (const distro of [true, false]) {
          for (const clear of [true, false]) {
            const o = offer({ offerCfTeardown, apexHost: offerCfTeardown ? 'x.example.com' : null });
            const c = choices({ cf, distro, clear });
            const goes = goesList(c, o);
            const stays = staysList(c, o);

            const cfGoes = goes.some((l) => l.includes('Cloudflare'));
            const cfStays = stays.some((l) => l.includes('Cloudflare'));
            if (offerCfTeardown) {
              expect(cfGoes).toBe(cf);
              expect(cfStays).toBe(!cf);
            } else {
              expect(cfGoes).toBe(false);
              expect(cfStays).toBe(false);
            }

            const distroGoes = goes.some((l) => l.includes('Livinity system and all its data'));
            const distroStays = stays.some((l) => l.includes('Your server and everything stored on it'));
            expect(distroGoes).toBe(distro);
            expect(distroStays).toBe(!distro);

            const clearGoes = goes.some((l) => l === 'Your saved sign-in and settings on this PC');
            const clearStays = stays.some((l) => l === 'Your saved sign-in and settings on this PC');
            expect(clearGoes).toBe(clear);
            expect(clearStays).toBe(!clear);
          }
        }
      }
    }
  });
});

describe('stepCaptions (single-sourced from REMOVE_STEP_LABELS, removePlan order)', () => {
  it('zero-opt removal => []', () => {
    expect(stepCaptions(choices({}), true)).toEqual([]);
  });

  it('{cf:true,distro:true}, engineRunning=true => stop-engine, cf-teardown, distro-remove captions in D-13 order', () => {
    expect(stepCaptions(choices({ cf: true, distro: true }), true)).toEqual([
      'Stopping your server',
      'Removing the Cloudflare tunnel and DNS records',
      'Deleting the Livinity system',
    ]);
  });

  it('R-3 trap row: {distro:true} engineRunning=true => STILL includes "Stopping your server" (distro-only stops the engine)', () => {
    expect(stepCaptions(choices({ distro: true }), true)).toEqual(['Stopping your server', 'Deleting the Livinity system']);
  });

  it('R-3 trap row: {clear:true} engineRunning=true => NO "Stopping your server" (clear alone never stops the box)', () => {
    expect(stepCaptions(choices({ clear: true }), true)).toEqual(['Clearing your sign-in and settings']);
  });

  it('{distro:true} engineRunning=false => no stop-engine caption when already stopped', () => {
    expect(stepCaptions(choices({ distro: true }), false)).toEqual(['Deleting the Livinity system']);
  });

  it('full D-13 order: {cf:true,distro:true,clear:true} engineRunning=true => all four captions in fixed order', () => {
    expect(stepCaptions(choices({ cf: true, distro: true, clear: true }), true)).toEqual([
      'Stopping your server',
      'Removing the Cloudflare tunnel and DNS records',
      'Deleting the Livinity system',
      'Clearing your sign-in and settings',
    ]);
  });
});

describe('RemoveFlow.tsx wiring source-scan (WR-06 — no React runner here; the pure cores above are behavior-tested, the screen wiring is scanned, updater.test.ts precedent)', () => {
  const source = readFileSync(join(__dirname, '../../src/renderer/screens/remove/RemoveFlow.tsx'), 'utf8');

  it("the confirm stage is NOT gated on a non-null offer — no blank dead-end (no buttons, no Go back) while removeGetOffer is pending or failed", () => {
    expect(source).not.toMatch(/stage === 'confirm'\s*&&\s*offer\s*&&/);
    // The confirm content renders against the null-safe fallback instead.
    expect(source).toContain('offer ?? SAFE_OFFER');
  });

  it('the choices "Continue" is disabled until the offer resolves, and the getOffer failure path seeds the safe default (offer can never stay null forever)', () => {
    expect(source).toContain('disabled={!offer}');
    expect(source).toMatch(/\.catch\(\(\) => setOffer\(SAFE_OFFER\)\)/);
  });
});

describe('finalButton (Collision-pattern red gate, distro-only)', () => {
  it('distro:true, gateChecked:false => danger:true, disabled:true, red label', () => {
    expect(finalButton(choices({ distro: true }), false)).toEqual({
      label: 'Remove Livinity and delete my data',
      danger: true,
      disabled: true,
    });
  });

  it('distro:true, gateChecked:true => danger:true, disabled:false', () => {
    expect(finalButton(choices({ distro: true }), true)).toEqual({
      label: 'Remove Livinity and delete my data',
      danger: true,
      disabled: false,
    });
  });

  it('distro:false (any cf/clear, any gateChecked) => accent "Remove Livinity", never gated/disabled', () => {
    for (const cf of [true, false]) {
      for (const clear of [true, false]) {
        for (const gateChecked of [true, false]) {
          expect(finalButton(choices({ cf, distro: false, clear }), gateChecked)).toEqual({
            label: 'Remove Livinity',
            danger: false,
            disabled: false,
          });
        }
      }
    }
  });
});
