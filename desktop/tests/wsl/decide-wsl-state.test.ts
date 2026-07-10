import { describe, it, expect } from 'vitest';
import { decideWslState } from '../../src/main/wsl/decide-wsl-state';

/**
 * Flat table, one `it` per <behavior> row (mirrors tests/cloudflare/decide-scope-verdict.test.ts).
 * The load-bearing property: `bios-blocked` is reached ONLY via the authoritative
 * reactive launch-time `0x80370102`; exit 14107 (and any other non-zero --status)
 * is `needs-enable`, never `bios-blocked` — the proactive WMI bit alone never
 * gates the verdict (Pitfall 3, single rule).
 */
describe('decideWslState', () => {
  it('statusExit null (spawn ENOENT / wsl.exe absent) => wsl-missing', () => {
    expect(decideWslState({ statusExit: null })).toEqual({ kind: 'wsl-missing' });
  });

  it('statusExit 14107 (feature-enablement failure) => needs-enable, NEVER bios-blocked', () => {
    expect(decideWslState({ statusExit: 14107 })).toEqual({ kind: 'needs-enable' });
  });

  it('any other non-zero statusExit => needs-enable', () => {
    expect(decideWslState({ statusExit: 1 })).toEqual({ kind: 'needs-enable' });
  });

  it('statusExit 0 + reactive launch-time 0x80370102 => bios-blocked (authoritative reactive signal)', () => {
    expect(
      decideWslState({ statusExit: 0, biosVirtEnabled: false, launchError: '0x80370102' })
    ).toEqual({ kind: 'bios-blocked' });
  });

  it('proactive WMI bit false alone (no reactive launchError) + distro present => ready, NOT bios-blocked (hint only)', () => {
    expect(
      decideWslState({
        statusExit: 0,
        biosVirtEnabled: false,
        launchError: null,
        quietList: 'livinity',
      })
    ).toEqual({ kind: 'ready' });
  });

  it('statusExit 0 + no launchError + distro absent from quiet list => distro-missing', () => {
    expect(decideWslState({ statusExit: 0, launchError: null, quietList: 'Ubuntu' })).toEqual({
      kind: 'distro-missing',
    });
  });

  it('statusExit 0 + no launchError + distro present => ready', () => {
    expect(decideWslState({ statusExit: 0, launchError: null, quietList: 'livinity' })).toEqual({
      kind: 'ready',
    });
  });

  it('statusExit 0 + needsReboot flag => needs-reboot (enable just completed this session)', () => {
    expect(decideWslState({ statusExit: 0, needsReboot: true })).toEqual({ kind: 'needs-reboot' });
  });
});
