/**
 * Phase 291 — live AionUi agent list for the command-bar "Agent" selector.
 *
 * One-shot fetch of GET /liv/api/agents (livinityd-filtered to LivOS-managed +
 * authed agents). Defensive: any failure (dev / no backend / cold box) yields
 * an empty list, in which case the composer hides the Agent chip and dispatch
 * uses AionUi's configured default agent (LivOS forces Claude Code).
 */
import {useEffect, useState} from 'react'

import {listLivAgents, type LivAgent} from './liv-command-aionui'

export function useLivAgents(enabled: boolean): {agents: LivAgent[]; loading: boolean} {
	const [agents, setAgents] = useState<LivAgent[]>([])
	const [loading, setLoading] = useState(false)

	useEffect(() => {
		if (!enabled) return
		let cancelled = false
		setLoading(true)
		listLivAgents()
			.then((a) => {
				if (!cancelled) setAgents(a)
			})
			.catch(() => {
				if (!cancelled) setAgents([])
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [enabled])

	return {agents, loading}
}
