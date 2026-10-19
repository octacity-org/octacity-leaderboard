import { createMemo, For, Show } from "solid-js";
import { fmt, monthLabel, monthName } from "../lib/format";
import {
  CATEGORIES,
  categoryStandings,
  countByType,
  inPeriod,
  teamStandings,
  type Category,
  type Standing,
} from "../lib/rank";
import type { EventType, LeaderboardData } from "../lib/types";
import { Avatar, leadOf, Member, personOf, profileHref, RoleTags } from "./Member";

const PODIUM_TITLES = ["1st place", "2nd place", "3rd place"];

/** Category boards always show this many rows so every board has the same height. */
const BOARD_SLOTS = 3;

const TOTALS: { label: string; types: EventType[] }[] = [
  { label: "Commits", types: ["commit"] },
  { label: "Merged PRs", types: ["pr_merged"] },
  { label: "Reviews", types: ["review"] },
  { label: "Issues opened", types: ["issue_opened"] },
  { label: "Discussion posts", types: ["discussion", "discussion_comment", "comment"] },
];

function breakdown(counts: Standing["counts"]) {
  const parts: [number, string, string][] = [
    [counts.commit, "commit", "commits"],
    [counts.pr_merged, "merged", "merged"],
    [counts.review, "review", "reviews"],
    [counts.issue_opened, "issue", "issues"],
    [counts.discussion + counts.discussion_comment + counts.comment, "post", "posts"],
  ];
  return parts.filter(([n]) => n > 0).map(([n, one, many]) => `${fmt(n)} ${n === 1 ? one : many}`);
}

export function Standings(props: {
  data: LeaderboardData;
  period: string;
  months: string[];
  /** Team slug that narrows the ranking table; null ranks every member. */
  team: string | null;
  onPeriod: (period: string) => void;
  onTeam: (team: string | null) => void;
}) {
  const events = createMemo(() => inPeriod(props.data.events, props.period));
  const overall = createMemo(() => categoryStandings(events(), props.data.members, "overall"));
  // Only the ranking table follows the team filter; podium, totals, and boards stay org-wide.
  const team = createMemo(() => props.data.teams.find((t) => t.slug === props.team) ?? null);
  const boardMembers = createMemo(() => team()?.members ?? props.data.members);
  const board = createMemo(() => (team() ? categoryStandings(events(), boardMembers(), "overall") : overall()));
  const inactive = createMemo(() => {
    const ranked = new Set(board().map((row) => row.login));
    return boardMembers().filter((login) => !ranked.has(login));
  });

  /** Previous month for the "vs" comparison; none for all-time or the first month. */
  const previous = createMemo(() => {
    if (props.period === "all") return null;
    return props.months[props.months.indexOf(props.period) + 1] ?? null;
  });
  const totals = createMemo(() => {
    const members = new Set(props.data.members);
    const tally = (period: string) => {
      const own = inPeriod(props.data.events, period).filter((e) => members.has(e.actor));
      const counts = countByType(own);
      return [...TOTALS.map((t) => t.types.reduce((sum, type) => sum + counts[type], 0)), new Set(own.map((e) => e.actor)).size];
    };
    const now = tally(props.period);
    const before = previous() ? tally(previous()!) : null;
    return [...TOTALS.map((t) => t.label), "Active members"].map((label, i) => ({
      label,
      value: now[i]!,
      delta: before ? now[i]! - before[i]! : null,
    }));
  });

  return (
    <div class="standings">
      <Podium data={props.data} rows={overall().slice(0, 3)} />

      <section class="totals" aria-label="Period totals">
        <For each={totals()}>
          {(total) => (
            <div class="total">
              <span class="total-value">{fmt(total.value)}</span>
              <span class="total-label">{total.label}</span>
              <Show when={total.delta !== null}>
                <span class={["delta", { up: total.delta! > 0, down: total.delta! < 0 }]}>
                  {total.delta! > 0 ? "+" : ""}
                  {total.delta === 0 ? "even" : fmt(total.delta!)} vs {monthName(previous()!).slice(0, 3)}
                </span>
              </Show>
            </div>
          )}
        </For>
      </section>

      <section class="panel board" aria-labelledby="board-title">
        <header class="panel-head">
          <h2 id="board-title">Overall ranking</h2>
          <p>{team() ? `${team()!.name} members` : "Every member"} ranked by weighted score.</p>
          <div class="chips board-teams" role="group" aria-label="Team">
            <button
              type="button"
              class={["chip", { on: !team() }]}
              aria-pressed={!team() ? "true" : "false"}
              onClick={() => props.onTeam(null)}
            >
              All
            </button>
            <For each={props.data.teams}>
              {(t) => (
                <button
                  type="button"
                  class={["chip", { on: team()?.slug === t.slug }]}
                  aria-pressed={team()?.slug === t.slug ? "true" : "false"}
                  onClick={() => props.onTeam(t.slug)}
                >
                  {t.name}
                </button>
              )}
            </For>
          </div>
        </header>
        <Show when={board().length} fallback={<p class="calm">No {team() ? `${team()!.name} ` : "member "}activity {props.period === "all" ? "yet" : `in ${monthName(props.period)}`}.</p>}>
          <table class="ledger">
            <thead>
              <tr>
                <th scope="col" class="num">#</th>
                <th scope="col">Member</th>
                <th scope="col" class="num wide">Commits</th>
                <th scope="col" class="num wide">Merged</th>
                <th scope="col" class="num wide">Reviews</th>
                <th scope="col" class="num wide">Issues</th>
                <th scope="col" class="num wide">Posts</th>
                <th scope="col" class="num">Score</th>
              </tr>
            </thead>
            <tbody>
              <For each={board()}>
                {(row) => (
                  <tr class={{ [`medal-${row.rank}`]: row.rank <= 3 }}>
                    <td class="num rank">{row.rank}</td>
                    <td>
                      <Member person={personOf(props.data, row.login)} />
                    </td>
                    <td class="num wide">{fmt(row.counts.commit)}</td>
                    <td class="num wide">{fmt(row.counts.pr_merged)}</td>
                    <td class="num wide">{fmt(row.counts.review)}</td>
                    <td class="num wide">{fmt(row.counts.issue_opened)}</td>
                    <td class="num wide">{fmt(row.counts.discussion + row.counts.discussion_comment + row.counts.comment)}</td>
                    <td class="num score">{fmt(row.value)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
        <Show when={inactive().length}>
          <div class="ashore">
            <span>No activity {props.period === "all" ? "yet" : "this month"} · {inactive().length}</span>
            <div class="ashore-list">
              <For each={inactive()}>
                {(login) => (
                  <a href={profileHref(login)} title={`@${login}`}>
                    <Avatar person={personOf(props.data, login)} size={26} />
                  </a>
                )}
              </For>
            </div>
          </div>
        </Show>
      </section>

      <Teams data={props.data} events={events()} />

      <section class="categories" aria-label="Category boards">
        <For each={CATEGORIES.filter((c) => c.id !== "overall")}>
          {(category) => <CategoryBoard data={props.data} category={category} rows={categoryStandings(events(), props.data.members, category.id)} />}
        </For>
      </section>

      <Roll data={props.data} months={props.months} current={props.period} onPeriod={props.onPeriod} />

      <p class="weights">
        Score: commit 2 · PR opened 3 · PR merged 6 · review 5 (once per PR) · issue 3 · discussion 4 · reply 2 · comment 1.
        Only organization members are ranked.
      </p>
    </div>
  );
}

function Podium(props: { data: LeaderboardData; rows: Standing[] }) {
  return (
    <section class="podium" aria-label="Top three">
      <For each={[0, 1, 2]}>
        {(place) => (
          <Show
            when={props.rows[place]}
            fallback={
              <article class={["berth", "open", `place-${place + 1}`]}>
                <span class="numeral">{place + 1}</span>
                <p class="berth-title">{PODIUM_TITLES[place]}</p>
                <p class="open-text">No one yet</p>
              </article>
            }
          >
            {(row) => (
              <article class={["berth", `place-${place + 1}`]}>
                <span class="numeral" aria-hidden="true">{place + 1}</span>
                <Avatar person={personOf(props.data, row().login)} size={place === 0 ? 112 : 64} class="berth-avatar" />
                <div class="berth-body">
                  <p class="berth-title">{PODIUM_TITLES[place]}{row().rank !== place + 1 ? " (tied)" : ""}</p>
                  <a class="berth-name" href={profileHref(row().login)}>
                    {personOf(props.data, row().login).name ?? row().login}
                  </a>
                  <p class="berth-login">
                    @{row().login}
                    <RoleTags data={props.data} login={row().login} />
                  </p>
                  <p class="berth-score">
                    <strong>{fmt(row().value)}</strong> pts
                  </p>
                  <p class="berth-breakdown">{breakdown(row().counts).join(" · ")}</p>
                </div>
              </article>
            )}
          </Show>
        )}
      </For>
    </section>
  );
}

function Teams(props: { data: LeaderboardData; events: LeaderboardData["events"] }) {
  const rows = createMemo(() => teamStandings(props.events, props.data.teams));
  return (
    <section class="panel teams" aria-labelledby="teams-title">
      <header class="panel-head">
        <h2 id="teams-title">Teams</h2>
        <p>Teams ranked by the summed score of their members.</p>
      </header>
      <Show when={rows().length} fallback={<p class="calm">No teams are visible to the collector.</p>}>
        <table class="ledger">
          <thead>
            <tr>
              <th scope="col" class="num">#</th>
              <th scope="col">Team</th>
              <th scope="col" class="wide">Lead</th>
              <th scope="col" class="wide">Top scorer</th>
              <th scope="col" class="num">Active</th>
              <th scope="col" class="num wide">Commits</th>
              <th scope="col" class="num wide">Merged</th>
              <th scope="col" class="num wide">Reviews</th>
              <th scope="col" class="num wide">Issues</th>
              <th scope="col" class="num wide">Posts</th>
              <th scope="col" class="num">Score</th>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(row) => (
                <tr class={{ [`medal-${row.rank}`]: row.rank <= 3 && row.score > 0 }}>
                  <td class="num rank">{row.rank}</td>
                  <td>
                    <a class="team-row-name" href={row.team.url} target="_blank" rel="noreferrer">
                      {row.team.name}
                    </a>
                    <div class="stack">
                      <For each={row.team.members}>
                        {(login) => <Avatar person={personOf(props.data, login)} size={22} />}
                      </For>
                    </div>
                  </td>
                  <td class="wide">
                    <Show when={leadOf(row.team)} fallback={<span class="dim">—</span>}>
                      {(lead) => <Member person={personOf(props.data, lead())} size={24} />}
                    </Show>
                  </td>
                  <td class="wide">
                    <Show when={row.top} fallback={<span class="dim">—</span>}>
                      {(top) => <Member person={personOf(props.data, top())} size={24} />}
                    </Show>
                  </td>
                  <td class="num">
                    {row.active}/{row.team.members.length}
                  </td>
                  <td class="num wide">{fmt(row.counts.commit)}</td>
                  <td class="num wide">{fmt(row.counts.pr_merged)}</td>
                  <td class="num wide">{fmt(row.counts.review)}</td>
                  <td class="num wide">{fmt(row.counts.issue_opened)}</td>
                  <td class="num wide">{fmt(row.counts.discussion + row.counts.discussion_comment + row.counts.comment)}</td>
                  <td class="num score">{fmt(row.score)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </section>
  );
}

function CategoryBoard(props: { data: LeaderboardData; category: Category; rows: Standing[] }) {
  const max = createMemo(() => Math.max(1, ...props.rows.map((row) => row.value)));
  return (
    <article class="panel category">
      <header class="panel-head">
        <h3>{props.category.label}</h3>
        <p>{props.category.description}</p>
      </header>
      <ol class="mini">
        <For each={Array.from({ length: BOARD_SLOTS }, (_, slot) => slot)}>
          {(slot) => (
            <Show
              when={props.rows[slot]}
              fallback={
                <li class="empty">
                  <span class="mini-rank">{slot + 1}</span>
                  <span class="dim">—</span>
                </li>
              }
            >
              {(row) => (
                <li class={{ [`medal-${row().rank}`]: row().rank <= 3 }}>
                  <span class="mini-rank">{row().rank}</span>
                  <Member person={personOf(props.data, row().login)} size={24} />
                  <span class="mini-value">
                    {fmt(row().value)}
                    <span class="bar" aria-hidden="true">
                      <span style={{ width: `${(row().value / max()) * 100}%` }} />
                    </span>
                  </span>
                </li>
              )}
            </Show>
          )}
        </For>
      </ol>
    </article>
  );
}

/** Month-by-month winners of every category. */
function Roll(props: { data: LeaderboardData; months: string[]; current: string; onPeriod: (period: string) => void }) {
  const rows = createMemo(() =>
    props.months.map((month) => {
      const events = inPeriod(props.data.events, month);
      return {
        month,
        winners: CATEGORIES.map((category) => categoryStandings(events, props.data.members, category.id).filter((row) => row.rank === 1)),
      };
    }),
  );
  return (
    <section class="panel roll" aria-labelledby="roll-title">
      <header class="panel-head">
        <h2 id="roll-title">Monthly leaders</h2>
        <p>The leader of every board, month by month. Select a month to open its standings.</p>
      </header>
      <div class="roll-scroll">
        <table class="ledger roll-table">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <For each={CATEGORIES}>{(category) => <th scope="col">{category.label}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(row) => (
                <tr class={{ current: row.month === props.current }}>
                  <th scope="row">
                    <button type="button" class="link" onClick={() => props.onPeriod(row.month)}>
                      {monthLabel(row.month, "short")}
                    </button>
                  </th>
                  <For each={row.winners}>
                    {(winners) => (
                      <td>
                        <Show when={winners[0]} fallback={<span class="dim">—</span>}>
                          {(winner) => (
                            <a class="roll-winner" href={profileHref(winner().login)} title={`${fmt(winner().value)}`}>
                              <Avatar person={personOf(props.data, winner().login)} size={20} />
                              {winner().login}
                              <Show when={winners.length > 1}>
                                <span class="dim"> +{winners.length - 1}</span>
                              </Show>
                            </a>
                          )}
                        </Show>
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}
