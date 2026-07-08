/**
 * src/main/platform/schemas.ts
 *
 * One zod schema per platform HTTP response shape (livinity.io). Every
 * response must be run through `.safeParse()` before being trusted — never
 * `.parse()` (throws) at this trust boundary. Shapes are byte-exact copies
 * from 02-RESEARCH.md's Code Examples section (code-verified + live-probed
 * against production 2026-07-08) — do not re-derive them.
 *
 * Zero imports from ipc/ or tray/ — this module is a pure, unit-testable
 * main-process primitive (ARCHITECTURE.md hard isolation rule).
 */

import { z } from 'zod';

/** `POST /api/auth/login` 200 body. */
export const LoginResponseSchema = z.object({
  success: z.literal(true),
  user: z.object({
    id: z.string(),
    username: z.string().nullable(),
    email: z.string(),
    emailVerified: z.boolean(),
  }),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/** `GET /api/auth/me` 200 body — `user` is null when the session cookie is missing/invalid. */
export const MeResponseSchema = z.object({
  user: z
    .object({
      userId: z.string(),
      username: z.string().nullable(),
      email: z.string(),
      emailVerified: z.boolean(),
      is_admin: z.boolean(),
      free_byod: z.boolean(),
    })
    .nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/**
 * `GET /api/dashboard` 200 body. `.passthrough()` on the outer object so
 * unlisted fields (devices, bandwidth, etc.) don't fail parsing — this
 * schema only needs to validate the fields this phase actually reads.
 */
export const DashboardResponseSchema = z
  .object({
    billing: z.object({
      active: z.boolean(),
      plan: z.string(),
      status: z.string().nullable(),
      legacyFree: z.boolean(),
      reason: z.string().nullable(),
    }),
    apiKey: z.object({
      hasKey: z.boolean(),
      prefix: z.string().nullable(),
    }),
    server: z.object({
      online: z.boolean(),
      url: z.string(),
      provisioned: z.boolean(),
    }),
  })
  .passthrough();
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;

/** `POST /api/me/choose-free` 200 body (both the success and the has_paid_plan guard shape). */
export const ChooseFreeResponseSchema = z.object({
  ok: z.boolean(),
  free_byod: z.boolean().optional(),
  reason: z.string().optional(),
});
export type ChooseFreeResponse = z.infer<typeof ChooseFreeResponseSchema>;

/**
 * `POST /api/dashboard` (`{action:'generate-key'|'regenerate-key'}`) 200 body.
 * `.passthrough()` so extra fields (username/plan/byod/installCommand) don't
 * fail parsing — only `apiKey`/`prefix` are consumed by this phase.
 */
export const MintKeyResponseSchema = z
  .object({
    success: z.literal(true),
    apiKey: z.string(),
    prefix: z.string(),
  })
  .passthrough();
export type MintKeyResponse = z.infer<typeof MintKeyResponseSchema>;

/** `GET /api/me/profile` 200 body (the D-14 X-API-Key live-validation probe). */
export const ProfileProbeResponseSchema = z.object({
  username: z.string(),
  email: z.string(),
});
export type ProfileProbeResponse = z.infer<typeof ProfileProbeResponseSchema>;
