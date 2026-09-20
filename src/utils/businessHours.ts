import type { AttentionConfig } from "@/supabase/client";

/**
 * H6 — the rules a weekly schedule has to satisfy before it is worth saving.
 *
 * The sweeps of H4 read this schedule to decide when a customer's wait is
 * late, so a schedule that says something impossible — closing before it
 * opens, two windows over the same hour — is not a cosmetic problem: it
 * decides when somebody is told nobody came.
 */
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type Day = (typeof DAYS)[number];

export type Window = [string, string];

export type BusinessHours = Partial<Record<Day, Window[]>>;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":");

  return Number(hours) * 60 + Number(minutes);
}

/** The reason this day's windows cannot be saved, or undefined. */
export function dayError(windows: Window[]): string | undefined {
  for (const [from, to] of windows) {
    if (!HHMM.test(from) || !HHMM.test(to)) return "invalid";
    if (toMinutes(to) <= toMinutes(from)) return "order";
  }

  const sorted = [...windows].sort((a, b) => toMinutes(a[0]) - toMinutes(b[0]));

  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i][0]) < toMinutes(sorted[i - 1][1])) {
      return "overlap";
    }
  }

  return undefined;
}

export function scheduleErrors(
  hours: BusinessHours,
): Partial<Record<Day, string>> {
  const errors: Partial<Record<Day, string>> = {};

  for (const day of DAYS) {
    const error = dayError(hours[day] ?? []);

    if (error) errors[day] = error;
  }

  return errors;
}

/**
 * What the form edits, always all seven days — an absent day and an empty one
 * mean the same thing to the reader (closed), and a form that hides the
 * difference is easier to reason about than one that preserves it.
 */
export function toForm(
  hours: AttentionConfig["business_hours"],
): BusinessHours {
  return Object.fromEntries(
    DAYS.map((day) => [day, (hours?.[day] ?? []) as Window[]]),
  ) as BusinessHours;
}

/**
 * What is saved: null when the organization works every hour of every day,
 * because that is what "no schedule" means everywhere else (H4's defaults),
 * and a week where a closed day is an empty array.
 */
export function fromForm(hours: BusinessHours): BusinessHours | null {
  const anyWindow = DAYS.some((day) => (hours[day] ?? []).length > 0);

  if (!anyWindow) return null;

  return Object.fromEntries(
    DAYS.map((day) => [
      day,
      [...(hours[day] ?? [])].sort((a, b) => toMinutes(a[0]) - toMinutes(b[0])),
    ]),
  ) as BusinessHours;
}
