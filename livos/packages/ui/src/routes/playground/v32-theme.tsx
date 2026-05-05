/**
 * v32 Theme Playground (Phase 80)
 *
 * Visual QA surface for the OKLCH token set (--liv-*) and Geist fonts.
 * Gated by EnsureLoggedIn (parent layout); reachable via /playground/v32-theme.
 *
 * Sections:
 *   1. Theme toggle (live switch between light / dark / system)
 *   2. Color swatches (every --liv-* token)
 *   3. Typography scale (text-xs → text-2xl with Geist Sans + Mono)
 *   4. Primitive gallery (Button, Badge, Input, Switch, Card)
 *   5. Tool pill mock
 *   6. Side panel mock
 */

import {useState} from 'react'

import {Badge} from '@/shadcn-components/ui/badge'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Switch} from '@/shadcn-components/ui/switch'
import {Card} from '@/components/ui/card'
import {ThemeToggle} from '@/components/theme-toggle'
import {useTheme} from '@/hooks/use-theme'

// ThemeChoice type no longer needed — ThemeToggle component handles it internally.

// All --liv-* tokens rendered as swatches
const COLOR_SWATCHES: Array<{token: string; label: string}> = [
	{token: '--liv-background', label: 'background'},
	{token: '--liv-foreground', label: 'foreground'},
	{token: '--liv-card', label: 'card'},
	{token: '--liv-card-foreground', label: 'card-foreground'},
	{token: '--liv-primary', label: 'primary'},
	{token: '--liv-primary-foreground', label: 'primary-foreground'},
	{token: '--liv-secondary', label: 'secondary'},
	{token: '--liv-secondary-foreground', label: 'secondary-foreground'},
	{token: '--liv-muted', label: 'muted'},
	{token: '--liv-muted-foreground', label: 'muted-foreground'},
	{token: '--liv-accent', label: 'accent'},
	{token: '--liv-accent-foreground', label: 'accent-foreground'},
	{token: '--liv-destructive', label: 'destructive'},
	{token: '--liv-destructive-foreground', label: 'destructive-foreground'},
	{token: '--liv-border', label: 'border'},
	{token: '--liv-input', label: 'input'},
	{token: '--liv-ring', label: 'ring'},
	{token: '--liv-sidebar', label: 'sidebar'},
	{token: '--liv-sidebar-foreground', label: 'sidebar-foreground'},
	{token: '--liv-sidebar-primary', label: 'sidebar-primary'},
	{token: '--liv-sidebar-accent', label: 'sidebar-accent'},
	{token: '--liv-sidebar-border', label: 'sidebar-border'},
]

const TYPE_SCALE: Array<{className: string; label: string; sample: string}> = [
	{className: 'text-xs font-sans', label: 'text-xs / Geist Sans', sample: 'The quick brown fox jumps over the lazy dog'},
	{className: 'text-sm font-sans', label: 'text-sm / Geist Sans', sample: 'The quick brown fox jumps over the lazy dog'},
	{className: 'text-base font-sans', label: 'text-base / Geist Sans', sample: 'The quick brown fox jumps over the lazy dog'},
	{className: 'text-lg font-sans', label: 'text-lg / Geist Sans', sample: 'The quick brown fox jumps over the lazy dog'},
	{className: 'text-xl font-sans', label: 'text-xl / Geist Sans', sample: 'The quick brown fox jumps over the lazy dog'},
	{className: 'text-2xl font-sans', label: 'text-2xl / Geist Sans', sample: 'The quick brown fox'},
	{className: 'text-sm font-mono', label: 'text-sm / Geist Mono', sample: 'const answer = 42; // code sample'},
	{className: 'text-base font-mono', label: 'text-base / Geist Mono', sample: 'const answer = 42; // code sample'},
]

export default function V32ThemePlayground() {
	const {theme, resolvedTheme} = useTheme()
	const [switchChecked, setSwitchChecked] = useState(false)

	return (
		<div className="min-h-screen bg-liv-background text-liv-foreground font-sans">
			{/* Fixed side panel mock — renders over content intentionally for QA */}
			<div className="fixed inset-y-0 right-0 w-96 bg-liv-card border-l border-liv-border z-10 p-6 hidden lg:flex flex-col gap-4">
				<p className="text-xs font-mono text-liv-muted-foreground uppercase tracking-widest">Side Panel Mock</p>
				<div className="flex-1 flex flex-col gap-3">
					<div className="rounded-lg border border-liv-border bg-liv-muted p-4">
						<p className="text-sm text-liv-foreground font-medium">Panel item A</p>
						<p className="text-xs text-liv-muted-foreground mt-1">Secondary description text</p>
					</div>
					<div className="rounded-lg border border-liv-border bg-liv-muted p-4">
						<p className="text-sm text-liv-foreground font-medium">Panel item B</p>
						<p className="text-xs text-liv-muted-foreground mt-1">Secondary description text</p>
					</div>
				</div>
				<div className="rounded-full bg-liv-accent text-liv-accent-foreground px-3 py-1 text-xs font-medium w-fit">
					Tool Pill
				</div>
			</div>

			<div className="lg:mr-96 p-8 space-y-12 max-w-3xl">
				{/* Header + theme toggle */}
				<section>
					<h1 className="text-2xl font-semibold mb-1">v32 Theme Playground</h1>
					<p className="text-sm text-liv-muted-foreground mb-6">
						Phase 80 foundation — OKLCH tokens, Geist fonts, ThemeProvider.
						Resolved: <span className="font-mono">{resolvedTheme}</span>
					</p>
					{/* ThemeToggle component (Phase 89) — replaces the inline buttons. */}
					<div className="flex items-center gap-3">
						<ThemeToggle />
						<span className="text-xs text-liv-muted-foreground font-mono">
							active: {theme}
						</span>
					</div>
				</section>

				{/* Color swatches */}
				<section>
					<h2 className="text-lg font-semibold mb-4">Color Tokens</h2>
					<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
						{COLOR_SWATCHES.map(({token, label}) => (
							<div key={token} className="flex flex-col gap-1">
								<div
									className="h-12 rounded-lg border border-liv-border"
									style={{backgroundColor: `var(${token})`}}
								/>
								<p className="text-xs text-liv-muted-foreground font-mono truncate" title={token}>
									{label}
								</p>
							</div>
						))}
					</div>
				</section>

				{/* Typography */}
				<section>
					<h2 className="text-lg font-semibold mb-4">Typography Scale</h2>
					<div className="space-y-4 border border-liv-border rounded-xl p-6 bg-liv-card">
						{TYPE_SCALE.map(({className, label, sample}) => (
							<div key={label} className="flex flex-col gap-0.5">
								<p className="text-xs text-liv-muted-foreground font-mono">{label}</p>
								<p className={className} style={{color: 'var(--liv-foreground)'}}>
									{sample}
								</p>
							</div>
						))}
					</div>
				</section>

				{/* Primitives */}
				<section>
					<h2 className="text-lg font-semibold mb-4">Primitives</h2>
					<div className="border border-liv-border rounded-xl p-6 bg-liv-card space-y-6">
						{/* Buttons */}
						<div>
							<p className="text-xs text-liv-muted-foreground font-mono mb-3">Button</p>
							<div className="flex flex-wrap gap-2">
								<Button>Default</Button>
								<Button variant="outline">Outline</Button>
								<Button variant="ghost">Ghost</Button>
								<Button variant="destructive">Destructive</Button>
								<Button disabled>Disabled</Button>
							</div>
						</div>

						{/* Badges */}
						<div>
							<p className="text-xs text-liv-muted-foreground font-mono mb-3">Badge</p>
							<div className="flex flex-wrap gap-2">
								<Badge>Default</Badge>
								<Badge variant="secondary">Secondary</Badge>
								<Badge variant="outline">Outline</Badge>
								<Badge variant="destructive">Destructive</Badge>
							</div>
						</div>

						{/* Input */}
						<div>
							<p className="text-xs text-liv-muted-foreground font-mono mb-3">Input</p>
							<div className="flex flex-col gap-2 max-w-sm">
								<Input placeholder="Type something..." />
								<Input placeholder="Disabled input" disabled />
							</div>
						</div>

						{/* Switch */}
						<div>
							<p className="text-xs text-liv-muted-foreground font-mono mb-3">Switch</p>
							<div className="flex items-center gap-3">
								<Switch checked={switchChecked} onCheckedChange={setSwitchChecked} />
								<span className="text-sm text-liv-foreground">{switchChecked ? 'On' : 'Off'}</span>
							</div>
						</div>

						{/* Card */}
						<div>
							<p className="text-xs text-liv-muted-foreground font-mono mb-3">Card</p>
							<Card className="p-4">
								<p className="text-sm font-medium text-liv-foreground">Card title</p>
								<p className="text-xs text-liv-muted-foreground mt-1">
									Card body text rendered inside a Card component.
								</p>
							</Card>
						</div>
					</div>
				</section>

				{/* Tool pill */}
				<section>
					<h2 className="text-lg font-semibold mb-4">Tool Pill Mock</h2>
					<div className="flex flex-wrap gap-2">
						{['web_search', 'read_file', 'execute_code', 'write_file'].map((tool) => (
							<span
								key={tool}
								className="rounded-full bg-liv-accent text-liv-accent-foreground px-3 py-1 text-xs font-medium"
							>
								{tool}
							</span>
						))}
					</div>
				</section>

				{/* Side panel — mobile inline version (real one is fixed on lg+) */}
				<section className="lg:hidden">
					<h2 className="text-lg font-semibold mb-4">Side Panel Mock (inline)</h2>
					<div className="w-full bg-liv-card border border-liv-border rounded-xl p-6 flex flex-col gap-4">
						<div className="rounded-lg border border-liv-border bg-liv-muted p-4">
							<p className="text-sm text-liv-foreground font-medium">Panel item A</p>
							<p className="text-xs text-liv-muted-foreground mt-1">Secondary description text</p>
						</div>
						<div className="rounded-lg border border-liv-border bg-liv-muted p-4">
							<p className="text-sm text-liv-foreground font-medium">Panel item B</p>
							<p className="text-xs text-liv-muted-foreground mt-1">Secondary description text</p>
						</div>
						<div className="rounded-full bg-liv-accent text-liv-accent-foreground px-3 py-1 text-xs font-medium w-fit">
							Tool Pill
						</div>
					</div>
				</section>
			</div>
		</div>
	)
}
