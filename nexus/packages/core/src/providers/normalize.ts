/**
 * Message normalization layer for multi-provider AI.
 * Handles role mapping, consecutive message merging, alternation validation,
 * and provider-specific format conversion.
 */

import type { ProviderMessage } from './types.js';
import { logger } from '../logger.js';

/**
 * Normalize raw messages (from Brain ChatMessage or similar) to ProviderMessage format.
 * Maps 'model' → 'assistant', 'text' → 'content', strips empty messages.
 */
export function normalizeMessages(
  messages: Array<{ role: string; text?: string; content?: string; images?: Array<{ base64: string; mimeType: string }> }>,
): ProviderMessage[] {
  const result: ProviderMessage[] = [];

  for (const msg of messages) {
    const role = msg.role === 'model' ? 'assistant' : (msg.role as 'user' | 'assistant');
    const content = msg.content ?? msg.text ?? '';
    const images = msg.images;

    // Skip empty messages (no content and no images)
    if (!content && (!images || images.length === 0)) {
      continue;
    }

    result.push({ role, content, images });
  }

  return result;
}

/**
 * Merge consecutive messages with the same role by concatenating content.
 * Critical for Claude compliance — Claude rejects consecutive same-role messages.
 */
export function mergeConsecutiveRoles(messages: ProviderMessage[]): ProviderMessage[] {
  if (messages.length === 0) return [];

  const merged: ProviderMessage[] = [{ ...messages[0], images: messages[0].images ? [...messages[0].images] : undefined }];

  for (let i = 1; i < messages.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = messages[i];

    if (curr.role === prev.role) {
      // Merge content
      prev.content = prev.content ? `${prev.content}\n\n${curr.content}` : curr.content;

      // Merge images
      if (curr.images && curr.images.length > 0) {
        if (!prev.images) prev.images = [];
        prev.images.push(...curr.images);
      }

      logger.debug('normalize: merged consecutive same-role messages', { role: curr.role, index: i });
    } else {
      merged.push({ ...curr, images: curr.images ? [...curr.images] : undefined });
    }
  }

  return merged;
}

/**
 * Validate strict user/assistant alternation (required by Claude).
 * First message must be 'user'.
 */
export function validateAlternation(messages: ProviderMessage[]): { valid: boolean; error?: string } {
  if (messages.length === 0) {
    return { valid: true };
  }

  if (messages[0].role !== 'user') {
    return { valid: false, error: `Messages[0]: expected 'user' but got '${messages[0].role}'` };
  }

  for (let i = 1; i < messages.length; i++) {
    const expected = messages[i - 1].role === 'user' ? 'assistant' : 'user';
    if (messages[i].role !== expected) {
      return { valid: false, error: `Messages[${i}]: expected '${expected}' but got '${messages[i].role}'` };
    }
  }

  return { valid: true };
}

/**
 * Convert ProviderMessage[] to provider-specific format.
 * Applies mergeConsecutiveRoles before conversion.
 * For Claude, also validates alternation and throws if invalid.
 */
export function prepareForProvider(messages: ProviderMessage[], provider: 'claude' | 'gemini'): unknown[] {
  const merged = mergeConsecutiveRoles(messages);

  if (provider === 'claude') {
    const validation = validateAlternation(merged);
    if (!validation.valid) {
      throw new Error(`Claude message alternation error: ${validation.error}`);
    }

    return merged.map((msg) => {
      if (msg.images && msg.images.length > 0) {
        return {
          role: msg.role,
          content: [
            { type: 'text' as const, text: msg.content },
            ...msg.images.map((img) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: img.mimeType,
                data: img.base64,
              },
            })),
          ],
        };
      }
      return { role: msg.role, content: msg.content };
    });
  }

  // Gemini format
  return merged.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : msg.role,
    parts: [
      { text: msg.content },
      ...(msg.images || []).map((img) => ({
        inlineData: { data: img.base64, mimeType: img.mimeType },
      })),
    ],
  }));
}

/**
 * Convenience: normalize raw messages and prepare for a specific provider in one call.
 */
export function normalizeAndPrepare(
  rawMessages: Array<{ role: string; text?: string; content?: string; images?: Array<{ base64: string; mimeType: string }> }>,
  provider: 'claude' | 'gemini',
): unknown[] {
  const normalized = normalizeMessages(rawMessages);
  return prepareForProvider(normalized, provider);
}
