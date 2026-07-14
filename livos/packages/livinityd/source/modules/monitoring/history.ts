// Phase 320 (MON-01) — resource-history PG-CRUD. Mirrors smart-alerts.ts:
// getPool() per call, parameterized, fail-open, no module-load connection.
//
// This is the data layer every other MON-01 plan reads:
//   - Plan 02 scheduler collector writes via insertResourceSample()
//   - Plan 02 rollup/retention job calls aggregateRollups() + pruneOldRows()
//   - Plan 04 tRPC query calls getResourceHistory(range)
//
// Bounded footprint (~3MB forever) is enforced by the retention windows this
// module's pruneOldRows() applies (raw>48h / 5m>30d / 1h>365d, D-320-5).
//
// Fail-open contract (copied verbatim from smart-alerts.ts): every function
// calls getPool() fresh; if the pool is null (PG transiently unavailable) it
// returns a safe empty/null value and issues NO query — a scheduler tick or a
// tRPC query must survive PG being briefly down, never throw. Sample values are
// parameterized ($1..$7); table/column/interval come from a CLOSED internal map
// keyed by the 4-value range enum, never string-interpolated from caller input.

import {getPool} from '../database/index.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// D-320-2: 4 fixed presets only — no one-year tier, no custom range.
export type HistoryRange = '1h' | '24h' | '7d' | '30d'

export interface ResourceSampleInput {
	cpuPct: number
	memUsedBytes: number
	memTotalBytes: number
	diskReadBps: number | null
	diskWriteBps: number | null
	netRxBps: number
	netTxBps: number
}

export interface ResourceHistoryPoint {
	time: string // ISO timestamp (ts or bucket_start)
	cpuPct: number | null
	memUsedBytes: number | null
	memTotalBytes: number | null // present on raw tier; null on rollup tiers
	diskReadBps: number | null
	diskWriteBps: number | null
	netRxBps: number | null
	netTxBps: number | null
}

// ---------------------------------------------------------------------------
// Range -> table mapping (CLOSED internal map — never from caller input).
// '1h'/'24h' -> raw samples; '7d' -> 5m rollups; '30d' -> 1h rollups.
// ---------------------------------------------------------------------------

interface RangeSpec {
	table: 'resource_samples_raw' | 'resource_rollups_5m' | 'resource_rollups_1h'
	tsCol: 'ts' | 'bucket_start'
	interval: string
	isRaw: boolean
}

const RANGE_MAP: Record<HistoryRange, RangeSpec> = {
	'1h': {table: 'resource_samples_raw', tsCol: 'ts', interval: '1 hour', isRaw: true},
	'24h': {table: 'resource_samples_raw', tsCol: 'ts', interval: '24 hours', isRaw: true},
	'7d': {table: 'resource_rollups_5m', tsCol: 'bucket_start', interval: '7 days', isRaw: false},
	'30d': {table: 'resource_rollups_1h', tsCol: 'bucket_start', interval: '30 days', isRaw: false},
}

// ---------------------------------------------------------------------------
// Row -> domain mapper (private). pg returns BIGINT as string, REAL as number.
// ---------------------------------------------------------------------------

interface HistoryRow {
	time: Date | string
	cpu_pct: number | string | null
	mem_used_bytes: number | string | null
	mem_total_bytes: number | string | null
	disk_read_bps: number | string | null
	disk_write_bps: number | string | null
	net_rx_bps: number | string | null
	net_tx_bps: number | string | null
}

function toNum(v: number | string | null | undefined): number | null {
	if (v == null) return null
	const n = typeof v === 'number' ? v : Number(v)
	return Number.isFinite(n) ? n : null
}

function rowToPoint(row: HistoryRow): ResourceHistoryPoint {
	return {
		time: row.time instanceof Date ? row.time.toISOString() : String(row.time),
		cpuPct: toNum(row.cpu_pct),
		memUsedBytes: toNum(row.mem_used_bytes),
		memTotalBytes: toNum(row.mem_total_bytes),
		diskReadBps: toNum(row.disk_read_bps),
		diskWriteBps: toNum(row.disk_write_bps),
		netRxBps: toNum(row.net_rx_bps),
		netTxBps: toNum(row.net_tx_bps),
	}
}

// ---------------------------------------------------------------------------
// Write: one wide row per collection tick (fire-and-forget, no RETURNING).
// ---------------------------------------------------------------------------

/**
 * Insert one raw sample row (ts = NOW(), 7 metric columns as $1..$7). Returns
 * null when no pool (never throws — a scheduler tick must survive PG being
 * briefly down). ON CONFLICT (ts) DO NOTHING makes a same-second re-tick a
 * no-op rather than a crash.
 */
export async function insertResourceSample(s: ResourceSampleInput): Promise<null> {
	const pool = getPool()
	if (!pool) return null

	await pool.query(
		`INSERT INTO resource_samples_raw
		   (ts, cpu_pct, mem_used_bytes, mem_total_bytes, disk_read_bps, disk_write_bps, net_rx_bps, net_tx_bps)
		 VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (ts) DO NOTHING`,
		[s.cpuPct, s.memUsedBytes, s.memTotalBytes, s.diskReadBps, s.diskWriteBps, s.netRxBps, s.netTxBps],
	)
	return null
}

// ---------------------------------------------------------------------------
// Read: pick the raw/5m/1h table by range, return chart-ready rows (time ASC).
// ---------------------------------------------------------------------------

/**
 * Return chart-ready history points for the requested range. Range selects the
 * table/column/interval from the CLOSED RANGE_MAP (never caller input — no SQL
 * injection surface). Rollup tiers alias *_avg columns to the raw shape and
 * return NULL for mem_total_bytes (raw-tier-only). Returns [] when no pool.
 */
export async function getResourceHistory(range: HistoryRange): Promise<ResourceHistoryPoint[]> {
	const pool = getPool()
	if (!pool) return []

	const spec = RANGE_MAP[range]
	const sql = spec.isRaw
		? `SELECT ts AS time, cpu_pct, mem_used_bytes, mem_total_bytes,
		          disk_read_bps, disk_write_bps, net_rx_bps, net_tx_bps
		   FROM resource_samples_raw
		   WHERE ts >= NOW() - INTERVAL '${spec.interval}'
		   ORDER BY ts ASC`
		: `SELECT bucket_start AS time, cpu_pct_avg AS cpu_pct,
		          mem_used_bytes_avg AS mem_used_bytes, NULL AS mem_total_bytes,
		          disk_read_bps_avg AS disk_read_bps, disk_write_bps_avg AS disk_write_bps,
		          net_rx_bps_avg AS net_rx_bps, net_tx_bps_avg AS net_tx_bps
		   FROM ${spec.table}
		   WHERE bucket_start >= NOW() - INTERVAL '${spec.interval}'
		   ORDER BY bucket_start ASC`

	const {rows} = await pool.query<HistoryRow>(sql)
	return rows.map(rowToPoint)
}

// ---------------------------------------------------------------------------
// Rollup aggregation: raw -> 5m, then 5m -> 1h. Idempotent (ON CONFLICT DO
// UPDATE) so a re-run overwrites the same bucket rather than duplicating it.
// ---------------------------------------------------------------------------

/**
 * Re-aggregate recent raw samples into 5-minute buckets, then recent 5-minute
 * buckets into hourly buckets. Both statements are idempotent via ON CONFLICT
 * (bucket_start) DO UPDATE — safe to re-run on every hourly tick. Returns
 * without throwing when no pool.
 *
 * IN-320-03 — accepted catch-up-window trade-off (documented, no behavior
 * change for v1): the two lookback windows below (raw->5m = last 2h, 5m->1h =
 * last 3h) are fixed and non-backfilling. The job runs hourly, so 2-3x is a
 * safe buffer against a missed tick or two. But if the scheduler or Postgres is
 * DOWN longer than the raw window, raw samples older than 2h at the time the
 * job resumes are never rolled up — and because pruneOldRows() deletes raw rows
 * past 48h regardless, that gap in the 7d/30d chart tiers becomes permanent
 * (the chart shows nothing for that period; connectNulls bridges it visually).
 * This is a reasonable v1 trade-off for a ~3MB-capped module. If a longer
 * outage window ever needs to be recoverable, widen the raw->5m lookback toward
 * the 48h raw-retention ceiling (one extra bounded full-table scan per tick) so
 * any outage shorter than the raw retention is fully recoverable on the next
 * successful tick. Also surfaced in 320-HUMAN-UAT.md so operators know a
 * multi-hour outage can leave a permanent gap in the persisted history.
 */
export async function aggregateRollups(): Promise<void> {
	const pool = getPool()
	if (!pool) return

	// raw -> 5m (5-minute buckets via epoch-floor). Catch-up window = last 2h
	// (fixed, non-backfilling — see IN-320-03 trade-off in the JSDoc above).
	await pool.query(
		`INSERT INTO resource_rollups_5m
		   (bucket_start, sample_count, cpu_pct_avg, cpu_pct_min, cpu_pct_max,
		    mem_used_bytes_avg, mem_used_bytes_max, disk_read_bps_avg, disk_read_bps_max,
		    disk_write_bps_avg, disk_write_bps_max, net_rx_bps_avg, net_rx_bps_max,
		    net_tx_bps_avg, net_tx_bps_max)
		 SELECT to_timestamp(floor(extract(epoch from ts) / 300) * 300),
		   count(*), avg(cpu_pct), min(cpu_pct), max(cpu_pct),
		   avg(mem_used_bytes)::bigint, max(mem_used_bytes),
		   avg(disk_read_bps)::bigint, max(disk_read_bps),
		   avg(disk_write_bps)::bigint, max(disk_write_bps),
		   avg(net_rx_bps)::bigint, max(net_rx_bps),
		   avg(net_tx_bps)::bigint, max(net_tx_bps)
		 FROM resource_samples_raw
		 WHERE ts >= NOW() - INTERVAL '2 hours'
		 GROUP BY 1
		 ON CONFLICT (bucket_start) DO UPDATE SET
		   sample_count = EXCLUDED.sample_count,
		   cpu_pct_avg = EXCLUDED.cpu_pct_avg, cpu_pct_min = EXCLUDED.cpu_pct_min, cpu_pct_max = EXCLUDED.cpu_pct_max,
		   mem_used_bytes_avg = EXCLUDED.mem_used_bytes_avg, mem_used_bytes_max = EXCLUDED.mem_used_bytes_max,
		   disk_read_bps_avg = EXCLUDED.disk_read_bps_avg, disk_read_bps_max = EXCLUDED.disk_read_bps_max,
		   disk_write_bps_avg = EXCLUDED.disk_write_bps_avg, disk_write_bps_max = EXCLUDED.disk_write_bps_max,
		   net_rx_bps_avg = EXCLUDED.net_rx_bps_avg, net_rx_bps_max = EXCLUDED.net_rx_bps_max,
		   net_tx_bps_avg = EXCLUDED.net_tx_bps_avg, net_tx_bps_max = EXCLUDED.net_tx_bps_max`,
	)

	// 5m -> 1h (weighted avg via sample_count; hour bucket via epoch-floor).
	// Catch-up window = last 3h (fixed, non-backfilling — see IN-320-03).
	// WR-320-01: use the SAME timezone-agnostic epoch-floor as the raw->5m tier
	// above. extract(epoch from ts) is an absolute-instant (UTC) computation, so
	// the bucket edges are invariant regardless of the PG session's TimeZone GUC.
	// date_trunc('hour', timestamptz) would truncate in the *session* timezone —
	// under any DST-observing session zone the fall-back transition maps two
	// distinct absolute hours onto one local "hour" (one bucket silently
	// overwrites the other via ON CONFLICT DO UPDATE, losing an hour of history)
	// and spring-forward skips an hour. Epoch-floor keeps both rollup tiers
	// consistently UTC-bucketed without depending on connection-level tz config.
	await pool.query(
		`INSERT INTO resource_rollups_1h
		   (bucket_start, sample_count, cpu_pct_avg, cpu_pct_min, cpu_pct_max,
		    mem_used_bytes_avg, mem_used_bytes_max, disk_read_bps_avg, disk_read_bps_max,
		    disk_write_bps_avg, disk_write_bps_max, net_rx_bps_avg, net_rx_bps_max,
		    net_tx_bps_avg, net_tx_bps_max)
		 SELECT to_timestamp(floor(extract(epoch from bucket_start) / 3600) * 3600),
		   sum(sample_count),
		   (sum(cpu_pct_avg * sample_count) / NULLIF(sum(sample_count),0))::real, min(cpu_pct_min), max(cpu_pct_max),
		   (sum(mem_used_bytes_avg * sample_count) / NULLIF(sum(sample_count),0))::bigint, max(mem_used_bytes_max),
		   (sum(disk_read_bps_avg * sample_count) / NULLIF(sum(sample_count),0))::bigint, max(disk_read_bps_max),
		   (sum(disk_write_bps_avg * sample_count) / NULLIF(sum(sample_count),0))::bigint, max(disk_write_bps_max),
		   (sum(net_rx_bps_avg * sample_count) / NULLIF(sum(sample_count),0))::bigint, max(net_rx_bps_max),
		   (sum(net_tx_bps_avg * sample_count) / NULLIF(sum(sample_count),0))::bigint, max(net_tx_bps_max)
		 FROM resource_rollups_5m
		 WHERE bucket_start >= NOW() - INTERVAL '3 hours'
		 GROUP BY 1
		 ON CONFLICT (bucket_start) DO UPDATE SET
		   sample_count = EXCLUDED.sample_count,
		   cpu_pct_avg = EXCLUDED.cpu_pct_avg, cpu_pct_min = EXCLUDED.cpu_pct_min, cpu_pct_max = EXCLUDED.cpu_pct_max,
		   mem_used_bytes_avg = EXCLUDED.mem_used_bytes_avg, mem_used_bytes_max = EXCLUDED.mem_used_bytes_max,
		   disk_read_bps_avg = EXCLUDED.disk_read_bps_avg, disk_read_bps_max = EXCLUDED.disk_read_bps_max,
		   disk_write_bps_avg = EXCLUDED.disk_write_bps_avg, disk_write_bps_max = EXCLUDED.disk_write_bps_max,
		   net_rx_bps_avg = EXCLUDED.net_rx_bps_avg, net_rx_bps_max = EXCLUDED.net_rx_bps_max,
		   net_tx_bps_avg = EXCLUDED.net_tx_bps_avg, net_tx_bps_max = EXCLUDED.net_tx_bps_max`,
	)
}

// ---------------------------------------------------------------------------
// Retention: fixed-window pruning bounds total footprint (D-320-5). Intervals
// are fixed literals (no caller surface). Returns without throwing when no pool.
// ---------------------------------------------------------------------------

/**
 * Delete rows past each tier's retention window: raw>48h, 5m>30d, 1h>365d.
 * This is the "retention/downsampling job enforced from day one" — bounds the
 * shared livos Postgres footprint to ~3MB forever.
 */
export async function pruneOldRows(): Promise<void> {
	const pool = getPool()
	if (!pool) return

	await pool.query(`DELETE FROM resource_samples_raw WHERE ts < NOW() - INTERVAL '48 hours'`)
	await pool.query(`DELETE FROM resource_rollups_5m  WHERE bucket_start < NOW() - INTERVAL '30 days'`)
	await pool.query(`DELETE FROM resource_rollups_1h  WHERE bucket_start < NOW() - INTERVAL '365 days'`)
}
