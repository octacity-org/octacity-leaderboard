export type EventType =
  | "commit"
  | "pr_opened"
  | "pr_merged"
  | "review"
  | "issue_opened"
  | "comment"
  | "discussion"
  | "discussion_comment";

export interface ActivityEvent {
  type: EventType;
  repo: string;
  actor: string;
  /** ISO-8601 timestamp. */
  at: string;
  title: string;
  url: string;
  /** Pull request, issue, or discussion number the event belongs to. */
  number?: number;
  /** Short commit SHA. */
  sha?: string;
  additions?: number;
  deletions?: number;
  /** Review state such as APPROVED or CHANGES_REQUESTED. */
  state?: string;
  /** Discussion category. */
  category?: string;
}

export interface Person {
  login: string;
  name: string | null;
  avatarUrl: string;
  url: string;
}

export interface Team {
  slug: string;
  name: string;
  description: string | null;
  url: string;
  members: string[];
}

export interface Repo {
  name: string;
  url: string;
  description: string | null;
  stars: number;
  archived: boolean;
}

export interface BacklogIssue {
  repo: string;
  number: number;
  title: string;
  url: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  labels: string[];
  /** Assignee logins. */
  assignees: string[];
  /** Open pull requests linked to close this issue. */
  pullRequests: { number: number; url: string }[];
}

export interface LeaderboardData {
  generatedAt: string;
  org: { login: string; name: string; url: string; description: string | null };
  /** Org member logins. */
  members: string[];
  teams: Team[];
  /** Everyone referenced by members or events, keyed by login. */
  people: Record<string, Person>;
  repos: Repo[];
  events: ActivityEvent[];
  /** Open issues in public repositories. */
  backlog: BacklogIssue[];
}
