#!/usr/bin/env node
// Runs on SessionStart - notifies daemon that a Claude Code session started
const NEXUS_URL = process.env.NEXUS_URL || 'http://45.137.194.103:3200';

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
