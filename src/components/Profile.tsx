import { createMemo, For, Show } from "solid-js";
import { bonusesFor } from "../lib/bonus";
import { dayLabel, EVENT_META, fmt, monthName } from "../lib/format";
import { calendarWeeks, dailyCounts, streakMilestones } from "../lib/profile";
import { categoryStandings, countByType, inPeriod, type Standing } from "../lib/rank";
import type { LeaderboardData } from "../lib/types";
import { Avatar, personOf, RoleTags } from "./Member";

const CALENDAR_WEEKS = 53;
const RECENT = 12;
const TOP_REPOS = 8;

/** Contribution counts at which a calendar day gets darker. */
const level = (count: number) => (count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 7 ? 3 : 4);

export function Profile(props: { data: LeaderboardData; login: string; month: string }) {
  return (
    <Show
      when={props.data.members.includes(props.login)}
      fallback={
        <section class="profile">
          <p class="calm log-empty">
            @{props.login} is not an Octacity member, so there is no profile.{" "}
            <a class="link" href={`https://github.com/${props.login}`} target="_blank" rel="noreferrer">
              Open on GitHub
            </a>
          </p>
        </section>
      }
    >
      <ProfileBody data={props.data} login={props.login} month={props.month} />
    </Show>
  );
}

function ProfileBody(props: { data: LeaderboardData; login: string; month: string }) {
  const person = () => personOf(props.data, props.login);
  // Events are stored newest first.
  const own = createMemo(() => props.data.events.filter((event) => event.actor === props.login));
  const counts = createMemo(() => countByType(own()));
  const allTime = createMemo(() => categoryStandings(props.data.events, props.data.members, "overall", bonusesFor(props.data)));
  const thisMonth = createMemo(() =>
    categoryStandings(
      inPeriod(props.data.events, props.month),
      props.data.members,
      "overall",
      inPeriod(bonusesFor(props.data), props.month),
    ),
  );
  const days = createMemo(() => dailyCounts(own()));
  const repos = createMemo(() => {
    const tally = new Map<string, number>();
    for (const event of own()) tally.set(event.repo, (tally.get(event.repo) ?? 0) + 1);
    return [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  });

  const stats = () => [
    { label: "Active days", value: days().size },
    { label: "Longest weekly streak", value: streakMilestones(own()).length },
    { label: "Commits", value: counts().commit },
    { label: "Merged PRs", value: counts().pr_merged },
    { label: "Reviews", value: counts().review },
    { label: "Repositories", value: repos().length },
  ];

  return (
    <article class="profile">
      <a class="profile-back link" href="#/members">
        ‹ All members
      </a>

      <header class="profile-hero">
        <Avatar person={person()} size={128} class="profile-avatar" />
        <div class="profile-id">
          <p class="eyebrow">Member profile</p>
          <h1>{person().name ?? props.login}</h1>
          <p class="member-login">
            @{props.login}
            <RoleTags data={props.data} login={props.login} />
          </p>
          <a class="profile-github" href={person().url} target="_blank" rel="noreferrer">
            GitHub profile ↗
          </a>
        </div>
        <dl class="profile-scores">
          <Score label="All-time" rows={allTime()} login={props.login} />
          <Score label={monthName(props.month)} rows={thisMonth()} login={props.login} />
        </dl>
      </header>

      <section class="totals" aria-label="Contribution totals">
        <For each={stats()}>
          {(stat) => (
            <div class="total">
              <span class="total-value">{fmt(stat.value)}</span>
              <span class="total-label">{stat.label}</span>
            </div>
          )}
        </For>
      </section>

      <Calendar days={days()} />

      <div class="profile-columns">
        <section class="panel profile-recent" aria-labelledby="recent-title">
          <header class="panel-head">
            <h2 id="recent-title">Recent activity</h2>
            <p>The latest {Math.min(RECENT, own().length)} of {fmt(own().length)} entries.</p>
          </header>
          <Show when={own().length} fallback={<p class="calm">No public activity yet.</p>}>
            <ol>
              <For each={own().slice(0, RECENT)}>
                {(entry) => (
                  <li class="entry">
                    <time datetime={entry.at}>{dayLabel(entry.at)}</time>
                    <span class={["kind", `tone-${EVENT_META[entry.type].tone}`]}>{EVENT_META[entry.type].label}</span>
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
          </Show>
        </section>

        <section class="panel profile-repos" aria-labelledby="repos-title">
          <header class="panel-head">
            <h2 id="repos-title">Repositories</h2>
            <p>
              {repos().length > TOP_REPOS
                ? `Top ${TOP_REPOS} of ${repos().length} by contributions.`
                : "Where their contributions went."}
            </p>
          </header>
          <Show when={repos().length} fallback={<p class="calm">None yet.</p>}>
            <ol class="mini">
              <For each={repos().slice(0, TOP_REPOS)}>
                {([name, count]) => (
                  <li>
                    <a class="repo-name" href={`${props.data.org.url}/${name}`} target="_blank" rel="noreferrer">
                      {name}
                    </a>
                    <span class="mini-value">
                      {fmt(count)}
                      <span class="bar" aria-hidden="true">
                        <span style={{ width: `${(count / repos()[0]![1]) * 100}%` }} />
                      </span>
                    </span>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </section>
      </div>
    </article>
  );
}

function Score(props: { label: string; rows: Standing[]; login: string }) {
  const row = () => props.rows.find((r) => r.login === props.login);
  return (
    <div>
      <dt>{props.label}</dt>
      <dd class="profile-points">
        <strong>{fmt(row()?.value ?? 0)}</strong> pts
      </dd>
      <dd class="profile-rank">{row() ? `#${row()!.rank} of ${props.rows.length} ranked` : "Not ranked"}</dd>
    </div>
  );
}

function Calendar(props: { days: Map<string, number> }) {
  const today = new Date().toISOString().slice(0, 10);
  const weeks = calendarWeeks(new Date(), CALENDAR_WEEKS);
  const total = createMemo(() =>
    weeks.flat().reduce((sum, day) => sum + (props.days.get(day) ?? 0), 0),
  );
  // A month is labelled above the first week that contains its 1st.
  const months = weeks.flatMap((week, index) => {
    const first = week.find((day) => day.endsWith("-01"));
    return first ? [{ index, label: monthName(first.slice(0, 7)).slice(0, 3) }] : [];
  });

  return (
    <section class="panel calendar" aria-labelledby="calendar-title">
      <header class="panel-head">
        <h2 id="calendar-title">Activity calendar</h2>
        <p>{fmt(total())} contributions in the last year, by UTC day.</p>
      </header>
      <div class="cal-scroll">
        <div class="cal" style={{ "--weeks": CALENDAR_WEEKS }}>
          <For each={months}>
            {(month) => (
              <span class="cal-month" style={{ "grid-column": month.index + 2 }}>
                {month.label}
              </span>
            )}
          </For>
          <span class="cal-weekday" style={{ "grid-row": 3 }}>Mon</span>
          <span class="cal-weekday" style={{ "grid-row": 5 }}>Wed</span>
          <span class="cal-weekday" style={{ "grid-row": 7 }}>Fri</span>
          <For each={weeks}>
            {(week, index) => (
              <For each={week}>
                {(day, weekday) => (
                  <span
                    class={["cal-day", `level-${level(props.days.get(day) ?? 0)}`, { future: day > today }]}
                    style={{ "grid-column": index() + 2, "grid-row": weekday() + 2 }}
                    title={`${fmt(props.days.get(day) ?? 0)} on ${dayLabel(`${day}T12:00:00Z`)}`}
                  />
                )}
              </For>
            )}
          </For>
        </div>
      </div>
      <p class="cal-legend">
        Less
        <For each={[0, 1, 2, 3, 4]}>{(n) => <span class={["cal-day", `level-${n}`]} />}</For>
        More
      </p>
    </section>
  );
}
