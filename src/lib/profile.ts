import { countable } from "./rank";
import type { ActivityEvent, EventType } from "./types";

const DAY = 86_400_000;

export const dayOf = (iso: string) => iso.slice(0, 10);

/** Monday of the UTC week containing `iso`, as YYYY-MM-DD. */
export function weekOf(iso: string): string {
  const date = new Date(`${dayOf(iso)}T00:00:00Z`);
  return dayOf(new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY).toISOString());
}

/** Events per UTC day. */
export function dailyCounts(events: ActivityEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(dayOf(event.at), (counts.get(dayOf(event.at)) ?? 0) + 1);
  return counts;
}

const oldestFirst = (events: ActivityEvent[]) => [...events].sort((a, b) => a.at.localeCompare(b.at));

/*
 * Milestones list, oldest first, the moment a running value reached 1, 2, 3, and so on.
 * Their length is the value, and milestones[n - 1] is when the value first reached n.
 */

export function countMilestones(events: ActivityEvent[], types: EventType[]): string[] {
  return oldestFirst(countable(events))
    .filter((event) => types.includes(event.type))
    .map((event) => event.at);
}

export function repoMilestones(events: ActivityEvent[]): string[] {
  const seen = new Set<string>();
  return oldestFirst(events).flatMap((event) => {
    if (seen.has(event.repo)) return [];
    seen.add(event.repo);
    return [event.at];
  });
}

/** Consecutive UTC weeks with at least one event; the longest run so far sets the value. */
export function streakMilestones(events: ActivityEvent[]): string[] {
  const milestones: string[] = [];
  let lastWeek: string | null = null;
  let run = 0;
  for (const event of oldestFirst(events)) {
    const week = weekOf(event.at);
    if (week === lastWeek) continue;
    const consecutive = lastWeek !== null && new Date(week).getTime() - new Date(lastWeek).getTime() === 7 * DAY;
    run = consecutive ? run + 1 : 1;
    lastWeek = week;
    if (run > milestones.length) milestones.push(event.at);
  }
  return milestones;
}

/** The last `count` UTC weeks through the week of `now`, each as Monday-to-Sunday day keys. */
export function calendarWeeks(now: Date, count: number): string[][] {
  const start = new Date(weekOf(now.toISOString())).getTime() - (count - 1) * 7 * DAY;
  return Array.from({ length: count }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => dayOf(new Date(start + (week * 7 + day) * DAY).toISOString())),
  );
}
