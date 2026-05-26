import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';
import { provisionUserHostnames, CfApiError } from '@/lib/cf-saas';
import { encryptToken } from '@/lib/token-encryption';

type Body = {
  username?: string;
  user_id?: string;
};

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.username && !body.user_id) {
    return NextResponse.json({ error: 'Must provide username or user_id' }, { status: 400 });
  }

  // Resolve the target user.
  const userRow = await pool.query<{
    id: string;
    username: string;
    cf_tunnel_id: string | null;
    cf_dns_record_id_apex: string | null;
  }>(
    body.user_id
      ? 'SELECT id, username, cf_tunnel_id, cf_dns_record_id_apex FROM users WHERE id = $1 LIMIT 1'
      : 'SELECT id, username, cf_tunnel_id, cf_dns_record_id_apex FROM users WHERE username = $1 LIMIT 1',
    [body.user_id ?? body.username],
  );

  if (userRow.rows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const user = userRow.rows[0];

  // NOTE: this endpoint does NOT deprovision the previous tunnel — it issues
  // a FRESH tunnel + DNS row and overwrites the user record. The orphaned
  // CF resources from the old tunnel must be cleaned up manually for now
  // (separate carry — full deprovision needs app_dns_record_ids enumeration).

  let cf;
  try {
    cf = await provisionUserHostnames(user.username);
  } catch (err) {
    const message = err instanceof CfApiError ? err.message : err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `provisionUserHostnames failed: ${message}` },
      { status: 502 },
    );
  }

  let encryptedToken: Buffer;
  try {
    encryptedToken = await encryptToken(cf.tunnel_token);
  } catch (err) {
    return NextResponse.json(
      { error: `Token encryption failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  await pool.query(
    `UPDATE users
       SET cf_tunnel_id = $1,
           cf_tunnel_token_encrypted = $2,
           cf_dns_record_id_apex = $3,
           cf_provisioned_at = NOW()
       WHERE id = $4`,
    [cf.tunnel_id, encryptedToken, cf.apex_dns_record_id, user.id],
  );

  console.info(
    `[cf-reprovision] admin=${ctx.username} user=${user.username} tunnel=${cf.tunnel_id}`,
  );

  return NextResponse.json({
    user_id: user.id,
    username: user.username,
    previous_tunnel_id: user.cf_tunnel_id,
    new_tunnel_id: cf.tunnel_id,
    apex_dns_record_id: cf.apex_dns_record_id,
    note: 'Tunnel token NOT returned in response (only stored encrypted). User must reconnect via existing tunnel-token issuance flow. Previous tunnel CF resources are orphaned — manual cleanup needed (CARRY-P216-DEPROVISION).',
  });
}
