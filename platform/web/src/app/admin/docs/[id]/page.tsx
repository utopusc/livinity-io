'use client';

import { useEffect, useState, use } from 'react';
import { AdminShell } from '../../admin-shell';
import { ArticleForm } from '../../components/article-form';
import { getArticle, type DocArticle } from '../../lib/docs-api';

export default function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [article, setArticle] = useState<DocArticle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getArticle(id)
      .then(setArticle)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  return (
    <AdminShell>
      <div className="admin-ph">
        <div>
          <div className="admin-ph-eyebrow">Editing · {id}</div>
          <h1 className="admin-ph-title">
            {article ? (
              <>
                Edit <em>{article.title}</em>
              </>
            ) : (
              <>Loading…</>
            )}
          </h1>
          {article && (
            <p className="admin-ph-sub">Slug locked. Saves go straight to Supabase.</p>
          )}
        </div>
      </div>
      {error && (
        <div className="form" style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {article && <ArticleForm initial={article} />}
    </AdminShell>
  );
}
