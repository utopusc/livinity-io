/**
 * Liv tool-category → Tabler icon map (Phase 66, D-17).
 *
 * Single source of truth for Liv tool-view icons, replacing scattered
 * ad-hoc imports. Consumers in P68-P69 adopt incrementally per D-18 —
 * this phase only ADDS the map; it does NOT migrate existing call sites.
 *
 * Suna→Tabler mappings honored per .planning/v31-DRAFT.md line 247:
 *   MonitorPlay → IconScreenShare  (key: `screenShare`)
 *   Terminal    → IconTerminal2    (key: `terminal`)
 *   Globe       → IconWorldSearch  (key: `webSearch`)
 *
 * Tabler version: ^3.36.1 (frozen — T-66-04-01 mitigation).
 *
 * Icon-component runtime type in @tabler/icons-react v3.x is
 * `TablerIcon` (i.e. `ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>`),
 * NOT the structurally-narrower `Icon` (`FunctionComponent<IconProps>`).
 * We therefore constrain via `Record<string, TablerIcon>` so the
 * `satisfies` clause typechecks against the real exported components.
 */
import {
	IconBolt,
	IconCode,
	IconEdit,
	IconFile,
	IconScreenShare,
	IconSpider,
	IconTerminal2,
	IconTool,
	IconWorld,
	IconWorldSearch,
	type TablerIcon,
} from '@tabler/icons-react'

export const LivIcons = {
	browser: IconWorld,
	screenShare: IconScreenShare,
	terminal: IconTerminal2,
	file: IconFile,
	fileEdit: IconEdit,
	webSearch: IconWorldSearch,
	webCrawl: IconSpider,
	webScrape: IconCode,
	mcp: IconBolt,
	generic: IconTool,
} as const satisfies Record<string, TablerIcon>

export type LivIconKey = keyof typeof LivIcons
