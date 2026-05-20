// Phase 179-05 — Consolidated settings hook.
// Reads all 4 localStorage keys on mount. Each setter: setState + write localStorage.
// No debounce in the hook itself — sections handle their own debounce.
//
// Threat T-179-05-B: reads same-origin localStorage on self-hosted server; no cross-origin access.

import {useState, useCallback} from 'react'

import {FiltersState, defaultFilters, FILTERS_KEY} from '../sections/FiltersSection'
import {GroupsState, defaultGroups} from '../sections/GroupsSection'
import {DisplayState, defaultDisplay, DISPLAY_KEY} from '../sections/DisplaySection'
import {ForcesState, defaultForces, FORCES_KEY} from '../sections/ForcesSection'

const GROUPS_KEY = (userId?: string): string =>
	userId
		? `liv:vault-graph:settings:groups:${userId}`
		: 'liv:vault-graph:settings:groups'

function readLS<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key)
		return raw ? (JSON.parse(raw) as T) : fallback
	} catch {
		return fallback
	}
}

export interface GraphSettings {
	filters: FiltersState
	groups: GroupsState
	display: DisplayState
	forces: ForcesState
	setFilters: (f: FiltersState) => void
	setGroups: (g: GroupsState) => void
	setDisplay: (d: DisplayState) => void
	setForces: (f: ForcesState) => void
}

export function useGraphSettings(userId?: string): GraphSettings {
	const [filters, setFiltersState] = useState<FiltersState>(() =>
		readLS(FILTERS_KEY(userId), defaultFilters),
	)
	const [groups, setGroupsState] = useState<GroupsState>(() =>
		readLS(GROUPS_KEY(userId), defaultGroups),
	)
	const [display, setDisplayState] = useState<DisplayState>(() =>
		readLS(DISPLAY_KEY(userId), defaultDisplay),
	)
	const [forces, setForcesState] = useState<ForcesState>(() =>
		readLS(FORCES_KEY(userId), defaultForces),
	)

	const setFilters = useCallback(
		(f: FiltersState) => {
			setFiltersState(f)
			localStorage.setItem(FILTERS_KEY(userId), JSON.stringify(f))
		},
		[userId],
	)

	const setGroups = useCallback(
		(g: GroupsState) => {
			setGroupsState(g)
			localStorage.setItem(GROUPS_KEY(userId), JSON.stringify(g))
		},
		[userId],
	)

	const setDisplay = useCallback(
		(d: DisplayState) => {
			setDisplayState(d)
			localStorage.setItem(DISPLAY_KEY(userId), JSON.stringify(d))
		},
		[userId],
	)

	const setForces = useCallback(
		(f: ForcesState) => {
			setForcesState(f)
			localStorage.setItem(FORCES_KEY(userId), JSON.stringify(f))
		},
		[userId],
	)

	return {filters, groups, display, forces, setFilters, setGroups, setDisplay, setForces}
}
