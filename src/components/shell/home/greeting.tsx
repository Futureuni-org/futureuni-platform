import { formatInTimeZone } from "date-fns-tz";

/**
 * The Editorial Ledger opening line — display type, the user's first name, today's date in
 * their timezone. No punctuation flourishes; sentence case; no emoji.
 */
export function Greeting({
  name,
  timezone,
  now = new Date(),
}: {
  name: string;
  timezone: string;
  now?: Date;
}) {
  const hour = Number(formatInTimeZone(now, timezone, "H"));
  const greeting =
    hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = name.split(/\s+/)[0] ?? name;
  const date = formatInTimeZone(now, timezone, "EEEE, d MMM yyyy · zzz");
  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-display text-[clamp(2rem,1.4rem+2vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-heading">
        {greeting}, {first}
      </h1>
      <p className="text-sm uppercase tracking-[0.08em] text-muted">{date}</p>
    </header>
  );
}
