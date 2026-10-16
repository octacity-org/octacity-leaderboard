import { describe, expect, test } from "bun:test";
import { availableMonths, categoryStandings, inPeriod, scoreOf, teamStandings, WEIGHTS } from "./rank";
import type { ActivityEvent, EventType, Team } from "./types";

let seq = 0;
function event(type: EventType, actor: string, at: string, extra: Partial<ActivityEvent> = {}): ActivityEvent {
  seq++;
  return { type, actor, at, repo: "repo", title: `t${seq}`, url: `u${seq}`, ...extra };
}

const members = ["ada", "bob", "cy"];

describe("inPeriod", () => {
  test("filters by UTC month and passes everything for all-time", () => {
    const events = [
      event("commit", "ada", "2026-09-30T23:59:59Z"),
      event("commit", "ada", "2026-10-01T00:00:00Z"),
    ];
    expect(inPeriod(events, "2026-10").map((e) => e.at)).toEqual(["2026-10-01T00:00:00Z"]);
    expect(inPeriod(events, "all")).toHaveLength(2);
  });
});

describe("availableMonths", () => {
  test("lists every month from the first event through the current month, newest first", () => {
    const events = [event("commit", "ada", "2026-07-15T00:00:00Z")];
    expect(availableMonths(events, new Date("2026-10-16T12:00:00Z"))).toEqual(["2026-10", "2026-09", "2026-08", "2026-07"]);
  });
});

describe("scoreOf", () => {
  test("sums weights and counts each reviewed pull request once per reviewer", () => {
    const events = [
      event("commit", "ada", "2026-10-01T00:00:00Z"),
      event("review", "ada", "2026-10-02T00:00:00Z", { number: 4 }),
      event("review", "ada", "2026-10-03T00:00:00Z", { number: 4 }),
      event("review", "ada", "2026-10-03T00:00:00Z", { number: 5 }),
    ];
    expect(scoreOf(events)).toBe(WEIGHTS.commit + 2 * WEIGHTS.review);
  });
});

describe("categoryStandings", () => {
  test("ranks members only, skips zeros, and shares ranks on ties", () => {
    const events = [
      event("commit", "ada", "2026-10-01T00:00:00Z"),
      event("commit", "ada", "2026-10-02T00:00:00Z"),
      event("commit", "bob", "2026-10-02T00:00:00Z"),
      event("commit", "cy", "2026-10-03T00:00:00Z"),
      event("commit", "guest", "2026-10-03T00:00:00Z"),
      event("commit", "guest", "2026-10-04T00:00:00Z"),
      event("commit", "guest", "2026-10-05T00:00:00Z"),
    ];
    const rows = categoryStandings(events, members, "commits");
    expect(rows.map((r) => [r.login, r.value, r.rank])).toEqual([
      ["ada", 2, 1],
      ["bob", 1, 2],
      ["cy", 1, 2],
    ]);
  });

  test("lines sums additions and deletions of merged pull requests", () => {
    const events = [
      event("pr_merged", "ada", "2026-10-01T00:00:00Z", { additions: 10, deletions: 5 }),
      event("pr_merged", "ada", "2026-10-02T00:00:00Z", { additions: 1 }),
      event("pr_opened", "bob", "2026-10-02T00:00:00Z", { additions: 99 }),
    ];
    expect(categoryStandings(events, members, "lines").map((r) => [r.login, r.value])).toEqual([["ada", 16]]);
  });

  test("overall uses weighted score and orders ties by login", () => {
    const events = [
      event("pr_merged", "bob", "2026-10-01T00:00:00Z"),
      event("discussion", "ada", "2026-10-01T00:00:00Z"),
    ];
    const rows = categoryStandings(events, members, "overall");
    expect(rows[0]).toMatchObject({ login: "bob", value: WEIGHTS.pr_merged, rank: 1 });
    expect(rows[1]).toMatchObject({ login: "ada", value: WEIGHTS.discussion, rank: 2 });
  });
});

describe("teamStandings", () => {
  test("sums member scores and names the top contributor", () => {
    const teams: Team[] = [
      { slug: "a", name: "A", description: null, url: "", members: ["ada", "bob"] },
      { slug: "b", name: "B", description: null, url: "", members: ["cy"] },
    ];
    const events = [
      event("commit", "ada", "2026-10-01T00:00:00Z"),
      event("pr_merged", "bob", "2026-10-01T00:00:00Z"),
      event("commit", "cy", "2026-10-01T00:00:00Z"),
    ];
    const rows = teamStandings(events, teams);
    expect(rows.map((r) => [r.team.slug, r.score, r.top, r.active])).toEqual([
      ["a", WEIGHTS.commit + WEIGHTS.pr_merged, "bob", 2],
      ["b", WEIGHTS.commit, "cy", 1],
    ]);
    expect([rows[0]!.counts.commit, rows[0]!.counts.pr_merged]).toEqual([1, 1]);
  });
});
