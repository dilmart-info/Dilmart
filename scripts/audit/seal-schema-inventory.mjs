import { readFileSync, writeFileSync } from "node:fs";
import { parseRawInventory, sealRecords, serializeSealed } from "./schema-inventory-lib.mjs";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  process.stderr.write("usage: node scripts/audit/seal-schema-inventory.mjs <raw.csv> <sealed.csv>\n");
  process.exit(3);
}

const records = sealRecords(parseRawInventory(readFileSync(source, "utf8")));
writeFileSync(destination, serializeSealed(records));
process.stdout.write(`sealed rows=${records.length}\n`);
