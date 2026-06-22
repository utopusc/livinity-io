import { AdminShell } from '../../admin-shell';
import { AnnouncementForm } from '../../components/announcement-form';

export default function NewAnnouncementPage() {
  return (
    <AdminShell>
      <div className="admin-ph">
        <div>
          <div className="admin-ph-eyebrow">New entry</div>
          <h1 className="admin-ph-title">
            Compose a new <em>announcement</em>
          </h1>
          <p className="admin-ph-sub">
            Build with content blocks or paste raw HTML, pick a template, set targeting and
            display rules, then publish to the fleet.
          </p>
        </div>
      </div>
      <AnnouncementForm />
    </AdminShell>
  );
}
