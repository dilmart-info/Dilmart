/**
 * In-memory / file journal for bulk batches (resume-safe).
 * No production side effects.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { writeJson } from "./csv.mjs";

export const JOURNAL_STATUSES = Object.freeze([
  "pending",
  "image_uploaded",
  "image_verified",
  "api_create_attempted",
  "product_created",
  "product_verified",
  "completed",
  "failed",
  "indeterminate",
  "conflict",
]);

export function createBatchJournal({
  batchId,
  merchantId,
  manifestSha,
  sourceSha = null,
  executionHeadSha = null,
  rows,
}) {
  return {
    journal_id: crypto.randomUUID(),
    batch_id: batchId,
    merchant_id: merchantId,
    manifest_sha256: manifestSha,
    source_sha256: sourceSha,
    execution_head_sha: executionHeadSha,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    entries: rows.map((r) => {
      const isPending = r.image_readiness_status === "IMAGE_PENDING" || !(r.normalized_image_path || r.storage_path);
      return {
        merchant_sku: r.merchant_sku,
        image_readiness_status: isPending ? "IMAGE_PENDING" : "IMAGE_VERIFIED",
        status: "pending",
        storage_path: isPending ? null : (r.normalized_image_path || r.storage_path || null),
        expected_image_sha256: isPending ? null : (r.image_sha256 || null),
        expected_payload_sha256: r.payload_sha256 || null,
        storage_status: isPending ? "NOT_REQUIRED" : "pending",
        product_id: null,
        history: [{ status: "pending", at: new Date().toISOString() }],
      };
    }),
    write_accounting: {
      storage_upload_attempted: 0,
      storage_upload_succeeded: 0,
      storage_verified: 0,
      api_create_attempted: 0,
      product_create_succeeded: 0,
      product_verified: 0,
      failed: 0,
      indeterminate: 0,
      conflict: 0,
    },
  };
}

export function journalPath(tmpDir, batchId) {
  return path.join(tmpDir, batchId, "execution-journal.json");
}

export function loadJournal(tmpDir, batchId) {
  const p = journalPath(tmpDir, batchId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function saveJournal(tmpDir, journal) {
  const p = journalPath(tmpDir, journal.batch_id);
  journal.updated_at = new Date().toISOString();
  const temp = `${p}.tmp`;
  writeJson(temp, journal);
  fs.renameSync(temp, p);
  return p;
}

/**
 * Resume must not duplicate completed rows.
 */
export function pendingJournalEntries(journal) {
  return (journal?.entries || []).filter((e) => e.status !== "completed");
}

export function transitionJournalEntry(entry, status, details = {}) {
  if (!JOURNAL_STATUSES.includes(status)) throw new Error(`UNKNOWN_JOURNAL_STATUS:${status}`);
  entry.status = status;
  Object.assign(entry, details);
  entry.history = Array.isArray(entry.history) ? entry.history : [];
  entry.history.push({ status, at: new Date().toISOString(), ...details });
  return entry;
}

export function assertJournalBinding(
  journal,
  { batchId, merchantId, manifestSha, sourceSha = null, executionHeadSha },
) {
  const errors = [];
  if (!journal) return { ok: false, errors: ["JOURNAL_MISSING"] };
  if (journal.batch_id !== batchId) errors.push("JOURNAL_BATCH_MISMATCH");
  if (journal.merchant_id !== merchantId) errors.push("JOURNAL_MERCHANT_MISMATCH");
  if (journal.manifest_sha256 !== manifestSha) errors.push("JOURNAL_MANIFEST_SHA_MISMATCH");
  if (sourceSha && journal.source_sha256 !== sourceSha) errors.push("JOURNAL_SOURCE_SHA_MISMATCH");
  if (
    !journal.execution_head_sha ||
    !/^[0-9a-f]{40}$/i.test(journal.execution_head_sha) ||
    (executionHeadSha && journal.execution_head_sha !== executionHeadSha)
  ) {
    errors.push("JOURNAL_HEAD_MISMATCH");
  }
  return { ok: errors.length === 0, errors };
}
