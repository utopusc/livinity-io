import {
  createParser,
  enrichErrors,
  type LibraryJSONSchema,
  type OpenUIError,
  type ParseResult,
  type Parser,
} from "@openuidev/lang-core";
import schemaJson from "./generated/openui-schema.json" with { type: "json" };

// `openui-schema.json` ships `{schema, componentNames}` — the JSON Schema
// emitted by `openuiLibrary.toJSONSchema()` plus a flat list of component
// names extracted at build time. The constrained `LibraryJSONSchema` type
// in lang-core only names the fields the parser reads (`$defs.*.{properties,
// required}`), so the cast at the boundary stays.
const LIBRARY_SCHEMA: LibraryJSONSchema = (schemaJson as unknown as { schema: LibraryJSONSchema })
  .schema;
const COMPONENT_NAMES: readonly string[] = (schemaJson as unknown as { componentNames: string[] })
  .componentNames;

/** Public-shape of a single lint finding returned to the LLM. */
export interface LintFinding {
  code: string;
  message: string;
  statement?: string;
  component?: string;
  path?: string;
  hint?: string;
}

/**
 * Loose typing for the AST nodes the lint walker inspects. The lang-core
 * `ASTNode` union models the parser's emitted shape, but at lint time we
 * also walk materialized element trees and a few dynamically-shaped
 * branches (e.g. `then`/`otherwise` on legacy conditional nodes). Narrowing
 * everything through this single union lets us dot-access the fields we
 * read while keeping the runtime walk over arbitrary subtrees.
 */
interface LintAstNode {
  k: string;
  name?: unknown;
  n?: unknown;
  args?: unknown;
  els?: unknown;
  entries?: unknown;
  mappedProps?: unknown;
  then?: unknown;
  otherwise?: unknown;
}

interface LintElementNode {
  type: "element";
  // Materialized elements use `typeName` (the component name from the library)
  // and optionally `statementId` (the source variable). lang-core's ElementNode
  // is the contract — see node_modules/@openuidev/lang-core/dist/index.d.mts.
  typeName?: unknown;
  statementId?: unknown;
  props?: unknown;
}

function isLintAstNode(value: unknown): value is LintAstNode {
  return (
    typeof value === "object" && value !== null && typeof (value as { k?: unknown }).k === "string"
  );
}

function isLintElementNode(value: unknown): value is LintElementNode {
  return (
    typeof value === "object" && value !== null && (value as { type?: unknown }).type === "element"
  );
}

export interface LintReport {
  /** True if the code parses cleanly with no validation errors and all refs resolved. */
  ok: boolean;
  /** Structured findings, one per problem, ready to surface back to the LLM. */
  findings: LintFinding[];
  /** Human-readable note combining all findings — handy for quick glances. */
  summary: string;
  /**
   * Hallucination-replacement primer, attached when at least one
   * `unknown-component` finding wasn't covered by a direct replacement entry.
   * Surfaced once per lint report (not per finding) to avoid duplicating ~600
   * chars of guidance across every unknown in a program.
   */
  hint?: string;
}

let cachedParser: Parser | null = null;
function getParser(): Parser {
  if (!cachedParser) {
    cachedParser = createParser(LIBRARY_SCHEMA);
  }
  return cachedParser;
}

function unresolvedToFinding(name: string): LintFinding {
  return {
    code: "unresolved-ref",
    statement: name,
    message: `Reference "${name}" is used but never defined as a top-level statement. Add "${name} = ..." somewhere in the program.`,
    hint: 'Every identifier referenced inside a component must be assigned at the top level, e.g. `header = CardHeader("Title")` before use.',
  };
}

function orphanedToFinding(name: string): LintFinding {
  return {
    code: "orphan-statement",
    statement: name,
    message: `Statement "${name}" is defined but not reachable from \`root\`. It will be silently dropped at runtime.`,
    hint: "Reference it from root (or an ancestor of root), or delete the statement.",
  };
}

/**
 * Walk the materialized tree hunting for semantic issues the parser's value-
 * path validation can't catch — most notably inline `Query()` / `Mutation()`
 * inside an `Action([...])`, which goes unchecked because `materializeExpr`
 * skips reserved-call validation, and unresolved `@Run` targets.
 *
 * Returns additional findings to append to the parser's own errors.
 */
function walkSemantic(parsed: ParseResult): LintFinding[] {
  const findings: LintFinding[] = [];
  const declaredQueries = new Set(parsed.queryStatements.map((q) => q.statementId));
  const declaredMutations = new Set(parsed.mutationStatements.map((m) => m.statementId));
  // Dedupe by AST-node identity: mappedProps + args duplicate the same node,
  // so path-based dedupe would over-count. WeakSet keys on node reference.
  const flaggedNodes = new WeakSet<object>();
  const visitedNodes = new WeakSet<object>();

  const isRunLike = (name: string): boolean => name === "Run" || name === "Set" || name === "Reset";

  const describeRunArgProblem = (
    compName: "Run" | "Set" | "Reset",
    argNode: unknown,
  ): { code: string; message: string; hint: string } | null => {
    if (!argNode || typeof argNode !== "object") {
      return {
        code: "action-bad-target",
        message: `@${compName}(...) received an empty or invalid target`,
        hint: `@${compName} must reference a declared top-level identifier (or $state for @Set/@Reset).`,
      };
    }
    const n = argNode as { k?: unknown; name?: unknown };
    const k = n.k;
    if (compName === "Run") {
      // Valid: RuntimeRef (resolved at materialize) or Ref (still-unresolved at walk time — reported separately as unresolved)
      if (k === "RuntimeRef" || k === "Ref") return null;
      if (k === "Comp") {
        const inlineName = String(n.name ?? "?");
        return {
          code: "action-inline-target",
          message: `@Run(${inlineName}(...)) was passed an inline call. @Run needs a reference to a top-level declared statement.`,
          hint: `Declare \`myMutation = ${inlineName}("tool", { ... })\` at the top level, parameterize via $state, then use \`@Run(myMutation)\`.`,
        };
      }
      return {
        code: "action-bad-target",
        message: `@Run expects a reference to a declared Query or Mutation, got k="${String(k)}"`,
        hint: `Declare the target at the top level (e.g. \`refresh = Query(...)\`) and pass its name: \`@Run(refresh)\`.`,
      };
    }
    // Set / Reset: must point at a $state declaration (StateRef).
    if (k === "StateRef" || k === "Ref") return null;
    return {
      code: "action-bad-target",
      message: `@${compName} expects a $state target, got k="${String(k)}"`,
      hint: `Declare \`$myVar = ...\` at the top level and pass it: \`@${compName}($myVar${compName === "Set" ? ", newValue" : ""})\`.`,
    };
  };

  const visit = (node: unknown, path: string[]): void => {
    if (!node || typeof node !== "object") return;
    if (visitedNodes.has(node)) return;
    visitedNodes.add(node);
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) visit(node[i], [...path, `[${i}]`]);
      return;
    }
    // Element node (rendered component) — recurse into its props
    if (isLintElementNode(node) && node.props && typeof node.props === "object") {
      for (const [key, value] of Object.entries(node.props as Record<string, unknown>)) {
        visit(value, [...path, key]);
      }
    }
    // AST node
    if (isLintAstNode(node)) {
      // Inline reserved (Query / Mutation) surviving the materialize pass means
      // it's embedded in an expression position — parser won't have flagged it.
      if (
        node.k === "Comp" &&
        (node.name === "Query" || node.name === "Mutation") &&
        !flaggedNodes.has(node)
      ) {
        flaggedNodes.add(node);
        const statementGuess = path.find(
          (seg) => typeof seg === "string" && /^[a-z][a-zA-Z0-9_]*$/.test(seg),
        );
        findings.push({
          code: "inline-reserved",
          message: `${node.name}(...) is used inline. It must be declared as a top-level statement — e.g. \`myRef = ${node.name}("tool", { ... })\` — then referenced by name.`,
          ...(statementGuess ? { statement: statementGuess } : {}),
          component: node.name,
          hint: `When the call needs per-row data, route it through $state: \`$selectedId = null; myRef = ${node.name}("tool", { params: {id: $selectedId}, ... }); Button(..., Action([@Set($selectedId, row.id), @Run(myRef)]))\`.`,
        });
      }
      // Action step calls — @Run / @Set / @Reset must have valid targets
      if (
        node.k === "Comp" &&
        typeof node.name === "string" &&
        isRunLike(node.name) &&
        !flaggedNodes.has(node)
      ) {
        flaggedNodes.add(node);
        const firstArg = Array.isArray(node.args) ? node.args[0] : undefined;
        const compName = node.name as "Run" | "Set" | "Reset";
        const problem = describeRunArgProblem(compName, firstArg);
        if (problem) {
          findings.push({
            code: problem.code,
            message: problem.message,
            component: compName,
            hint: problem.hint,
          });
        } else if (compName === "Run" && isLintAstNode(firstArg)) {
          if (firstArg.k === "Ref" && typeof firstArg.n === "string") {
            const refName = firstArg.n;
            if (!declaredQueries.has(refName) && !declaredMutations.has(refName)) {
              findings.push({
                code: "action-unknown-target",
                message: `@Run(${refName}) references "${refName}", which is not declared as a top-level Query or Mutation.`,
                component: "Run",
                statement: refName,
                hint: `Add \`${refName} = Query("tool", ...)\` or \`${refName} = Mutation("tool", ...)\` at the top level.`,
              });
            }
          }
        }
      }
      // Recurse known children
      if (Array.isArray(node.args)) visit(node.args, [...path, "args"]);
      if (Array.isArray(node.els)) visit(node.els, [...path, "els"]);
      if (Array.isArray(node.entries)) visit(node.entries, [...path, "entries"]);
      if (node.mappedProps && typeof node.mappedProps === "object") {
        for (const [key, value] of Object.entries(node.mappedProps as Record<string, unknown>)) {
          visit(value, [...path, "mappedProps", key]);
        }
      }
      if (node.then) visit(node.then, [...path, "then"]);
      if (node.otherwise) visit(node.otherwise, [...path, "otherwise"]);
      return;
    }
    // Generic fallback — recurse object keys
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (value && typeof value === "object") visit(value, [...path, key]);
    }
  };

  visit(parsed.root, ["root"]);
  return findings;
}

/**
 * Enum validator — walks the materialized tree and flags string-literal props
 * whose value isn't in the component's schema enum (e.g. Stack direction "col"
 * instead of "column", Card variant "compact" instead of "card"/"sunk"/"clear",
 * TextContent size "huge", Tag variant "negative").
 *
 * The upstream parser silently drops `enum` arrays at compile time, so the
 * parser itself never validates. We have the enum arrays here in
 * `openui-schema.json`, so we can validate plugin-side. This is the
 * structural fix for the "col-not-column" class of bugs.
 */
type SchemaProperty = { type?: string; enum?: unknown[] };
type ComponentSchema = { properties?: Record<string, SchemaProperty> };
type SchemaDefs = Record<string, ComponentSchema>;

const SCHEMA_DEFS: SchemaDefs =
  ((LIBRARY_SCHEMA as unknown as { $defs?: SchemaDefs }).$defs as SchemaDefs) ?? {};

// High-confidence typo → correction mapping. Only entries where the bad
// value has ONE obvious right answer regardless of which component prop it's
// on. We DON'T list speculative Card-variant typos like "compact → sunk" —
// those are guesses, and the lint already lists the allowed values, so the
// agent can pick the right one. Less is more here; misleading hints are
// worse than no hint.
const ENUM_TYPO_FIX: Record<string, string> = {
  col: "column",
  vertical: "column",
  horizontal: "row",
  huge: "large-heavy",
  medium: "md", // Tag size: sm | md | lg
  negative: "danger",
  positive: "success",
};

function buildEnumHint(
  compName: string,
  propName: string,
  badValue: string,
  allowed: readonly unknown[],
): string {
  const allowedList = allowed.map((v) => `"${String(v)}"`).join(" | ");
  const fix = ENUM_TYPO_FIX[badValue.toLowerCase()];
  // Only suggest the fix if it's actually in the allowed list (avoids
  // misleading hints for components that have different enum sets).
  if (fix && allowed.includes(fix)) {
    return `Use "${fix}" instead. Valid values for ${compName}.${propName}: ${allowedList}.`;
  }
  return `Valid values for ${compName}.${propName}: ${allowedList}.`;
}

function walkEnumValidation(parsed: ParseResult): LintFinding[] {
  const findings: LintFinding[] = [];
  const seen = new WeakSet<object>();

  const visit = (node: unknown, statementHint: string | undefined): void => {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) visit(item, statementHint);
      return;
    }

    if (isLintElementNode(node)) {
      const compName = typeof node.typeName === "string" ? node.typeName : undefined;
      const elementStatement =
        typeof node.statementId === "string" ? node.statementId : statementHint;
      const props =
        node.props && typeof node.props === "object"
          ? (node.props as Record<string, unknown>)
          : undefined;
      if (compName && props) {
        const compSchema = SCHEMA_DEFS[compName];
        const propsSchema = compSchema?.properties;
        if (propsSchema) {
          for (const [propName, value] of Object.entries(props)) {
            if (typeof value !== "string") continue;
            const propSchema = propsSchema[propName];
            const allowed = propSchema?.enum;
            if (!Array.isArray(allowed) || allowed.length === 0) continue;
            if (allowed.includes(value)) continue;
            findings.push({
              code: "invalid-enum",
              component: compName,
              path: propName,
              ...(elementStatement ? { statement: elementStatement } : {}),
              message: `${compName}.${propName} got "${value}" — not a valid value.`,
              hint: buildEnumHint(compName, propName, value, allowed),
            });
          }
        }
        // Recurse into element props (children, etc.) carrying the element's
        // statementId so nested findings attribute correctly.
        for (const v of Object.values(props)) visit(v, elementStatement);
        return;
      }
    }

    // Generic object — recurse keys; track statement-id hints when present
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const nextHint =
        statementHint ??
        (typeof key === "string" && /^[a-z][a-zA-Z0-9_]*$/.test(key) ? key : undefined);
      visit(value, nextHint);
    }
  };

  visit(parsed.root, undefined);
  return findings;
}

/**
 * Hallucination-replacement table for `unknown-component` and
 * `unknown-builtin` hints. Curated from trajectory failure-mining (real
 * names the agent emits) — keep tight; long lists become noise.
 */
const COMPONENT_REPLACEMENTS: Record<string, string> = {
  Heading: 'CardHeader("Title", "Subtitle") or TextContent("Title", "large-heavy")',
  PageHeader: 'CardHeader("Title", "Subtitle")',
  Section:
    "SectionBlock([SectionItem(...)]) in chat / Accordion([AccordionItem(...)]) in apps — there is no plain Section",
  KpiCard:
    'Card([TextContent("Label", "small"), TextContent(value, "large-heavy")], "sunk") — there is no KPI component, this is the recipe',
  KPICard: 'Card([TextContent("Label", "small"), TextContent(value, "large-heavy")], "sunk")',
  KPI: 'Card([TextContent("Label", "small"), TextContent(value, "large-heavy")], "sunk")',
  StatCard: 'Card([TextContent("Label", "small"), TextContent(value, "large-heavy")], "sunk")',
  Stat: 'Card([TextContent("Label", "small"), TextContent(value, "large-heavy")], "sunk")',
  Metric: 'Card([TextContent("Label", "small"), TextContent(value, "large-heavy")], "sunk")',
  KeyValue: 'Card([TextContent("Label", "small"), TextContent(value, "large-heavy")], "sunk")',
  KeyValueList:
    "Stack of Cards with the KPI recipe (Card([TextContent(label,'small'), TextContent(value,'large-heavy')], 'sunk'))",
  Markdown: "MarkDownRenderer",
  Badge: 'Tag(text, null, "sm", "info" | "success" | "warning" | "danger")',
  Divider: "Separator()",
  Tab: 'TabItem("id", "Trigger", [content])',
  Grid: "two Stack rows of max 3 children — do NOT use wrap=true on a row of Cards",
  TextH1: 'TextContent("text", "large-heavy")',
  TextSmall: 'TextContent("text", "small")',
  TextMuted: 'TextContent("text", "small")',
  TextEyebrow: 'TextContent("text", "small")',
  FollowUp: 'FollowUpItem("text") — one arg only, the clickable text',
  // Chat-only components if seen in app context, app-only if seen in chat:
  FollowUpBlock:
    "chat-only — in apps, use a FollowUp-style row of Buttons or @Each(rows, 'r', Button(r.label, Action([@ToAssistant(r.msg)])))",
  ListBlock:
    "chat-only — in apps, use Table or @Each(rows, 'r', Card([...])) for clickable item lists",
  ListItem: "chat-only — see ListBlock note",
  SectionBlock: "chat-only — in apps, use Accordion([AccordionItem(...)])",
  SectionItem: "chat-only — see SectionBlock note",
  // Builtins reported via the same unknown-component path are caught here too:
  Map: "@Each(rows, 'item', Component(item.field))",
  JsonParse: "Query('exec', ...) auto-parses stdout that starts with { or [",
  ParseJSON: "Query('exec', ...) auto-parses stdout that starts with { or [",
  Length: "@Count(array)",
  Find: "@First(@Filter(array, 'field', '==', value))",
};

const REPLACEMENT_PRIMER =
  "Common hallucinations and their canonical replacements:\n" +
  Object.entries(COMPONENT_REPLACEMENTS)
    .slice(0, 12)
    .map(([k, v]) => `  ${k} → ${v}`)
    .join("\n");

// `enrichErrors` in lang-core emits unknown-component for unknown @-builtins
// too (the @ prefix is stripped before lint sees the name), so we only need
// to guard on "unknown-component". Lookup tries the bare name; a leading @
// fallback covers any future code path that preserves the prefix.
function enrichHallucinationHint(finding: LintFinding): LintFinding {
  if (finding.code !== "unknown-component") return finding;
  const name = finding.component ?? "";
  const direct = COMPONENT_REPLACEMENTS[name] ?? COMPONENT_REPLACEMENTS[name.replace(/^@/, "")];
  const baseHint = finding.hint ?? "";
  if (direct) {
    return {
      ...finding,
      hint: `Use ${direct}. ${baseHint}`.trim(),
    };
  }
  // No direct match — leave hint as the parser provided. The full primer is
  // attached ONCE per response in `lintOpenUICode` (not per-finding) so a
  // program with N unknowns doesn't produce N copies of the primer.
  return finding;
}

function summarize(findings: LintFinding[]): string {
  if (findings.length === 0) return "ok";
  return findings
    .map((f) => {
      const parts = [
        f.statement ? `[${f.statement}]` : undefined,
        f.component ? `${f.component}` : undefined,
        f.path || undefined,
        f.message,
      ].filter(Boolean);
      return parts.join(" ");
    })
    .join("\n");
}

const componentNames = COMPONENT_NAMES as string[];

/**
 * Parse the given openui-lang program and surface any fixable issues.
 *
 * Only returns issues the LLM can correct by editing the source — validation
 * errors, missing refs, and orphan statements. Streaming/incomplete states are
 * ignored because tools always pass a fully-written program.
 */
export function lintOpenUICode(code: string): LintReport {
  if (typeof code !== "string" || code.trim().length === 0) {
    return {
      ok: false,
      findings: [
        {
          code: "empty-code",
          message: "Code is empty. Provide a valid openui-lang program.",
        },
      ],
      summary: "empty",
    };
  }

  const parser = getParser();
  let errors: OpenUIError[] = [];
  let unresolved: string[] = [];
  let orphaned: string[] = [];

  let semantic: LintFinding[] = [];
  let enumIssues: LintFinding[] = [];
  try {
    const result = parser.parse(code);
    errors = enrichErrors(result.meta.errors, LIBRARY_SCHEMA, componentNames);
    unresolved = result.meta.unresolved ?? [];
    orphaned = result.meta.orphaned ?? [];
    semantic = walkSemantic(result);
    enumIssues = walkEnumValidation(result);
  } catch (err) {
    return {
      ok: false,
      findings: [
        {
          code: "parse-exception",
          message: err instanceof Error ? err.message : "Parser threw while reading the program",
        },
      ],
      summary: "parse-exception",
    };
  }

  const rawFindings: LintFinding[] = [
    ...errors.map(
      (e): LintFinding => ({
        code: e.code,
        message: e.message,
        ...(e.statementId ? { statement: e.statementId } : {}),
        ...(e.component ? { component: e.component } : {}),
        ...(e.path ? { path: e.path } : {}),
        ...(e.hint ? { hint: e.hint } : {}),
      }),
    ),
    ...unresolved.map(unresolvedToFinding),
    ...orphaned.map(orphanedToFinding),
    ...semantic,
    ...enumIssues,
  ];

  // Enrich hints on the highest-frequency hallucinations so the lint message
  // itself teaches the canonical replacement (Heading → CardHeader, etc.).
  // Cheaper than bloating the always-on preamble.
  const findings = rawFindings.map(enrichHallucinationHint);

  // Attach the primer once if any unknown-component finding had no direct
  // replacement match — that means the agent reached for a name we haven't
  // catalogued, and the primer's broader list is the most useful hint we can
  // give. Per-finding attachment was too expensive (N findings × ~600 chars).
  const hasUncatalogued = findings.some(
    (f) =>
      f.code === "unknown-component" &&
      !COMPONENT_REPLACEMENTS[f.component ?? ""] &&
      !COMPONENT_REPLACEMENTS[(f.component ?? "").replace(/^@/, "")],
  );

  return {
    ok: findings.length === 0,
    findings,
    summary: summarize(findings),
    ...(hasUncatalogued ? { hint: REPLACEMENT_PRIMER } : {}),
  };
}
