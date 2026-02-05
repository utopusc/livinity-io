#!/usr/bin/env node
// This runs on UserPromptSubmit hook in Claude Code
// It checks if the Nexus daemon has pending notifications
const NEXUS_URL = process.env.NEXUS_URL || 'http://45.137.194.103:3200';

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
