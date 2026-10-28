import { BONUS_POINTS, type Bonus } from "./bonus";
import type { ActivityEvent, EventType, Team } from "./types";

/** "all" or a UTC month key such as "2026-10". */
export type Period = string;

export const WEIGHTS: Record<EventType, number> = {
  commit: 2,
  pr_opened: 3,
  pr_merged: 6,
  review: 5,
  issue_opened: 3,
  comment: 1,
  discussion: 4,
  discussion_comment: 2,
};

export type CategoryId = "overall" | "commits" | "shipped" | "lines" | "reviews" | "discussions" | "issues";

export interface Category {
  id: CategoryId;
  label: string;
  description: string;
  unit: string;
  /** Event types counted; overall scores every type and lines sums merged diff sizes instead. */
  types: EventType[];
}

export const CATEGORIES: Category[] = [
  { id: "overall", label: "Overall", description: "Weighted score across every kind of contribution.", unit: "pts", types: [] },
  { id: "commits", label: "Commits", description: "Commits landed on default branches.", unit: "commits", types: ["commit"] },
  { id: "shipped", label: "Merged PRs", description: "Pull requests authored and merged.", unit: "merged", types: ["pr_merged"] },
  { id: "lines", label: "Lines merged", description: "Lines added and removed through merged pull requests.", unit: "lines", types: ["pr_merged"] },
  { id: "reviews", label: "Code reviews", description: "Pull requests reviewed for someone else.", unit: "reviews", types: ["review"] },
  { id: "discussions", label: "Discussions", description: "Discussions started, replies, and issue or PR comments.", unit: "posts", types: ["discussion", "discussion_comment", "comment"] },
  { id: "issues", label: "Issues", description: "Issues opened.", unit: "issues", types: ["issue_opened"] },
];

export const monthOf = (iso: string) => iso.slice(0, 7);

export function inPeriod<T extends { at: string }>(events: T[], period: Period): T[] {
  return period === "all" ? events : events.filter((event) => monthOf(event.at) === period);
}

/** Month keys from the earliest event through `now`, newest first. */
export function availableMonths(events: ActivityEvent[], now = new Date()): string[] {
  if (!events.length) return [monthOf(now.toISOString())];
  const first = events.reduce((min, event) => (event.at < min ? event.at : min), events[0]!.at);
  const cursor = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, 1));
  const months: string[] = [];
  while (cursor <= now) {
    months.unshift(monthOf(cursor.toISOString()));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/** Repeat reviews of the same pull request by the same reviewer count once. */
export function countable(events: ActivityEvent[]): ActivityEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (event.type !== "review") return true;
    const key = `${event.actor}:${event.repo}#${event.number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Weighted score of events plus any bonuses earned with them. */
export function scoreOf(events: ActivityEvent[], bonuses: Bonus[] = []): number {
  const points = countable(events).reduce((sum, event) => sum + WEIGHTS[event.type], 0);
  return bonuses.reduce((sum, bonus) => sum + BONUS_POINTS[bonus.type], points);
}

export function countByType(events: ActivityEvent[]): Record<EventType, number> {
  const counts = Object.fromEntries(Object.keys(WEIGHTS).map((type) => [type, 0])) as Record<EventType, number>;
  for (const event of countable(events)) counts[event.type]++;
  return counts;
}

function valueFor(category: CategoryId, events: ActivityEvent[], bonuses: Bonus[]): number {
  if (category === "overall") return scoreOf(events, bonuses);
  if (category === "lines") {
    return events.reduce((sum, e) => (e.type === "pr_merged" ? sum + (e.additions ?? 0) + (e.deletions ?? 0) : sum), 0);
  }
  const types = CATEGORIES.find((c) => c.id === category)!.types;
  return countable(events).filter((event) => types.includes(event.type)).length;
}

function groupByActor<T extends { actor: string }>(events: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const event of events) {
    const list = groups.get(event.actor);
    if (list) list.push(event);
    else groups.set(event.actor, [event]);
  }
  return groups;
}

/** Assigns competition ranks (1, 2, 2, 4) to rows already sorted by value. */
function withRanks<T extends { value: number }>(rows: T[]): (T & { rank: number })[] {
  let rank = 0;
  return rows.map((row, index) => {
    if (index === 0 || rows[index - 1]!.value !== row.value) rank = index + 1;
    return { ...row, rank };
  });
}

export interface Standing {
  login: string;
  value: number;
  rank: number;
  counts: Record<EventType, number>;
}

/** Member standings for one category over already period-filtered events and bonuses. */
export function categoryStandings(events: ActivityEvent[], members: string[], category: CategoryId, bonuses: Bonus[] = []): Standing[] {
  const groups = groupByActor(events);
  const bonusGroups = groupByActor(bonuses);
  const rows = members
    .map((login) => {
      const own = groups.get(login) ?? [];
      return { login, value: valueFor(category, own, bonusGroups.get(login) ?? []), counts: countByType(own) };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.login.localeCompare(b.login));
  return withRanks(rows);
}

export interface TeamStanding {
  team: Team;
  score: number;
  rank: number;
  /** Members with any activity in the period. */
  active: number;
  /** Highest-scoring member, if anyone scored. */
  top: string | null;
  /** Contributions summed over the team's members. */
  counts: Record<EventType, number>;
}

export function teamStandings(events: ActivityEvent[], teams: Team[], bonuses: Bonus[] = []): TeamStanding[] {
  const groups = groupByActor(events);
  const bonusGroups = groupByActor(bonuses);
  const rows = teams
    .map((team) => {
      const scores = team.members
        .map((login) => ({ login, score: scoreOf(groups.get(login) ?? [], bonusGroups.get(login) ?? []) }))
        .sort((a, b) => b.score - a.score || a.login.localeCompare(b.login));
      const active = scores.filter((s) => s.score > 0);
      return {
        team,
        value: active.reduce((sum, s) => sum + s.score, 0),
        active: active.length,
        top: active[0]?.login ?? null,
        counts: countByType(team.members.flatMap((login) => groups.get(login) ?? [])),
      };
    })
    .sort((a, b) => b.value - a.value || a.team.name.localeCompare(b.team.name));
  return withRanks(rows).map(({ value, ...row }) => ({ ...row, score: value }));
}
