import { AdminShell } from '../../admin-shell';
import { ArticleForm } from '../../components/article-form';

export default function NewArticlePage() {
  return (
    <AdminShell>
      <div className="admin-ph">
        <div>
          <div className="admin-ph-eyebrow">New entry</div>
          <h1 className="admin-ph-title">
            Write a new <em>article</em>
          </h1>
          <p className="admin-ph-sub">
            Markdown on the left, live preview on the right. Use “Insert image”
            to upload screenshots inline.
          </p>
        </div>
      </div>
      <ArticleForm />
    </AdminShell>
  );
}
