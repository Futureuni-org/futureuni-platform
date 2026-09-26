/**
 * The 8 development users and their team profiles (data-model §10.2). Invented people on the
 * reserved futureuni.local domain, with no passwords (Phase 3 seeds credentials from
 * SEED_USER_PASSWORD). currentLoad isn't listed: it's computed from the seeded handoff
 * assignments (see HANDOFF_ASSIGNMENTS in pipeline.ts), which produce the loads in §10.2.
 */

import type { Role, ServiceLine } from "@/contracts/common";

export const ALL_LINES: readonly ServiceLine[] = [
  "WEB_DEVELOPMENT",
  "UI_UX_DESIGN",
  "GRAPHIC_DESIGN",
  "VIDEO_EDITING",
];

export type UserKey =
  "admin" | "manager" | "webLead" | "uiuxLead" | "graphicLead" | "videoLead" | "kelechi" | "zainab";

export interface SeedUser {
  key: UserKey;
  n: number;
  name: string;
  email: string;
  role: Role;
  serviceLines: readonly ServiceLine[];
  weeklyCapacity: number;
  /** The load §10.2 expects; checked against the assignments after seeding. */
  expectedLoad: number;
  canApprove: boolean;
  timezone: string;
  title: string;
}

export const SEED_USERS: readonly SeedUser[] = [
  {
    key: "admin",
    n: 1,
    name: "Adaeze Okafor",
    email: "admin@futureuni.local",
    role: "ADMIN",
    serviceLines: ALL_LINES,
    weeklyCapacity: 2,
    expectedLoad: 0,
    canApprove: true,
    timezone: "Africa/Lagos",
    title: "Administrator",
  },
  {
    key: "manager",
    n: 2,
    name: "Tunde Bakare",
    email: "manager@futureuni.local",
    role: "MANAGER",
    serviceLines: ALL_LINES,
    weeklyCapacity: 4,
    expectedLoad: 2,
    canApprove: true,
    timezone: "Africa/Lagos",
    title: "Manager",
  },
  {
    key: "webLead",
    n: 3,
    name: "Chinedu Eze",
    email: "web.lead@futureuni.local",
    role: "SERVICE_LEAD",
    serviceLines: ["WEB_DEVELOPMENT"],
    weeklyCapacity: 6,
    expectedLoad: 3,
    canApprove: true,
    timezone: "Africa/Lagos",
    title: "Web Development lead",
  },
  {
    key: "uiuxLead",
    n: 4,
    name: "Amaka Nwosu",
    email: "uiux.lead@futureuni.local",
    role: "SERVICE_LEAD",
    serviceLines: ["UI_UX_DESIGN"],
    weeklyCapacity: 5,
    expectedLoad: 4,
    canApprove: true,
    timezone: "Africa/Lagos",
    title: "UI/UX Design lead",
  },
  {
    key: "graphicLead",
    n: 5,
    name: "Blessed Ighodaro",
    email: "graphic.lead@futureuni.local",
    role: "SERVICE_LEAD",
    serviceLines: ["GRAPHIC_DESIGN"],
    weeklyCapacity: 4,
    expectedLoad: 4,
    canApprove: true,
    timezone: "Africa/Lagos",
    title: "Graphic Design lead",
  },
  {
    key: "videoLead",
    n: 6,
    name: "Ifeoma Adeyemi",
    email: "video.lead@futureuni.local",
    role: "SERVICE_LEAD",
    serviceLines: ["VIDEO_EDITING"],
    weeklyCapacity: 5,
    expectedLoad: 1,
    canApprove: true,
    timezone: "Africa/Lagos",
    title: "Video Editing lead",
  },
  {
    key: "kelechi",
    n: 7,
    name: "Kelechi Obi",
    email: "kelechi@futureuni.local",
    role: "MEMBER",
    serviceLines: ["WEB_DEVELOPMENT", "GRAPHIC_DESIGN"],
    weeklyCapacity: 3,
    expectedLoad: 1,
    canApprove: false,
    timezone: "Africa/Lagos",
    title: "Designer and developer",
  },
  {
    key: "zainab",
    n: 8,
    name: "Zainab Musa",
    email: "zainab@futureuni.local",
    role: "MEMBER",
    serviceLines: ["UI_UX_DESIGN", "VIDEO_EDITING"],
    weeklyCapacity: 3,
    expectedLoad: 1,
    canApprove: true,
    timezone: "Europe/London",
    title: "Product designer and editor",
  },
];

/** Line capacity after the seed (§10.2): the throttle, the banner and Phase 18's what-if hint. */
export const LINE_CAPACITY: Readonly<Record<ServiceLine, "NORMAL" | "SLOW" | "PAUSED">> = {
  WEB_DEVELOPMENT: "NORMAL",
  UI_UX_DESIGN: "SLOW",
  GRAPHIC_DESIGN: "PAUSED",
  VIDEO_EDITING: "NORMAL",
};
