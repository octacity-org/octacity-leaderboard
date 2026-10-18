import { describe, expect, test } from "bun:test";
import { backlogGroups, issueStatus } from "./backlog";
import type { BacklogIssue } from "./types";

let seq = 0;
function issue(extra: Partial<BacklogIssue> = {}): BacklogIssue {
  seq++;
  return {
    repo: "repo",
    number: seq,
    title: `t${seq}`,
    url: `u${seq}`,
    createdAt: "2026-10-01T00:00:00Z",
    labels: [],
    assignees: [],
    pullRequests: [],
    ...extra,
  };
}

describe("issueStatus", () => {
  test("is in review with a linked pull request, claimed with an assignee, and open otherwise", () => {
    const pr = { number: 9, url: "pr" };
    expect(issueStatus(issue())).toBe("open");
    expect(issueStatus(issue({ assignees: ["ada"] }))).toBe("claimed");
    expect(issueStatus(issue({ assignees: ["ada"], pullRequests: [pr] }))).toBe("review");
  });
});

describe("backlogGroups", () => {
  test("lists issues with both labels in both groups and the rest under general", () => {
    const both = issue({ labels: ["good first issue", "help wanted"] });
    const first = issue({ labels: ["Good First Issue"] });
    const help = issue({ labels: ["help wanted", "bug"] });
    const other = issue({ labels: ["bug"] });
    const bare = issue();
    const groups = backlogGroups([both, first, help, other, bare]);
    expect(groups["good-first-issue"].map((i) => i.number).sort()).toEqual([both.number, first.number].sort());
    expect(groups["help-wanted"].map((i) => i.number).sort()).toEqual([both.number, help.number].sort());
    expect(groups.general.map((i) => i.number).sort()).toEqual([other.number, bare.number].sort());
  });

  test("puts open issues first, then claimed, then in review, newest first within each", () => {
    const pr = { number: 9, url: "pr" };
    const review = issue({ pullRequests: [pr], createdAt: "2026-10-09T00:00:00Z" });
    const claimed = issue({ assignees: ["ada"], createdAt: "2026-10-08T00:00:00Z" });
    const older = issue({ createdAt: "2026-10-01T00:00:00Z" });
    const newer = issue({ createdAt: "2026-10-05T00:00:00Z" });
    expect(backlogGroups([review, claimed, older, newer]).general.map((i) => i.number)).toEqual([
      newer.number,
      older.number,
      claimed.number,
      review.number,
    ]);
  });
});
