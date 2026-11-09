let currentClock = () => new Date();

export function now() {
  return new Date(currentClock().getTime());
}

export function todayUtcDate() {
  return now().toISOString().slice(0, 10);
}

export function setClock(clock) {
  if (typeof clock !== "function")
    throw new TypeError("clock must be a function");
  currentClock = clock;
}

export function resetClock() {
  currentClock = () => new Date();
}

export function withClock(clock, callback) {
  const previous = currentClock;
  setClock(clock);
  try {
    return callback();
  } finally {
    currentClock = previous;
  }
}

export function businessDate(date = now(), timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function dateAtUtcMidnight(date) {
  if (
    !/^\d{4}-\d\d-\d\d$/.test(date) ||
    new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date
  ) {
    throw new RangeError("Expected a valid business-local YYYY-MM-DD date.");
  }
  return new Date(`${date}T00:00:00.000Z`);
}
