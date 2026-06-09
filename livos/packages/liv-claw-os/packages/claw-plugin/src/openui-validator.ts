/**
 * Phase 203-04 — OpenUI Lang whitelist validator (plugin-side).
 *
 * BYTE-IDENTICAL (modulo this header comment) to
 * `livos/packages/livinityd/source/modules/openui/validator.ts` so the
 * plugin's pre-flight lint hook + livinityd's tRPC boundary apply the
 * SAME 14-component whitelist + URL guards. Why duplicated instead of
 * extracted to a workspace-shared package: Plan 203-04 plan_context calls
 * the duplication "pragmatic; OK for ~80 LOC. Document the duplication in
 * SUMMARY so a future cleanup phase can extract it to a workspace-shared
 * @livos/openui-validator package." A future v204+ cleanup phase may
 * extract this once the pnpm install path on Windows is unblocked
 * (Plan 203-02 deviation).
 *
 * Threat mitigations:
 *   T-203-03 — same allow-list + scheme-rejection logic as the server.
 */

export const OPENUI_ALLOWED_COMPONENTS: readonly string[] = [
  "heading",
  "text",
  "paragraph",
  "button",
  "list",
  "card",
  "image",
  "link",
  "divider",
  "layout-stack",
  "layout-row",
  "badge",
  "input",
  "table",
];

const ALLOWED_SET = new Set(OPENUI_ALLOWED_COMPONENTS);

const SAFE_IMG_DATA_PREFIX = /^data:image\/(png|jpeg|gif|webp|svg\+xml);/i;
const DANGEROUS_SCHEMES = /^(javascript|vbscript|data|file|about):/i;

export function isSafeUrl(value: unknown, opts: { allowDataImage?: boolean } = {}): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  const v = value.trim();
  if (opts.allowDataImage && SAFE_IMG_DATA_PREFIX.test(v)) return true;
  if (DANGEROUS_SCHEMES.test(v)) return false;
  if (/^https:\/\//i.test(v)) return true;
  if (v.startsWith("//")) return true;
  if (v.startsWith("/")) return true;
  if (v.startsWith("#")) return true;
  return false;
}

export type ValidationResult = { ok: true } | { ok: false; reason: string; path?: string };

export function validateOpenUITree(node: unknown, path = "$"): ValidationResult {
  if (node == null) return { ok: true };
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return { ok: true };
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const r = validateOpenUITree(node[i], `${path}[${i}]`);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  if (typeof node !== "object") return { ok: true };

  const obj = node as Record<string, unknown>;

  if ("dangerouslySetInnerHTML" in obj) {
    return { ok: false, reason: "OPENUI_RAW_HTML", path };
  }

  const compName =
    typeof obj["type"] === "string"
      ? (obj["type"] as string)
      : typeof obj["name"] === "string"
        ? (obj["name"] as string)
        : null;

  if (compName !== null) {
    if (!ALLOWED_SET.has(compName)) {
      return { ok: false, reason: `OPENUI_DISALLOWED_COMPONENT:${compName}`, path };
    }
    const props = (obj["props"] ?? {}) as Record<string, unknown>;
    if (compName === "image") {
      if (props["src"] !== undefined && !isSafeUrl(props["src"], { allowDataImage: true })) {
        return { ok: false, reason: "OPENUI_UNSAFE_URL:image.src", path };
      }
    }
    if (compName === "link") {
      if (props["href"] !== undefined && !isSafeUrl(props["href"])) {
        return { ok: false, reason: "OPENUI_UNSAFE_URL:link.href", path };
      }
    }
  }

  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === "object") {
      const r = validateOpenUITree(val, `${path}.${key}`);
      if (!r.ok) return r;
    }
  }

  return { ok: true };
}
