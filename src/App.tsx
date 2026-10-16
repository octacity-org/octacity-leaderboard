import { createMemo, createSignal, Errored, For, Loading, Match, onSettled, Switch } from "solid-js";
import { Crew } from "./components/Crew";
import { Logbook } from "./components/Logbook";
import { Standings } from "./components/Standings";
import { Wheel } from "./components/Wheel";
import { ago, monthLabel } from "./lib/format";
import { availableMonths } from "./lib/rank";
import type { LeaderboardData } from "./lib/types";

type Tab = "standings" | "activity" | "members";
const TABS: { id: Tab; label: string }[] = [
  { id: "standings", label: "Standings" },
  { id: "activity", label: "Activity" },
  { id: "members", label: "Members" },
];

/** Routes look like `#/activity/2026-10` or `#/standings/all`. */
function parseHash(): { tab: Tab; period: string | null } {
  const [, tab, period] = location.hash.split("/");
  return {
    tab: TABS.some((t) => t.id === tab) ? (tab as Tab) : "standings",
    period: period && /^(all|\d{4}-\d{2})$/.test(period) ? period : null,
  };
}

export function App() {
  const data = createMemo(async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}data.json`);
    if (!response.ok) throw new Error(`Could not load data.json (${response.status})`);
    return (await response.json()) as LeaderboardData;
  });

  return (
    <Errored
      fallback={(error) => (
        <div class="splash">
          <Wheel turn={0} class="splash-wheel" />
          <p>Could not load data: {String(error())}</p>
        </div>
      )}
    >
      <Loading
        fallback={
          <div class="splash">
            <Wheel turn={0} class="splash-wheel spinning" />
            <p>Loading…</p>
          </div>
        }
      >
        <Main data={data()} />
      </Loading>
    </Errored>
  );
}

function Main(props: { data: LeaderboardData }) {
  const [route, setRoute] = createSignal(parseHash());
  onSettled(() => {
    const sync = () => setRoute(parseHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  });

  const months = createMemo(() => availableMonths(props.data.events));
  const periods = createMemo(() => [...months(), "all"]);
  const period = createMemo(() => {
    const requested = route().period;
    return requested && periods().includes(requested) ? requested : months()[0]!;
  });
  const periodIndex = createMemo(() => periods().indexOf(period()));

  const go = (tab: Tab, next = period()) => {
    location.hash = `#/${tab}/${next}`;
  };
  const step = (delta: number) => {
    const next = periods()[periodIndex() + delta];
    if (next) go(route().tab, next);
  };

  return (
    <div class="page">
      <Wheel turn={-periodIndex()} class="voyage-wheel" />
      <div class="shell">
        <header class="topbar">
          <a class="brand" href="#/standings">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width="36" height="36" />
            <span>
              <strong>Octacity</strong>
              <em>Leaderboard</em>
            </span>
          </a>
          <nav class="tabs" aria-label="Sections">
            {TABS.map((tab) => (
              <a
                href={`#/${tab.id}/${period()}`}
                class={{ active: route().tab === tab.id }}
                aria-current={route().tab === tab.id ? "page" : undefined}
              >
                {tab.label}
              </a>
            ))}
          </nav>
          <p class="updated" title={new Date(props.data.generatedAt).toUTCString()}>
            Updated {ago(props.data.generatedAt)}
          </p>
        </header>

        <section class="voyage" aria-label="Period">
          <div class="voyage-text">
            <p class="eyebrow">{period() === "all" ? "All-time standings" : "Monthly standings"}</p>
            <h1>{monthLabel(period())}</h1>
            <div class="helm">
              <button type="button" onClick={() => step(-1)} disabled={periodIndex() === 0} aria-label="Newer period">
                ‹
              </button>
              <select aria-label="Choose a month" onChange={(event) => go(route().tab, event.currentTarget.value)}>
                <For each={periods()}>
                  {(key) => (
                    <option value={key} selected={key === period()}>
                      {monthLabel(key)}
                    </option>
                  )}
                </For>
              </select>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={periodIndex() === periods().length - 1}
                aria-label="Older period"
              >
                ›
              </button>
            </div>
          </div>
        </section>

        <main>
          <Switch>
            <Match when={route().tab === "standings"}>
              <Standings data={props.data} period={period()} months={months()} onPeriod={(p) => go("standings", p)} />
            </Match>
            <Match when={route().tab === "activity"}>
              <Logbook data={props.data} period={period()} />
            </Match>
            <Match when={route().tab === "members"}>
              <Crew data={props.data} period={period()} />
            </Match>
          </Switch>
        </main>

        <footer class="footer">
          <p>
            Built from public activity across <a href={props.data.org.url}>{props.data.repos.length} repositories</a> of{" "}
            {props.data.org.name}. Refreshed daily by GitHub Actions; months are counted in UTC.
          </p>
          <p class="motto">Let's build together and carry it forward.</p>
        </footer>
      </div>
    </div>
  );
}
