import type { ActivityEvent, LeaderboardData } from "./types";

export type BonusType = "review_24h" | "review_48h" | "reviewed_merge" | "first_merge" | "first_issue" | "helping_hand";

/** Extra points earned on top of an event's weight, dated when they were earned. */
export interface Bonus {
  type: BonusType;
  actor: string;
  at: string;
  repo: string;
  number?: number;
}

export const BONUS_POINTS: Record<BonusType, number> = {
  review_24h: 3,
  review_48h: 2,
  reviewed_merge: 3,
  first_merge: 5,
  first_issue: 2,
  helping_hand: 1,
};

const HOUR = 60 * 60 * 1000;

const itemKey = (event: { repo: string; number?: number }) => `${event.repo}#${event.number}`;

/** Bonuses earned by members, newest first. */
export function bonusesOf(events: ActivityEvent[], members: string[]): Bonus[] {
  const isMember = new Set(members);
  const oldestFirst = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const bonuses: Bonus[] = [];
  const pay = (type: BonusType, event: ActivityEvent, at = event.at) =>
    bonuses.push({ type, actor: event.actor, at, repo: event.repo, number: event.number });

  const authors = new Map<string, string>();
  const opened = new Map<string, string>();
  const approvals = new Map<string, ActivityEvent[]>();
  const merges = new Map<string, ActivityEvent>();
  const comments = new Map<string, ActivityEvent[]>();
  for (const event of oldestFirst) {
    const key = itemKey(event);
    if (event.type === "issue_opened" || event.type === "pr_opened") authors.set(key, event.actor);
    if (event.type === "pr_opened") opened.set(key, event.at);
    if (event.type === "review" && event.state === "APPROVED") approvals.set(key, [...(approvals.get(key) ?? []), event]);
    if (event.type === "pr_merged") merges.set(key, event);
    if (event.type === "comment") comments.set(key, [...(comments.get(key) ?? []), event]);
  }

  // Fast review: a reviewer's first review on a pull request, within 24 or 48 hours of it opening.
  const reviewed = new Set<string>();
  for (const event of oldestFirst) {
    if (event.type !== "review" || !isMember.has(event.actor)) continue;
    const reviewKey = `${event.actor} ${itemKey(event)}`;
    if (reviewed.has(reviewKey)) continue;
    reviewed.add(reviewKey);
    const openedAt = opened.get(itemKey(event));
    if (!openedAt) continue;
    const hours = (Date.parse(event.at) - Date.parse(openedAt)) / HOUR;
    if (hours <= 24) pay("review_24h", event);
    else if (hours <= 48) pay("review_48h", event);
  }

  // Reviewed merge: someone else approved the pull request before it was merged.
  // First merge: the author's first merged pull request in that repository.
  const merged = new Set<string>();
  for (const event of oldestFirst) {
    if (event.type !== "pr_merged" || !isMember.has(event.actor)) continue;
    const approved = approvals.get(itemKey(event))?.some((review) => review.actor !== event.actor && review.at <= event.at);
    if (approved) pay("reviewed_merge", event);
    const repoKey = `${event.actor} ${event.repo}`;
    if (!merged.has(repoKey)) {
      merged.add(repoKey);
      pay("first_merge", event);
    }
  }

  // First issue: the first time another member comments on, or merges a fix for, one of the author's issues in a repository.
  const responded = new Map<string, { event: ActivityEvent; at: string }>();
  for (const event of oldestFirst) {
    if (event.type !== "issue_opened" || !isMember.has(event.actor)) continue;
    const others = (actor: string) => actor !== event.actor && isMember.has(actor);
    const times = [
      ...(comments.get(itemKey(event)) ?? []).filter((c) => others(c.actor)).map((c) => c.at),
      ...(event.closedBy ?? [])
        .map((number) => merges.get(itemKey({ repo: event.repo, number })))
        .filter((pr): pr is ActivityEvent => !!pr && others(pr.actor))
        .map((pr) => pr.at),
    ];
    if (!times.length) continue;
    const at = times.reduce((min, time) => (time < min ? time : min));
    const repoKey = `${event.actor} ${event.repo}`;
    const earlier = responded.get(repoKey);
    if (!earlier || at < earlier.at) responded.set(repoKey, { event, at });
  }
  for (const { event, at } of responded.values()) pay("first_issue", event, at);

  // Helping hand: a comment on someone else's issue or pull request.
  for (const event of oldestFirst) {
    if (event.type !== "comment" || !isMember.has(event.actor)) continue;
    const author = authors.get(itemKey(event));
    if (author && author !== event.actor) pay("helping_hand", event);
  }

  return bonuses.sort((a, b) => b.at.localeCompare(a.at));
}

const cache = new WeakMap<LeaderboardData, Bonus[]>();

/** Bonuses for a loaded data file, computed once. */
export function bonusesFor(data: LeaderboardData): Bonus[] {
  let bonuses = cache.get(data);
  if (!bonuses) cache.set(data, (bonuses = bonusesOf(data.events, data.members)));
  return bonuses;
}
