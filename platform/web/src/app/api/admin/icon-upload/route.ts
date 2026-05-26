// POST a single image file → uploads to Supabase Storage `app-icons` bucket
// → returns the public URL ready to drop into apps.icon_url.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-admin';
import { getSupabaseService, getSupabasePublicUrl } from '@/lib/supabase-server';

const MAX_BYTES = 2 * 1024 * 1024; // matches bucket file_size_limit
const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const form = await req.formData();
  const file = form.get('file');
  const slug = form.get('slug');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing file field' }, { status: 400 });
  }
  if (typeof slug !== 'string' || !slug) {
    return NextResponse.json({ error: 'missing slug field' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (${file.size}b > ${MAX_BYTES}b)` },
      { status: 413 },
    );
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json(
      { error: `mime type "${file.type}" not allowed` },
      { status: 415 },
    );
  }

  // Object path: <slug>/<timestamp>-<originalName>. Timestamp prefix gives
  // a free cache-busting handle when an icon is replaced.
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const objectPath = `${slug}/${Date.now()}-${safeName}`;

  const supabase = getSupabaseService();
  const buffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from('app-icons')
    .upload(objectPath, buffer, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message },
      { status: 500 },
    );
  }

  // Compose the public URL — bucket is public, so this URL is the final
  // value to put into apps.icon_url.
  const supabaseUrl = getSupabasePublicUrl();
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/app-icons/${objectPath}`;

  return NextResponse.json({ url: publicUrl, path: objectPath });
}
