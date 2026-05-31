// Pure trend computation — no platform imports. Ported verbatim from the
// desktop app (src/lib/core/trend.ts).

export type TrendDirection = "up" | "down" | "stable";

/**
 * Compute the trend direction from a status history array.
 * Expects newest-first ordering (as returned by the DB query).
 *
 * "up"   = latest is better than the previous (e.g. needs_attention → meeting)
 * "down" = latest is worse (e.g. meeting → needs_attention)
 * "stable" = same status, or not enough data
 */
export function computeTrend(history: ReadonlyArray<{ status: string | null }>): TrendDirection {
  const first = history[0];
  const second = history[1];
  if (!first || !second) return "stable";

  const current = first.status;
  const previous = second.status;

  if (current === previous) return "stable";

  const rank = statusRank(current);
  const prevRank = statusRank(previous);

  if (rank > prevRank) return "up";
  if (rank < prevRank) return "down";
  return "stable";
}

/** Higher = better. meeting > not_assessed > needs_attention */
function statusRank(status: string | null): number {
  switch (status) {
    case "meeting":
      return 2;
    case "not_assessed":
      return 1;
    case "needs_attention":
      return 0;
    default:
      return -1;
  }
}
