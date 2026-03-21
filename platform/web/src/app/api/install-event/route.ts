import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { db } from '@/lib/drizzle';
import { apps, installHistory } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  try {
    const body = await req.json();
    const { app_id, action, instance_name } = body;

    // Validate required fields
    if (!app_id || !action || !instance_name) {
      return NextResponse.json(
        { error: 'Missing required fields: app_id, action, instance_name' },
        { status: 400 }
      );
    }

    // Validate action value
    if (action !== 'install' && action !== 'uninstall') {
      return NextResponse.json(
        { error: 'action must be "install" or "uninstall"' },
        { status: 400 }
      );
    }

    // Resolve slug to UUID (LivOS sends slugs like "n8n", DB uses UUID FKs)
    let resolvedAppId = app_id;
    const appRows = await db.select({ id: apps.id }).from(apps).where(eq(apps.slug, app_id)).limit(1);
    if (appRows.length > 0) {
      resolvedAppId = appRows[0].id;
    }

    const [row] = await db.insert(installHistory).values({
      user_id: auth.userId,
      app_id: resolvedAppId,
      action,
      instance_name,
    }).returning();

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
