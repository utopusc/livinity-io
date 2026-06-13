// Pure formatting helpers shared across the admin dashboard / billing /
// analytics pages. NO React here — keep this importable from server and
// client modules alike.

/** Bytes → human-readable (B / KB / MB / GB / TB). */
export function formatBytes(n: number): string {
  const bytes = Number(n) || 0;
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Integer/float → grouped en-US string (e.g. 1,234). */
export function formatNumber(n: number): string {
  return (Number(n) || 0).toLocaleString('en-US');
}

/** USD amount → currency string (e.g. $1,234.50 or $0.00). */
export function formatUsd(n: number): string {
  return (Number(n) || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** ISO timestamp → compact relative age (e.g. "just now", "3m", "2h", "4d ago"). */
export function timeAgo(iso: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 0) return 'soon';
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(day / 365);
  return `${yr}y ago`;
}

/** ISO timestamp → short date (e.g. "Jun 13, 2026"); em dash for null/invalid. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
