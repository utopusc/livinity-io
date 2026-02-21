import {useEffect, useMemo} from 'react'
import {cn} from '@/shadcn-lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

type ArtifactType = 'react' | 'html' | 'svg' | 'mermaid' | 'recharts'

interface CanvasIframeProps {
	content: string
	type?: ArtifactType
	onError?: (error: string) => void
	className?: string
}

// ── CDN URLs ─────────────────────────────────────────────────────────────────

const CDN = {
	react: 'https://unpkg.com/react@18/umd/react.production.min.js',
	reactDom: 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
	babel: 'https://unpkg.com/@babel/standalone/babel.min.js',
	tailwind: 'https://cdn.tailwindcss.com',
	mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js',
	recharts: 'https://unpkg.com/recharts@2/umd/Recharts.js',
} as const

// ── Shared constants ─────────────────────────────────────────────────────────

const BASE_STYLES = `<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    color: #e5e5e5;
    background: #0a0a0a;
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1.5;
  }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
</style>`

const ERROR_BOUNDARY_SCRIPT = `<script>
  window.onerror = function(msg, src, line, col, err) {
    window.parent.postMessage({
      type: 'canvas-error',
      error: String(msg),
      source: src || '',
      line: line || 0,
      stack: err && err.stack ? err.stack : ''
    }, '*');
    return true;
  };
  window.onunhandledrejection = function(e) {
    window.parent.postMessage({
      type: 'canvas-error',
      error: 'Unhandled Promise: ' + String(e.reason),
      stack: e.reason && e.reason.stack ? e.reason.stack : ''
    }, '*');
  };
</script>`

// ── Type auto-detection ──────────────────────────────────────────────────────

export function detectArtifactType(content: string): ArtifactType {
	const trimmed = content.trim()

	// SVG detection: starts with <svg or <?xml...><svg
	if (trimmed.startsWith('<svg') || (trimmed.startsWith('<?xml') && trimmed.includes('<svg'))) {
		return 'svg'
	}

	// Mermaid detection: starts with common mermaid diagram keywords
	const mermaidKeywords = [
		'graph ', 'graph\n', 'flowchart ', 'sequenceDiagram', 'classDiagram',
		'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie ', 'pie\n',
		'mindmap', 'timeline', 'gitGraph', 'C4Context', 'sankey',
	]
	if (mermaidKeywords.some(kw => trimmed.startsWith(kw))) {
		return 'mermaid'
	}

	// HTML detection: full document or has structural tags
	if (
		trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<!doctype') ||
		trimmed.startsWith('<html') ||
		(trimmed.includes('<head>') && trimmed.includes('<body>'))
	) {
		return 'html'
	}

	// Recharts detection: references Recharts-specific components
	const rechartsComponents = [
		'LineChart', 'BarChart', 'PieChart', 'AreaChart', 'RadarChart',
		'ResponsiveContainer', 'Recharts', 'ScatterChart', 'ComposedChart',
		'RadialBarChart', 'FunnelChart', 'Treemap',
	]
	if (rechartsComponents.some(comp => trimmed.includes(comp))) {
		return 'recharts'
	}

	// Default: React (most common for generated components)
	return 'react'
}

// ── Per-type srcdoc builders ─────────────────────────────────────────────────

function buildReactSrcdoc(content: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${BASE_STYLES}
  ${ERROR_BOUNDARY_SCRIPT}
  <script src="${CDN.tailwind}"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: { extend: {} }
    };
  </script>
  <script src="${CDN.react}"></script>
  <script src="${CDN.reactDom}"></script>
  <script src="${CDN.babel}"></script>
</head>
<body class="dark">
  <div id="root"></div>
  <script type="text/babel" data-type="module">
    const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext, Fragment } = React;

    ${content}

    // Auto-mount: try common component names
    const Component = typeof App !== 'undefined' ? App
      : typeof Main !== 'undefined' ? Main
      : typeof Dashboard !== 'undefined' ? Dashboard
      : typeof Page !== 'undefined' ? Page
      : () => React.createElement('div', {style:{padding:'20px',color:'#ef4444'}}, 'Error: No App, Main, Dashboard, or Page component found.');

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(Component));
  </script>
</body>
</html>`
}

function buildHtmlSrcdoc(content: string): string {
	const trimmed = content.trim()
	// If content is already a full HTML document, inject error boundary into <head>
	if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
		const injected = content.replace(/<head>/i, `<head>${ERROR_BOUNDARY_SCRIPT}`)
		return injected
	}
	// Otherwise wrap in a minimal HTML document with Tailwind
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${BASE_STYLES}
  ${ERROR_BOUNDARY_SCRIPT}
  <script src="${CDN.tailwind}"></script>
</head>
<body class="dark">
  ${content}
</body>
</html>`
}

function buildSvgSrcdoc(content: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  ${ERROR_BOUNDARY_SCRIPT}
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #0a0a0a;
      padding: 16px;
    }
    svg {
      max-width: 100%;
      max-height: 100vh;
      height: auto;
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`
}

function buildMermaidSrcdoc(content: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  ${ERROR_BOUNDARY_SCRIPT}
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #0a0a0a;
      padding: 24px;
    }
    .mermaid { font-family: system-ui, sans-serif; }
    .mermaid svg { max-width: 100%; }
  </style>
</head>
<body>
  <pre class="mermaid">
${content}
  </pre>
  <script src="${CDN.mermaid}"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: '#0a0a0a',
        primaryColor: '#6366f1',
        primaryTextColor: '#e5e5e5',
        primaryBorderColor: '#4f46e5',
        lineColor: '#6366f1',
        secondaryColor: '#1e1b4b',
        tertiaryColor: '#1e1b4b',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        nodeBorder: '#4f46e5',
        mainBkg: '#1e1b4b',
        clusterBkg: '#1e1b4b',
      }
    });
  </script>
</body>
</html>`
}

function buildRechartsSrcdoc(content: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${BASE_STYLES}
  ${ERROR_BOUNDARY_SCRIPT}
  <script src="${CDN.tailwind}"></script>
  <script src="${CDN.react}"></script>
  <script src="${CDN.reactDom}"></script>
  <script src="${CDN.recharts}"></script>
  <script src="${CDN.babel}"></script>
</head>
<body class="dark">
  <div id="root"></div>
  <script type="text/babel" data-type="module">
    const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;

    // Recharts components available as globals
    const {
      LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
      XAxis, YAxis, CartesianGrid, Tooltip, Legend,
      ResponsiveContainer, AreaChart, Area, ScatterChart, Scatter,
      RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
      ComposedChart, Treemap, Funnel, FunnelChart,
      RadialBarChart, RadialBar
    } = Recharts;

    ${content}

    const Component = typeof App !== 'undefined' ? App
      : typeof Main !== 'undefined' ? Main
      : typeof Chart !== 'undefined' ? Chart
      : typeof Dashboard !== 'undefined' ? Dashboard
      : () => React.createElement('div', {style:{padding:'20px',color:'#ef4444'}}, 'Error: No App, Main, Chart, or Dashboard component found.');

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(Component));
  </script>
</body>
</html>`
}

// ── Main buildSrcdoc function ────────────────────────────────────────────────

export function buildSrcdoc(content: string, type: string): string {
	switch (type) {
		case 'react': return buildReactSrcdoc(content)
		case 'html': return buildHtmlSrcdoc(content)
		case 'svg': return buildSvgSrcdoc(content)
		case 'mermaid': return buildMermaidSrcdoc(content)
		case 'recharts': return buildRechartsSrcdoc(content)
		default: return buildReactSrcdoc(content) // Fallback to React
	}
}

// ── Component ────────────────────────────────────────────────────────────────

export function CanvasIframe({content, type, onError, className}: CanvasIframeProps) {
	const resolvedType = type || detectArtifactType(content)
	const srcdoc = useMemo(() => buildSrcdoc(content, resolvedType), [content, resolvedType])

	useEffect(() => {
		const handler = (e: MessageEvent) => {
			if (e.data?.type === 'canvas-error' && onError) {
				onError(e.data.error || 'Unknown error')
			}
		}
		window.addEventListener('message', handler)
		return () => window.removeEventListener('message', handler)
	}, [onError])

	return (
		<iframe
			srcDoc={srcdoc}
			sandbox="allow-scripts allow-popups"
			title="Canvas Preview"
			className={cn('h-full w-full border-0', className)}
			style={{colorScheme: 'dark'}}
		/>
	)
}
