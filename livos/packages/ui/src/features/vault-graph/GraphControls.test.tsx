// @vitest-environment jsdom
//
// Phase 179-02 — GraphControls unit tests (5 assertions, RED gate).
// Pattern: @testing-library/react render + fireEvent (RTL is installed in UI package).

import {describe, it, expect} from 'vitest'
import {render, fireEvent} from '@testing-library/react'

import {GraphControls} from './GraphControls'

describe('GraphControls', () => {
	it('renders collapsed chip by default (controls-chip visible, controls-panel absent)', () => {
		const {getByTestId, queryByTestId} = render(<GraphControls />)
		expect(getByTestId('controls-chip')).toBeTruthy()
		expect(queryByTestId('controls-panel')).toBeNull()
	})

	it('clicking chip opens panel (controls-panel becomes visible)', () => {
		const {getByTestId} = render(<GraphControls />)
		fireEvent.click(getByTestId('controls-chip'))
		expect(getByTestId('controls-panel')).toBeTruthy()
	})

	it('clicking close button inside panel collapses back to chip', () => {
		const {getByTestId, queryByTestId} = render(<GraphControls />)
		fireEvent.click(getByTestId('controls-chip'))
		fireEvent.click(getByTestId('controls-close'))
		expect(getByTestId('controls-chip')).toBeTruthy()
		expect(queryByTestId('controls-panel')).toBeNull()
	})

	it('renders children prop when panel is open', () => {
		const {getByTestId} = render(
			<GraphControls>
				<div data-testid='child-content'>hello</div>
			</GraphControls>,
		)
		fireEvent.click(getByTestId('controls-chip'))
		expect(getByTestId('child-content')).toBeTruthy()
	})

	it('controls-chip has aria-label="Open graph controls"', () => {
		const {getByTestId} = render(<GraphControls />)
		expect(getByTestId('controls-chip').getAttribute('aria-label')).toBe(
			'Open graph controls',
		)
	})
})
