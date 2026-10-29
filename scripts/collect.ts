/**
 * Collects Octacity activity from the GitHub GraphQL API into public/data.json.
 *
 * Token: GH_TOKEN or GITHUB_TOKEN, falling back to `gh auth token` locally.
 * Org teams and private memberships need `read:org` (or Members: read for a GitHub App).
 * Only public repositories are collected because the output is published.
 */
import type { ActivityEvent, BacklogIssue, LeaderboardData, Person, Repo, Team } from "../src/lib/types";

const ORG = process.env.LEADERBOARD_ORG ?? "octacity-org";
/** Repositories that are not contribution work, such as membership applications. */
const EXCLUDED_REPOS = new Set(["membership"]);
const OUTPUT = new URL("../public/data.json", import.meta.url);

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ghCliToken();
if (!token) throw new Error("Set GH_TOKEN or GITHUB_TOKEN (or log in with `gh auth login`).");

function ghCliToken(): string | undefined {
  try {
    const result = Bun.spawnSync(["gh", "auth", "token"]);
    return result.success ? result.stdout.toString().trim() : undefined;
  } catch {
    return undefined;
  }
}

interface GraphQLError {
  message: string;
  type?: string;
  path?: (string | number)[];
}

async function graphql<T>(query: string, variables: Record<string, unknown> = {}, allowPartial = false): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if ((response.status >= 500 || response.status === 403) && attempt < 6) {
      console.warn(`  ! GitHub returned ${response.status}, retrying (${attempt}/5)`);
      await Bun.sleep(attempt * 3000);
      continue;
    }
    if (!response.ok) throw new Error(`GitHub GraphQL ${response.status}: ${await response.text()}`);
    const body = (await response.json()) as { data?: T; errors?: GraphQLError[] };
    if (body.errors?.length) {
      const message = body.errors.map((e) => e.message).join("; ");
      if (!allowPartial || !body.data) throw new Error(`GitHub GraphQL: ${message}`);
      console.warn(`  ! partial result: ${message}`);
    }
    return body.data as T;
  }
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

/** Walks a cursor-paginated connection; `select` picks the connection out of each response. */
async function paginate<N>(
  query: string,
  variables: Record<string, unknown>,
  select: (data: any) => { pageInfo: PageInfo; nodes: N[] } | null | undefined,
): Promise<N[]> {
  const nodes: N[] = [];
  let cursor: string | null = null;
  do {
    const connection = select(await graphql(query, { ...variables, cursor }));
    if (!connection) break;
    nodes.push(...connection.nodes);
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);
  return nodes;
}

// Actors ---------------------------------------------------------------------

interface Actor {
  __typename?: string;
  login: string;
  avatarUrl: string;
  url: string;
  name?: string | null;
}

const ACTOR = `__typename login avatarUrl url ... on User { name }`;
const people: Record<string, Person> = {};

/** Registers a human actor and returns its login; bots and ghosts return null. */
function person(actor: Actor | null | undefined): string | null {
  if (!actor || actor.__typename === "Bot" || actor.login.endsWith("[bot]")) return null;
  people[actor.login] ??= {
    login: actor.login,
    name: actor.name || null,
    avatarUrl: actor.avatarUrl,
    url: actor.url,
  };
  return actor.login;
}

// Organization ---------------------------------------------------------------

async function collectOrg() {
  const data = await graphql<any>(
    `query($org: String!) {
      organization(login: $org) {
        login name url description
        membersWithRole(first: 100) { nodes { ${ACTOR} } }
        teams(first: 100) {
          nodes { slug name description url members(first: 100) { nodes { login } } }
        }
      }
    }`,
    { org: ORG },
    true,
  );
  const org = data.organization;
  const members: string[] = (org.membersWithRole?.nodes ?? [])
    .map((node: Actor) => person({ ...node, __typename: "User" }))
    .filter(Boolean);
  const teams: Team[] = (org.teams?.nodes ?? []).map((team: any) => ({
    slug: team.slug,
    name: team.name,
    description: team.description || null,
    url: team.url,
    members: team.members.nodes.map((m: { login: string }) => m.login),
  }));
  // Refuse to publish a leaderboard with nobody on it.
  if (!members.length) throw new Error("No org members visible; the token needs read:org (GitHub App: Members: read).");
  if (!teams.length) console.warn("  ! no teams visible; the token likely lacks read:org (GitHub App: Members: read)");
  return {
    org: { login: org.login, name: org.name ?? org.login, url: org.url, description: org.description || null },
    members,
    teams,
  };
}

async function collectRepos() {
  const nodes = await paginate<any>(
    `query($org: String!, $cursor: String) {
      organization(login: $org) {
        repositories(first: 100, after: $cursor, privacy: PUBLIC, orderBy: { field: PUSHED_AT, direction: DESC }) {
          pageInfo { hasNextPage endCursor }
          nodes {
            name url description createdAt stargazerCount isArchived isFork hasDiscussionsEnabled
            defaultBranchRef { name }
          }
        }
      }
    }`,
    { org: ORG },
    (data) => data.organization.repositories,
  );
  return nodes.filter((repo) => !repo.isFork && !EXCLUDED_REPOS.has(repo.name));
}

// Repository activity ----------------------------------------------------------

async function collectCommits(repo: string, branch: string, events: ActivityEvent[]) {
  const commits = await paginate<any>(
    `query($org: String!, $repo: String!, $ref: String!, $cursor: String) {
      repository(owner: $org, name: $repo) {
        ref(qualifiedName: $ref) {
          target {
            ... on Commit {
              history(first: 100, after: $cursor) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  oid url messageHeadline committedDate
                  parents { totalCount }
                  author { user { ${ACTOR} } }
                }
              }
            }
          }
        }
      }
    }`,
    { org: ORG, repo, ref: `refs/heads/${branch}` },
    (data) => data.repository.ref?.target?.history,
  );
  for (const commit of commits) {
    // Merge commits are credited through the pull request events instead.
    if (commit.parents.totalCount > 1) continue;
    const actor = person(commit.author?.user);
    if (!actor) continue;
    events.push({
      type: "commit",
      repo,
      actor,
      at: commit.committedDate,
      title: commit.messageHeadline,
      url: commit.url,
      sha: commit.oid.slice(0, 7),
    });
  }
}

function pushComments(repo: string, parent: any, comments: any[], events: ActivityEvent[]) {
  for (const comment of comments) {
    const actor = person(comment.author);
    if (!actor) continue;
    events.push({
      type: "comment",
      repo,
      actor,
      at: comment.createdAt,
      title: parent.title,
      url: comment.url,
      number: parent.number,
    });
  }
}

async function collectPullRequests(repo: string, events: ActivityEvent[]) {
  const pulls = await paginate<any>(
    `query($org: String!, $repo: String!, $cursor: String) {
      repository(owner: $org, name: $repo) {
        pullRequests(first: 50, after: $cursor, orderBy: { field: CREATED_AT, direction: ASC }) {
          pageInfo { hasNextPage endCursor }
          nodes {
            number title url createdAt mergedAt additions deletions
            author { ${ACTOR} }
            reviews(first: 100) { nodes { url state submittedAt author { ${ACTOR} } } }
            comments(first: 100) { nodes { url createdAt author { ${ACTOR} } } }
          }
        }
      }
    }`,
    { org: ORG, repo },
    (data) => data.repository.pullRequests,
  );
  for (const pr of pulls) {
    const author = person(pr.author);
    const base = { repo, title: pr.title, number: pr.number };
    if (author) {
      events.push({ ...base, type: "pr_opened", actor: author, at: pr.createdAt, url: pr.url });
      if (pr.mergedAt) {
        events.push({
          ...base,
          type: "pr_merged",
          actor: author,
          at: pr.mergedAt,
          url: pr.url,
          additions: pr.additions,
          deletions: pr.deletions,
        });
      }
    }
    for (const review of pr.reviews.nodes) {
      const reviewer = person(review.author);
      // Authors replying inside their own review threads are not reviews.
      if (!reviewer || reviewer === author || !review.submittedAt || review.state === "PENDING") continue;
      events.push({ ...base, type: "review", actor: reviewer, at: review.submittedAt, url: review.url, state: review.state });
    }
    pushComments(repo, pr, pr.comments.nodes, events);
  }
}

/** Records issue activity, and open issues of active repositories in the backlog. */
async function collectIssues(repo: string, events: ActivityEvent[], backlog: BacklogIssue[] | null) {
  const issues = await paginate<any>(
    `query($org: String!, $repo: String!, $cursor: String) {
      repository(owner: $org, name: $repo) {
        issues(first: 100, after: $cursor, orderBy: { field: CREATED_AT, direction: ASC }) {
          pageInfo { hasNextPage endCursor }
          nodes {
            number title url createdAt state
            author { ${ACTOR} }
            comments(first: 100) { nodes { url createdAt author { ${ACTOR} } } }
            labels(first: 20) { nodes { name } }
            assignees(first: 10) { nodes { ${ACTOR} } }
            closedByPullRequestsReferences(first: 5) { nodes { number url state } }
            mergedFixes: closedByPullRequestsReferences(first: 10, includeClosedPrs: true) { nodes { number state } }
          }
        }
      }
    }`,
    { org: ORG, repo },
    (data) => data.repository.issues,
  );
  for (const issue of issues) {
    const author = person(issue.author);
    if (author) {
      const closedBy = issue.mergedFixes.nodes
        .filter((pr: { state: string }) => pr.state === "MERGED")
        .map((pr: { number: number }) => pr.number);
      events.push({
        type: "issue_opened",
        repo,
        actor: author,
        at: issue.createdAt,
        title: issue.title,
        url: issue.url,
        number: issue.number,
        ...(closedBy.length ? { closedBy } : {}),
      });
    }
    pushComments(repo, issue, issue.comments.nodes, events);
    if (backlog && issue.state === "OPEN") {
      backlog.push({
        repo,
        number: issue.number,
        title: issue.title,
        url: issue.url,
        createdAt: issue.createdAt,
        labels: issue.labels.nodes.map((label: { name: string }) => label.name),
        assignees: issue.assignees.nodes.map(person).filter(Boolean),
        pullRequests: issue.closedByPullRequestsReferences.nodes
          .filter((pr: { state: string }) => pr.state === "OPEN")
          .map((pr: { number: number; url: string }) => ({ number: pr.number, url: pr.url })),
      });
    }
  }
}

async function collectDiscussions(repo: string, events: ActivityEvent[]) {
  const discussions = await paginate<any>(
    `query($org: String!, $repo: String!, $cursor: String) {
      repository(owner: $org, name: $repo) {
        discussions(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            number title url createdAt
            category { name }
            author { ${ACTOR} }
            comments(first: 50) {
              nodes {
                url createdAt author { ${ACTOR} }
                replies(first: 50) { nodes { url createdAt author { ${ACTOR} } } }
              }
            }
          }
        }
      }
    }`,
    { org: ORG, repo },
    (data) => data.repository.discussions,
  );
  for (const discussion of discussions) {
    const base = { repo, title: discussion.title, number: discussion.number, category: discussion.category?.name };
    const author = person(discussion.author);
    if (author) events.push({ ...base, type: "discussion", actor: author, at: discussion.createdAt, url: discussion.url });
    const replies = discussion.comments.nodes.flatMap((c: any) => [c, ...c.replies.nodes]);
    for (const reply of replies) {
      const actor = person(reply.author);
      if (actor) events.push({ ...base, type: "discussion_comment", actor, at: reply.createdAt, url: reply.url });
    }
  }
}

// Main ---------------------------------------------------------------------------

console.log(`Collecting ${ORG}…`);
const { org, members, teams } = await collectOrg();
console.log(`  ${members.length} members, ${teams.length} teams`);

const repoNodes = await collectRepos();
const events: ActivityEvent[] = [];
const backlog: BacklogIssue[] = [];
const repos: Repo[] = [];

for (const [index, repo] of repoNodes.entries()) {
  const before = events.length;
  // Sequential on purpose: parallel heavy queries trigger GitHub 502s.
  if (repo.defaultBranchRef) await collectCommits(repo.name, repo.defaultBranchRef.name, events);
  await collectPullRequests(repo.name, events);
  // Archived repositories are read-only, so their open issues cannot be worked on.
  await collectIssues(repo.name, events, repo.isArchived ? null : backlog);
  if (repo.hasDiscussionsEnabled) await collectDiscussions(repo.name, events);
  // Imported repositories carry upstream history from before they joined the org.
  for (let i = events.length - 1; i >= before; i--) {
    if (events[i]!.at < repo.createdAt) events.splice(i, 1);
  }
  repos.push({
    name: repo.name,
    url: repo.url,
    description: repo.description || null,
    stars: repo.stargazerCount,
    archived: repo.isArchived,
  });
  console.log(`  [${index + 1}/${repoNodes.length}] ${repo.name}: ${events.length - before} events`);
}

events.sort((a, b) => b.at.localeCompare(a.at));

const referenced = new Set([
  ...members,
  ...teams.flatMap((team) => team.members),
  ...events.map((event) => event.actor),
  ...backlog.flatMap((issue) => issue.assignees),
]);
for (const login of Object.keys(people)) {
  if (!referenced.has(login)) delete people[login];
}

const data: LeaderboardData = {
  generatedAt: new Date().toISOString(),
  org,
  members,
  teams,
  people,
  repos,
  events,
  backlog,
};

await Bun.write(OUTPUT, JSON.stringify(data));
console.log(
  `Wrote ${events.length} events, ${backlog.length} open issues, and ${Object.keys(people).length} people to public/data.json`,
);
