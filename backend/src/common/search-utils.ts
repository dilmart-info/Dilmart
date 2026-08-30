/**
 * PostgREST filter escaping utility.
 *
 * This addresses a **PostgREST filter injection / query manipulation risk**
 * (NOT classic SQL injection). When user input is interpolated into Supabase
 * `.or()` / `.ilike()` filter strings, special characters can alter the
 * query semantics — e.g. `,` adds extra filter clauses, `.` changes the
 * column target, `(` / `)` break grouping.
 *
 * @see https://postgrest.org/en/stable/references/api/tables_views.html#operators
 */

/**
 * Escape characters that have special meaning in PostgREST filter values.
 * This makes the string safe to embed inside `.or()` / `.ilike()` expressions.
 */
export function escapePostgrestSearch(raw: string): string {
  // Characters with semantic meaning in PostgREST filter syntax:
  //   %  → wildcard in LIKE/ILIKE
  //   _  → single-char wildcard in LIKE/ILIKE
  //   ,  → separates filter clauses in .or()
  //   .  → column.operator separator
  //   (  → opens grouped expression
  //   )  → closes grouped expression
  //   :  → operator separator in some contexts
  //   *  → full-text search prefix
  //
  // We backslash-escape %, _ for LIKE, and remove/replace the structural
  // chars that could alter filter semantics.
  return raw
    .replace(/\\/g, "\\\\")  // escape existing backslashes first
    .replace(/%/g, "\\%")    // LIKE wildcard
    .replace(/_/g, "\\_")    // LIKE single-char wildcard
    .replace(/,/g, "")       // filter clause separator — remove
    .replace(/\./g, "")      // column separator — remove
    .replace(/\(/g, "")      // grouping — remove
    .replace(/\)/g, "")      // grouping — remove
    .replace(/:/g, "")       // operator separator — remove
    .replace(/\*/g, "");     // full-text prefix — remove
}

/**
 * Sanitize and validate a search term before use in PostgREST queries.
 *
 * @param raw    - Raw user input
 * @param maxLen - Maximum allowed length (default 80)
 * @returns Trimmed, length-limited, escaped search string
 */
export function sanitizeSearchTerm(raw: string | null | undefined, maxLen = 80): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  const limited = trimmed.slice(0, maxLen);
  return escapePostgrestSearch(limited);
}

/**
 * Build a safe Supabase `.or()` filter string for multi-column ilike search.
 *
 * @example
 *   const filter = buildSafeOrFilter("أحمد", ["full_name", "email", "phone"]);
 *   // → "full_name.ilike.%أحمد%,email.ilike.%أحمد%,phone.ilike.%أحمد%"
 *   req = req.or(filter);
 */
export function buildSafeOrFilter(escapedSearch: string, columns: string[]): string {
  return columns.map((col) => `${col}.ilike.%${escapedSearch}%`).join(",");
}
