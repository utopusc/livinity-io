/**
 * src/renderer/screens/wsl/ResourceAllocation.tsx
 *
 * Screen 3 of the WSL2 provisioning wizard (WSL-05; D-15..D-17) -- OPTIONAL,
 * SKIPPABLE resource allocation. Arrives pre-filled at the auto-detected
 * recommended values (wsl:configGet); a user who does nothing just clicks
 * the accent "Use recommended" and proceeds. Moving any slider flips the
 * CTA to "Continue" and reveals "Reset to recommended" (the CfToken
 * stateful-single-accent pattern, 03-07).
 *
 * Renders the full three-slider layout when `cpuRamTunable` is true, or
 * ONLY the Disk slider (same shell, conditional rows, D-16) when it is
 * false -- and always discloses honestly that Memory/Processor limits are
 * VM-global (D-17), never implying per-app isolation WSL2 can't deliver.
 *
 * Security (T-04-07): the renderer sends plain numeric limits; the
 * AUTHORITATIVE validation is main-side (`validateResourceLimits`, 04-03,
 * called by the 04-09 `wsl:configApply` handler) -- a malformed slider
 * value can never reach `.wslconfig`. Sliders are also constrained to sane
 * min/max ranges here as a first line of defense.
 */

import { useEffect, useState } from 'react';
import type { WslResourceInfo } from '../../../../shared/ipc-contract';

interface ResourceAllocationProps {
  onContinue: () => void;
}

export interface RangeRowProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  recommended: number;
  formatReadout: (value: number) => string;
  onChange: (value: number) => void;
}

/**
 * One resource slider row: Label -> mono readout -> native range -> a
 * decorative recommended-value tick. aria-valuetext carries the human
 * readout so a screen reader announces "8 GB of 16 GB", not a bare number.
 *
 * Exported (06-09) for verbatim reuse by Settings.tsx's Resource limits
 * card -- same component, only the pre-fill source differs (current applied
 * values, not "recommended"). No behavior change to ResourceAllocation
 * itself.
 */
export function RangeRow({
  id,
  label,
  value,
  min,
  max,
  recommended,
  formatReadout,
  onChange,
}: RangeRowProps): React.ReactElement {
  const readout = formatReadout(value);
  const span = max - min;
  const tickPercent = span > 0 ? ((recommended - min) / span) * 100 : 0;
  return (
    <div className="field">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <span className="range-readout">{readout}</span>
      </div>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-valuetext={readout}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {/* Decorative recommended tick -- aria-hidden; the readout text above IS the value (UI-SPEC Accessibility). */}
      <div className="range-tick" aria-hidden="true">
        <span
          style={{
            position: 'absolute',
            left: `calc(${tickPercent}% - 1px)`,
            top: 0,
            width: 2,
            height: 4,
            borderRadius: 1,
            background: 'var(--fg-mute)',
          }}
        />
      </div>
    </div>
  );
}

export default function ResourceAllocation({ onContinue }: ResourceAllocationProps) {
  const [info, setInfo] = useState<WslResourceInfo | null>(null);
  const [memoryGb, setMemoryGb] = useState(0);
  const [processors, setProcessors] = useState(0);
  const [diskGb, setDiskGb] = useState(0);
  const [touched, setTouched] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyFailed, setApplyFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await window.api.wslConfigGet();
      setInfo(result);
      setMemoryGb(result.recommended.memoryGb);
      setProcessors(result.recommended.processors);
      setDiskGb(result.recommended.diskGb);
    })();
    // Runs once on mount -- the resource snapshot is read exactly once per screen entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function markTouched(): void {
    setTouched(true);
    setApplyFailed(false);
  }

  function handleReset(): void {
    if (!info) return;
    setMemoryGb(info.recommended.memoryGb);
    setProcessors(info.recommended.processors);
    setDiskGb(info.recommended.diskGb);
    setTouched(false);
    setApplyFailed(false);
  }

  async function handleApply(): Promise<void> {
    if (!info || applying) return;
    setApplying(true);
    setApplyFailed(false);
    try {
      // Full variant sends all three limits; disk-only sends diskGb alone
      // (memoryGb/processors are optional on WslApi's wslConfigApply).
      const limits = info.cpuRamTunable ? { memoryGb, processors, diskGb } : { diskGb };
      const result = await window.api.wslConfigApply(limits);
      if (result.ok) {
        onContinue();
        return;
      }
      setApplyFailed(true);
    } catch {
      setApplyFailed(true);
    } finally {
      setApplying(false);
    }
  }

  if (!info) {
    return (
      <div className="setup-shell">
        <section aria-busy="true">
          <h1 className="display">How much of your PC should LivOS use?</h1>
          <div style={{ marginTop: 24 }}>
            <div
              className="progress-track progress-indeterminate"
              role="progressbar"
              aria-label="Checking your PC"
            >
              <div className="progress-fill" />
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="setup-shell">
      <section>
        <h1 className="display">How much of your PC should LivOS use?</h1>
        <p className="note-line" style={{ marginTop: 16 }}>
          {info.cpuRamTunable
            ? "We picked settings that fit your PC. Use them as they are, or fine-tune — it's up to you."
            : "Livinity uses your PC's memory and processors with Windows' standard settings. You can set how much disk space it's allowed to use."}
        </p>

        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {info.cpuRamTunable && (
            <RangeRow
              id="resource-memory"
              label="Memory"
              value={memoryGb}
              min={1}
              max={Math.max(info.totalRamGb, 1)}
              recommended={info.recommended.memoryGb}
              formatReadout={(v) => `${v} GB of ${info.totalRamGb} GB`}
              onChange={(v) => {
                setMemoryGb(v);
                markTouched();
              }}
            />
          )}
          {info.cpuRamTunable && (
            <RangeRow
              id="resource-processors"
              label="Processor cores"
              value={processors}
              min={1}
              max={Math.max(info.totalCores, 1)}
              recommended={info.recommended.processors}
              formatReadout={(v) => `${v} of ${info.totalCores} cores`}
              onChange={(v) => {
                setProcessors(v);
                markTouched();
              }}
            />
          )}
          <RangeRow
            id="resource-disk"
            label="Disk space for Livinity"
            value={diskGb}
            min={15}
            max={Math.max(info.freeDiskGb, 15)}
            recommended={info.recommended.diskGb}
            formatReadout={(v) => `Up to ${v} GB`}
            onChange={(v) => {
              setDiskGb(v);
              markTouched();
            }}
          />
        </div>

        {/* Honest VM-global disclosure (D-17) -- calm, never red. */}
        <p className="note-line" style={{ marginTop: 24 }}>
          Memory and processor limits apply to every Linux environment on your PC, not just Livinity —
          that's how Windows' WSL works. Disk space is used by Livinity only.
        </p>

        {applying && (
          <p className="note-line" aria-live="polite" style={{ marginTop: 16 }}>
            Applying your settings…
          </p>
        )}
        {applyFailed && !applying && (
          <p className="note-line" aria-live="polite" style={{ marginTop: 16 }}>
            That didn't go through — try again.
          </p>
        )}

        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 24 }}
          disabled={applying}
          onClick={() => void handleApply()}
        >
          {applying ? 'Applying your settings…' : touched ? 'Continue' : 'Use recommended'}
        </button>

        {touched && !applying && (
          <div style={{ marginTop: 16 }}>
            <button type="button" className="link-mute" onClick={handleReset}>
              Reset to recommended
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
