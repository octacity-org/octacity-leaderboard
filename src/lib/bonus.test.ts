import { describe, expect, test } from "bun:test";
import { BONUS_POINTS, bonusesOf } from "./bonus";
import { categoryStandings, scoreOf, teamStandings, WEIGHTS } from "./rank";
import type { ActivityEvent, EventType, Team } from "./types";

let seq = 0;
function event(type: EventType, actor: string, at: string, extra: Partial<ActivityEvent> = {}): ActivityEvent {
  seq++;
  return { type, actor, at, repo: "repo", title: `t${seq}`, url: `u${seq}`, ...extra };
}

const members = ["ada", "bob", "cy"];
const summary = (events: ActivityEvent[]) => bonusesOf(events, members).map((b) => [b.type, b.actor, b.at]);

describe("reviewed merge", () => {
  test("pays the author when someone else approved before the merge", () => {
    const events = [
      event("pr_opened", "ada", "2026-10-01T00:00:00Z", { number: 1 }),
      event("review", "bob", "2026-10-02T00:00:00Z", { number: 1, state: "APPROVED" }),
      event("pr_merged", "ada", "2026-10-03T00:00:00Z", { number: 1 }),
    ];
    expect(summary(events)).toContainEqual(["reviewed_merge", "ada", "2026-10-03T00:00:00Z"]);
  });

  test("ignores approvals after the merge and reviews that did not approve", () => {
    const events = [
      event("review", "bob", "2026-10-02T00:00:00Z", { number: 1, state: "COMMENTED" }),
      event("pr_merged", "ada", "2026-10-03T00:00:00Z", { number: 1 }),
      event("review", "bob", "2026-10-04T00:00:00Z", { number: 1, state: "APPROVED" }),
    ];
    expect(summary(events).filter(([type]) => type === "reviewed_merge")).toEqual([]);
  });
});

describe("fast review", () => {
  test("pays the reviewer by how soon after the pull request opened they reviewed", () => {
    const events = [
      event("pr_opened", "ada", "2026-10-01T00:00:00Z", { number: 1 }),
      event("pr_opened", "ada", "2026-10-01T00:00:00Z", { number: 2 }),
      event("pr_opened", "ada", "2026-10-01T00:00:00Z", { number: 3 }),
      event("review", "bob", "2026-10-02T00:00:00Z", { number: 1, state: "APPROVED" }),
      event("review", "bob", "2026-10-02T12:00:00Z", { number: 2, state: "COMMENTED" }),
      event("review", "bob", "2026-10-03T00:00:01Z", { number: 3, state: "APPROVED" }),
    ];
    expect(summary(events).filter(([type]) => type === "review_24h" || type === "review_48h")).toEqual([
      ["review_48h", "bob", "2026-10-02T12:00:00Z"],
      ["review_24h", "bob", "2026-10-02T00:00:00Z"],
    ]);
  });

  test("pays once per pull request per reviewer, timed by their first review, and not for guests", () => {
    const events = [
      event("pr_opened", "ada", "2026-10-01T00:00:00Z", { number: 1 }),
      event("review", "bob", "2026-10-02T12:00:00Z", { number: 1, state: "COMMENTED" }),
      event("review", "bob", "2026-10-01T06:00:00Z", { number: 1, state: "CHANGES_REQUESTED" }),
      event("review", "guest", "2026-10-01T01:00:00Z", { number: 1, state: "APPROVED" }),
    ];
    expect(summary(events).filter(([type]) => type === "review_24h" || type === "review_48h")).toEqual([["review_24h", "bob", "2026-10-01T06:00:00Z"]]);
  });
});

describe("first merge in a repository", () => {
  test("pays once per repository, for the earliest merge", () => {
    const events = [
      event("pr_merged", "ada", "2026-10-05T00:00:00Z", { number: 2 }),
      event("pr_merged", "ada", "2026-10-01T00:00:00Z", { number: 1 }),
      event("pr_merged", "ada", "2026-10-02T00:00:00Z", { number: 1, repo: "other" }),
    ];
    expect(summary(events).filter(([type]) => type === "first_merge")).toEqual([
      ["first_merge", "ada", "2026-10-02T00:00:00Z"],
      ["first_merge", "ada", "2026-10-01T00:00:00Z"],
    ]);
  });

  test("does not pay for opening a pull request that is never merged", () => {
    const events = [event("pr_opened", "ada", "2026-10-01T00:00:00Z", { number: 1 })];
    expect(summary(events)).toEqual([]);
  });
});

describe("first issue in a repository", () => {
  test("pays when another member first comments on one of the author's issues", () => {
    const events = [
      event("issue_opened", "ada", "2026-10-01T00:00:00Z", { number: 3 }),
      event("issue_opened", "ada", "2026-10-02T00:00:00Z", { number: 4 }),
      event("comment", "ada", "2026-10-02T12:00:00Z", { number: 3 }),
      event("comment", "bob", "2026-10-04T00:00:00Z", { number: 3 }),
      event("comment", "cy", "2026-10-03T00:00:00Z", { number: 4 }),
    ];
    expect(summary(events).filter(([type]) => type === "first_issue")).toEqual([["first_issue", "ada", "2026-10-03T00:00:00Z"]]);
  });

  test("pays when another member's merged pull request closes it", () => {
    const events = [
      event("issue_opened", "ada", "2026-10-01T00:00:00Z", { number: 3, closedBy: [7] }),
      event("pr_merged", "bob", "2026-10-06T00:00:00Z", { number: 7 }),
    ];
    expect(summary(events)).toContainEqual(["first_issue", "ada", "2026-10-06T00:00:00Z"]);
  });

  test("does not pay for issues nobody else engages with, or that the author closes", () => {
    const events = [
      event("issue_opened", "ada", "2026-10-01T00:00:00Z", { number: 3, closedBy: [7] }),
      event("pr_merged", "ada", "2026-10-02T00:00:00Z", { number: 7 }),
      event("issue_opened", "ada", "2026-10-01T00:00:00Z", { number: 4, repo: "other" }),
      event("comment", "guest", "2026-10-02T00:00:00Z", { number: 4, repo: "other" }),
    ];
    expect(summary(events).filter(([type]) => type === "first_issue")).toEqual([]);
  });
});

describe("helping hand", () => {
  test("pays for comments on someone else's issue or pull request only", () => {
    const events = [
      event("issue_opened", "guest", "2026-10-01T00:00:00Z", { number: 3 }),
      event("pr_opened", "ada", "2026-10-01T00:00:00Z", { number: 5 }),
      event("comment", "ada", "2026-10-02T00:00:00Z", { number: 3 }),
      event("comment", "ada", "2026-10-03T00:00:00Z", { number: 5 }),
      event("comment", "guest", "2026-10-04T00:00:00Z", { number: 5 }),
    ];
    expect(summary(events).filter(([type]) => type === "helping_hand")).toEqual([["helping_hand", "ada", "2026-10-02T00:00:00Z"]]);
  });
});

describe("scoring with bonuses", () => {
  const events = [
    event("pr_opened", "ada", "2026-10-01T00:00:00Z", { number: 1 }),
    event("review", "bob", "2026-10-02T00:00:00Z", { number: 1, state: "APPROVED" }),
    event("pr_merged", "ada", "2026-10-03T00:00:00Z", { number: 1 }),
  ];
  const bonuses = bonusesOf(events, members);
  const ada = WEIGHTS.pr_opened + WEIGHTS.pr_merged + BONUS_POINTS.reviewed_merge + BONUS_POINTS.first_merge;
  const bob = WEIGHTS.review + BONUS_POINTS.review_24h;

  test("adds bonus points to the overall score and team score only", () => {
    expect(scoreOf(events.filter((e) => e.actor === "ada"), bonuses.filter((b) => b.actor === "ada"))).toBe(ada);
    expect(categoryStandings(events, members, "overall", bonuses).map((r) => [r.login, r.value])).toEqual([
      ["ada", ada],
      ["bob", bob],
    ]);
    expect(categoryStandings(events, members, "shipped", bonuses).map((r) => [r.login, r.value])).toEqual([["ada", 1]]);
    const teams: Team[] = [{ slug: "a", name: "A", description: null, url: "", members: ["ada", "bob"] }];
    expect(teamStandings(events, teams, bonuses)[0]!.score).toBe(ada + bob);
  });

  test("ranks a member whose only points this period are a bonus", () => {
    const late = [{ type: "first_issue" as const, actor: "cy", at: "2026-11-01T00:00:00Z", repo: "repo", number: 9 }];
    expect(categoryStandings([], members, "overall", late).map((r) => [r.login, r.value])).toEqual([["cy", BONUS_POINTS.first_issue]]);
  });
});
