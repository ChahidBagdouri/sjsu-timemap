import { describe, expect, it } from "vitest";
import { rankEventOpportunities } from "./opportunities";
import type { Dataset } from "./types";
import manifest from "../public/data/manifest.json";

const snapshots = import.meta.glob<Dataset>("../public/data/*.json", {
  eager: true,
  import: "default",
});
describe("published semester opportunity analysis", () => {
  for (const entry of manifest.terms) {
    it("produces valid opportunities for " + entry.label, () => {
      const data = snapshots["../public/data/" + entry.file];
      const begin = performance.now();
      const ranking = rankEventOpportunities(
        data.sections,
        data.term,
        { mode: "semester", week: data.term.startDate },
        { duration: 60, buffer: 10, proximity: 60 },
      );
      console.info(
        entry.label +
          ": " +
          Math.round(performance.now() - begin) +
          " ms; " +
          ranking.coverage.eligibleSections +
          "/" +
          ranking.coverage.timedSections +
          " eligible weekday sections; " +
          ranking.candidateCount +
          " slots; " +
          ranking.suggestions.length +
          " suggestions",
      );
      expect(ranking.coverage.eligibleSections).toBeGreaterThan(0);
      expect(ranking.coverage.eligibleSections).toBeLessThanOrEqual(
        ranking.coverage.timedSections,
      );
      expect(ranking.suggestions.length).toBeGreaterThan(0);
      expect(ranking.suggestions.length).toBeLessThanOrEqual(5);
      for (const w of ranking.candidates) {
        expect([w.score, w.nearby, w.conflicts].every(Number.isFinite)).toBe(
          true,
        );
        expect(w.nearby).toBeGreaterThanOrEqual(0);
        expect(w.conflicts).toBeGreaterThanOrEqual(0);
        expect(w.ending + w.starting).toBeCloseTo(w.nearby, 6);
        expect(w.settings).toHaveLength(9);
        expect(w.score).toBeGreaterThanOrEqual(0);
        expect(w.score).toBeLessThanOrEqual(100);
      }
    });
  }
});
