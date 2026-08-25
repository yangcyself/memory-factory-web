import { describe, expect, it } from "vitest";
import { intervalDaysForRating } from "../lib/review-schedule";

describe("rating-v1", () => {
  it.each([
    [0, 1],
    [1, 3],
    [2, 7],
    [3, 14],
    [4, 30],
  ])("maps rating %i to %i days", (rating, days) => {
    expect(intervalDaysForRating(rating)).toBe(days);
  });
  it.each([-1, 5, 1.5, Number.NaN])("rejects invalid rating %s", (rating) => {
    expect(() => intervalDaysForRating(rating)).toThrow(RangeError);
  });
});
