/**
 * Deterministic claim templates for MEASURED/OBSERVED checks (contract rule 2). The claim is
 * generated from the measured values, never free text, and reads plainly for a non-technical owner.
 * Dates use the project document format ("3 Oct 2026").
 */

import "server-only";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function formatClaimDate(when: Date): string {
  return dateFmt.format(when);
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export const claim = {
  pagespeed(strategy: "mobile" | "desktop", lcpMs: number, when: Date): string {
    return `Your homepage took ${seconds(lcpMs)}s to show its main content on ${strategy} in our test on ${formatClaimDate(when)}.`;
  },
  sslNoRedirect(when: Date): string {
    return `Your homepage does not send visitors to the secure (https) version of your site, which browsers now warn about (checked ${formatClaimDate(when)}).`;
  },
  sslExpiring(days: number, when: Date): string {
    return `Your site's security certificate expires in ${String(days)} days; if it lapses, visitors will see a security warning (checked ${formatClaimDate(when)}).`;
  },
  sslExpired(when: Date): string {
    return `Your site's security certificate is not valid, so visitors see a security warning before the page loads (checked ${formatClaimDate(when)}).`;
  },
  viewport(when: Date): string {
    return `Your homepage has no mobile viewport setting, so it may not scale correctly on phones (checked ${formatClaimDate(when)}).`;
  },
  brokenLinks(broken: number, checked: number, when: Date): string {
    return `We found ${String(broken)} broken links out of the ${String(checked)} we tested on your homepage on ${formatClaimDate(when)}.`;
  },
  seoBasics(missing: string[], when: Date): string {
    return `Your homepage is missing ${missing.join(", ")}, which makes it harder to find in search (checked ${formatClaimDate(when)}).`;
  },
  outdatedYear(year: number, yearsBehind: number, when: Date): string {
    return `Your website's copyright notice still reads ${String(year)}, ${String(yearsBehind)} years out of date, which can look abandoned (checked ${formatClaimDate(when)}).`;
  },
  outdatedTech(hints: string[], when: Date): string {
    return `Your website shows signs of outdated technology (${hints.join(", ")}), which affects speed and security (checked ${formatClaimDate(when)}).`;
  },
  noWebsite(presence: string, when: Date): string {
    return `This business has no real website; its only online presence is ${presence} (as of ${formatClaimDate(when)}).`;
  },
  contactPath(when: Date): string {
    return `A visitor can't reach a way to contact or buy within two clicks of your homepage (checked ${formatClaimDate(when)}).`;
  },
  mobileOverflow(when: Date): string {
    return `Your homepage scrolls sideways on a phone-sized screen, which makes it awkward to use on mobile (checked ${formatClaimDate(when)}).`;
  },
  accessibility(serious: number, when: Date): string {
    return `Automated testing found ${String(serious)} serious accessibility problems on your homepage on ${formatClaimDate(when)}.`;
  },
  videoCadence(days: number, when: Date): string {
    return `Your channel has not posted a new video in ${String(days)} days, and the gap between uploads is growing (as of ${formatClaimDate(when)}).`;
  },
  videoCaptions(withCaptions: number, total: number, when: Date): string {
    return `Only ${String(withCaptions)} of your last ${String(total)} videos have captions, which limits reach and accessibility (as of ${formatClaimDate(when)}).`;
  },
  videoEngagement(viewsPerVideo: number, subscribers: number, when: Date): string {
    return `Your recent videos average ${String(viewsPerVideo)} views against ${String(subscribers)} subscribers, so most of your audience isn't watching (as of ${formatClaimDate(when)}).`;
  },
  logoLowRes(width: number, height: number, when: Date): string {
    return `Your logo is only ${String(width)}×${String(height)} pixels, so it looks blurry on larger or high-resolution screens (checked ${formatClaimDate(when)}).`;
  },
};
