import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';

interface ApiKeyValid {
  valid: true;
  userId: string;
}

interface ApiKeyInvalid {
  valid: false;
  error: string;
  status: number;
}

type ApiKeyResult = ApiKeyValid | ApiKeyInvalid;

export async function validateApiKey(req: NextRequest): Promise<ApiKeyResult> {
  const apiKey = req.headers.get('x-api-key');

  if (!apiKey) {
    return { valid: false, error: 'Missing API key', status: 401 };
  }

  // Quick prefix check: all keys start with "liv_k_"
  if (!apiKey.startsWith('liv_k_')) {
    return { valid: false, error: 'Invalid API key', status: 401 };
  }

  const result = await pool.query<{ key_hash: string; user_id: string }>(
    'SELECT key_hash, user_id FROM api_keys'
  );

  for (const row of result.rows) {
    const match = await bcrypt.compare(apiKey, row.key_hash);
    if (match) {
      return { valid: true, userId: row.user_id };
    }
  }

  return { valid: false, error: 'Invalid API key', status: 401 };
}

export function unauthorizedResponse(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 401 });
}
