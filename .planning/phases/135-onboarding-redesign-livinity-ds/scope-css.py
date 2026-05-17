"""Scope reference onboarding.css under [data-flow="onboarding"].

Reads .planning/phases/135-onboarding-redesign-livinity-ds/reference/onboarding.css,
rewrites every top-level rule's selector to be a descendant of [data-flow="onboarding"]:
  :root { ... }         -> [data-flow="onboarding"] { ... }
  html, body { ... }    -> [data-flow="onboarding"] { ... }  (merge; body styles apply to the scope root)
  .btn { ... }          -> [data-flow="onboarding"] .btn { ... }
  body.step-0 .x { ... }-> [data-flow="onboarding"].step-0 .x { ... }
  * { ... }             -> [data-flow="onboarding"] * { ... }
  @keyframes / @media   -> kept as-is (no scoping)

Outputs to livos/packages/ui/src/styles/onboarding-flow.css.
"""
import re
from pathlib import Path

SCOPE = '[data-flow="onboarding"]'

SRC = Path(".planning/phases/135-onboarding-redesign-livinity-ds/reference/onboarding.css")
DST = Path("livos/packages/ui/src/styles/onboarding-flow.css")

src = SRC.read_text(encoding="utf-8")

# Tokenizer: walk the file, splitting into atomic units (at-rules, selectors+blocks, comments).
out = []
i = 0
n = len(src)
in_atrule_depth = 0

HEADER = (
    "/* Phase 135 — Onboarding flow stylesheet.\n"
    " * AUTO-PORTED from reference onboarding.css (1708 LOC) by scope-css.py.\n"
    " * Every selector scoped under [data-flow=\"onboarding\"] so the styles\n"
    " * only apply inside the onboarding subtree and don't leak into the\n"
    " * rest of LivOS. Do NOT hand-edit — regenerate via the script.\n"
    " *\n"
    " * Source: .planning/phases/135-onboarding-redesign-livinity-ds/reference/onboarding.css\n"
    " * Generator: .planning/phases/135-onboarding-redesign-livinity-ds/scope-css.py\n"
    " */\n\n"
)

def scope_selector_list(sel_list: str) -> str:
    """Apply scope prefix to a comma-separated selector list."""
    parts = [s.strip() for s in sel_list.split(",")]
    scoped = []
    for s in parts:
        if not s:
            continue
        # :root or *the* :root pseudo-class: replace with scope root
        if s == ":root":
            scoped.append(SCOPE)
            continue
        # html, body, html.x, body.step-N etc. — replace html/body with scope element
        # body.step-0 → [data-flow="onboarding"].step-0  (combines on the scope element)
        m = re.match(r"^(html|body)((?:[.#:\[][^,\s>+~]*)*)((?:\s+.*)?)$", s)
        if m:
            tail_class = m.group(2)  # e.g. ".step-0"
            descend = m.group(3)      # e.g. " .child" or ""
            scoped.append(f"{SCOPE}{tail_class}{descend}")
            continue
        # Default: prepend scope as ancestor
        scoped.append(f"{SCOPE} {s}")
    return ", ".join(scoped)


def _scope_block(inner: str) -> str:
    """Scope a block of CSS (selectors inside @media/@supports)."""
    out2 = []
    k = 0
    m = len(inner)
    while k < m:
        c = inner[k]
        if c in " \t\r\n":
            out2.append(c)
            k += 1
            continue
        if c == '/' and k+1 < m and inner[k+1] == '*':
            end = inner.find('*/', k+2)
            if end < 0:
                out2.append(inner[k:])
                break
            out2.append(inner[k:end+2])
            k = end + 2
            continue
        if c == '@':
            jj = k
            while jj < m and inner[jj] not in '{;':
                jj += 1
            head = inner[k:jj].strip()
            if jj < m and inner[jj] == '{':
                end = find_block_end(inner, jj)
                if head.startswith(('@keyframes', '@-webkit-keyframes')):
                    out2.append(inner[k:end+1])
                elif head.startswith(('@media', '@supports')):
                    sub = _scope_block(inner[jj+1:end])
                    out2.append(inner[k:jj] + '{' + sub + '}')
                else:
                    out2.append(inner[k:end+1])
                k = end + 1
            else:
                out2.append(inner[k:jj+1])
                k = jj + 1
            continue
        jj = k
        while jj < m and inner[jj] != '{':
            if inner[jj] in "\"'":
                q = inner[jj]
                jj += 1
                while jj < m and inner[jj] != q:
                    if inner[jj] == '\\':
                        jj += 2
                        continue
                    jj += 1
            jj += 1
        if jj >= m:
            out2.append(inner[k:])
            break
        sel = inner[k:jj]
        end = find_block_end(inner, jj)
        body = inner[jj:end+1]
        out2.append(scope_selector_list(sel) + body)
        k = end + 1
    return "".join(out2)


def find_block_end(s: str, start: int) -> int:
    """Given start at an opening '{', return index of matching '}'."""
    depth = 0
    i = start
    while i < len(s):
        c = s[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i
        elif c == '/' and i + 1 < len(s) and s[i+1] == '*':
            end = s.find('*/', i + 2)
            if end < 0:
                return len(s) - 1
            i = end + 1
        i += 1
    return len(s) - 1


while i < n:
    c = src[i]

    # Skip whitespace verbatim (preserve formatting)
    if c in " \t\r\n":
        out.append(c)
        i += 1
        continue

    # Comments — copy verbatim
    if c == '/' and i + 1 < n and src[i+1] == '*':
        end = src.find('*/', i + 2)
        if end < 0:
            out.append(src[i:])
            break
        out.append(src[i:end+2])
        i = end + 2
        continue

    # @-rule
    if c == '@':
        # Read up to next '{' or ';'
        j = i
        while j < n and src[j] not in '{;':
            j += 1
        head = src[i:j]
        head_stripped = head.strip()
        # keyframes / media / supports / font-face / import → don't scope (keyframes have inner selectors
        # like "from"/"to"/"50%" that aren't real DOM selectors; @media wraps rules whose inner
        # selectors we DO want scoped). Handle @media/@supports recursively by passing through.
        if head_stripped.startswith(('@keyframes', '@-webkit-keyframes', '@font-face', '@import', '@charset')):
            if j < n and src[j] == '{':
                block_end = find_block_end(src, j)
                out.append(src[i:block_end+1])
                i = block_end + 1
            else:
                out.append(src[i:j+1])
                i = j + 1
            continue
        if head_stripped.startswith(('@media', '@supports')):
            # Emit head + recurse into block: we need to scope inner rules.
            if j < n and src[j] == '{':
                block_end = find_block_end(src, j)
                inner = src[j+1:block_end]
                # Recurse: shell out by running the same tokenizer on inner.
                # Simplest: just re-process via this same logic via recursion-by-string.
                # We'll do that by calling a helper.
                inner_scoped = _scope_block(inner)
                out.append(head + '{' + inner_scoped + '}')
                i = block_end + 1
                continue
            else:
                out.append(src[i:j+1])
                i = j + 1
                continue
        # Other at-rules: just emit verbatim
        if j < n and src[j] == '{':
            block_end = find_block_end(src, j)
            out.append(src[i:block_end+1])
            i = block_end + 1
        else:
            out.append(src[i:j+1])
            i = j + 1
        continue

    # Regular selector list ending in '{'
    j = i
    while j < n and src[j] != '{':
        # skip strings (CSS allows quoted attribute values in selectors)
        if src[j] in "\"'":
            q = src[j]
            j += 1
            while j < n and src[j] != q:
                if src[j] == '\\':
                    j += 2
                    continue
                j += 1
        # skip block-style comment inside selector
        if src[j] == '/' and j+1 < n and src[j+1] == '*':
            end = src.find('*/', j+2)
            if end < 0:
                j = n
                break
            j = end + 2
            continue
        j += 1
    if j >= n:
        out.append(src[i:])
        break
    sel = src[i:j]
    block_end = find_block_end(src, j)
    body = src[j:block_end+1]
    scoped_sel = scope_selector_list(sel)
    out.append(scoped_sel + body)
    i = block_end + 1


DST.parent.mkdir(parents=True, exist_ok=True)
DST.write_text(HEADER + "".join(out), encoding="utf-8")
print(f"Wrote {DST} ({DST.stat().st_size} bytes)")
