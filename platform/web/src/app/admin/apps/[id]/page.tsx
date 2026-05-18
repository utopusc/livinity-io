'use client';

import { useEffect, useState, use } from 'react';
import { AdminShell } from '../../admin-shell';
import { AppForm } from '../../components/app-form';
import { getApp, type AdminApp } from '../../lib/admin-api';

export default function EditAppPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [app, setApp] = useState<AdminApp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getApp(id)
      .then(setApp)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  return (
    <AdminShell>
      <div className="admin-ph">
        <div>
          <div className="admin-ph-eyebrow">Editing · {id}</div>
          <h1 className="admin-ph-title">
            {app ? (
              <>
                Edit <em>{app.name}</em>
              </>
            ) : (
              <>Loading…</>
            )}
          </h1>
          {app && (
            <p className="admin-ph-sub">
              Slug locked. Change anything else; saves go straight to Supabase.
            </p>
          )}
        </div>
      </div>
      {error && (
        <div
          className="form"
          style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: 13 }}
        >
          {error}
        </div>
      )}
      {app && <AppForm initial={app} />}
    </AdminShell>
  );
}
