// Pure format detector — no React, no side effects.
// Adapted from Suna's MCPFormatDetector with simplified return type.

export type MCPFormat = 'search' | 'table' | 'json' | 'markdown' | 'error' | 'plain'

export interface FormatDetectionResult {
  format: MCPFormat
  confidence: number
  parsedData?: unknown
}

const SEARCH_HEURISTICS = [
  /results?:\s*\[/i,
  /search results/i,
  /"results"\s*:\s*\[/,
  /found \d+ (result|match)/i,
]

const MARKDOWN_HEURISTICS = [
  /^#{1,6}\s+/m,
  /\*\*[^*]+\*\*/,
  /\[[^\]]+\]\([^)]+\)/,
  /^[\*\-]\s+/m,
  /^>\s+/m,
  /```[\s\S]*```/,
]

const ERROR_HEURISTICS = [
  /\berror\b/i,
  /\bexception\b/i,
  /\bfailed\b/i,
  /stack trace/i,
]

function isSearchResultArray(arr: unknown[]): boolean {
  if (arr.length === 0) return false
  return arr.some(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      ('title' in (item as object)) &&
      (('url' in (item as object)) || ('link' in (item as object))),
  )
}

function isTableLike(arr: unknown[]): boolean {
  if (arr.length < 2) return false
  const first = arr[0]
  if (first === null || typeof first !== 'object') return false
  const firstKeys = Object.keys(first as object).sort()
  return arr.every((item) => {
    if (item === null || typeof item !== 'object') return false
    const keys = Object.keys(item as object).sort()
    return (
      keys.length === firstKeys.length &&
      keys.every((k, i) => k === firstKeys[i])
    )
  })
}

function detectObject(obj: unknown): FormatDetectionResult {
  // Check for search-result wrapper objects
  if (obj !== null && typeof obj === 'object') {
    const o = obj as Record<string, unknown>

    // { results: [...], data: [...] } or direct array
    const candidates = [
      Array.isArray(o.results) ? o.results : null,
      Array.isArray(o.data) ? o.data : null,
      Array.isArray(obj) ? (obj as unknown[]) : null,
    ].filter(Boolean) as unknown[][]

    for (const arr of candidates) {
      if (isSearchResultArray(arr)) {
        return { format: 'search', confidence: 0.95, parsedData: obj }
      }
    }

    if (Array.isArray(obj) && isTableLike(obj)) {
      return { format: 'table', confidence: 0.85, parsedData: obj }
    }

    // Error field present
    if ('error' in o || 'errorMessage' in o || 'message' in o) {
      const str = JSON.stringify(obj)
      if (ERROR_HEURISTICS.some((p) => p.test(str))) {
        return { format: 'error', confidence: 0.75, parsedData: obj }
      }
    }
  }

  return { format: 'json', confidence: 0.9, parsedData: obj }
}

function detectText(text: string): FormatDetectionResult {
  // Try JSON parse
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      return detectObject(parsed)
    } catch {
      // not JSON
    }
  }

  // Error patterns (high weight — check early)
  let errorScore = 0
  for (const p of ERROR_HEURISTICS) if (p.test(text)) errorScore += 0.3
  if (errorScore >= 0.3) return { format: 'error', confidence: Math.min(errorScore, 1) }

  // Search patterns
  let searchScore = 0
  for (const p of SEARCH_HEURISTICS) if (p.test(text)) searchScore += 0.25
  if (/https?:\/\/\S+/.test(text)) searchScore += 0.1
  if (searchScore >= 0.4) return { format: 'search', confidence: Math.min(searchScore, 1) }

  // Markdown patterns
  let mdScore = 0
  for (const p of MARKDOWN_HEURISTICS) if (p.test(text)) mdScore += 0.2
  if (mdScore >= 0.4) return { format: 'markdown', confidence: Math.min(mdScore, 1) }

  return { format: 'plain', confidence: 0.5 }
}

export function detectMCPFormat(content: unknown): FormatDetectionResult {
  if (content === null || content === undefined) {
    return { format: 'plain', confidence: 1 }
  }
  if (typeof content === 'object') {
    return detectObject(content)
  }
  return detectText(String(content))
}
