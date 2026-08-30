/**
 * Pure helpers shared by the phone audit scripts.
 *
 * Kept apart from the scripts themselves so tests can import them without a Supabase
 * client, an environment, or a network stack existing.
 */

/** Local Iraqi form. Used to compare and to mask — a full number is never printed. */
export function normalize(phone) {
  if (typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (/^9647\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^07\d{9}$/.test(digits)) return digits;
  if (/^7\d{9}$/.test(digits)) return `0${digits}`;
  return null;
}

/** 07XX****XXX — enough to tell two clusters apart, not enough to dial. */
export function mask(normalized) {
  if (typeof normalized !== "string" || normalized.length < 8) return "***";
  return `${normalized.slice(0, 4)}****${normalized.slice(-3)}`;
}

/**
 * Groups user ids by normalized phone, keeping only numbers held by more than one user.
 * Each cluster is a potential account collision the moment phone becomes a login identity.
 */
export function buildClusters(entries) {
  const byPhone = new Map();
  for (const { userId, phone } of entries) {
    const normalized = normalize(phone);
    if (!normalized) continue;
    if (!byPhone.has(normalized)) byPhone.set(normalized, new Set());
    byPhone.get(normalized).add(userId);
  }

  const clusters = [];
  for (const [phone, users] of byPhone) {
    if (users.size > 1) clusters.push({ phone, userIds: [...users] });
  }
  return clusters;
}

/**
 * Splits auth users into those sitting on an unfinished phone change and, of those, the
 * ones abandoned long enough to be considered stale.
 */
export function collectPendingPhoneChanges(authUsers, { staleCutoffMs }) {
  const pending = [];
  for (const user of authUsers ?? []) {
    const target = typeof user.phone_change === "string" ? user.phone_change.trim() : "";
    if (!target) continue;
    const sentAt = user.phone_change_sent_at ? Date.parse(user.phone_change_sent_at) : NaN;
    pending.push({
      userId: user.id,
      phone: target,
      stale: !Number.isFinite(sentAt) || sentAt < staleCutoffMs,
    });
  }
  return pending;
}
