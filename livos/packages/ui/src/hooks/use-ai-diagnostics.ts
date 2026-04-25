// Phase 23 (AID-01/03/04) — Bundles the three Kimi-bound mutations
// (diagnoseContainer, generateComposeFromPrompt, explainVulnerabilities)
// into a single React hook so the UI surfaces (container detail sheet,
// DeployStackForm AI tab, ScanResultPanel) can subscribe to one shape.

import {trpcReact} from '@/trpc/trpc'

export function useAiDiagnostics() {
	const diagnoseMutation = trpcReact.docker.diagnoseContainer.useMutation()
	const composeMutation = trpcReact.docker.generateComposeFromPrompt.useMutation()
	const explainMutation = trpcReact.docker.explainVulnerabilities.useMutation()

	return {
		// Diagnose
		diagnoseContainer: (input: {name: string; environmentId?: string | null}) =>
			diagnoseMutation.mutate(input),
		diagnosticResult: diagnoseMutation.data,
		diagnosticError: diagnoseMutation.error,
		isDiagnosing: diagnoseMutation.isPending,
		resetDiagnosis: () => diagnoseMutation.reset(),

		// Compose generation
		generateCompose: (input: {prompt: string}) => composeMutation.mutate(input),
		composeResult: composeMutation.data,
		composeError: composeMutation.error,
		isGeneratingCompose: composeMutation.isPending,
		resetCompose: () => composeMutation.reset(),

		// CVE explanation
		explainVulnerabilities: (input: {imageRef: string}) => explainMutation.mutate(input),
		explanationResult: explainMutation.data,
		explanationError: explainMutation.error,
		isExplaining: explainMutation.isPending,
		resetExplanation: () => explainMutation.reset(),
	}
}
