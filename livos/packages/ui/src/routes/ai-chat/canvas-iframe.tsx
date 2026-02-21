import {useEffect, useMemo} from 'react'
import {cn} from '@/shadcn-lib/utils'

interface CanvasIframeProps {
	content: string
	type: 'react' | 'html' | 'svg' | 'mermaid' | 'recharts'
	onError?: (error: string) => void
	className?: string
}

const CDN = {
	react: 'https://unpkg.com/react@18/umd/react.production.min.js',
	reactDom: 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
	babel: 'https://unpkg.com/@babel/standalone/babel.min.js',
	tailwind: 'https://cdn.tailwindcss.com',
	mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js',
	recharts: 'https://unpkg.com/recharts@2/umd/Recharts.js',
} as const

const BASE_STYLE = `<style>body{margin:0;color:#e5e5e5;background:#0a0a0a;font-family:system-ui,sans-serif}</style>`

const ERROR_SCRIPT = `<script>
window.onerror = function(message, source, lineno, colno, error) {
  window.parent.postMessage({ type: 'canvas-error', error: String(message), source: source, line: lineno }, '*');
};
window.onunhandledrejection = function(e) {
  window.parent.postMessage({ type: 'canvas-error', error: String(e.reason) }, '*');
};
</script>`

function buildSrcdoc(content: string, type: string): string {
	switch (type) {
		case 'html': {
			const hasTailwind = content.includes('tailwindcss')
			const tailwindTag = hasTailwind ? '' : `<script src="${CDN.tailwind}"></script>`
			return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${BASE_STYLE}${tailwindTag}${ERROR_SCRIPT}</head><body>${content}</body></html>`
		}

		case 'react':
			return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${BASE_STYLE}
${ERROR_SCRIPT}
<script src="${CDN.tailwind}"></script>
<script src="${CDN.react}"></script>
<script src="${CDN.reactDom}"></script>
<script src="${CDN.babel}"></script>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
${content}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(typeof App !== 'undefined' ? App : (typeof Main !== 'undefined' ? Main : () => React.createElement('div', null, 'No App or Main component found'))));
</script>
</body>
</html>`

		case 'svg':
			return `<!DOCTYPE html><html><head><meta charset="utf-8">${BASE_STYLE}${ERROR_SCRIPT}</head><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0a0a0a">${content}</body></html>`

		case 'mermaid':
			return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${BASE_STYLE}
${ERROR_SCRIPT}
<script src="${CDN.mermaid}"></script>
</head>
<body style="display:flex;justify-content:center;align-items:center;min-height:100vh;padding:2rem">
<pre class="mermaid">${content}</pre>
<script>mermaid.initialize({startOnLoad:true, theme:'dark'});</script>
</body>
</html>`

		case 'recharts':
			return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${BASE_STYLE}
${ERROR_SCRIPT}
<script src="${CDN.tailwind}"></script>
<script src="${CDN.react}"></script>
<script src="${CDN.reactDom}"></script>
<script src="${CDN.recharts}"></script>
<script src="${CDN.babel}"></script>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } = Recharts;
${content}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(typeof App !== 'undefined' ? App : (typeof Main !== 'undefined' ? Main : () => React.createElement('div', null, 'No App or Main component found'))));
</script>
</body>
</html>`

		default:
			return `<!DOCTYPE html><html><head>${BASE_STYLE}${ERROR_SCRIPT}</head><body><pre>${content}</pre></body></html>`
	}
}

export function CanvasIframe({content, type, onError, className}: CanvasIframeProps) {
	const srcdoc = useMemo(() => buildSrcdoc(content, type), [content, type])

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
