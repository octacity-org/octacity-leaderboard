import { countMilestones, repoMilestones, streakMilestones } from "./profile";
import type { ActivityEvent } from "./types";

export type Tier = "bronze" | "silver" | "gold";
export const TIERS: Tier[] = ["bronze", "silver", "gold"];

export interface Badge {
  id: string;
  name: string;
  description: string;
  unit: string;
  /** Values that earn bronze, silver, and gold. */
  thresholds: [number, number, number];
  /** See profile.ts: milestones[n - 1] is when the value first reached n. */
  milestones: (events: ActivityEvent[]) => string[];
}

// Placeholder definitions to preview the profile design; names, rules, and artwork are not final.
export const BADGES: Badge[] = [
  {
    id: "relentless",
    name: "Relentless",
    description: "Active in consecutive weeks.",
    unit: "weeks in a row",
    thresholds: [4, 8, 16],
    milestones: streakMilestones,
  },
  {
    id: "inspector",
    name: "Inspector",
    description: "Reviewed pull requests by others.",
    unit: "reviews",
    thresholds: [5, 25, 100],
    milestones: (events) => countMilestones(events, ["review"]),
  },
  {
    id: "shipwright",
    name: "Shipwright",
    description: "Authored pull requests that were merged.",
    unit: "merged PRs",
    thresholds: [5, 25, 100],
    milestones: (events) => countMilestones(events, ["pr_merged"]),
  },
  {
    id: "lookout",
    name: "Lookout",
    description: "Opened issues.",
    unit: "issues",
    thresholds: [5, 25, 100],
    milestones: (events) => countMilestones(events, ["issue_opened"]),
  },
  {
    id: "voice",
    name: "Voice",
    description: "Started discussions, replied, and commented.",
    unit: "posts",
    thresholds: [5, 25, 100],
    milestones: (events) => countMilestones(events, ["discussion", "discussion_comment", "comment"]),
  },
  {
    id: "navigator",
    name: "Navigator",
    description: "Contributed to different repositories.",
    unit: "repositories",
    thresholds: [3, 8, 15],
    milestones: repoMilestones,
  },
];

export interface BadgeProgress {
  badge: Badge;
  value: number;
  /** Highest tier reached, or null when not earned. */
  tier: Tier | null;
  /** When the highest tier was reached. */
  earnedAt: string | null;
  /** Value needed for the next tier, or null at gold. */
  next: number | null;
}

export function badgeProgress(events: ActivityEvent[]): BadgeProgress[] {
  return BADGES.map((badge) => {
    const milestones = badge.milestones(events);
    const reached = badge.thresholds.filter((threshold) => milestones.length >= threshold).length;
    return {
      badge,
      value: milestones.length,
      tier: reached ? TIERS[reached - 1]! : null,
      earnedAt: reached ? milestones[badge.thresholds[reached - 1]! - 1]! : null,
      next: badge.thresholds[reached] ?? null,
    };
  });
}
