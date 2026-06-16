#!/usr/bin/env node
// Runs on SessionStart - notifies daemon that an AI session started
// Phase 278: default to LOCAL liv-core (127.0.0.1:3200). NEXUS_URL is never
// exported anywhere, so the old `45.137.194.103:3200` (Server4) default was what
// actually RAN — these hooks POSTed session data to a FOREIGN box on every
// non-bruce install. liv-core listens on 127.0.0.1:3200 on the same box; set
// NEXUS_URL only to override for a remote daemon.
const NEXUS_URL = process.env.NEXUS_URL || 'http://127.0.0.1:3200';

async function notifySessionStart() {
  try {
    let rawInput = '';
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    rawInput = Buffer.concat(chunks).toString('utf8');
    const input = JSON.parse(rawInput);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);

    await fetch(`${NEXUS_URL}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        event: 'session_start',
        sessionId: input.session_id,
        cwd: input.cwd,
        timestamp: Date.now(),
      }),
    });
  } catch {
    // Silent fail
  }
}

notifySessionStart();
