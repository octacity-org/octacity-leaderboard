import type { BacklogIssue } from "./types";

export type BacklogGroupId = "good-first-issue" | "help-wanted" | "general";
export type IssueStatus = "open" | "claimed" | "review";

export const BACKLOG_GROUPS: { id: BacklogGroupId; label: string; description: string }[] = [
  { id: "good-first-issue", label: "Good first issue", description: "Small, well-scoped starting points." },
  { id: "help-wanted", label: "Help wanted", description: "Maintainers are asking for a hand." },
  { id: "general", label: "General", description: "Everything else that is open." },
];

const STATUS_ORDER: Record<IssueStatus, number> = { open: 0, claimed: 1, review: 2 };

export function issueStatus(issue: BacklogIssue): IssueStatus {
  if (issue.pullRequests.length) return "review";
  if (issue.assignees.length) return "claimed";
  return "open";
}

const hasLabel = (issue: BacklogIssue, name: string) => issue.labels.some((label) => label.toLowerCase() === name);

/** Issues carrying both labels appear in both groups; issues with neither are general. */
export function backlogGroups(issues: BacklogIssue[]): Record<BacklogGroupId, BacklogIssue[]> {
  const sorted = [...issues].sort(
    (a, b) => STATUS_ORDER[issueStatus(a)] - STATUS_ORDER[issueStatus(b)] || b.createdAt.localeCompare(a.createdAt),
  );
  const firstIssue = sorted.filter((issue) => hasLabel(issue, "good first issue"));
  const helpWanted = sorted.filter((issue) => hasLabel(issue, "help wanted"));
  return {
    "good-first-issue": firstIssue,
    "help-wanted": helpWanted,
    general: sorted.filter((issue) => !firstIssue.includes(issue) && !helpWanted.includes(issue)),
  };
}
