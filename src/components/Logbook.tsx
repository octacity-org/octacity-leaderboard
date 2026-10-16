import { createMemo, createSignal, For, Show } from "solid-js";
import { dayLabel, EVENT_META, fmt, monthLabel, timeLabel } from "../lib/format";
import { inPeriod } from "../lib/rank";
import type { ActivityEvent, EventType, LeaderboardData } from "../lib/types";
import { Avatar, personOf } from "./Member";

const FILTERS: { id: string; label: string; types: EventType[] }[] = [
  { id: "commits", label: "Commits", types: ["commit"] },
  { id: "prs", label: "Pull requests", types: ["pr_opened", "pr_merged"] },
  { id: "reviews", label: "Reviews", types: ["review"] },
  { id: "issues", label: "Issues", types: ["issue_opened"] },
  { id: "talk", label: "Discussions & comments", types: ["discussion", "discussion_comment", "comment"] },
];

const PAGE = 80;

export function Logbook(props: { data: LeaderboardData; period: string }) {
  const [filter, setFilter] = createSignal<string | null>(null);
  const [repo, setRepo] = createSignal("");
  const [query, setQuery] = createSignal("");
  const [limit, setLimit] = createSignal(PAGE);
  const members = createMemo(() => new Set(props.data.members));

  const periodEvents = createMemo(() => inPeriod(props.data.events, props.period));
  const counts = createMemo(() =>
    Object.fromEntries(FILTERS.map((f) => [f.id, periodEvents().filter((e) => f.types.includes(e.type)).length])),
  );
  const repos = createMemo(() => [...new Set(periodEvents().map((e) => e.repo))].sort((a, b) => a.localeCompare(b)));

  const matches = createMemo(() => {
    const types = FILTERS.find((f) => f.id === filter())?.types;
    const needle = query().trim().toLowerCase();
    return periodEvents().filter(
      (e) =>
        (!types || types.includes(e.type)) &&
        (!repo() || e.repo === repo()) &&
        (!needle ||
          e.actor.toLowerCase().includes(needle) ||
          e.title.toLowerCase().includes(needle) ||
          (personOf(props.data, e.actor).name ?? "").toLowerCase().includes(needle)),
    );
  });

  /** Visible entries grouped by calendar day (local time), newest first. */
  const days = createMemo(() => {
    const groups: { day: string; entries: ActivityEvent[] }[] = [];
    for (const entry of matches().slice(0, limit())) {
      const day = dayLabel(entry.at);
      const last = groups[groups.length - 1];
      if (last?.day === day) last.entries.push(entry);
      else groups.push({ day, entries: [entry] });
    }
    return groups;
  });

  const choose = (id: string | null) => {
    setFilter(id);
    setLimit(PAGE);
  };

  return (
    <section class="logbook" aria-labelledby="log-title">
      <header class="log-head">
        <div>
          <h2 id="log-title">Activity</h2>
          <p>
            {fmt(matches().length)} of {fmt(periodEvents().length)} entries · {monthLabel(props.period)}
          </p>
        </div>
        <div class="log-tools">
          <input
            type="search"
            placeholder="Search people or titles"
            aria-label="Search activity"
            value={query()}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setLimit(PAGE);
            }}
          />
          <select
            aria-label="Repository"
            onChange={(event) => {
              setRepo(event.currentTarget.value);
              setLimit(PAGE);
            }}
          >
            <option value="" selected={repo() === ""}>
              All repositories
            </option>
            <For each={repos()}>
              {(name) => (
                <option value={name} selected={repo() === name}>
                  {name}
                </option>
              )}
            </For>
          </select>
        </div>
      </header>

      <div class="chips" role="group" aria-label="Entry type">
        <button type="button" class={["chip", { on: filter() === null }]} aria-pressed={filter() === null ? "true" : "false"} onClick={() => choose(null)}>
          Everything <span>{fmt(periodEvents().length)}</span>
        </button>
        <For each={FILTERS}>
          {(f) => (
            <button
              type="button"
              class={["chip", { on: filter() === f.id }]}
              aria-pressed={filter() === f.id ? "true" : "false"}
              onClick={() => choose(filter() === f.id ? null : f.id)}
            >
              {f.label} <span>{fmt(counts()[f.id] ?? 0)}</span>
            </button>
          )}
        </For>
      </div>

      <Show when={days().length} fallback={<p class="calm log-empty">No entries match these filters.</p>}>
        <For each={days()}>
          {(group) => (
            <section class="day">
              <h3>
                {group.day}
                <span>{group.entries.length}</span>
              </h3>
              <ol>
                <For each={group.entries}>
                  {(entry) => (
                    <li class="entry">
                      <time datetime={entry.at}>{timeLabel(entry.at)}</time>
                      <span class={["kind", `tone-${EVENT_META[entry.type].tone}`]}>
                        {EVENT_META[entry.type].label}
                        <Show when={entry.state && entry.state !== "COMMENTED"}>
                          {" "}
                          · {entry.state!.toLowerCase().replace("_", " ")}
                        </Show>
                      </span>
                      <span class="who">
                        <Avatar person={personOf(props.data, entry.actor)} size={20} />
                        {entry.actor}
                        <Show when={!members().has(entry.actor)}>
                          <span class="guest">guest</span>
                        </Show>
                      </span>
                      <a class="what" href={entry.url} target="_blank" rel="noreferrer">
                        {entry.title}
                      </a>
                      <span class="where">
                        {entry.repo}
                        {entry.sha ? ` · ${entry.sha}` : entry.number ? ` #${entry.number}` : ""}
                      </span>
                    </li>
                  )}
                </For>
              </ol>
            </section>
          )}
        </For>
        <Show when={matches().length > limit()}>
          <button type="button" class="more" onClick={() => setLimit(limit() + PAGE)}>
            Show {fmt(Math.min(PAGE, matches().length - limit()))} more of {fmt(matches().length - limit())} remaining
          </button>
        </Show>
      </Show>
    </section>
  );
}
