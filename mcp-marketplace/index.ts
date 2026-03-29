import express from 'express'
import { catalog, categories, types, type MarketplaceItem } from './catalog.js'

const app = express()
const PORT = 4100

app.use(express.json())

// CORS for LivOS instances
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ── Health ───────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', items: catalog.length, categories: categories.length, types: types.length })
})

// ── Search ───────────────────────────────────────────
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim()
  const type = String(req.query.type || '').toLowerCase().trim()
  const category = String(req.query.category || '').toLowerCase().trim()
  const limit = Math.min(Number(req.query.limit) || 50, 100)

  let results = catalog

  if (type) {
    results = results.filter(i => i.type === type)
  }

  if (category) {
    results = results.filter(i => i.category.toLowerCase() === category)
  }

  if (q) {
    results = results.filter(i => {
      if (i.name.toLowerCase().includes(q)) return true
      if (i.description.toLowerCase().includes(q)) return true
      if (i.tags.some(t => t.toLowerCase().includes(q))) return true
      if (i.triggers.some(t => t.toLowerCase().includes(q))) return true
      return false
    })
  }

  res.json({ results: results.slice(0, limit), total: results.length })
})

// ── List all ─────────────────────────────────────────
app.get('/api/catalog', (req, res) => {
  const type = String(req.query.type || '').toLowerCase().trim()
  let items = catalog
  if (type) items = items.filter(i => i.type === type)
  res.json({ items, total: items.length, categories, types })
})

// ── Get single item ──────────────────────────────────
app.get('/api/item/:id(*)', (req, res) => {
  const item = catalog.find(i => i.id === req.params.id)
  if (!item) return res.status(404).json({ error: 'Not found' })
  res.json(item)
})

// ── Categories ───────────────────────────────────────
app.get('/api/categories', (req, res) => {
  const grouped: Record<string, number> = {}
  for (const item of catalog) {
    grouped[item.category] = (grouped[item.category] || 0) + 1
  }
  res.json({ categories: grouped })
})

// ── Stats ────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const byType: Record<string, number> = {}
  for (const item of catalog) {
    byType[item.type] = (byType[item.type] || 0) + 1
  }
  res.json({ total: catalog.length, byType, categories: categories.length })
})

// ── Install info (returns config for LivOS to install) ──
app.post('/api/install', (req, res) => {
  const { id } = req.body || {}
  if (!id) return res.status(400).json({ error: 'id is required' })

  const item = catalog.find(i => i.id === id)
  if (!item) return res.status(404).json({ error: 'Item not found in marketplace' })

  // Return the install config that LivOS/Nexus needs
  res.json({
    success: true,
    item: {
      id: item.id,
      type: item.type,
      name: item.name,
      description: item.description,
      install_source: item.install_source,
      install_command: item.install_command,
      config: item.config,
      provides_tools: item.provides_tools,
      requires: item.requires,
      tags: item.tags,
      tier: item.tier,
      context_cost: item.context_cost,
    },
  })
})

// ── Recommend (based on installed capabilities) ──────
app.post('/api/recommend', (req, res) => {
  const { installed = [], tags = [] } = req.body || {}
  const installedIds = new Set(installed as string[])

  // Filter out already installed, then score by tag overlap
  const candidates = catalog.filter(i => !installedIds.has(i.id))

  if (tags.length === 0) {
    // No context — return popular items by category diversity
    const seen = new Set<string>()
    const diverse: MarketplaceItem[] = []
    for (const item of candidates) {
      if (!seen.has(item.category)) {
        diverse.push(item)
        seen.add(item.category)
      }
      if (diverse.length >= 5) break
    }
    return res.json({ recommendations: diverse })
  }

  // Score by tag overlap
  const inputTags = (tags as string[]).map((t: string) => t.toLowerCase())
  const scored = candidates.map(item => {
    let score = 0
    for (const tag of item.tags) {
      if (inputTags.includes(tag.toLowerCase())) score += 2
    }
    for (const trigger of item.triggers) {
      for (const inputTag of inputTags) {
        if (trigger.toLowerCase().includes(inputTag)) score += 1
      }
    }
    return { item, score }
  })

  scored.sort((a, b) => b.score - a.score)
  const top = scored.filter(s => s.score > 0).slice(0, 5).map(s => s.item)

  res.json({ recommendations: top.length > 0 ? top : scored.slice(0, 3).map(s => s.item) })
})

// ── Start ────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[marketplace] Livinity Marketplace API listening on port ${PORT}`)
  console.log(`[marketplace] Catalog: ${catalog.length} items (${types.join(', ')})`)
  console.log(`[marketplace] Categories: ${categories.join(', ')}`)
})
