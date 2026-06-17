'use client';

import { useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { slugifyHeading } from '../_lib/slugify';

// Flatten arbitrary React children to plain text so headings can derive a
// stable slug `id` that matches the TOC anchors.
function toText(node: ReactNode): string {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return toText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return '';
}

// Fenced code block with a hover-revealed copy button. The button sits OUTSIDE
// the <pre> (sibling in the wrapper) so reading `pre.textContent` returns the
// code only — the syntax-highlight spans flatten back to the original source.
function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = preRef.current?.textContent ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text.replace(/\n$/, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API unavailable (insecure context / denied) — fail silently.
    }
  }

  return (
    <div className="docs-code-wrap">
      <button
        type="button"
        className={`docs-code-copy${copied ? ' is-copied' : ''}`}
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}

/**
 * Shared GitHub-flavored markdown renderer. Used for the public article body
 * AND the admin editor's live preview, so what the author sees IS what ships.
 * Styling lives in docs.css under `.docs-prose`. As a client component it is
 * still server-rendered into the initial HTML (good for SEO + first paint).
 */
export function DocsMarkdown({ content }: { content: string }) {
  return (
    <div className="docs-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h2: ({ children }) => <h2 id={slugifyHeading(toText(children))}>{children}</h2>,
          h3: ({ children }) => <h3 id={slugifyHeading(toText(children))}>{children}</h3>,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          img: (props) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.src as string} alt={(props.alt as string) || ''} loading="lazy" />
          ),
          a: ({ href, children }) => {
            const external = typeof href === 'string' && /^https?:\/\//.test(href);
            return (
              <a
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer noopener' : undefined}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
