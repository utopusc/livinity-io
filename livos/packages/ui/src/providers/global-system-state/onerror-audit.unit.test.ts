import {readFileSync, readdirSync, statSync} from 'node:fs'
import {join, relative} from 'node:path'
import {describe, expect, it} from 'vitest'

/**
 * BACKLOG 999.6 regression-prevention test.
 *
 * Phase 34 (UX-01) added `onError` handlers to every `system.update.useMutation`
 * caller in the UI tree to surface failures as toasts. This test ensures no
 * future commit re-introduces a silent caller (mutation without onError).
 *
 * The test scans `livos/packages/ui/src/` for any `.tsx`/`.ts` file containing
 * `system.update.useMutation(`. For each match, it inspects the next ~40 lines
 * to verify an `onError` key is present in the options object.
 *
 * If a caller is added without onError, this test FAILS with the file path and
 * line number, forcing the developer to add the handler before merging.
 */
describe('BACKLOG 999.6 regression: system.update.useMutation callers must have onError', () => {
	const UI_SRC = join(__dirname, '../../') // packages/ui/src/
	const PATTERN = /trpcReact\.system\.update\.useMutation\s*\(/
	const ONERROR_WINDOW = 40

	function* walk(dir: string): Generator<string> {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry)
			const stat = statSync(full)
			if (stat.isDirectory()) {
				if (entry === 'node_modules' || entry.startsWith('.')) continue
				yield* walk(full)
			} else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
				if (full.endsWith('.unit.test.ts') || full.endsWith('.unit.test.tsx')) continue
				yield full
			}
		}
	}

	it('every system.update.useMutation has onError within 40 lines', () => {
		const offenders: Array<{file: string; line: number}> = []

		for (const file of walk(UI_SRC)) {
			const content = readFileSync(file, 'utf-8')
			const lines = content.split('\n')

			for (let i = 0; i < lines.length; i++) {
				if (PATTERN.test(lines[i])) {
					const window_ = lines.slice(i, i + ONERROR_WINDOW).join('\n')
					if (!/\bonError\s*[:=]/.test(window_)) {
						offenders.push({file: relative(UI_SRC, file), line: i + 1})
					}
				}
			}
		}

		if (offenders.length > 0) {
			const report = offenders.map((o) => `  - ${o.file}:${o.line}`).join('\n')
			throw new Error(
				`BACKLOG 999.6 regression: ${offenders.length} system.update.useMutation caller(s) missing onError:\n${report}\n\n` +
					`Add an onError handler that calls describeUpdateError() + toast.error() (see global-system-state/update.tsx for the pattern).`,
			)
		}

		expect(offenders).toEqual([])
	})
})
