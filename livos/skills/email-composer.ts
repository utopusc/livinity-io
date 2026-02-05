/**
---
name: email-composer
description: Smart email writing with automatic tone adjustment based on recipient
version: 1.0.0
type: simple
triggers:
  - ^(write|draft|compose|create)\s+(an?\s+)?email
  - email.*(tone|formal|casual|professional)
  - (boss|manager|client|colleague|friend).*(email|mail)
model_tier: sonnet
max_tokens: 4000
timeout_ms: 60000
---
*/

import type { SkillContext, SkillResult } from '@nexus/core/lib';

// ============================================================================
// TYPES
// ============================================================================

interface EmailRequest {
  recipient: RecipientType;
  recipientName?: string;
  recipientTitle?: string;
  subject: string;
  content: string;
  tone?: ToneType;
  urgency?: 'low' | 'normal' | 'high';
}

type RecipientType =
  | 'boss'
  | 'manager'
  | 'colleague'
  | 'subordinate'
  | 'client'
  | 'vendor'
  | 'friend'
  | 'stranger'
  | 'hr'
  | 'support';

type ToneType =
  | 'formal'
  | 'professional'
  | 'friendly'
  | 'casual'
  | 'persuasive'
  | 'apologetic'
  | 'urgent'
  | 'thankful';

interface EmailOutput {
  subject: string;
  body: string;
  suggestedTone: ToneType;
  tips?: string[];
}

// ============================================================================
// TONE MAPPING
// ============================================================================

const RECIPIENT_TONE_MAP: Record<RecipientType, ToneType> = {
  boss: 'formal',
  manager: 'professional',
  colleague: 'friendly',
  subordinate: 'professional',
  client: 'professional',
  vendor: 'professional',
  friend: 'casual',
  stranger: 'formal',
  hr: 'formal',
  support: 'professional',
};

const TONE_DESCRIPTIONS: Record<ToneType, string> = {
  formal: 'Formal and respectful. Proper salutations, longer sentence structures.',
  professional: 'Business-focused and clear. Direct communication, no unnecessary fluff.',
  friendly: 'Warm but professional. Friendly address, positive language.',
  casual: 'Relaxed and informal. Everyday language, short sentences.',
  persuasive: 'Convincing. Highlight benefits, clear call to action.',
  apologetic: 'Apologetic. Take responsibility, offer solutions.',
  urgent: 'Urgent. Emphasize importance, request quick response.',
  thankful: 'Grateful. Express appreciation, be specific about what you appreciate.',
};

// ============================================================================
// HANDLER
// ============================================================================

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  const { message } = ctx;

  try {
    // Parse the request
    const request = await parseEmailRequest(ctx, message);

    // Determine optimal tone
    const suggestedTone = request.tone || RECIPIENT_TONE_MAP[request.recipient];

    // Generate the email
    const email = await generateEmail(ctx, request, suggestedTone);

    // Format output
    const output = formatEmailOutput(email);

    return {
      success: true,
      message: output,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to create email: ${(err as Error).message}`,
    };
  }
}

// ============================================================================
// REQUEST PARSING
// ============================================================================

async function parseEmailRequest(ctx: SkillContext, message: string): Promise<EmailRequest> {
  const parsePrompt = `
Analyze this email writing request.

Message: "${message}"

Respond in JSON format:
{
  "recipient": "boss|manager|colleague|subordinate|client|vendor|friend|stranger|hr|support",
  "recipientName": "Recipient name if mentioned",
  "recipientTitle": "Title if mentioned (e.g., 'Mr.', 'CEO', 'Dr.')",
  "subject": "Email subject",
  "content": "Main content/purpose of the email",
  "tone": "formal|professional|friendly|casual|persuasive|apologetic|urgent|thankful (if specified)",
  "urgency": "low|normal|high"
}

Rules:
- recipient: Extract from message (boss, client, friend, etc.)
- If tone not specified, set to null
- content: Summarize what the user wants to communicate
`;

  const response = await ctx.think(parsePrompt, { tier: 'flash' });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON parse failed');

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      recipient: parsed.recipient || 'colleague',
      recipientName: parsed.recipientName || undefined,
      recipientTitle: parsed.recipientTitle || undefined,
      subject: parsed.subject || 'No Subject',
      content: parsed.content || message,
      tone: parsed.tone || undefined,
      urgency: parsed.urgency || 'normal',
    };
  } catch {
    return {
      recipient: detectRecipient(message),
      subject: 'Email',
      content: message,
      urgency: 'normal',
    };
  }
}

function detectRecipient(message: string): RecipientType {
  const lower = message.toLowerCase();

  if (/\b(boss|ceo|director|vp|president)\b/.test(lower)) return 'boss';
  if (/\b(manager|supervisor|lead|head)\b/.test(lower)) return 'manager';
  if (/\b(client|customer)\b/.test(lower)) return 'client';
  if (/\b(vendor|supplier|partner)\b/.test(lower)) return 'vendor';
  if (/\b(friend|buddy|pal)\b/.test(lower)) return 'friend';
  if (/\b(hr|human\s*resources)\b/.test(lower)) return 'hr';
  if (/\b(support|help\s*desk)\b/.test(lower)) return 'support';

  return 'colleague';
}

// ============================================================================
// EMAIL GENERATION
// ============================================================================

async function generateEmail(
  ctx: SkillContext,
  request: EmailRequest,
  tone: ToneType
): Promise<EmailOutput> {
  const toneDesc = TONE_DESCRIPTIONS[tone];
  const urgencyNote = request.urgency === 'high'
    ? '\n- This is URGENT, convey importance without creating panic'
    : '';

  const prompt = `
Write a professional email.

RECIPIENT INFO:
- Type: ${request.recipient}${request.recipientName ? ` (${request.recipientName})` : ''}${request.recipientTitle ? `, ${request.recipientTitle}` : ''}

SUBJECT: ${request.subject}

CONTENT/PURPOSE:
${request.content}

TONE REQUIREMENTS:
- Tone: ${tone}
- Description: ${toneDesc}${urgencyNote}

RULES:
1. Start with appropriate greeting (Dear, Hi, Hello, etc.)
2. Write the main message clearly and readably
3. End with appropriate closing
4. Be realistic and professional
5. Keep it readable - don't be too long

OUTPUT FORMAT (JSON):
{
  "subject": "Suggested email subject line",
  "body": "Email text (use \\n for line breaks)",
  "tips": ["1-2 tips about the email"]
}
`;

  const response = await ctx.think(prompt, { tier: 'sonnet' });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Email generation failed');

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      subject: parsed.subject || request.subject,
      body: parsed.body || '',
      suggestedTone: tone,
      tips: parsed.tips || [],
    };
  } catch {
    throw new Error('Could not generate email text');
  }
}

// ============================================================================
// OUTPUT FORMATTING
// ============================================================================

function formatEmailOutput(email: EmailOutput): string {
  const lines: string[] = [];

  lines.push('## Email Draft');
  lines.push('');
  lines.push(`**Subject:** ${email.subject}`);
  lines.push('');
  lines.push(`**Tone:** ${email.suggestedTone}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(email.body.replace(/\\n/g, '\n'));
  lines.push('');
  lines.push('---');

  if (email.tips && email.tips.length > 0) {
    lines.push('');
    lines.push('**Tips:**');
    for (const tip of email.tips) {
      lines.push(`- ${tip}`);
    }
  }

  lines.push('');
  lines.push('_You can copy this draft and paste it into your email application._');

  return lines.join('\n');
}

export const tools = [];
