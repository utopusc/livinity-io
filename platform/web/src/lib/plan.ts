/**
 * WS3 — plan limits.
 *
 * Locked decision D3:
 *   - Pro paid tier  = 1 TB / month
 *   - legacy/free    = 50 GB / month
 *
 * Soft cap only this round (meter + display; no hard block). Bytes are exact
 * binary (TiB/GiB) so the dashboard percentage math is stable.
 */

// 1 TiB = 1024^4 bytes
export const PRO_BANDWIDTH_BYTES = 1099511627776;
// 50 GiB = 50 * 1024^3 bytes
export const LEGACY_BANDWIDTH_BYTES = 53687091200;

/**
 * Monthly bandwidth allowance in bytes for a user.
 * @param legacyFree true for grandfathered/free accounts (50 GB), false for the
 *   paid Pro tier (1 TB).
 */
export function bandwidthLimitFor(legacyFree: boolean): number {
  return legacyFree ? LEGACY_BANDWIDTH_BYTES : PRO_BANDWIDTH_BYTES;
}
