// /tmp/poc-presence.mjs (placed inside platform/web/scripts for node_modules access)
// Phase 146 W2-T2 — Realtime presence POC
// Validates the full bootstrap chain BEFORE Vercel deploy exists:
//   1. mint HS256 JWT with SUPABASE_JWT_SECRET (mirrors /api/me/realtime-token logic)
//   2. side A: livinityd impersonator subscribes + tracks presence on tunnel:<uid>
//   3. side B: /api/dashboard impersonator (service-role) reads presenceState
//   4. assert online count == 1

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_JWT_SECRET', 'LUCY_USER_ID'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`MISSING ENV: ${k}`);
    process.exit(2);
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const LUCY_USER_ID = process.env.LUCY_USER_ID;
const CHANNEL = `tunnel:${LUCY_USER_ID}`;

// === mint JWT (same logic as supabase-server.ts mintRealtimeJwt) ===
const RT_TOKEN = jwt.sign(
  { sub: LUCY_USER_ID, role: 'authenticated', aud: 'authenticated', userId: LUCY_USER_ID },
  SUPABASE_JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' },
);
console.log('[mint] JWT len:', RT_TOKEN.length, 'channel:', CHANNEL);

// === Side A: livinityd impersonator ===
const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 2 } },
});
clientA.realtime.setAuth(RT_TOKEN);
const chA = clientA.channel(CHANNEL, { config: { presence: { key: LUCY_USER_ID } } });

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('side A subscribe timeout 15s')), 15000);
  chA.on('presence', { event: 'sync' }, () => {
    console.log('[A] presence sync — current state:', JSON.stringify(chA.presenceState()));
  });
  chA.subscribe(async (status, err) => {
    console.log('[A] subscribe status:', status, err ? `err=${err.message || err}` : '');
    if (status === 'SUBSCRIBED') {
      const trackRes = await chA.track({
        username: 'lucy',
        livinityd_version: '146-poc',
        started_at: new Date().toISOString(),
      });
      console.log('[A] track result:', trackRes);
      clearTimeout(timeout);
      resolve();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      clearTimeout(timeout);
      reject(new Error(`subscribe failed: ${status} ${err?.message || ''}`));
    }
  });
});

// Wait for propagation
await new Promise((r) => setTimeout(r, 3000));

// === Side B: /api/dashboard impersonator (service-role) ===
const clientB = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const chB = clientB.channel(CHANNEL);
const stateAtB = await new Promise((resolve) => {
  let resolved = false;
  chB.on('presence', { event: 'sync' }, () => {
    if (!resolved) { resolved = true; resolve(chB.presenceState()); }
  });
  chB.subscribe();
  setTimeout(() => {
    if (!resolved) { resolved = true; resolve(chB.presenceState()); }
  }, 5000);
});
console.log('[B] presence state seen by service-role:');
console.log(JSON.stringify(stateAtB, null, 2));
const onlineCount = Object.keys(stateAtB).length;
console.log(`[B] online count: ${onlineCount}`);

await clientA.removeChannel(chA);
await clientB.removeChannel(chB);

if (onlineCount < 1) {
  console.error('FAIL: presence state empty');
  process.exit(1);
}
console.log('PASS: presence flow end-to-end');
process.exit(0);
