import Link from 'next/link';
import { LEGAL_DOCS } from './_content';

export default function LegalHub() {
  return (
    <main className="docs-home">
      <div className="docs-home-eyebrow">Livinity Legal</div>
      <h1 className="docs-home-title">Legal &amp; policies</h1>
      <p className="docs-home-sub">
        The agreements and policies that govern your use of Livinity. By using the Service you
        agree to these terms.
      </p>

      <div className="docs-featured-list">
        {LEGAL_DOCS.map((d) => (
          <Link key={d.slug} href={`/legal/${d.slug}`} className="docs-featured-item">
            <div>
              <div className="ttl">{d.title}</div>
              <div className="dsc">{d.summary}</div>
            </div>
            <span className="arrow">→</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
