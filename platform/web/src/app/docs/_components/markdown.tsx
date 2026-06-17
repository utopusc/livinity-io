'use client';

import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
        components={{
          h2: ({ children }) => <h2 id={slugifyHeading(toText(children))}>{children}</h2>,
          h3: ({ children }) => <h3 id={slugifyHeading(toText(children))}>{children}</h3>,
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
