import { createMemo, For, Match, Show, Switch } from "solid-js";
import { BACKLOG_GROUPS, backlogGroups, issueStatus } from "../lib/backlog";
import { ago, dayLabel, fmt } from "../lib/format";
import type { BacklogIssue, LeaderboardData } from "../lib/types";
import { Avatar, personOf } from "./Member";

export function Backlog(props: { data: LeaderboardData }) {
  const groups = createMemo(() => backlogGroups(props.data.backlog));

  return (
    <section class="backlog" aria-labelledby="backlog-title">
      <header class="log-head">
        <div>
          <h2 id="backlog-title">Backlog</h2>
          <p>
            {fmt(props.data.backlog.length)} open issues across public repositories. To take one, comment on it and ask
            to be assigned.
          </p>
        </div>
      </header>

      <For each={BACKLOG_GROUPS}>
        {(group) => (
          <section class="backlog-group" aria-labelledby={`backlog-${group.id}`}>
            <h3 id={`backlog-${group.id}`}>
              {group.label}
              <span>{fmt(groups()[group.id].length)}</span>
            </h3>
            <p class="backlog-note">{group.description}</p>
            <Show when={groups()[group.id].length} fallback={<p class="calm log-empty">No open issues.</p>}>
              <ol>
                <For each={groups()[group.id]}>{(issue) => <IssueRow data={props.data} issue={issue} />}</For>
              </ol>
            </Show>
          </section>
        )}
      </For>
    </section>
  );
}

function IssueRow(props: { data: LeaderboardData; issue: BacklogIssue }) {
  const status = () => issueStatus(props.issue);

  return (
    <li>
      <a class="issue" href={props.issue.url} target="_blank" rel="noreferrer">
        <span class="issue-where">
          {props.issue.repo} #{props.issue.number}
        </span>
        <span class="issue-main">
          <span class="issue-title">{props.issue.title}</span>
          <Show when={props.issue.labels.length}>
            <span class="issue-labels">
              <For each={props.issue.labels}>{(label) => <span class="issue-label">{label}</span>}</For>
            </span>
          </Show>
        </span>
        <span class={["kind", `status-${status()}`]}>
          <Switch>
            <Match when={status() === "review"}>In review · PR #{props.issue.pullRequests[0]!.number}</Match>
            <Match when={status() === "claimed"}>
              <span class="who">
                <Avatar person={personOf(props.data, props.issue.assignees[0]!)} size={18} />
                {props.issue.assignees[0]}
                <Show when={props.issue.assignees.length > 1}> +{props.issue.assignees.length - 1}</Show>
              </span>
            </Match>
            <Match when={status() === "open"}>Unclaimed</Match>
          </Switch>
        </span>
        <time datetime={props.issue.createdAt} title={dayLabel(props.issue.createdAt)}>
          {ago(props.issue.createdAt)}
        </time>
      </a>
    </li>
  );
}
