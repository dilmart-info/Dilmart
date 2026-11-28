import { readFileSync } from "node:fs";
import { applyReview, compareInventories, parseSealedInventory } from "./schema-inventory-lib.mjs";

const [baselinePath, candidatePath, reviewPath] = process.argv.slice(2);
if (!baselinePath || !candidatePath) {
  process.stderr.write("usage: node scripts/audit/compare-schema-inventory.mjs <baseline.csv> <candidate.csv> [review.json]\n");
  process.exit(3);
}

try {
  const review = reviewPath ? JSON.parse(readFileSync(reviewPath, "utf8")) : null;
  const result = applyReview(
    compareInventories(
      parseSealedInventory(readFileSync(baselinePath, "utf8")),
      parseSealedInventory(readFileSync(candidatePath, "utf8")),
    ),
    review,
  );
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    counts: result.counts,
    errors: result.errors,
    unexplained: result.unexplained ?? result.differences,
    reviewed: result.reviewed ?? [],
  }, null, 2)}\n`);
  process.exit(result.exitCode);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(3);
}
