import { createMemo, createSignal, For, Show } from "solid-js";
import { bonusesFor } from "../lib/bonus";
import { dayLabel, fmt } from "../lib/format";
import { inPeriod, scoreOf } from "../lib/rank";
import type { ActivityEvent, LeaderboardData } from "../lib/types";
import { Avatar, leadOf, Member, membersOf, ORG_LEAD, personOf, profileHref, RoleTags, teamsOf } from "./Member";

/** Roster cards per carousel page. */
const ROSTER_PAGE = 15;

interface CrewRow {
  login: string;
  score: number;
  allTime: number;
  last: string | null;
}

export function Crew(props: { data: LeaderboardData; period: string }) {
  const rows = createMemo(() => {
    const byActor = new Map<string, ActivityEvent[]>();
    for (const event of props.data.events) {
      const list = byActor.get(event.actor);
      if (list) list.push(event);
      else byActor.set(event.actor, [event]);
    }
    const bonuses = bonusesFor(props.data);
    return props.data.members
      .map((login): CrewRow => {
        const own = byActor.get(login) ?? [];
        const ownBonuses = bonuses.filter((bonus) => bonus.actor === login);
        return {
          login,
          score: scoreOf(inPeriod(own, props.period), inPeriod(ownBonuses, props.period)),
          allTime: scoreOf(own, ownBonuses),
          // Events are stored newest first.
          last: own[0]?.at ?? null,
        };
      })
      .sort((a, b) => b.allTime - a.allTime || a.login.localeCompare(b.login));
  });
  const byLogin = createMemo(() => new Map(rows().map((row) => [row.login, row])));
  const pages = createMemo(() =>
    Array.from({ length: Math.ceil(rows().length / ROSTER_PAGE) }, (_, i) => rows().slice(i * ROSTER_PAGE, (i + 1) * ROSTER_PAGE)),
  );
  const [page, setPage] = createSignal(0);
  let track: HTMLDivElement | undefined;
  const goTo = (index: number) => track?.scrollTo({ left: index * track.clientWidth });
  // The organization lead is not on a team, so is not "unassigned".
  const unassigned = createMemo(() => rows().filter((row) => row.login !== ORG_LEAD && !teamsOf(props.data, row.login).length));

  return (
    <div class="crew-view">
      <section aria-labelledby="teams-heading">
        <header class="section-head">
          <h2 id="teams-heading">Teams</h2>
        </header>
        <div class="team-grid">
          <For each={props.data.teams}>
            {(team) => (
              <article class="panel team-card">
                <header>
                  <div>
                    <a class="team-name" href={team.url} target="_blank" rel="noreferrer">
                      {team.name}
                    </a>
                    <p>
                      {team.members.length} {team.members.length === 1 ? "member" : "members"}
                    </p>
                  </div>
                  <span class="points-label">Points</span>
                </header>
                <ul>
                  <For each={membersOf(team)}>
                    {(login) => (
                      <li>
                        <Member person={personOf(props.data, login)} size={26} />
                        <Show when={leadOf(team) === login}>
                          <span class="team-tag lead">Lead</span>
                        </Show>
                        <span class="crew-score">{fmt(byLogin().get(login)?.score ?? 0)}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </article>
            )}
          </For>
          <Show when={unassigned().length}>
            <article class="panel team-card unassigned">
              <header>
                <div>
                  <span class="team-name">Unassigned</span>
                  <p>Members not on a team yet.</p>
                </div>
                <span class="points-label">Points</span>
              </header>
              <ul>
                <For each={unassigned()}>
                  {(row) => (
                    <li>
                      <Member person={personOf(props.data, row.login)} size={26} />
                      <span class="crew-score">{fmt(row.score)}</span>
                    </li>
                  )}
                </For>
              </ul>
            </article>
          </Show>
        </div>
      </section>

      <section aria-labelledby="roster-heading">
        <header class="section-head roster-head">
          <div>
            <h2 id="roster-heading">Roster</h2>
            <p>All {props.data.members.length} members, ordered by all-time score.</p>
          </div>
          <Show when={pages().length > 1}>
            <div class="helm roster-nav">
              <button type="button" onClick={() => goTo(page() - 1)} disabled={page() === 0} aria-label="Previous page">
                ‹
              </button>
              <For each={pages()}>
                {(_, index) => (
                  <button
                    type="button"
                    class={["dot", { active: page() === index() }]}
                    onClick={() => goTo(index())}
                    aria-label={`Page ${index() + 1}`}
                    aria-current={page() === index() ? "true" : undefined}
                  />
                )}
              </For>
              <button
                type="button"
                onClick={() => goTo(page() + 1)}
                disabled={page() === pages().length - 1}
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          </Show>
        </header>
        <div
          class="roster"
          ref={(el) => (track = el)}
          onScroll={(event) => setPage(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}
        >
          <For each={pages()}>
            {(cards) => (
              <div class="roster-page">
                <For each={cards}>
                  {(row) => (
                    <a class="panel roster-card" href={profileHref(row.login)}>
                      <Avatar person={personOf(props.data, row.login)} size={48} />
                      <div>
                        <p class="member-name">{personOf(props.data, row.login).name ?? row.login}</p>
                        <p class="member-login">
                          @{row.login}
                          <RoleTags data={props.data} login={row.login} />
                        </p>
                        <p class="roster-stats">
                          <strong>{fmt(row.allTime)}</strong> pts all-time
                          <Show when={row.last} fallback={<> · no activity yet</>}>
                            {(last) => <> · last seen {dayLabel(last())}</>}
                          </Show>
                        </p>
                      </div>
                    </a>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
