// Phase 26 Plan 26-01 — Image vulnerability scan result panel.
//
// Ported verbatim from routes/server-control/index.tsx:1741-1992. Wires:
//   - Trivy scan via useImages().scanImage (Phase 19 carry-over).
//   - Cached scan lookup via trpcReact.docker.getCachedScan (Phase 19).
//   - Plain-English explanation via useAiDiagnostics().explainVulnerabilities
//     (Phase 23 AID-04 carry-over — only surfaces when there are CRITICAL/HIGH
//     CVEs to avoid wasting Kimi tokens on clean scans).
//
// Imports adjusted to the new resources/ path for formatRelativeDate.

import {useState} from 'react'
import {IconBrain, IconExternalLink, IconLoader2, IconRefresh, IconShieldCheck} from '@tabler/icons-react'

import {useAiDiagnostics} from '@/hooks/use-ai-diagnostics'
import {useImages} from '@/hooks/use-images'
import {Button} from '@/shadcn-components/ui/button'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'

import {formatRelativeDate} from './format-relative-date'

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

const SEVERITY_LIST: readonly Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

function severityBadgeClasses(sev: Severity, active: boolean): string {
	const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer'
	const palette = {
		CRITICAL: 'bg-red-500/20 text-red-700 hover:bg-red-500/30',
		HIGH: 'bg-orange-500/20 text-orange-700 hover:bg-orange-500/30',
		MEDIUM: 'bg-yellow-500/20 text-yellow-800 hover:bg-yellow-500/30',
		LOW: 'bg-neutral-500/20 text-neutral-600 hover:bg-neutral-500/30',
	}
	return cn(base, palette[sev], active && 'ring-2 ring-current ring-offset-1')
}

export function ScanResultPanel({imageRef}: {imageRef: string}) {
	const cachedQuery = trpcReact.docker.getCachedScan.useQuery(
		{imageRef},
		{retry: false, refetchOnWindowFocus: false},
	)
	const {scanImage, isScanning, scanResult, scanError} = useImages()
	const [expandedSeverity, setExpandedSeverity] = useState<Severity | null>(null)
	// Plan 23-01 (AID-04): plain-English CVE explainer
	const {
		explainVulnerabilities,
		explanationResult,
		explanationError,
		isExplaining,
		resetExplanation,
	} = useAiDiagnostics()

	// Show fresh scan result if mutation just ran for this image, else cached, else "not scanned yet"
	const result = scanResult && scanResult.imageRef === imageRef ? scanResult : (cachedQuery.data ?? null)

	if (isScanning) {
		return (
			<div className='flex items-center gap-3 px-4 py-6 text-sm text-text-secondary'>
				<IconRefresh size={16} className='animate-spin text-text-tertiary' />
				<span>Running Trivy — first scan may take 60-90s while pulling aquasec/trivy:latest...</span>
			</div>
		)
	}

	if (scanError && (!scanResult || scanResult.imageRef !== imageRef)) {
		return (
			<div className='px-4 py-4'>
				<div className='rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600'>
					{scanError.message}
				</div>
				<Button
					size='sm'
					variant='default'
					className='mt-3'
					onClick={() => scanImage(imageRef)}
				>
					Retry scan
				</Button>
			</div>
		)
	}

	if (!result) {
		return (
			<div className='flex flex-col items-center gap-3 py-8 text-center text-sm text-text-secondary'>
				<IconShieldCheck size={28} className='text-text-tertiary' />
				<p>No scan run yet for this image.</p>
				<Button size='sm' onClick={() => scanImage(imageRef)}>
					Run vulnerability scan
				</Button>
			</div>
		)
	}

	const totalCves = result.counts.CRITICAL + result.counts.HIGH + result.counts.MEDIUM + result.counts.LOW
	const filteredCves =
		expandedSeverity !== null ? result.cves.filter((c) => c.severity === expandedSeverity) : []

	return (
		<div className='space-y-3 px-4 py-3'>
			<div className='flex flex-wrap items-center gap-2 text-xs text-text-tertiary'>
				<span>Scanned {formatRelativeDate(Math.floor(result.scannedAt / 1000))}</span>
				{result.cached && (
					<span className='inline-flex items-center rounded bg-blue-500/15 px-1.5 py-0.5 font-medium text-blue-700'>
						cached
					</span>
				)}
				<span className='text-text-tertiary/70'>· {totalCves} CVE{totalCves === 1 ? '' : 's'}</span>
				<span className='text-text-tertiary/70'>· digest <span className='font-mono'>{result.imageDigest.slice(0, 19)}…</span></span>
				<div className='ml-auto'>
					<Button
						size='sm'
						variant='default'
						onClick={() => scanImage(imageRef, true)}
						disabled={isScanning}
					>
						<IconRefresh size={12} className='mr-1' />
						Rescan
					</Button>
				</div>
			</div>

			<div className='flex flex-wrap gap-2'>
				{SEVERITY_LIST.map((sev) => (
					<button
						key={sev}
						type='button'
						onClick={() => setExpandedSeverity(expandedSeverity === sev ? null : sev)}
						className={severityBadgeClasses(sev, expandedSeverity === sev)}
						disabled={result.counts[sev] === 0}
					>
						<span>{sev}</span>
						<span className='font-mono'>{result.counts[sev]}</span>
					</button>
				))}
				{/* Plan 23-01 (AID-04): plain-English CVE explainer.
				    Hidden when there are no CRITICAL/HIGH CVEs to avoid wasting
				    Kimi tokens on clean scans. */}
				{result.counts.CRITICAL + result.counts.HIGH > 0 && (
					<Button
						size='sm'
						variant='default'
						className='ml-auto'
						onClick={() => {
							resetExplanation()
							explainVulnerabilities({imageRef})
						}}
						disabled={isExplaining}
					>
						{isExplaining ? (
							<>
								<IconLoader2 size={12} className='mr-1 animate-spin' />
								Explaining...
							</>
						) : (
							<>
								<IconBrain size={12} className='mr-1' />
								Explain CVEs
							</>
						)}
					</Button>
				)}
			</div>

			{isExplaining && (
				<div className='flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-700'>
					<IconLoader2 size={14} className='animate-spin' />
					<span>Asking Kimi to explain the most critical CVEs...</span>
				</div>
			)}
			{explanationError && (
				<div className='rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600'>
					{explanationError.message}
				</div>
			)}
			{explanationResult && !isExplaining && (
				<div className='space-y-2'>
					{explanationResult.explanation && (
						<div className='rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700'>
							<div className='mb-1 font-medium text-emerald-600'>Explanation</div>
							<p className='whitespace-pre-wrap leading-relaxed'>
								{explanationResult.explanation}
							</p>
						</div>
					)}
					{explanationResult.upgradeSuggestion && (
						<div className='rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-700'>
							<div className='mb-1 font-medium text-blue-600'>Upgrade path</div>
							<p className='whitespace-pre-wrap leading-relaxed'>
								{explanationResult.upgradeSuggestion}
							</p>
						</div>
					)}
				</div>
			)}

			{expandedSeverity !== null && (
				<div className='overflow-x-auto rounded-lg border border-border-default bg-surface-base'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='pl-3'>CVE</TableHead>
								<TableHead>Package</TableHead>
								<TableHead>Installed</TableHead>
								<TableHead>Fixed</TableHead>
								<TableHead>CVSS</TableHead>
								<TableHead>Title</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredCves.length === 0 ? (
								<TableRow>
									<TableCell colSpan={6} className='px-3 py-3 text-center text-xs text-text-tertiary'>
										No {expandedSeverity} CVEs.
									</TableCell>
								</TableRow>
							) : (
								filteredCves.map((cve) => (
									<TableRow key={`${cve.id}-${cve.packageName}-${cve.installedVersion}`}>
										<TableCell className='pl-3 align-top'>
											{cve.primaryUrl ? (
												<a
													href={cve.primaryUrl}
													target='_blank'
													rel='noopener noreferrer'
													className='inline-flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline'
													title={cve.primaryUrl}
												>
													{cve.id}
													<IconExternalLink size={10} />
												</a>
											) : (
												<span className='font-mono text-xs text-text-secondary'>{cve.id}</span>
											)}
										</TableCell>
										<TableCell className='align-top'>
											<span className='font-mono text-xs text-text-secondary'>{cve.packageName || '-'}</span>
										</TableCell>
										<TableCell className='align-top'>
											<span className='font-mono text-xs text-text-secondary'>{cve.installedVersion || '-'}</span>
										</TableCell>
										<TableCell className='align-top'>
											<span className='font-mono text-xs'>
												{cve.fixedVersion ? (
													<span className='text-emerald-600'>{cve.fixedVersion}</span>
												) : (
													<span className='text-text-tertiary italic'>unfixed</span>
												)}
											</span>
										</TableCell>
										<TableCell className='align-top'>
											<span className='font-mono text-xs text-text-secondary'>
												{cve.cvss !== null ? cve.cvss.toFixed(1) : '-'}
											</span>
										</TableCell>
										<TableCell className='align-top'>
											<span
												className='block max-w-[420px] truncate text-xs text-text-secondary'
												title={cve.description || cve.title}
											>
												{cve.title || '-'}
											</span>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	)
}
