/**
 * M4.8 — Lightweight weekly snapshots of platform avg readiness (from executive API) for a sparse trend line.
 * Persists in localStorage; builds history as leadership opens the executive view over time.
 */
const KEY = "DilMart-executive-readiness-history-v1";
const MAX_WEEKS = 12;

export type ReadinessHistoryPoint = { weekKey: string; avgScore: number; capturedAt: string };

/** Monday date (local) as stable week bucket key */
function weekBucketKey(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

function readAll(): ReadinessHistoryPoint[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function writeAll(points: ReadinessHistoryPoint[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(points.slice(-MAX_WEEKS)));
  } catch {
    // no-op
  }
}

/** Upsert current ISO week with latest avg readiness from server. */
export function recordExecutiveReadinessSnapshot(avgScore: number) {
  const weekKey = weekBucketKey(new Date());
  const capturedAt = new Date().toISOString();
  const current = readAll().filter((p) => p.weekKey !== weekKey);
  const next: ReadinessHistoryPoint[] = [...current, { weekKey, avgScore, capturedAt }].sort((a, b) =>
    a.weekKey.localeCompare(b.weekKey),
  );
  writeAll(next.slice(-MAX_WEEKS));
}

export function getExecutiveReadinessHistory(): ReadinessHistoryPoint[] {
  return readAll().sort((a, b) => a.weekKey.localeCompare(b.weekKey));
}
