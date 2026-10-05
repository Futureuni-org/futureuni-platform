/**
 * Client Acquisition's manifest (docs/contracts/module-manifest.md). This is Phase 2's initial
 * version; Phase 19 owns it afterwards and adds the jobs, schedules, settings, AI tasks,
 * subscribers and badge resolvers the areas export.
 *
 * Permissions are every `acquisition.*` action in the .claude/project-rules.md matrix, in the
 * table's order (scopes: ADMIN, MANAGER, SERVICE_LEAD, MEMBER; "—" is NONE).
 */

import type { NavItem } from "@/contracts/module-manifest";
import type { ServiceLine } from "@/contracts/common";
import { defineModule, permission, scopes } from "@/platform/registry/define";

import { complianceJobs, complianceSettings, complianceSubscribers } from "./compliance";
import { enrichmentJobs, enrichmentSettings, enrichmentTasks } from "./enrichment";
import { profilesAiTasks, profilesSettings } from "./profiles";
// Import registration arrays from the areas' leaf files, not their barrels: the barrels re-export
// runtime code (orchestration, the runner/adapters) that pulls @/platform/ai, whose index boots the
// task registry at import and would form a manifest ↔ registry cycle (TDZ on `validated`).
import { auditJobs } from "./audits/jobs";
import { auditSettings } from "./audits/settings";
import { auditTasks } from "./audits/tasks";
import { complianceSchedules } from "./compliance/schedules";
import { workflowJobs } from "./workflows/jobs";
import { workflowSchedules } from "./workflows/schedules";
import { workflowSettings } from "./workflows/settings";
import { workflowSubscribers } from "./workflows/subscribers";
import { workflowNotifications } from "./workflows/notifications";
import { sourcingJobs } from "./sourcing/jobs";
import { sourcingNotificationTypes } from "./sourcing/notifications";
import { getSourcingDynamicSchedules } from "./sourcing/schedules";
import { sourcingSettings } from "./sourcing/settings";
import { sourcingTasks } from "./sourcing/tasks";
// Wave 3 (batch B4): scoring (11), outreach (12) and pipeline (14), imported from leaf files.
import { scoringJobs } from "./scoring/jobs";
import { scoringNotificationTypes } from "./scoring/notifications";
import { scoringSchedules } from "./scoring/schedules";
import { scoringSettings } from "./scoring/settings";
import { scoringSubscribers } from "./scoring/subscribers";
import { scoringTasks } from "./scoring/tasks";
import { outreachJobs } from "./outreach/jobs";
import { outreachNotifications } from "./outreach/notifications";
import { outreachSchedules } from "./outreach/schedules";
import { outreachSettings } from "./outreach/settings";
import { outreachSubscribers } from "./outreach/subscribers";
import { outreachAiTasks } from "./outreach/draft/tasks";
import { pipelineJobs } from "./pipeline/jobs";
import { pipelineNotificationTypes } from "./pipeline/notifications";
import { pipelineSchedules } from "./pipeline/schedules";
import { pipelineSettings } from "./pipeline/settings";
import { pipelineTasks } from "./pipeline/tasks";
import { inboxJobs } from "./inbox/jobs";
import { inboxNotifications } from "./inbox/notifications";
import { inboxSchedules } from "./inbox/schedules";
import { inboxSettings } from "./inbox/settings";
import { inboxAiTasks } from "./inbox/tasks";
// Wave 4 (batch B6): analytics (17), imported from leaf files for the same reason.
import { analyticsJobs } from "./analytics/jobs";
import { analyticsNotificationTypes } from "./analytics/notifications";
import { analyticsSchedules } from "./analytics/schedules";
import { analyticsSettings } from "./analytics/settings";
import { analyticsTasks } from "./analytics/tasks";

/** The four line tabs and their URL slugs (module spec §6). */
const LINES = [
  {
    slug: "web-development",
    serviceLine: "WEB_DEVELOPMENT",
    label: "Web Development",
    icon: "Globe",
  },
  { slug: "ui-ux-design", serviceLine: "UI_UX_DESIGN", label: "UI/UX Design", icon: "PenTool" },
  {
    slug: "graphic-design",
    serviceLine: "GRAPHIC_DESIGN",
    label: "Graphic Design",
    icon: "Palette",
  },
  {
    slug: "video-editing",
    serviceLine: "VIDEO_EDITING",
    label: "Video Editing",
    icon: "Clapperboard",
  },
] as const satisfies readonly {
  slug: string;
  serviceLine: ServiceLine;
  label: string;
  icon: string;
}[];

/** Every line tab has the same seven sections, in this order (module spec §3.1; contract rule 6). */
const SECTIONS = [
  { slug: "search", label: "Search", permission: "acquisition.search.read", icon: "Search" },
  {
    slug: "review",
    label: "Review",
    permission: "acquisition.review.read",
    icon: "ClipboardCheck",
  },
  { slug: "leads", label: "Leads", permission: "acquisition.lead.read", icon: "Users" },
  {
    slug: "pipeline",
    label: "Pipeline",
    permission: "acquisition.pipeline.read",
    icon: "SquareKanban",
  },
  { slug: "inbox", label: "Inbox", permission: "acquisition.inbox.read", icon: "Inbox" },
  {
    slug: "analytics",
    label: "Analytics",
    permission: "acquisition.analytics.read",
    icon: "ChartColumn",
  },
  {
    slug: "settings",
    label: "Settings",
    permission: "acquisition.profile.read",
    icon: "SlidersHorizontal",
  },
] as const;

/** A line tab is gated by `acquisition.lead.read` for its line; each section by its own action. */
function lineTab(line: (typeof LINES)[number]): NavItem {
  const resource = { serviceLine: line.serviceLine };
  return {
    id: line.slug,
    label: line.label,
    href: `/acquisition/${line.slug}`,
    icon: line.icon,
    permission: "acquisition.lead.read",
    resource,
    children: SECTIONS.map((section) => ({
      id: `${line.slug}.${section.slug}`,
      label: section.label,
      href: `/acquisition/${line.slug}/${section.slug}`,
      icon: section.icon,
      permission: section.permission,
      resource,
      ...(section.slug === "review"
        ? { badge: { source: "acquisition.review-count", tone: "attention" as const } }
        : {}),
    })),
  };
}

/**
 * The command-palette entries, declared here so the manifest is the single source (the shell's
 * `acquisition/layout.tsx` filters these by permission through `getCommands()` + `mayOpen`, rather
 * than recomputing the list). A "navigate" command per line × section, plus two per-line actions.
 * Each is gated by its own permission and service line, so the palette shows only reachable entries.
 */
function buildCommands(): NonNullable<Parameters<typeof defineModule>[0]["commands"]> {
  const commands: NonNullable<Parameters<typeof defineModule>[0]["commands"]> = [
    {
      id: "acq-nav-overview",
      label: "Go to Overview",
      group: "navigate",
      href: "/acquisition/overview",
      permission: "acquisition.overview.read",
    },
  ];
  for (const line of LINES) {
    const resource = { serviceLine: line.serviceLine };
    for (const section of SECTIONS) {
      commands.push({
        id: `acq-nav-${line.slug}-${section.slug}`,
        label: `Go to ${line.label} › ${section.label}`,
        group: "navigate",
        href: `/acquisition/${line.slug}/${section.slug}`,
        permission: section.permission,
        resource,
      });
    }
    commands.push({
      id: `acq-search-${line.slug}`,
      label: `Run a search in ${line.label}`,
      group: "actions",
      href: `/acquisition/${line.slug}/search`,
      permission: "acquisition.search.read",
      resource,
    });
    commands.push({
      id: `acq-review-${line.slug}`,
      label: `Open review queue · ${line.label}`,
      group: "actions",
      href: `/acquisition/${line.slug}/review`,
      permission: "acquisition.review.read",
      resource,
    });
  }
  return commands;
}

const EVERYONE = scopes("ALL", "ALL", "ALL", "ALL");
const LINE_WORK = scopes("ALL", "ALL", "LINES", "OWN"); // leads worked by their owner
const LINE_ONLY = scopes("ALL", "ALL", "LINES", "NONE"); // line owners and up
const LINE_READ = scopes("ALL", "ALL", "ALL", "LINES"); // read everywhere; members their lines
const LINE_APPROVE = scopes("ALL", "ALL", "LINES", "OWN+A");
const ADMIN_ONLY = scopes("ALL", "NONE", "NONE", "NONE");
const ADMIN_AND_MANAGER = scopes("ALL", "ALL", "NONE", "NONE");

export default defineModule({
  id: "acquisition",
  name: "Client Acquisition",
  description: "Find, audit, contact and win clients for every FUTUREUNI service line.",
  icon: "Radar",
  routePrefix: "/acquisition",
  order: 10,
  enabled: true,
  navigation: [
    {
      id: "overview",
      label: "Overview",
      href: "/acquisition/overview",
      icon: "LayoutDashboard",
      permission: "acquisition.overview.read",
    },
    ...LINES.map(lineTab),
  ],
  permissions: [
    permission("acquisition.module.access", "Open Client Acquisition", EVERYONE),
    permission(
      "acquisition.overview.read",
      "View the acquisition overview",
      scopes("ALL", "ALL", "LINES", "LINES"),
      "Non-managers see their lines only.",
    ),
    permission("acquisition.analytics.read", "View acquisition analytics", LINE_READ),
    permission("acquisition.search.run", "Run searches", LINE_ONLY),
    permission("acquisition.search.read", "View searches, runs and history", LINE_READ),
    permission("acquisition.savedSearch.manage", "Manage saved searches", LINE_ONLY),
    permission("acquisition.import.run", "Import leads from a CSV", LINE_ONLY),
    permission(
      "acquisition.lead.create",
      "Add a lead by hand",
      scopes("ALL", "ALL", "LINES", "LINES"),
    ),
    permission("acquisition.lead.read", "View leads", LINE_READ),
    permission("acquisition.lead.assign", "Assign leads", LINE_ONLY),
    permission(
      "acquisition.lead.update",
      "Update a lead",
      LINE_WORK,
      "Next action, snooze, notes, primary contact and nurture.",
    ),
    permission("acquisition.lead.disqualify", "Disqualify a lead", LINE_WORK),
    permission("acquisition.lead.rescore", "Re-score a lead", LINE_WORK),
    permission("acquisition.lead.reaudit", "Re-run a lead's audits", LINE_WORK),
    permission("acquisition.lead.export", "Export leads", LINE_ONLY),
    permission("acquisition.finding.dismiss", "Dismiss an audit finding", LINE_WORK),
    permission(
      "acquisition.scoreReview.decide",
      "Accept or override a borderline review",
      LINE_APPROVE,
    ),
    permission(
      "acquisition.crossSell.manage",
      "Manage cross-sell groups",
      LINE_ONLY,
      "A SERVICE_LEAD needs every lead in the group to be in their lines.",
    ),
    permission("acquisition.review.read", "View the review queue", LINE_WORK),
    permission(
      "acquisition.message.draft",
      "Draft outreach messages",
      LINE_WORK,
      "Create, edit, regenerate and AI assist.",
    ),
    permission("acquisition.message.approve", "Approve outreach messages", LINE_APPROVE),
    permission("acquisition.message.reject", "Reject outreach messages", LINE_WORK),
    permission(
      "acquisition.message.sendAssisted",
      "Send assisted messages",
      LINE_WORK,
      "Prepare the link and mark it sent.",
    ),
    permission("acquisition.message.sendOneOff", "Send a one-off email", LINE_WORK),
    permission("acquisition.inbox.read", "Read the inbox", LINE_WORK),
    permission("acquisition.inbox.reply", "Reply from the inbox", LINE_WORK),
    permission("acquisition.inbox.reclassify", "Reclassify a reply", LINE_WORK),
    permission("acquisition.inbox.assign", "Assign inbox threads", LINE_ONLY),
    permission("acquisition.inbox.logAssisted", "Log an assisted reply", LINE_WORK),
    permission(
      "acquisition.inbox.link",
      "Link an unmatched reply to a lead",
      LINE_ONLY,
      "Scoped by the target lead.",
    ),
    permission("acquisition.pipeline.read", "View the pipeline", LINE_READ),
    permission("acquisition.pipeline.move", "Move leads on the pipeline", LINE_WORK),
    permission("acquisition.meeting.manage", "Manage meetings", LINE_WORK),
    permission("acquisition.proposal.create", "Create proposals", LINE_WORK),
    permission("acquisition.proposal.approve", "Approve proposals within limits", LINE_APPROVE),
    permission(
      "acquisition.proposal.approveException",
      "Approve a proposal exception",
      ADMIN_AND_MANAGER,
      "A discount above the threshold, or a total outside the package range.",
    ),
    permission("acquisition.proposal.send", "Send proposals", LINE_WORK),
    permission("acquisition.deal.close", "Mark a deal won or lost", LINE_WORK),
    permission("acquisition.handoff.assign", "Assign delivery owners", ADMIN_AND_MANAGER),
    permission(
      "acquisition.handoff.acknowledge",
      "Acknowledge a handoff",
      scopes("ALL", "ALL", "OWN", "OWN"),
      "The assignee acknowledges.",
    ),
    permission("acquisition.profile.read", "View service-line profiles", LINE_READ),
    permission("acquisition.profile.edit", "Edit profile drafts", LINE_ONLY),
    permission("acquisition.profile.publish", "Publish a profile", LINE_ONLY),
    permission("acquisition.profile.rollback", "Roll back a profile", LINE_ONLY),
    permission("acquisition.lineSettings.update", "Change line settings", LINE_ONLY),
    permission("acquisition.throttle.read", "View capacity throttling", LINE_READ),
    permission(
      "acquisition.suppression.read",
      "View the suppression list",
      scopes("ALL", "ALL", "ALL", "NONE"),
    ),
    permission("acquisition.suppression.add", "Add to the suppression list", EVERYONE),
    permission(
      "acquisition.suppression.remove",
      "Remove from the suppression list",
      ADMIN_ONLY,
      "Needs a reason.",
    ),
    permission("acquisition.suppression.import", "Import suppressions", ADMIN_AND_MANAGER),
    permission("acquisition.consent.manage", "Manage consent records", ADMIN_AND_MANAGER),
    permission("acquisition.dsr.manage", "Handle data-subject requests", ADMIN_ONLY),
    permission(
      "acquisition.retention.preview",
      "Preview the retention purge",
      ADMIN_ONLY,
      "A dry run.",
    ),
    permission("acquisition.mailbox.read", "View outreach mailboxes", ADMIN_AND_MANAGER),
    permission("acquisition.mailbox.manage", "Manage outreach mailboxes", ADMIN_ONLY),
    permission("acquisition.domain.checkDns", "Check a sending domain's DNS", ADMIN_AND_MANAGER),
    permission("acquisition.outreach.globalPause", "Pause all outreach", ADMIN_ONLY),
  ],
  jobs: [
    ...enrichmentJobs,
    ...complianceJobs,
    ...sourcingJobs,
    ...auditJobs,
    ...scoringJobs,
    ...outreachJobs,
    ...pipelineJobs,
    ...inboxJobs,
    ...analyticsJobs,
    ...workflowJobs,
  ],
  schedules: [
    ...complianceSchedules,
    ...scoringSchedules,
    ...outreachSchedules,
    ...pipelineSchedules,
    ...inboxSchedules,
    ...analyticsSchedules,
    ...workflowSchedules,
  ],
  dynamicSchedules: getSourcingDynamicSchedules,
  settings: [
    ...profilesSettings,
    ...enrichmentSettings,
    ...complianceSettings,
    ...sourcingSettings,
    ...auditSettings,
    ...scoringSettings,
    ...outreachSettings,
    ...pipelineSettings,
    ...inboxSettings,
    ...analyticsSettings,
    ...workflowSettings,
  ],
  settingsPanels: [],
  subscribers: [
    ...complianceSubscribers,
    ...scoringSubscribers,
    ...outreachSubscribers,
    ...workflowSubscribers,
  ],
  aiTasks: [
    ...profilesAiTasks,
    ...enrichmentTasks,
    ...sourcingTasks,
    ...auditTasks,
    ...scoringTasks,
    ...outreachAiTasks,
    ...pipelineTasks,
    ...inboxAiTasks,
    ...analyticsTasks,
  ],
  homeWidgets: [
    {
      id: "acquisition.my-review-queue",
      title: "My review queue",
      permission: "acquisition.review.read",
      size: "md",
      order: 10,
    },
    {
      id: "acquisition.my-inbox",
      title: "My inbox",
      permission: "acquisition.inbox.read",
      size: "md",
      order: 20,
    },
    {
      id: "acquisition.pipeline-value",
      title: "Pipeline value",
      permission: "acquisition.pipeline.read",
      size: "md",
      order: 30,
    },
  ],
  notificationTypes: [
    ...sourcingNotificationTypes,
    ...scoringNotificationTypes,
    ...outreachNotifications,
    ...pipelineNotificationTypes,
    ...inboxNotifications,
    ...analyticsNotificationTypes,
    ...workflowNotifications,
  ],
  commands: buildCommands(),
  badgeResolvers: {
    // The Review nav badge: the viewer's review-queue count, shared with the "My review queue"
    // home widget (dynamic import keeps the server/db code out of the codegen import graph).
    "acquisition.review-count": async ({ userId }) => {
      const { getReviewCountForUser } = await import("./ui/widgets/review-count");
      return getReviewCountForUser(userId);
    },
  },
});
