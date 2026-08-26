export const RATING_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;

export function intervalDaysForRating(rating: number): number {
  if (!Number.isInteger(rating) || rating < 0 || rating > 4) {
    throw new RangeError("Memory rating must be an integer from 0 to 4.");
  }
  return RATING_INTERVAL_DAYS[rating];
}

export const ratingOptions = [
  { value: 0, label: "Nothing", description: "Remembered almost nothing" },
  {
    value: 1,
    label: "Vague",
    description: "Familiar, but the main idea would not come back",
  },
  { value: 2, label: "Main idea", description: "Remembered the main idea" },
  {
    value: 3,
    label: "Clear",
    description: "Remembered most important details",
  },
  { value: 4, label: "Effortless", description: "Recalled it easily" },
] as const;

export const importanceOptions = [
  {
    value: 0,
    label: "No review",
    description: "Meta items and notes you do not need to memorize",
  },
  {
    value: 1,
    label: "Very rare",
    description: "About once every one to two years",
  },
  {
    value: 2,
    label: "Occasional",
    description: "Useful to revisit, but not often",
  },
  {
    value: 3,
    label: "Regular",
    description: "A balanced default review cadence",
  },
  {
    value: 4,
    label: "Important",
    description: "Review frequently and retain well",
  },
  {
    value: 5,
    label: "Must memorize",
    description: "Make sure this stays memorized",
  },
] as const;
