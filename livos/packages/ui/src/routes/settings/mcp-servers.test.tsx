/**
 * Phase 182-04 — mcp-servers.test.tsx
 *
 * Source-text invariant suite (vitest). Locks the McpServersPage shape:
 *   - Two-column layout: McpServerList (left) + detail/featured (right)
 *   - Uses McpServerList, McpServerDetail, FEATURED_MCPS
 *   - REST /api/mcp/servers (same as mcp-panel.tsx)
 *   - Featured MCP cards with data-testid
 *   - Header eyebrow '10 · MCP'
 */

import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const SRC = readFileSync(resolve(__dirname, 'mcp-servers.tsx'), 'utf8')
const LIST_SRC = readFileSync(resolve(__dirname, '../../components/mcp/McpServerList.tsx'), 'utf8')
const DETAIL_SRC = readFileSync(resolve(__dirname, '../../components/mcp/McpServerDetail.tsx'), 'utf8')
const FEATURED_SRC = readFileSync(resolve(__dirname, '../../components/mcp/featured-mcps.ts'), 'utf8')

describe('Phase 182-04 — McpServersPage source-text invariants', () => {
	it('B1: page root has data-testid mcp-servers-page', () => {
		expect(SRC).toMatch(/data-testid=['"]mcp-servers-page['"]/)
	})

	it('B2: imports McpServerList from @/components/mcp/McpServerList', () => {
		expect(SRC).toMatch(/from ['"]@\/components\/mcp\/McpServerList['"]/)
	})

	it('B3: imports McpServerDetail from @/components/mcp/McpServerDetail', () => {
		expect(SRC).toMatch(/from ['"]@\/components\/mcp\/McpServerDetail['"]/)
	})

	it('B4: imports FEATURED_MCPS from @/components/mcp/featured-mcps', () => {
		expect(SRC).toMatch(/FEATURED_MCPS.*from ['"]@\/components\/mcp\/featured-mcps['"]/)
	})

	it('B5: featured section has data-testid mcp-featured-section', () => {
		expect(SRC).toMatch(/data-testid=['"]mcp-featured-section['"]/)
	})

	it('B6: featured MCP card has data-testid with name interpolation', () => {
		expect(SRC).toMatch(/data-testid=\{`featured-mcp-\$\{mcp\.name\}`\}/)
	})

	it('B7: page header eyebrow is 10 · MCP', () => {
		expect(SRC).toMatch(/eyebrow=['"]10 · MCP['"]/)
	})

	it('B8: REST API uses /api/mcp base path', () => {
		expect(SRC).toMatch(/\/api\/mcp/)
	})

	it('B9: McpServerList component renders mcp-server-list testid', () => {
		expect(LIST_SRC).toMatch(/data-testid=['"]mcp-server-list['"]/)
	})

	it('B10: McpServerList row has data-testid mcp-server-row-{name}', () => {
		expect(LIST_SRC).toMatch(/data-testid=\{`mcp-server-row-\$\{/)
	})

	it('B11: McpServerDetail renders mcp-server-detail testid', () => {
		expect(DETAIL_SRC).toMatch(/data-testid=['"]mcp-server-detail['"]/)
	})

	it('B12: featured-mcps exports FEATURED_MCPS with brave-search entry', () => {
		expect(FEATURED_SRC).toMatch(/brave-search/)
		expect(FEATURED_SRC).toMatch(/export const FEATURED_MCPS/)
	})
})
