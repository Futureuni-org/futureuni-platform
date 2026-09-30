import "server-only";

/**
 * Video Editing default profile (module spec §3.3.4). All prices placeholders,
 * all portfolio items placeholders (INV-19).
 */

import type { ServiceLineProfile } from "@/contracts/service-line-profile";

import {
  COMMON_APPROVAL_MODE,
  COMMON_CAPACITY_POLICY,
  COMMON_DISQUALIFIERS,
  COMMON_NEGATIVE_RULES,
  COMMON_POSITIVE_RULES,
  DEFAULT_SCORING_BASELINE,
  intlEmailFirstLinkedInFollow,
  ngWhatsAppFirstEmail,
} from "./shared";

export const videoEditingDefaultProfile: ServiceLineProfile = {
  schemaVersion: 1,
  id: "VIDEO_EDITING",
  label: "Video Editing",
  description:
    "Editing, captions and thumbnails for creators, coaches and brands that post video.",
  owners: { roles: ["SERVICE_LEAD"], userIds: [] },
  contactRolePriority: [
    "creator",
    "channel manager",
    "founder",
    "marketing manager",
    "producer",
  ],

  signals: [
    {
      id: "active_creator",
      label: "Active creator with rough editing",
      description: "Channel posts regularly but the editing shows rough cuts, no motion basics.",
      weight: 20,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "≥ 3 uploads in the last 60 days with visible rough cuts.",
      detectingSources: ["youtube-channels"],
      confirmedBy: ["video.duration_profile", "video.engagement"],
      future: false,
    },
    {
      id: "no_captions",
      label: "Videos without captions",
      description: "Most recent uploads have no caption track.",
      weight: 25,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "contentDetails.caption = false on ≥ 50% of the last 20 videos.",
      detectingSources: [],
      confirmedBy: ["video.captions"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "inconsistent_thumbnails",
      label: "Inconsistent thumbnails",
      description: "Thumbnails vary widely in style, type and hierarchy.",
      weight: 15,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Thumbnail grid shows 3+ style breaks across the last 12 uploads.",
      detectingSources: [],
      confirmedBy: ["video.thumbnails"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "gone_quiet",
      label: "Channel has gone quiet",
      description: "Posting gap is growing; last upload > 45 days ago.",
      weight: 15,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Longest recent gap ≥ 45 days AND last upload > 45 days ago.",
      detectingSources: ["youtube-channels"],
      confirmedBy: ["video.cadence"],
      future: false,
    },
    {
      id: "long_unedited_uploads",
      label: "Long unedited uploads",
      description: "Uploads run 20+ minutes with no trimming or chapter markers.",
      weight: 10,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "≥ 3 recent videos > 20 minutes with no chapter markers.",
      detectingSources: [],
      confirmedBy: ["video.duration_profile"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "job_post_video_editor",
      label: "Hiring a video editor",
      description: "Public job post for a video editor within the last 90 days.",
      weight: 15,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Job title matches /video editor/i.",
      detectingSources: ["jobs-serpapi", "jobs-adzuna", "myjobmag"],
      confirmedBy: [],
      future: false,
    },
  ],

  sources: [
    {
      adapterId: "youtube-channels",
      markets: ["NIGERIA", "INTERNATIONAL"],
      enabled: true,
      optional: false,
      defaultParams: {
        NIGERIA: {
          regionCode: "NG",
          keywords: ["lagos vlog", "nigerian coach", "business tips nigeria"],
        },
        INTERNATIONAL: {
          regionCode: "GB",
          keywords: ["business coach", "fitness coach", "founder story"],
        },
      },
    },
    {
      adapterId: "jobs-serpapi",
      markets: ["NIGERIA", "INTERNATIONAL"],
      enabled: true,
      optional: false,
      defaultParams: {
        NIGERIA: { jobTitles: ["video editor"], location: "Nigeria" },
        INTERNATIONAL: { jobTitles: ["video editor"], location: "United Kingdom" },
      },
    },
  ],

  audits: [
    {
      agentId: "audit.video",
      checks: [
        { checkId: "video.cadence", required: true },
        { checkId: "video.captions", required: true },
        { checkId: "video.duration_profile", required: false },
        { checkId: "video.engagement", required: false },
        { checkId: "video.thumbnails", required: false },
        { checkId: "video.titles_hooks", required: false },
      ],
    },
  ],

  scoring: {
    rules: [
      ...COMMON_POSITIVE_RULES,
      ...COMMON_NEGATIVE_RULES,
      {
        id: "no_captions_hit",
        label: "Most videos have no captions",
        condition: {
          all: [
            {
              kind: "finding",
              checkId: "video.captions",
              minSeverity: "MEDIUM",
              pitchableOnly: true,
              negate: false,
            },
          ],
        },
        points: 25,
      },
      {
        id: "rough_active_creator",
        label: "Active creator with rough editing",
        condition: { all: [{ kind: "signal", signalId: "active_creator", negate: false }] },
        points: 15,
      },
      {
        id: "channel_quiet",
        label: "Channel has gone quiet",
        condition: { all: [{ kind: "signal", signalId: "gone_quiet", negate: false }] },
        points: 15,
      },
      {
        id: "thumb_inconsistent",
        label: "Thumbnails inconsistent",
        condition: {
          all: [{ kind: "signal", signalId: "inconsistent_thumbnails", negate: false }],
        },
        points: 10,
      },
      {
        id: "hiring_video_editor",
        label: "Hiring a video editor",
        condition: {
          all: [{ kind: "signal", signalId: "job_post_video_editor", negate: false }],
        },
        points: 15,
      },
    ],
    ...DEFAULT_SCORING_BASELINE,
  },

  pitchAngles: {
    NIGERIA: [
      {
        id: "captions_reach",
        hook: "Captions help your videos reach viewers watching on mute.",
        whenToUse: { signals: ["no_captions"], findingChecks: ["video.captions"] },
        proofTags: ["captions"],
        avoidPhrases: ["your videos are bad"],
      },
      {
        id: "consistency",
        hook: "A steady posting rhythm without the editing load on you.",
        whenToUse: {
          signals: ["gone_quiet", "active_creator"],
          findingChecks: ["video.cadence"],
        },
        proofTags: ["retainer"],
        avoidPhrases: [],
      },
      {
        id: "thumbnails",
        hook: "Thumbnails that match your brand and read at a glance.",
        whenToUse: {
          signals: ["inconsistent_thumbnails"],
          findingChecks: ["video.thumbnails"],
        },
        proofTags: ["thumbnails"],
        avoidPhrases: [],
      },
    ],
    INTERNATIONAL: [
      {
        id: "timezone_overlap",
        hook: "An editing team in Lagos that works your UK hours.",
        whenToUse: { signals: [], findingChecks: [] },
        proofTags: ["retainer"],
        avoidPhrases: ["cheap", "offshore"],
      },
      {
        id: "captions_reach",
        hook: "Captions help your videos reach viewers watching on mute.",
        whenToUse: { signals: ["no_captions"], findingChecks: ["video.captions"] },
        proofTags: ["captions"],
        avoidPhrases: [],
      },
      {
        id: "consistency",
        hook: "A steady posting rhythm without the editing load on you.",
        whenToUse: {
          signals: ["gone_quiet", "active_creator"],
          findingChecks: ["video.cadence"],
        },
        proofTags: ["retainer"],
        avoidPhrases: [],
      },
    ],
  },

  portfolio: [
    {
      id: "todo_video_case_1",
      title: "TODO: real FUTUREUNI video editing retainer case",
      description: "Placeholder until real work is added.",
      tags: ["retainer", "captions"],
      markets: ["NIGERIA", "INTERNATIONAL"],
      isPlaceholder: true,
    },
  ],

  pricing: {
    needsReview: true,
    packages: [
      {
        id: "single_video",
        name: "Single edited video",
        includes: ["Trim + colour", "Captions", "Thumbnail"],
        timelineWeeks: { min: 1, max: 2 },
        prices: [
          {
            market: "NIGERIA",
            currency: "NGN",
            minMinor: 8_000_000, // ₦80k placeholder
            typicalMinor: 15_000_000,
            maxMinor: 25_000_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "USD",
            minMinor: 30_000, // $300 placeholder
            typicalMinor: 60_000,
            maxMinor: 120_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "GBP",
            minMinor: 25_000,
            typicalMinor: 50_000,
            maxMinor: 100_000,
          },
        ],
      },
      {
        id: "monthly_4_videos",
        name: "Creator retainer (4 videos a month)",
        includes: ["Editing", "Captions", "Thumbnails", "Publish support"],
        timelineWeeks: { min: 4, max: 4 },
        prices: [
          {
            market: "NIGERIA",
            currency: "NGN",
            minMinor: 15_000_000,
            typicalMinor: 25_000_000,
            maxMinor: 40_000_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "USD",
            minMinor: 80_000,
            typicalMinor: 130_000,
            maxMinor: 220_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "GBP",
            minMinor: 60_000,
            typicalMinor: 90_000,
            maxMinor: 150_000,
          },
        ],
      },
    ],
  },

  sequences: {
    NIGERIA: [
      {
        id: "ng_default",
        name: "WhatsApp first, then email",
        isDefault: true,
        steps: ngWhatsAppFirstEmail({
          intro: "captions_reach",
          valueAdd: "consistency",
          portfolio: "thumbnails",
          softBreakup: "captions_reach",
        }),
      },
    ],
    INTERNATIONAL: [
      {
        id: "intl_default",
        name: "Email first with a LinkedIn touch",
        isDefault: true,
        steps: intlEmailFirstLinkedInFollow({
          intro: "captions_reach",
          followUp: "timezone_overlap",
          valueAdd: "consistency",
          softBreakup: "timezone_overlap",
        }),
      },
    ],
  },

  disqualifiers: [...COMMON_DISQUALIFIERS],
  approvalMode: COMMON_APPROVAL_MODE,
  capacityPolicy: COMMON_CAPACITY_POLICY,
};
