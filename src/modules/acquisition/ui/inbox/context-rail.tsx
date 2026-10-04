import Link from "next/link";

import { MarketBadge } from "@/components/ui/market-badge";
import { StatusBadge } from "@/components/ui/status-badge";

import { ContactabilityList } from "../leads/contactability-list";
import { ScoreMeter } from "../leads/score-meter";
import type { ThreadContextView } from "./inbox-types";

/**
 * The inbox context rail: who the thread is with and whether they can be contacted. Presentational,
 * so it renders both as the third pane on wide screens and inside the details sheet on narrow ones.
 * What the reply said (follow-up date, referral, objections, questions) and what was done about it
 * sit with each reply in the conversation.
 */
export function ContextRail({ context }: { context: ThreadContextView }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Lead</p>
        <Link
          href={context.leadHref}
          className="inline-flex min-h-12 w-fit max-w-full items-center rounded font-display text-xl font-semibold break-words text-heading hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {context.companyName}
        </Link>
        {context.place !== null && (
          <p className="text-sm break-words text-muted">{context.place}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind="lead" value={context.status} />
          <MarketBadge market={context.market} />
        </div>
        <ScoreMeter score={context.score} band={context.scoreBand} />
      </div>

      {context.brief !== null && (
        <p className="text-sm break-words whitespace-pre-wrap text-foreground">{context.brief}</p>
      )}

      <dl className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Owner</dt>
          <dd className="break-words text-foreground">{context.ownerName ?? "Unassigned"}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            Primary contact
          </dt>
          <dd className="break-words text-foreground">
            {context.primaryContact === null ? (
              "No primary contact"
            ) : (
              <>
                {context.primaryContact.name ?? "Unnamed contact"}
                {context.primaryContact.role !== null && (
                  <span className="text-muted"> · {context.primaryContact.role}</span>
                )}
                {context.primaryContact.email !== null && (
                  <span className="block break-all text-muted">{context.primaryContact.email}</span>
                )}
              </>
            )}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
          Contactability
        </p>
        <ContactabilityList channels={context.channels} />
      </div>
    </div>
  );
}
