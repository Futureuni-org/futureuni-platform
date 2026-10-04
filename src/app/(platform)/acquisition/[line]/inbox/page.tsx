import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban } from "lucide-react";

import type { SelectOption } from "@/components/admin";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, PermissionState } from "@/components/patterns/states";
import type { Actor, ServiceLine } from "@/contracts/common";
import { cn } from "@/lib/cn";
import { AppError } from "@/lib/errors";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import { ContextRail } from "@/modules/acquisition/ui/inbox/context-rail";
import { ConversationThread } from "@/modules/acquisition/ui/inbox/conversation-thread";
import {
  isLeadInLine,
  loadThreadContext,
  loadThreadRows,
  loadUnmatched,
  parseInboxFilters,
} from "@/modules/acquisition/ui/inbox/inbox-data";
import { InboxFilters } from "@/modules/acquisition/ui/inbox/inbox-filters";
import { InboxLive } from "@/modules/acquisition/ui/inbox/inbox-live";
import {
  replyBlock,
  summariseRows,
  type ComposerDraft,
  type InboxCapabilities,
  type ThreadContextView,
  type ThreadRowView,
} from "@/modules/acquisition/ui/inbox/inbox-types";
import { ReclassifyControl } from "@/modules/acquisition/ui/inbox/reclassify-control";
import { ReplyComposer } from "@/modules/acquisition/ui/inbox/reply-composer";
import { loadThread } from "@/modules/acquisition/ui/inbox/thread-data";
import { ThreadList } from "@/modules/acquisition/ui/inbox/thread-list";
import { ThreadToolbar } from "@/modules/acquisition/ui/inbox/thread-toolbar";
import {
  conversationOnly,
  draftFor,
  latestReply,
  type ThreadView,
} from "@/modules/acquisition/ui/inbox/thread-types";
import { UnmatchedList } from "@/modules/acquisition/ui/inbox/unmatched-list";
import { lineHref, resolveLine } from "@/modules/acquisition/ui/leads/_seams";
import { loadLineOwners } from "@/modules/acquisition/ui/leads/owners";

export const metadata: Metadata = { title: "Inbox" };

const COUNT = new Intl.NumberFormat("en-GB");
const PAGE = 30;

type SearchParams = Record<string, string | string[] | undefined>;
type CurrentUser = NonNullable<Parameters<typeof canFromUser>[0]>;

type OpenThread =
  | { state: "none" }
  | { state: "forbidden" }
  | { state: "missing" }
  | { state: "open"; thread: ThreadView; context: ThreadContextView };

/** The current URL without the open thread: where "back" goes on a narrow screen. */
function withoutThread(basePath: string, sp: SearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (key !== "thread" && typeof v === "string" && v !== "") params.set(key, v);
  }
  const qs = params.toString();
  return qs.length > 0 ? `${basePath}?${qs}` : basePath;
}

/**
 * The header line, counted from the rows on screen. The inbox service's own counts are per owner
 * (the signed-in person's leads only), so for anyone who sees a whole line they disagreed with the
 * list beneath them. These always describe exactly what is listed, under the current filters.
 */
function summaryLine(rows: ThreadRowView[], hasMore: boolean): string {
  const { shown, unread, waiting } = summariseRows(rows);
  const threads = hasMore
    ? `First ${COUNT.format(shown)} threads`
    : `${COUNT.format(shown)} ${shown === 1 ? "thread" : "threads"}`;
  return `${threads} · ${COUNT.format(unread)} unread · ${COUNT.format(waiting)} waiting for a reply`;
}

/** Loads the open thread. The inbox service authorises first; the lead is read only after that. */
async function loadOpenThread(
  actor: Actor,
  line: ServiceLine,
  leadId: string | undefined,
): Promise<OpenThread> {
  if (leadId === undefined) return { state: "none" };
  try {
    const thread = await loadThread(actor, leadId);
    const context = await loadThreadContext(leadId, line);
    return context === null ? { state: "missing" } : { state: "open", thread, context };
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") return { state: "missing" };
    if (error instanceof AppError && error.code === "FORBIDDEN") {
      // "It belongs to another owner" is only said about a lead in this line, which this person can
      // already see in the line's leads. Any other lead reads as missing, exactly like an id that
      // doesn't exist, so a thread id from another line reveals nothing.
      return (await isLeadInLine(leadId, line)) ? { state: "forbidden" } : { state: "missing" };
    }
    throw error;
  }
}

function ConversationPane({
  open,
  user,
  line,
  owners,
  canLink,
  backHref,
}: {
  open: OpenThread;
  user: CurrentUser;
  line: ServiceLine;
  owners: SelectOption[];
  canLink: boolean;
  backHref: string;
}) {
  if (open.state === "none") {
    return (
      <EmptyState
        title="Choose a thread"
        description="Pick a thread from the list to read the conversation and reply."
      />
    );
  }

  const back = (
    <Link
      href={backHref}
      scroll={false}
      className="inline-flex min-h-12 w-fit items-center gap-1 rounded text-sm text-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
    >
      <ArrowLeft aria-hidden className="size-4" />
      All threads
    </Link>
  );

  if (open.state === "forbidden") {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <PermissionState
          title="You can't read this thread"
          description="It belongs to another owner. Ask a line lead to assign it to you."
        />
      </div>
    );
  }
  if (open.state === "missing") {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <EmptyState
          title="That thread isn't in this inbox"
          description="It may belong to another service line, or the lead no longer exists."
        />
      </div>
    );
  }

  const { thread, context } = open;
  const scope = {
    serviceLine: line,
    ...(context.ownerId === null ? {} : { ownerId: context.ownerId }),
  };
  const may = (action: Parameters<typeof canFromUser>[1]) => canFromUser(user, action, scope);
  const capabilities: InboxCapabilities = {
    reply: may("acquisition.inbox.reply"),
    reclassify: may("acquisition.inbox.reclassify"),
    assign: may("acquisition.inbox.assign"),
    logAssisted: may("acquisition.inbox.logAssisted"),
    link: canLink,
    bookMeeting: may("acquisition.meeting.manage"),
  };

  const reply = latestReply(thread);
  const stored = reply === null ? null : draftFor(thread, reply.id);
  const draft: ComposerDraft | null =
    stored === null
      ? null
      : {
          id: stored.id,
          subject: stored.subject,
          body: stored.body,
          needsPricingApproval: stored.needsPricingApproval,
          citations: stored.citations,
        };
  // An unsubscribe is never answered (INV-23); the send action refuses these as well.
  const block = reply === null ? null : replyBlock(reply.classification, context.status);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {back}
      <h2 className="font-display text-2xl font-semibold break-words text-heading">
        {context.companyName}
      </h2>

      <div className="flex flex-wrap items-end gap-3">
        <ThreadToolbar
          context={context}
          owners={owners}
          capabilities={capabilities}
          timezone={user.timezone}
        />
        {capabilities.reclassify && reply !== null && (
          <ReclassifyControl replyId={reply.id} current={reply.classification} />
        )}
      </div>

      <ConversationThread thread={conversationOnly(thread)} timezone={user.timezone} />

      {reply !== null &&
        (block !== null ? (
          <p
            role="note"
            className="flex max-w-prose items-start gap-2 rounded-md bg-zone px-3 py-3 text-sm text-foreground"
          >
            <Ban aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>{block.message}</span>
          </p>
        ) : capabilities.reply ? (
          // Keyed by the lead, not the draft: a refresh or a regenerated draft must never remount
          // the composer and throw away what the person is typing. It takes new drafts as props.
          <ReplyComposer
            key={context.leadId}
            replyId={reply.id}
            leadId={context.leadId}
            channel={reply.channel}
            classification={reply.classification}
            draft={draft}
            canBookMeeting={capabilities.bookMeeting}
            timezone={user.timezone}
          />
        ) : (
          <p className="text-sm text-muted">
            You can read this thread, but only its owner or a line lead can reply.
          </p>
        ))}
    </div>
  );
}

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ line: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { line: slug } = await params;
  const ctx = resolveLine(slug);
  if (ctx === null) notFound();
  const line = ctx.line;

  const user = await requireUser();
  // A member reads only their own threads, so the line-level check passes their own id as owner.
  if (!canFromUser(user, "acquisition.inbox.read", { serviceLine: line, ownerId: user.id })) {
    return (
      <PermissionState
        title="No access to this inbox"
        description="You can only read replies for the service lines you work on."
      />
    );
  }

  const sp = await searchParams;
  const filters = parseInboxFilters(sp);
  const actor = actorOf(user);
  const basePath = lineHref(line, "inbox");
  const canLink = canFromUser(user, "acquisition.inbox.link", { serviceLine: line });
  const threadsTab = filters.tab === "threads";

  const owners = await loadLineOwners(user, line);
  const ownerNames = new Map(owners.map((owner) => [owner.value, owner.label]));

  // `unmatched` is null when this person may not see unmatched replies. That is decided by the
  // inbox service, not by `canLink` alone: an unmatched reply has no line yet, so the service
  // refuses anyone whose access is per line. A real failure is thrown, never shown as "none".
  const [list, unmatched, open] = await Promise.all([
    threadsTab ? loadThreadRows(actor, line, filters, ownerNames) : Promise.resolve(null),
    canLink ? loadUnmatched(actor) : Promise.resolve(null),
    loadOpenThread(actor, line, threadsTab ? filters.thread : undefined),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={ctx.label}
        title="Inbox"
        description={list === null ? undefined : summaryLine(list.rows, list.hasMore)}
      />

      {/* The filters belong to the list. On a narrow screen an open thread takes the list's place,
          so they go with it: otherwise the conversation starts a full screen below them. */}
      <div className={cn(open.state !== "none" && "hidden lg:block")}>
        <InboxFilters
          tab={filters.tab}
          owners={owners}
          unmatchedCount={unmatched === null ? null : unmatched.length}
          showUnmatched={unmatched !== null}
        />
      </div>

      {!threadsTab ? (
        unmatched !== null ? (
          <UnmatchedList replies={unmatched} serviceLine={line} timezone={user.timezone} />
        ) : (
          <PermissionState
            title="You can't see unmatched replies"
            description="An unmatched reply isn't tied to a service line yet, so only a manager or an admin can see and link it. Ask one of them to link the reply."
          />
        )
      ) : (
        // The list stays narrow so the conversation has room on a laptop. The details rail is a
        // third pane only on a very wide screen; below that the toolbar opens it in a sheet.
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)_18rem]">
          {/* On a narrow screen the list and the conversation are separate steps (drill-down). */}
          <div className={cn("min-w-0", open.state !== "none" && "hidden lg:block")}>
            <ThreadList
              rows={list?.rows ?? []}
              selectedId={filters.thread ?? null}
              timezone={user.timezone}
              hasMore={list?.hasMore ?? false}
              nextLimit={filters.limit + PAGE}
              canAssign={canFromUser(user, "acquisition.inbox.assign", { serviceLine: line })}
              owners={owners}
            />
          </div>

          <div className={cn("min-w-0", open.state === "none" && "hidden lg:block")}>
            <ConversationPane
              open={open}
              user={user}
              line={line}
              owners={owners}
              canLink={canLink}
              backHref={withoutThread(basePath, sp)}
            />
          </div>

          {open.state === "open" && (
            <aside className="hidden min-w-0 2xl:block" aria-label="Thread details">
              <ContextRail context={open.context} />
            </aside>
          )}
        </div>
      )}

      <InboxLive
        openLeadId={open.state === "open" ? open.context.leadId : null}
        openUnread={
          open.state === "open" ? open.thread.replies.filter((reply) => reply.unread).length : 0
        }
      />
    </div>
  );
}
