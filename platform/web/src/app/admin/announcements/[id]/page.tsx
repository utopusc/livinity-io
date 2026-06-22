'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { AdminShell } from '../../admin-shell';
import { AnnouncementForm } from '../../components/announcement-form';
import { type Announcement, getAnnouncement } from '../../lib/announcements-api';

export default function EditAnnouncementPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [initial, setInitial] = useState<Announcement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getAnnouncement(id)
      .then(setInitial)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  return (
    <AdminShell>
      <div className="admin-ph">
        <div>
          <div className="admin-ph-eyebrow">Edit</div>
          <h1 className="admin-ph-title">
            Edit <em>announcement</em>
          </h1>
          <p className="admin-ph-sub">Update content, targeting, schedule, and status.</p>
        </div>
      </div>
      {error && (
        <div className="form" style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {!error && !initial && <p style={{ color: 'var(--fg-mute)', fontSize: 14 }}>Loading…</p>}
      {initial && <AnnouncementForm initial={initial} />}
    </AdminShell>
  );
}
