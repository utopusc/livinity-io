import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { db } from '@/lib/drizzle';
import { installHistory } from '@/db/schema';

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

    const [row] = await db.insert(installHistory).values({
      user_id: auth.userId,
      app_id,
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
