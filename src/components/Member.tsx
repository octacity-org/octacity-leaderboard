import { For, Show } from "solid-js";
import { avatar } from "../lib/format";
import type { LeaderboardData, Person, Team } from "../lib/types";
import roles from "../roles.json";

export function personOf(data: LeaderboardData, login: string): Person {
  return data.people[login] ?? { login, name: null, avatarUrl: `https://github.com/${login}.png`, url: `https://github.com/${login}` };
}

export function teamsOf(data: LeaderboardData, login: string) {
  return data.teams.filter((team) => team.members.includes(login));
}

/** Leads are kept by hand in src/roles.json. */
export const ORG_LEAD: string = roles.organizationLead;
const TEAM_LEADS: Record<string, string> = roles.teamLeads;

export function leadOf(team: Team): string | null {
  return TEAM_LEADS[team.slug] ?? null;
}

/** Team members with the lead first. */
export function membersOf(team: Team) {
  const lead = leadOf(team);
  return lead ? [lead, ...team.members.filter((login) => login !== lead)] : team.members;
}

/** Team and lead tags shown after a member's login. */
export function RoleTags(props: { data: LeaderboardData; login: string }) {
  return (
    <>
      <Show when={props.login === ORG_LEAD}>
        <span class="team-tag lead">Organization lead</span>
      </Show>
      <For each={teamsOf(props.data, props.login)}>
        {(team) => (
          <span class={["team-tag", { lead: leadOf(team) === props.login }]}>
            {leadOf(team) === props.login ? `${team.name} lead` : team.name}
          </span>
        )}
      </For>
    </>
  );
}

export function Avatar(props: { person: Person; size: number; class?: string }) {
  return (
    <img
      class={["avatar", props.class]}
      src={avatar(props.person.avatarUrl, props.size)}
      alt=""
      width={props.size}
      height={props.size}
      loading="lazy"
    />
  );
}

/** Avatar, display name, and login linking to the GitHub profile. */
export function Member(props: { person: Person; size?: number }) {
  return (
    <a class="member" href={props.person.url} target="_blank" rel="noreferrer">
      <Avatar person={props.person} size={props.size ?? 28} />
      <span class="member-text">
        <span class="member-name">{props.person.name ?? props.person.login}</span>
        <span class="member-login">@{props.person.login}</span>
      </span>
    </a>
  );
}
