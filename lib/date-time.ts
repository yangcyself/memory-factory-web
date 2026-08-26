export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function formatDateTime(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function zonedDateToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
  hour = 0,
  minute = 0,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    candidate += target - represented;
  }
  return new Date(candidate);
}

export function zonedLocalDateTimeToUtc(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Invalid local date and time.");
  return zonedDateToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    timeZone,
    Number(match[4]),
    Number(match[5]),
  );
}

export function zonedDayBoundaries(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  const week = new Date(Date.UTC(year, month - 1, day + 8));
  return {
    start: zonedDateToUtc(year, month, day, timeZone),
    tomorrow: zonedDateToUtc(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
      timeZone,
    ),
    week: zonedDateToUtc(
      week.getUTCFullYear(),
      week.getUTCMonth() + 1,
      week.getUTCDate(),
      timeZone,
    ),
  };
}
