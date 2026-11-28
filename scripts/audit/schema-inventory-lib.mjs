import { createHash } from "node:crypto";

export const FORMAT_VERSION = "g0-a2-02-v2";
export const REVIEW_FORMAT = "g0-a2-02-review-v2";
export const EMPTY_IDENTITY = "__CATEGORY_EMPTY__";

export const MANDATORY_CATEGORIES = [
  "schemas",
  "schema_grants",
  "relations",
  "columns",
  "primary_keys",
  "foreign_keys",
  "unique_constraints",
  "check_constraints",
  "exclusion_constraints",
  "other_constraints",
  "indexes",
  "policies",
  "relation_grants",
  "column_grants",
  "default_privileges",
  "routines",
  "routine_grants",
  "triggers",
  "views",
  "sequences",
  "enumerations",
  "domains",
  "types",
  "type_grants",
  "partitions",
  "extensions",
  "extension_members",
  "role_attributes",
  "role_memberships",
  "migrations",
  "publications",
  "publication_schemas",
  "publication_tables",
  "event_triggers",
  "extraction_context",
];

const SEALED_HEADER = ["format_version", "schema_name", "category", "object_identity", "definition_sha256"];
const RAW_HEADER = ["format_version", "schema_name", "category", "object_identity", "canonical_definition"];

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function emptyCanonical(category) {
  return `${FORMAT_VERSION}|${category}|${EMPTY_IDENTITY}`;
}

export function canonicalField(value) {
  if (value === null || value === undefined) return "\\N";
  return String(value).replaceAll("\\", "\\\\").replaceAll("\u001f", "\\u").replaceAll("\u001e", "\\x");
}

export function canonicalJoin(parts) {
  return parts.map((part) => canonicalField(part)).join("\u001f");
}

export function canonicalList(values) {
  if (values === null || values === undefined) return "\\N";
  return [...values].map((value) => canonicalField(value)).sort(compareText).join("\u001e");
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function parseCsv(text) {
  if (typeof text !== "string" || text.length === 0) throw new Error("Inventory CSV is empty.");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          const next = source[index + 1];
          if (next !== undefined && next !== "," && next !== "\n" && next !== "\r") {
            throw new Error("Inventory CSV has trailing characters after a quoted field.");
          }
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      if (field.length > 0) throw new Error("Inventory CSV has a quote inside an unquoted field.");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("Inventory CSV has an unterminated quote.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  if (rows.length === 0) throw new Error("Inventory CSV is empty.");
  return rows;
}

function objectsFromRows(table, header) {
  if (table.length === 0 || table[0].length !== header.length || header.some((name, index) => table[0][index] !== name)) {
    throw new Error(`Inventory header must be ${header.join(",")}.`);
  }
  return table.slice(1).map((columns) => {
    if (columns.length !== header.length) throw new Error("Inventory row has the wrong number of columns.");
    return Object.fromEntries(header.map((name, index) => [name, columns[index]]));
  });
}

export function parseRawInventory(text) {
  return objectsFromRows(parseCsv(text), RAW_HEADER);
}

export function parseSealedInventory(text) {
  return objectsFromRows(parseCsv(text), SEALED_HEADER);
}

function csvField(value) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function sealRecords(records) {
  return records.map((record) => {
    if (record.format_version !== FORMAT_VERSION) {
      throw new Error(`Unsupported inventory format ${record.format_version}.`);
    }
    return {
      format_version: record.format_version,
      schema_name: record.schema_name,
      category: record.category,
      object_identity: record.object_identity,
      definition_sha256: sha256(record.canonical_definition),
    };
  });
}

export function serializeSealed(records) {
  const lines = [SEALED_HEADER.join(",")];
  const sorted = [...records].sort(compareIdentity);
  for (const record of sorted) {
    lines.push([
      record.format_version,
      record.schema_name,
      record.category,
      record.object_identity,
      record.definition_sha256,
    ].map(csvField).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function compareIdentity(left, right) {
  return compareText(left.category, right.category)
    || compareText(left.schema_name, right.schema_name)
    || compareText(left.object_identity, right.object_identity);
}

function keyOf(record) {
  return `${record.schema_name}\u0000${record.category}\u0000${record.object_identity}`;
}

function expand(records, label) {
  const errors = [];
  const byCategory = new Map();
  const seen = new Map();
  for (const record of records) {
    if (record.format_version !== FORMAT_VERSION) {
      errors.push(`${label} uses unsupported format ${record.format_version}.`);
      continue;
    }
    if (!/^[0-9a-f]{64}$/.test(record.definition_sha256)) {
      errors.push(`${label} has an invalid fingerprint for ${record.category} ${record.object_identity}.`);
    }
    const identity = keyOf(record);
    if (seen.has(identity)) errors.push(`${label} has a duplicate object identity ${record.schema_name}.${record.category}.${record.object_identity}.`);
    seen.set(identity, record);
    const rows = byCategory.get(record.category) ?? [];
    rows.push(record);
    byCategory.set(record.category, rows);
  }
  for (const category of MANDATORY_CATEGORIES) {
    if (!byCategory.has(category)) errors.push(`${label} is missing mandatory category ${category}.`);
  }
  const objects = new Map();
  for (const [category, rows] of byCategory) {
    const empties = rows.filter((row) => row.object_identity === EMPTY_IDENTITY);
    const concrete = rows.filter((row) => row.object_identity !== EMPTY_IDENTITY);
    if (empties.length > 0 && concrete.length > 0) {
      errors.push(`${label} category ${category} mixes ${EMPTY_IDENTITY} with real objects.`);
    }
    if (empties.length > 1) errors.push(`${label} category ${category} has more than one empty marker.`);
    if (empties.length === 1 && empties[0].definition_sha256 !== sha256(emptyCanonical(category))) {
      errors.push(`${label} category ${category} has an invalid empty-category fingerprint.`);
    }
    if (empties.length === 1 && empties[0].schema_name !== "") {
      errors.push(`${label} category ${category} empty marker must have a blank schema.`);
    }
    for (const row of concrete) objects.set(keyOf(row), row);
  }
  return { errors, objects };
}

export function compareInventories(baselineRecords, candidateRecords) {
  const baseline = expand(baselineRecords, "baseline");
  const candidate = expand(candidateRecords, "candidate");
  const errors = [...baseline.errors, ...candidate.errors];
  if (baseline.objects.size === 0 && candidate.objects.size === 0) {
    errors.push("Both inventories have no concrete objects.");
  }
  const baselineMajor = postgresMajor(baseline.objects);
  const candidateMajor = postgresMajor(candidate.objects);
  if (baselineMajor !== null && candidateMajor !== null && baselineMajor !== candidateMajor) {
    errors.push(`Incompatible PostgreSQL major versions ${baselineMajor} and ${candidateMajor}.`);
  }
  if (errors.length > 0) {
    return { ok: false, status: "INVALID", exitCode: 3, errors, counts: emptyCounts(), differences: [] };
  }
  const differences = [];
  let identical = 0;
  for (const [identity, row] of baseline.objects) {
    const other = candidate.objects.get(identity);
    if (!other) {
      differences.push(difference("MISSING", row, null));
    } else if (other.definition_sha256 !== row.definition_sha256) {
      differences.push(difference("MODIFIED", row, other));
    } else {
      identical += 1;
    }
  }
  for (const [identity, row] of candidate.objects) {
    if (!baseline.objects.has(identity)) differences.push(difference("EXTRA", null, row));
  }
  differences.sort((left, right) => compareText(left.category, right.category)
    || compareText(left.schema_name, right.schema_name)
    || compareText(left.object_identity, right.object_identity)
    || compareText(left.classification, right.classification));
  const counts = {
    identical,
    missing: differences.filter((item) => item.classification === "MISSING").length,
    extra: differences.filter((item) => item.classification === "EXTRA").length,
    modified: differences.filter((item) => item.classification === "MODIFIED").length,
  };
  const ok = differences.length === 0;
  return {
    ok,
    status: ok ? "IDENTICAL" : "DIFFERENT",
    exitCode: ok ? 0 : 2,
    errors: [],
    counts,
    differences,
  };
}

function emptyCounts() {
  return { identical: 0, missing: 0, extra: 0, modified: 0 };
}

function difference(classification, baseline, candidate) {
  const source = baseline ?? candidate;
  return {
    classification,
    schema_name: source.schema_name,
    category: source.category,
    object_identity: source.object_identity,
    baseline_sha256: baseline?.definition_sha256 ?? "",
    candidate_sha256: candidate?.definition_sha256 ?? "",
  };
}

function postgresMajor(objects) {
  for (const row of objects.values()) {
    if (row.category !== "extraction_context" || !row.object_identity.startsWith("server_version_num=")) continue;
    const version = Number(row.object_identity.slice("server_version_num=".length));
    if (!Number.isInteger(version)) return null;
    return Math.floor(version / 10000);
  }
  return null;
}

export function applyReview(result, review, inventoryHashes) {
  if (result.status === "INVALID") return result;
  if (!review) return { ...result, unexplained: result.differences, reviewed: [] };
  if (review.format_version !== REVIEW_FORMAT || !Array.isArray(review.items)) {
    return { ...result, ok: false, status: "INVALID", exitCode: 3, errors: ["Review file format is unsupported."] };
  }
  if (!inventoryHashes
    || review.baseline_inventory_sha256 !== inventoryHashes.baseline
    || review.candidate_inventory_sha256 !== inventoryHashes.candidate) {
    return { ...result, ok: false, status: "INVALID", exitCode: 3, errors: ["Review file is not bound to these inventory hashes."] };
  }
  const unexplained = [];
  const reviewed = [];
  const used = new Set();
  for (const item of result.differences) {
    const match = review.items.findIndex((entry, index) => !used.has(index)
      && entry.classification === item.classification
      && entry.schema_name === item.schema_name
      && entry.category === item.category
      && entry.object_identity === item.object_identity
      && entry.baseline_sha256 === item.baseline_sha256
      && entry.candidate_sha256 === item.candidate_sha256
      && entry.reason);
    if (match === -1) unexplained.push(item);
    else {
      used.add(match);
      reviewed.push({ ...item, reason: review.items[match].reason });
    }
  }
  const errors = [];
  review.items.forEach((entry, index) => {
    if (!used.has(index)) errors.push(`Review item ${index + 1} does not match a raw difference.`);
  });
  if (errors.length > 0) {
    return {
      ...result,
      ok: false,
      status: "INVALID",
      exitCode: 3,
      errors,
      unexplained,
      reviewed,
    };
  }
  return { ...result, ok: false, status: result.differences.length === 0 ? "IDENTICAL" : "DIFFERENT", exitCode: result.differences.length === 0 ? 0 : 2, unexplained, reviewed };
}
