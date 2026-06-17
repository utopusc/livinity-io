// Thin client-side fetch helpers for the docs admin. Same auth path as
// admin-api.ts (X-Api-Key from sessionStorage). Image upload reuses the
// existing /api/admin/icon-upload route with a `docs/<slug>` prefix so all
// article media lands under app-icons/docs/… — no new bucket/route needed.

const TOKEN_KEY = 'livinity_admin_token';

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-Api-Key': getToken(), ...extra };
}

export type DocCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DocArticle = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category_id: string;
  content: string;
  cover_url: string | null;
  published: boolean;
  featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

async function asError(res: Response, fallback: string): Promise<never> {
  const err = await res.json().catch(() => ({ error: res.statusText }));
  throw new Error(err.error || `${fallback} ${res.status}`);
}

// ---- Articles -------------------------------------------------------------

export async function listArticles(): Promise<DocArticle[]> {
  const res = await fetch('/api/admin/docs', { headers: authHeaders() });
  if (!res.ok) await asError(res, 'listArticles');
  return res.json();
}

export async function getArticle(slug: string): Promise<DocArticle> {
  const res = await fetch(`/api/admin/docs/${encodeURIComponent(slug)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) await asError(res, 'getArticle');
  return res.json();
}

export async function createArticle(body: Partial<DocArticle>): Promise<DocArticle> {
  const res = await fetch('/api/admin/docs', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) await asError(res, 'createArticle');
  return res.json();
}

export async function updateArticle(
  slug: string,
  body: Partial<DocArticle>,
): Promise<DocArticle> {
  const res = await fetch(`/api/admin/docs/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) await asError(res, 'updateArticle');
  return res.json();
}

export async function deleteArticle(slug: string): Promise<void> {
  const res = await fetch(`/api/admin/docs/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) await asError(res, 'deleteArticle');
}

// ---- Categories -----------------------------------------------------------

export async function listCategories(): Promise<DocCategory[]> {
  const res = await fetch('/api/admin/docs/categories', { headers: authHeaders() });
  if (!res.ok) await asError(res, 'listCategories');
  return res.json();
}

export async function createCategory(body: Partial<DocCategory>): Promise<DocCategory> {
  const res = await fetch('/api/admin/docs/categories', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) await asError(res, 'createCategory');
  return res.json();
}

export async function updateCategory(
  id: string,
  body: Partial<DocCategory>,
): Promise<DocCategory> {
  const res = await fetch(`/api/admin/docs/categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) await asError(res, 'updateCategory');
  return res.json();
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await fetch(`/api/admin/docs/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) await asError(res, 'deleteCategory');
}

// ---- Image upload (reuses /api/admin/icon-upload, docs/ prefix) -----------

export async function uploadDocImage(slug: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  // The icon-upload route stores at <slug>/<ts>-<name>; prefix with docs/ so
  // article media is grouped under app-icons/docs/<article-slug>/…
  form.append('slug', `docs/${slug || 'unsorted'}`);
  const res = await fetch('/api/admin/icon-upload', {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) await asError(res, 'uploadDocImage');
  const data = (await res.json()) as { url: string };
  return data.url;
}
