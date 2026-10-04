/**
 * `@/modules/acquisition/ui/shell` — the Client-Acquisition module shell.
 *
 * Provides SEAM-LINE-CONTEXT (`resolveLine`, `lineHref`, `LINE_SLUGS`) consumed by every
 * acquisition screen, plus the tab bar, section nav, capacity banner and command registrar used by
 * the module and line layouts.
 */

export {
  LINE_SLUGS,
  resolveLine,
  lineHref,
  lineLabel,
  lineAccentToken,
  type LineContext,
} from "./line-context";

export {
  SECTIONS,
  type SectionDef,
  type SectionBadgeKind,
  type SectionBadgeCounts,
} from "./sections";

export { getSectionBadges } from "./badges";

export { LineTabs, type LineTab, type OverviewTab } from "./line-tabs";
export { SectionNav, REFRESH_BADGES_EVENT, type SectionNavItem } from "./section-nav";
export { CapacityBanner } from "./capacity-banner";
export { CommandRegistrar, type ShellCommand } from "./commands";
