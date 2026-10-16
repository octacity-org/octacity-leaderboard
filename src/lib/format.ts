import type { EventType } from "./types";

export const EVENT_META: Record<EventType, { label: string; tone: string }> = {
  commit: { label: "Commit", tone: "commit" },
  pr_opened: { label: "PR opened", tone: "pr" },
  pr_merged: { label: "PR merged", tone: "merged" },
  review: { label: "Review", tone: "review" },
  issue_opened: { label: "Issue", tone: "issue" },
  comment: { label: "Comment", tone: "comment" },
  discussion: { label: "Discussion", tone: "discussion" },
  discussion_comment: { label: "Reply", tone: "discussion" },
};

const number = new Intl.NumberFormat("en");
export const fmt = (value: number) => number.format(value);

function monthDate(key: string) {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
}

export function monthLabel(key: string, style: "long" | "short" = "long") {
  if (key === "all") return "All time";
  return monthDate(key).toLocaleString("en", { month: style, year: "numeric", timeZone: "UTC" });
}

export function monthName(key: string) {
  return monthDate(key).toLocaleString("en", { month: "long", timeZone: "UTC" });
}

export function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function ago(iso: string, now = Date.now()) {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}


export function avatar(url: string, size: number) {
  return `${url}${url.includes("?") ? "&" : "?"}s=${size * 2}`;
}
