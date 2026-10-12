/**
 * Evaluation entry point (Phase A3): score the deterministic answer engine
 * against the PRD use-case table. Exits non-zero when any case fails.
 * Run with: npm run eval
 */
import { runEval } from "../src/eval/cases";

const { results, passed, total } = runEval();
console.log(`AI Site Memory — evaluation (${passed}/${total} passed)`);
for (const result of results) {
  const mark = result.passed ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${result.id}: ${result.question}`);
  for (const failure of result.failures) {
    console.log(`         - ${failure}`);
  }
}
if (passed !== total) {
  console.error("Evaluation FAILED.");
  process.exitCode = 1;
} else {
  console.log("Evaluation OK.");
}
