/**
 * src/renderer/screens/Routing.tsx
 *
 * AUTH-04 tier-detection wait state (D-09 silent routing) + D-12 retry-only
 * failure screen. Renders between "session validated" and "landed on the
 * correct screen" -- this state must NEVER disclose which tier/plan the
 * account has, a partial routing result, or any premature continuation
 * copy, ever.
 *
 * On a network/5xx failure this screen only ever offers Retry -- it never
 * guesses a branch (T-02-06). Only an explicit 401 (a different path,
 * handled by session-manager) clears the vault session.
 */

interface RoutingProps {
  error: boolean;
  onRetry: () => void;
}

export default function Routing({ error, onRetry }: RoutingProps) {
  if (error) {
    return (
      <section className="card">
        <h1 className="heading">Couldn't check your account</h1>
        <p className="note-line" style={{ marginTop: 8 }}>
          We couldn't reach Livinity to check your plan. Check your connection and try again.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onRetry}
          style={{ marginTop: 16 }}
        >
          Retry
        </button>
      </section>
    );
  }

  // Blank, branded wait only -- no tier/plan disclosure, no partial result,
  // no premature continuation copy of any kind (D-09).
  return (
    <section className="card" aria-busy="true">
      <div className="card-row" style={{ justifyContent: 'flex-start', gap: 10 }}>
        <span className="status-dot status-dot-pulse" aria-hidden="true" />
        <span className="note-line">Checking your account…</span>
      </div>
    </section>
  );
}
