#!/usr/bin/env node
// This runs on UserPromptSubmit hook
// It checks if the Nexus daemon has pending notifications
// Phase 278: default to LOCAL liv-core (127.0.0.1:3200). NEXUS_URL is never
// exported anywhere, so the old `45.137.194.103:3200` (Server4) default was what
// actually RAN — these hooks polled a FOREIGN box on every non-bruce install.
// liv-core listens on 127.0.0.1:3200 on the same box; set NEXUS_URL only to
// override for a remote daemon.
const NEXUS_URL = process.env.NEXUS_URL || 'http://127.0.0.1:3200';

async function checkInbox() {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${NEXUS_URL}/api/notifications`, {
      signal: controller.signal,
    });
    if (!response.ok) return;

    const data = await response.json();

    if (data.notifications && data.notifications.length > 0) {
      const output = {
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: `[Nexus Daemon Notifications]\n${data.notifications.map(n => `- ${n}`).join('\n')}\n[End Notifications]`,
        },
      };
      process.stdout.write(JSON.stringify(output));
    }
  } catch {
    // Silently fail - daemon might be unreachable
  }
}

checkInbox();
