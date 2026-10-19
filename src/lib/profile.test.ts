import { describe, expect, test } from "bun:test";
import { badgeProgress, BADGES } from "./badges";
import { calendarWeeks, countMilestones, repoMilestones, streakMilestones, weekOf } from "./profile";
import type { ActivityEvent, EventType } from "./types";

let seq = 0;
function event(type: EventType, at: string, extra: Partial<ActivityEvent> = {}): ActivityEvent {
  seq++;
  return { type, actor: "ada", at, repo: "repo", title: `t${seq}`, url: `u${seq}`, ...extra };
}

describe("weekOf", () => {
  test("returns the Monday of the UTC week", () => {
    expect(weekOf("2026-10-19T08:00:00Z")).toBe("2026-10-19");
    expect(weekOf("2026-10-25T23:59:59Z")).toBe("2026-10-19");
    expect(weekOf("2026-10-26T00:00:00Z")).toBe("2026-10-26");
  });
});

describe("milestones", () => {
  test("count milestones are oldest first and count repeat reviews once", () => {
    const events = [
      event("review", "2026-10-03T00:00:00Z", { number: 1 }),
      event("review", "2026-10-02T00:00:00Z", { number: 1 }),
      event("review", "2026-10-01T00:00:00Z", { number: 2 }),
      event("commit", "2026-10-01T00:00:00Z"),
    ];
    expect(countMilestones(events, ["review"])).toHaveLength(2);
    expect(countMilestones(events, ["review"])[0]).toBe("2026-10-01T00:00:00Z");
  });

  test("repo milestones record the first event in each repository", () => {
    const events = [
      event("commit", "2026-10-05T00:00:00Z", { repo: "b" }),
      event("commit", "2026-10-01T00:00:00Z", { repo: "a" }),
      event("commit", "2026-10-03T00:00:00Z", { repo: "b" }),
    ];
    expect(repoMilestones(events)).toEqual(["2026-10-01T00:00:00Z", "2026-10-03T00:00:00Z"]);
  });

  test("streak milestones record when the longest weekly streak first reached each length", () => {
    const events = [
      event("commit", "2026-09-01T10:00:00Z"), // week of Aug 31
      event("commit", "2026-09-08T10:00:00Z"), // week of Sep 7
      // gap: week of Sep 14
      event("commit", "2026-09-21T10:00:00Z"),
      event("commit", "2026-09-28T10:00:00Z"),
      event("commit", "2026-10-05T10:00:00Z"),
    ];
    expect(streakMilestones(events)).toEqual(["2026-09-01T10:00:00Z", "2026-09-08T10:00:00Z", "2026-10-05T10:00:00Z"]);
  });
});

describe("calendarWeeks", () => {
  test("ends with the current week and lists Monday through Sunday", () => {
    const weeks = calendarWeeks(new Date("2026-10-21T12:00:00Z"), 2);
    expect(weeks).toEqual([
      ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"],
      ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"],
    ]);
  });
});

describe("badgeProgress", () => {
  test("reports the highest tier reached, when it was reached, and the next threshold", () => {
    const badge = BADGES.find((b) => b.id === "inspector")!;
    const [bronze] = badge.thresholds;
    const events = Array.from({ length: bronze }, (_, i) =>
      event("review", `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`, { number: i + 1 }),
    );
    const progress = badgeProgress(events).find((p) => p.badge.id === "inspector")!;
    expect(progress.tier).toBe("bronze");
    expect(progress.earnedAt).toBe(events[bronze - 1]!.at);
    expect(progress.next).toBe(badge.thresholds[1]);
    expect(badgeProgress([]).every((p) => p.tier === null && p.value === 0)).toBe(true);
  });
});
