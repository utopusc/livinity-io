// Client-side fetch helpers for the announcements admin. Same auth path as
// docs-api.ts (X-Api-Key from sessionStorage). Media upload reuses the existing
// /api/admin/icon-upload route with an `announcements/<id>` prefix (DEC-09).
//
// The Block vocabulary defined here is the CONTRACT shared by: the visual
// builder (announcement-form.tsx), the templates (announcement-templates.ts),
// the box native renderer (Plan 07 — separate package, re-declares the same
// shape), and the feedback write-back keyed on `block.id` (Plan 05).

const TOKEN_KEY = 'livinity_admin_token';

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-Api-Key': getToken(), ...extra };
}

// ---- Block vocabulary (the trusted visual-builder content model) ----------

export type AnnouncementBlock =
  | { id: string; type: 'heading'; text: string }
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'image'; url: string; alt?: string }
  | { id: string; type: 'video'; url: string; poster?: string }
  | { id: string; type: 'step'; title: string; body: string }
  | { id: string; type: 'button'; label: string; href: string; variant?: 'primary' | 'secondary' }
  | { id: string; type: 'poll'; question: string; options: string[] }
  | { id: string; type: 'feedback'; prompt: string };

export type AnnouncementBlockType = AnnouncementBlock['type'];

export type Announcement = {
  id: string;
  slug: string | null;
  title: string;
  kind: 'announcement' | 'campaign' | 'promo' | 'feature' | 'feedback';
  blocks: AnnouncementBlock[];
  raw_html_sanitized: string | null;
  raw_html_source: string | null; // admin re-edit only (only the [id] GET returns it)
  frequency: 'once_ever' | 'once_per_day' | 'n_times';
  frequency_n: number | null;
  priority: number;
  dismissible: boolean;
  start_at: string | null;
  end_at: string | null;
  target_kind: 'all' | 'user_ids' | 'plan_tier';
  target_user_ids: string[];
  target_plan_tier: string | null;
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// The create/update body. `raw_html` (singular) is what the API maps into
// raw_html_source + raw_html_sanitized (Plan 02).
export type AnnouncementInput = {
  title: string;
  slug?: string | null;
  kind?: Announcement['kind'];
  blocks?: AnnouncementBlock[];
  raw_html?: string | null;
  frequency?: Announcement['frequency'];
  frequency_n?: number | null;
  priority?: number;
  dismissible?: boolean;
  start_at?: string | null;
  end_at?: string | null;
  target_kind?: Announcement['target_kind'];
  target_user_ids?: string[];
  target_plan_tier?: string | null;
  status?: Announcement['status'];
};

async function asError(res: Response, fallback: string): Promise<never> {
  const err = await res.json().catch(() => ({ error: res.statusText }));
  throw new Error(err.error || `${fallback} ${res.status}`);
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const res = await fetch('/api/admin/announcements', { headers: authHeaders() });
  if (!res.ok) await asError(res, 'listAnnouncements');
  const data = (await res.json()) as { announcements: Announcement[] };
  return data.announcements ?? [];
}

export async function getAnnouncement(id: string): Promise<Announcement> {
  const res = await fetch(`/api/admin/announcements/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) await asError(res, 'getAnnouncement');
  return res.json();
}

export async function createAnnouncement(body: AnnouncementInput): Promise<Announcement> {
  const res = await fetch('/api/admin/announcements', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) await asError(res, 'createAnnouncement');
  return res.json();
}

export async function updateAnnouncement(
  id: string,
  body: AnnouncementInput,
): Promise<Announcement> {
  const res = await fetch(`/api/admin/announcements/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) await asError(res, 'updateAnnouncement');
  return res.json();
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const res = await fetch(`/api/admin/announcements/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) await asError(res, 'deleteAnnouncement');
}

// Media upload — reuses /api/admin/icon-upload under an announcements/<id> prefix
// so all announcement media lands under app-icons/announcements/… (DEC-09).
export async function uploadAnnouncementImage(id: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('slug', `announcements/${id || 'unsorted'}`);
  const res = await fetch('/api/admin/icon-upload', {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) await asError(res, 'uploadAnnouncementImage');
  const data = (await res.json()) as { url: string };
  return data.url;
}

// ---- analytics (Plan 08) --------------------------------------------------

export type AnnouncementAnalytics = {
  seen: { users_seen: number; impressions: number; dismissed: number };
  votes: { block_id: string | null; vote_option: string; votes: number }[];
  feedback: { block_id: string | null; free_text: string; created_at: string }[];
};

export async function getAnnouncementAnalytics(id: string): Promise<AnnouncementAnalytics> {
  const res = await fetch(`/api/admin/announcements/${encodeURIComponent(id)}/analytics`, {
    headers: authHeaders(),
  });
  if (!res.ok) await asError(res, 'getAnnouncementAnalytics');
  return res.json();
}
