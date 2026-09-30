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
  jobs: [...enrichmentJobs, ...complianceJobs],
  schedules: [],
  settings: [...profilesSettings, ...enrichmentSettings, ...complianceSettings],
  settingsPanels: [],
  subscribers: [...complianceSubscribers],
  aiTasks: [...profilesAiTasks, ...enrichmentTasks],
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
  notificationTypes: [],
  commands: [],
});
