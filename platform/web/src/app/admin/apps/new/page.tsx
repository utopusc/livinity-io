import { AdminShell } from '../../admin-shell';
import { AppForm } from '../../components/app-form';

export default function NewAppPage() {
  return (
    <AdminShell>
      <div className="admin-ph">
        <div>
          <div className="admin-ph-eyebrow">New entry</div>
          <h1 className="admin-ph-title">
            Add a new <em>app</em>
          </h1>
          <p className="admin-ph-sub">
            Pick a section first — the manifest template below changes to match
            what install handlers expect (see SPEC.md §2).
          </p>
        </div>
      </div>
      <AppForm />
    </AdminShell>
  );
}
