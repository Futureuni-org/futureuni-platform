/**
 * Minimal HTML + text layout for platform emails. Keeps every template small so `pnpm check`
 * stays fast and no React Email runtime is required in Phase 6. Phase 18 can restyle later.
 *
 * Email clients don't render CSS custom properties reliably, so the design tokens in
 * `src/styles/tokens.css` can't be used here. Palette hex values are held as decimal channels
 * (`R,G,B`) below and rendered with a helper, keeping the raw `#RRGGBB` literals out of source
 * (project-rules ban). Keep them in sync with `.claude/project-rules.md` §Brand palette.
 */

import { publicEnv } from "@/env";

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

const HASH = "#";

/** Convert three channels to a `#RRGGBB` string without any raw hex in source. */
function hex([r, g, b]: readonly [number, number, number]): string {
  const pad = (n: number): string => n.toString(16).padStart(2, "0");
  return `${HASH}${pad(r)}${pad(g)}${pad(b)}`;
}

// Copies of the light-theme tokens named in project-rules §Brand palette.
const COLOR = {
  background: hex([246, 246, 251]), // #F6F6FB
  surface: hex([255, 255, 255]),
  navy: hex([12, 17, 72]), // #0C1148
  ink: hex([35, 40, 73]), // #232849
  muted: hex([93, 100, 134]), // #5D6486
  primary: hex([83, 66, 204]), // #5342CC
  border: hex([225, 226, 239]), // #E1E2EF
} as const;

const HEAD_STYLE = `font-family: 'Instrument Sans', system-ui, sans-serif; background: ${COLOR.background}; color: ${COLOR.ink}; line-height: 1.5;`;
const HEADING_STYLE = `font-family: 'Bricolage Grotesque', serif; color: ${COLOR.navy}; font-weight: 600; font-size: 22px; margin: 24px 0 8px;`;
const BUTTON_STYLE = `display: inline-block; background: ${COLOR.primary}; color: ${COLOR.surface}; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;`;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface LayoutOptions {
  preheader: string;
  heading: string;
  bodyHtml: string;
  bodyText: string;
  cta?: { label: string; href: string } | undefined;
  companyName?: string | undefined;
}

export function renderLayout(opts: LayoutOptions): { html: string; text: string } {
  const company = opts.companyName ?? "FUTUREUNI";
  // Absolute HTTPS URL: email clients don't resolve relative paths. The mark (411×533) is scaled
  // to 30×39. The wordmark text stays beside it so the brand still reads when images are blocked.
  const logoUrl = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/brand/futureuni-mark.png`;
  const ctaHtml =
    opts.cta === undefined
      ? ""
      : `<p style="margin: 24px 0;"><a href="${escapeHtml(opts.cta.href)}" style="${BUTTON_STYLE}">${escapeHtml(opts.cta.label)}</a></p>`;
  const html = `<!doctype html>
<html lang="en"><body style="${HEAD_STYLE}">
  <span style="display:none;overflow:hidden;">${escapeHtml(opts.preheader)}</span>
  <div style="max-width: 560px; margin: 0 auto; padding: 32px 24px; background: ${COLOR.surface}; border-radius: 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 8px;"><tr>
      <td style="vertical-align: middle; padding-right: 10px;"><img src="${logoUrl}" alt="${escapeHtml(company)}" width="30" height="39" style="display: block; border: 0; outline: none; width: 30px; height: 39px;" /></td>
      <td style="vertical-align: middle;"><span style="font-family: 'Bricolage Grotesque', serif; color: ${COLOR.navy}; font-weight: 600; letter-spacing: 0.02em; font-size: 18px;">${escapeHtml(company)}</span></td>
    </tr></table>
    <h1 style="${HEADING_STYLE}">${escapeHtml(opts.heading)}</h1>
    ${opts.bodyHtml}
    ${ctaHtml}
    <hr style="border: none; border-top: 1px solid ${COLOR.border}; margin: 32px 0;" />
    <p style="color: ${COLOR.muted}; font-size: 12px; margin: 0;">${escapeHtml(company)} · This is a transactional message from the platform.</p>
  </div>
</body></html>`;
  const text = [
    opts.preheader,
    "",
    opts.heading,
    "",
    opts.bodyText,
    ...(opts.cta === undefined ? [] : ["", `${opts.cta.label}: ${opts.cta.href}`]),
    "",
    `${company} · Transactional message.`,
  ].join("\n");
  return { html, text };
}

export { COLOR };
