// Phase 290 R2 (R8) — curated web-app catalog for the Add Shortcut → Web tab.
//
// A click-to-add icon grid grouped by category. Icons come from the
// homarr-labs/dashboard-icons CDN (https://github.com/homarr-labs/dashboard-icons),
// served via jsDelivr at /svg/<slug>.svg. Clicking an entry creates a `web`
// shortcut ({title, iconUrl, payload:{url}}); the backend derives open_mode via
// probeFrameable, so frame-deny sites (Gmail, X, …) get a stream tile.

export type WebAppCatalogEntry = {
	name: string
	url: string
	category: WebAppCategory
	/** dashboard-icons slug (→ https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/<slug>.svg). */
	slug: string
}

export type WebAppCategory =
	| 'Productivity'
	| 'Developer'
	| 'Communication'
	| 'Social'
	| 'Media'
	| 'AI'
	| 'Design'
	| 'Finance'
	| 'Storage'

const CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg'

export function webAppIconUrl(slug: string): string {
	return `${CDN}/${slug}.svg`
}

// ~55 entries. Slugs verified against the dashboard-icons naming convention
// (lowercase, hyphenated). If a slug 404s the tile shows the placeholder — the
// shortcut still works (icon is satisfied at create time by this URL).
export const WEB_APP_CATALOG: ReadonlyArray<WebAppCatalogEntry> = [
	// ── Productivity ──────────────────────────────────────────────────────────
	{name: 'Notion', url: 'https://notion.so', category: 'Productivity', slug: 'notion'},
	{name: 'Google Docs', url: 'https://docs.google.com', category: 'Productivity', slug: 'google-docs'},
	{name: 'Google Sheets', url: 'https://sheets.google.com', category: 'Productivity', slug: 'google-sheets'},
	{name: 'Google Calendar', url: 'https://calendar.google.com', category: 'Productivity', slug: 'google-calendar'},
	{name: 'Trello', url: 'https://trello.com', category: 'Productivity', slug: 'trello'},
	{name: 'Asana', url: 'https://asana.com', category: 'Productivity', slug: 'asana'},
	{name: 'Todoist', url: 'https://todoist.com', category: 'Productivity', slug: 'todoist'},
	{name: 'Obsidian', url: 'https://obsidian.md', category: 'Productivity', slug: 'obsidian'},
	{name: 'Airtable', url: 'https://airtable.com', category: 'Productivity', slug: 'airtable'},
	{name: 'ClickUp', url: 'https://clickup.com', category: 'Productivity', slug: 'clickup'},

	// ── Developer ───────────────────────────────────────────────────────────────
	{name: 'GitHub', url: 'https://github.com', category: 'Developer', slug: 'github'},
	{name: 'GitLab', url: 'https://gitlab.com', category: 'Developer', slug: 'gitlab'},
	{name: 'Stack Overflow', url: 'https://stackoverflow.com', category: 'Developer', slug: 'stackoverflow'},
	{name: 'Vercel', url: 'https://vercel.com', category: 'Developer', slug: 'vercel'},
	{name: 'Netlify', url: 'https://netlify.com', category: 'Developer', slug: 'netlify'},
	{name: 'Cloudflare', url: 'https://dash.cloudflare.com', category: 'Developer', slug: 'cloudflare'},
	{name: 'Docker Hub', url: 'https://hub.docker.com', category: 'Developer', slug: 'docker'},
	{name: 'npm', url: 'https://npmjs.com', category: 'Developer', slug: 'npm'},
	{name: 'Supabase', url: 'https://supabase.com/dashboard', category: 'Developer', slug: 'supabase'},
	{name: 'Linear', url: 'https://linear.app', category: 'Developer', slug: 'linear'},

	// ── Communication ────────────────────────────────────────────────────────────
	{name: 'Gmail', url: 'https://mail.google.com', category: 'Communication', slug: 'gmail'},
	{name: 'Slack', url: 'https://slack.com', category: 'Communication', slug: 'slack'},
	{name: 'Discord', url: 'https://discord.com/app', category: 'Communication', slug: 'discord'},
	{name: 'Microsoft Teams', url: 'https://teams.microsoft.com', category: 'Communication', slug: 'microsoft-teams'},
	{name: 'Zoom', url: 'https://zoom.us', category: 'Communication', slug: 'zoom'},
	{name: 'Telegram', url: 'https://web.telegram.org', category: 'Communication', slug: 'telegram'},
	{name: 'WhatsApp', url: 'https://web.whatsapp.com', category: 'Communication', slug: 'whatsapp'},
	{name: 'Outlook', url: 'https://outlook.live.com', category: 'Communication', slug: 'microsoft-outlook'},

	// ── Social ───────────────────────────────────────────────────────────────────
	{name: 'X', url: 'https://x.com', category: 'Social', slug: 'x'},
	{name: 'Reddit', url: 'https://reddit.com', category: 'Social', slug: 'reddit'},
	{name: 'LinkedIn', url: 'https://linkedin.com', category: 'Social', slug: 'linkedin'},
	{name: 'Instagram', url: 'https://instagram.com', category: 'Social', slug: 'instagram'},
	{name: 'Facebook', url: 'https://facebook.com', category: 'Social', slug: 'facebook'},
	{name: 'Mastodon', url: 'https://mastodon.social', category: 'Social', slug: 'mastodon'},
	{name: 'Bluesky', url: 'https://bsky.app', category: 'Social', slug: 'bluesky'},

	// ── Media ────────────────────────────────────────────────────────────────────
	{name: 'YouTube', url: 'https://youtube.com', category: 'Media', slug: 'youtube'},
	{name: 'Spotify', url: 'https://open.spotify.com', category: 'Media', slug: 'spotify'},
	{name: 'Netflix', url: 'https://netflix.com', category: 'Media', slug: 'netflix'},
	{name: 'Twitch', url: 'https://twitch.tv', category: 'Media', slug: 'twitch'},
	{name: 'SoundCloud', url: 'https://soundcloud.com', category: 'Media', slug: 'soundcloud'},
	{name: 'Plex', url: 'https://app.plex.tv', category: 'Media', slug: 'plex'},

	// ── AI ───────────────────────────────────────────────────────────────────────
	{name: 'ChatGPT', url: 'https://chatgpt.com', category: 'AI', slug: 'openai'},
	{name: 'Claude', url: 'https://claude.ai', category: 'AI', slug: 'claude-ai'},
	{name: 'Gemini', url: 'https://gemini.google.com', category: 'AI', slug: 'google-gemini'},
	{name: 'Perplexity', url: 'https://perplexity.ai', category: 'AI', slug: 'perplexity'},
	{name: 'Hugging Face', url: 'https://huggingface.co', category: 'AI', slug: 'hugging-face'},
	{name: 'Midjourney', url: 'https://midjourney.com', category: 'AI', slug: 'midjourney'},

	// ── Design ───────────────────────────────────────────────────────────────────
	{name: 'Figma', url: 'https://figma.com', category: 'Design', slug: 'figma'},
	{name: 'Canva', url: 'https://canva.com', category: 'Design', slug: 'canva'},
	{name: 'Excalidraw', url: 'https://excalidraw.com', category: 'Design', slug: 'excalidraw'},
	{name: 'Dribbble', url: 'https://dribbble.com', category: 'Design', slug: 'dribbble'},

	// ── Finance ──────────────────────────────────────────────────────────────────
	{name: 'PayPal', url: 'https://paypal.com', category: 'Finance', slug: 'paypal'},
	{name: 'Stripe', url: 'https://dashboard.stripe.com', category: 'Finance', slug: 'stripe'},
	{name: 'Wise', url: 'https://wise.com', category: 'Finance', slug: 'wise'},

	// ── Storage ──────────────────────────────────────────────────────────────────
	{name: 'Google Drive', url: 'https://drive.google.com', category: 'Storage', slug: 'google-drive'},
	{name: 'Dropbox', url: 'https://dropbox.com', category: 'Storage', slug: 'dropbox'},
	{name: 'OneDrive', url: 'https://onedrive.live.com', category: 'Storage', slug: 'microsoft-onedrive'},
	{name: 'Nextcloud', url: 'https://nextcloud.com', category: 'Storage', slug: 'nextcloud'},
]

export const WEB_APP_CATEGORIES: ReadonlyArray<WebAppCategory> = [
	'Productivity',
	'Developer',
	'Communication',
	'Social',
	'Media',
	'AI',
	'Design',
	'Finance',
	'Storage',
]
