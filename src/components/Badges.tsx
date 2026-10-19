import { createMemo, For, Show } from "solid-js";
import { type BadgeProgress, badgeProgress, TIERS } from "../lib/badges";
import { dayLabel, fmt } from "../lib/format";
import type { ActivityEvent } from "../lib/types";

// On hold: badges are not shown yet. Render <Badges events={own()} /> in Profile.tsx to bring them back.

const TIER_LABEL = { bronze: "Bronze", silver: "Silver", gold: "Gold" };

/** A member's badges, earned tiers first; `events` are that member's events. */
export function Badges(props: { events: ActivityEvent[] }) {
  const badges = createMemo(() =>
    badgeProgress(props.events).sort((a, b) => TIERS.indexOf(b.tier!) - TIERS.indexOf(a.tier!)),
  );
  return (
    <section class="panel badges" aria-labelledby="badges-title">
      <header class="panel-head">
        <h2 id="badges-title">
          Badges <span class="team-tag">Placeholder</span>
        </h2>
        <p>Earned from the full activity history. Names, rules, and artwork are placeholders.</p>
      </header>
      <ul class="badge-grid">
        <For each={badges()}>{(progress) => <BadgeCard progress={progress} />}</For>
      </ul>
    </section>
  );
}

/** Stand-in artwork: an octagon rimmed in the tier colour, with the badge's initial. */
function Medal(props: { progress: BadgeProgress }) {
  return (
    <svg class={["medal", props.progress.tier ?? "locked"]} viewBox="0 0 100 100" aria-hidden="true">
      <polygon class="medal-rim" points="29.3,2 70.7,2 98,29.3 98,70.7 70.7,98 29.3,98 2,70.7 2,29.3" />
      <polygon class="medal-face" points="32.6,10 67.4,10 90,32.6 90,67.4 67.4,90 32.6,90 10,67.4 10,32.6" />
      <text x="50" y="52" text-anchor="middle" dominant-baseline="central">
        {props.progress.badge.name[0]}
      </text>
    </svg>
  );
}

function BadgeCard(props: { progress: BadgeProgress }) {
  const p = () => props.progress;
  const floor = () => {
    const index = p().tier ? TIERS.indexOf(p().tier!) : -1;
    return index < 0 ? 0 : p().badge.thresholds[index]!;
  };
  const nextTier = () => TIERS[p().tier ? TIERS.indexOf(p().tier!) + 1 : 0]!;

  return (
    <li class={["badge", { earned: !!p().tier }]}>
      <Medal progress={p()} />
      <div class="badge-body">
        <p class="badge-name">{p().badge.name}</p>
        <p class="badge-tier">
          <span class="pips" aria-hidden="true">
            <For each={TIERS}>
              {(tier) => <span class={{ on: TIERS.indexOf(tier) <= TIERS.indexOf(p().tier!) && !!p().tier }} />}
            </For>
          </span>
          <Show when={p().tier} fallback="Not earned">
            {TIER_LABEL[p().tier!]} · {dayLabel(p().earnedAt!)}
          </Show>
        </p>
        <p class="badge-desc">{p().badge.description}</p>
        <Show when={p().next !== null} fallback={<p class="badge-next">Highest tier reached</p>}>
          <span class="bar" aria-hidden="true">
            <span style={{ width: `${((p().value - floor()) / (p().next! - floor())) * 100}%` }} />
          </span>
          <p class="badge-next">
            {fmt(p().value)} / {fmt(p().next!)} {p().badge.unit} for {TIER_LABEL[nextTier()].toLowerCase()}
          </p>
        </Show>
      </div>
    </li>
  );
}
