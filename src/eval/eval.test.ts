import { describe, expect, it } from "vitest";
import { runEval } from "./cases";

describe("evaluation harness (PRD UC/AC)", () => {
  const { results, passed, total } = runEval();
  for (const result of results) {
    it(`${result.id}: ${result.question}`, () => {
      expect(result.failures).toEqual([]);
    });
  }
  it(`scores ${passed}/${total}`, () => {
    expect(passed).toBe(total);
  });
});
