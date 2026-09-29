/**
 * Platform email templates (Phase 6). Every template has an `html` and a plain-text version.
 *
 * A template exposes `defaultProps` (used by the dev preview route), `render(props)` and a
 * `subject(props)` builder. The dispatcher passes the recipient's props verbatim.
 */

import { COLOR, escapeHtml, renderLayout, type Rendered } from "./layout";

interface TemplateDefinition<P extends Record<string, unknown>> {
  defaultProps: P;
  render(props: P): Promise<Rendered> | Rendered;
}

// ---- Templates -----------------------------------------------------------

const invite: TemplateDefinition<{ inviteeName: string; inviterName: string; role: string; acceptUrl: string; expiresInDays: number }> = {
  defaultProps: {
    inviteeName: "Ada",
    inviterName: "Prince Amadin",
    role: "SERVICE_LEAD",
    acceptUrl: "http://localhost:3000/invite/example",
    expiresInDays: 7,
  },
  render: (props) => {
    const subject = `You're invited to FUTUREUNI as ${props.role}`;
    const heading = `Hi ${props.inviteeName}, join FUTUREUNI`;
    const bodyText = [
      `${props.inviterName} invited you to FUTUREUNI as ${props.role}.`,
      `The invite expires in ${String(props.expiresInDays)} days.`,
    ].join("\n");
    const bodyHtml = `<p>${escapeHtml(props.inviterName)} invited you to FUTUREUNI as <strong>${escapeHtml(props.role)}</strong>.</p><p style="color: ${COLOR.muted};">The invite expires in ${String(props.expiresInDays)} days.</p>`;
    const { html, text } = renderLayout({ preheader: subject, heading, bodyHtml, bodyText, cta: { label: "Accept invite", href: props.acceptUrl } });
    return { subject, html, text };
  },
};

const verifyEmail: TemplateDefinition<{ name: string; verifyUrl: string }> = {
  defaultProps: { name: "Ada", verifyUrl: "http://localhost:3000/verify/example" },
  render: (props) => {
    const subject = "Verify your FUTUREUNI email";
    const heading = `Hi ${props.name}, confirm your email`;
    const bodyText = "Confirm your email so we know we've got the right address.";
    const bodyHtml = "<p>Confirm your email so we know we've got the right address.</p>";
    const { html, text } = renderLayout({ preheader: subject, heading, bodyHtml, bodyText, cta: { label: "Verify email", href: props.verifyUrl } });
    return { subject, html, text };
  },
};

const passwordReset: TemplateDefinition<{ name: string; resetUrl: string; expiresInMinutes: number }> = {
  defaultProps: { name: "Ada", resetUrl: "http://localhost:3000/reset/example", expiresInMinutes: 30 },
  render: (props) => {
    const subject = "Reset your FUTUREUNI password";
    const heading = `Hi ${props.name}, reset your password`;
    const bodyText = `The link expires in ${String(props.expiresInMinutes)} minutes. If you didn't ask for this, ignore this email.`;
    const bodyHtml = `<p>The link expires in ${String(props.expiresInMinutes)} minutes.</p><p style="color: ${COLOR.muted};">If you didn't ask for this, ignore this email.</p>`;
    const { html, text } = renderLayout({ preheader: subject, heading, bodyHtml, bodyText, cta: { label: "Reset password", href: props.resetUrl } });
    return { subject, html, text };
  },
};

const roleChanged: TemplateDefinition<{ name: string; fromRole: string; toRole: string; changedByName: string }> = {
  defaultProps: { name: "Ada", fromRole: "MEMBER", toRole: "SERVICE_LEAD", changedByName: "Prince Amadin" },
  render: (props) => {
    const subject = `Your role has changed to ${props.toRole}`;
    const heading = `Hi ${props.name}, your role changed`;
    const bodyText = `${props.changedByName} changed your role from ${props.fromRole} to ${props.toRole}.`;
    const bodyHtml = `<p>${escapeHtml(props.changedByName)} changed your role from <strong>${escapeHtml(props.fromRole)}</strong> to <strong>${escapeHtml(props.toRole)}</strong>.</p>`;
    const { html, text } = renderLayout({ preheader: subject, heading, bodyHtml, bodyText });
    return { subject, html, text };
  },
};

const twoFactorEnabled: TemplateDefinition<{ name: string }> = {
  defaultProps: { name: "Ada" },
  render: (props) => {
    const subject = "Two-factor authentication is on";
    const heading = `Hi ${props.name}, 2FA is enabled`;
    const bodyText = "Two-factor authentication is now protecting your account.";
    const bodyHtml = "<p>Two-factor authentication is now protecting your account.</p>";
    const { html, text } = renderLayout({ preheader: subject, heading, bodyHtml, bodyText });
    return { subject, html, text };
  },
};

const twoFactorReset: TemplateDefinition<{ name: string; resetByName: string }> = {
  defaultProps: { name: "Ada", resetByName: "Prince Amadin" },
  render: (props) => {
    const subject = "Two-factor authentication reset";
    const heading = `Hi ${props.name}, your 2FA was reset`;
    const bodyText = `${props.resetByName} reset your 2FA. Set it up again next time you sign in.`;
    const bodyHtml = `<p>${escapeHtml(props.resetByName)} reset your 2FA. Set it up again next time you sign in.</p>`;
    const { html, text } = renderLayout({ preheader: subject, heading, bodyHtml, bodyText });
    return { subject, html, text };
  },
};

const notification: TemplateDefinition<{ title: string; body: string; link: string | null; type: string }> = {
  defaultProps: { title: "A new reply from Delta Care", body: "Kelechi replied to your outreach.", link: "http://localhost:3000/acquisition", type: "reply.interested" },
  render: (props) => {
    const subject = props.title;
    const bodyText = props.body;
    const bodyHtml = `<p>${escapeHtml(props.body)}</p>`;
    const cta = props.link === null ? undefined : { label: "Open in the platform", href: props.link };
    const { html, text } = renderLayout({ preheader: subject, heading: props.title, bodyHtml, bodyText, cta });
    return { subject, html, text };
  },
};

const dailyDigest: TemplateDefinition<{ name: string; count: number; items: { title: string; link: string | null }[] }> = {
  defaultProps: { name: "Ada", count: 3, items: [{ title: "3 drafts waiting", link: "http://localhost:3000/acquisition/web-development/review" }] },
  render: (props) => {
    const subject = `Your FUTUREUNI daily digest (${String(props.count)} items)`;
    const heading = `Hi ${props.name}, here's what's waiting`;
    const bodyText = props.items.map((item) => `- ${item.title}${item.link === null ? "" : ` (${item.link})`}`).join("\n");
    const bodyHtml = `<ul>${props.items.map((item) => `<li>${escapeHtml(item.title)}${item.link === null ? "" : ` <a href="${escapeHtml(item.link)}" style="color:${COLOR.primary};">open</a>`}</li>`).join("")}</ul>`;
    const { html, text } = renderLayout({ preheader: subject, heading, bodyHtml, bodyText });
    return { subject, html, text };
  },
};

const budgetWarning: TemplateDefinition<{ scope: string; percent: number; usedUsd: string; limitUsd: string }> = {
  defaultProps: { scope: "platform.daily", percent: 80, usedUsd: "40.00", limitUsd: "50.00" },
  render: (props) => {
    const subject = `AI budget ${String(props.percent)}% used (${props.scope})`;
    const heading = "AI budget approaching limit";
    const bodyText = `${props.scope} has used ${props.usedUsd} of ${props.limitUsd} (${String(props.percent)}%).`;
    const bodyHtml = `<p><strong>${escapeHtml(props.scope)}</strong> has used ${escapeHtml(props.usedUsd)} of ${escapeHtml(props.limitUsd)} (${String(props.percent)}%).</p>`;
    const { html, text } = renderLayout({ preheader: subject, heading, bodyHtml, bodyText });
    return { subject, html, text };
  },
};

export const EMAIL_TEMPLATES = {
  invite,
  "verify-email": verifyEmail,
  "password-reset": passwordReset,
  "role-changed": roleChanged,
  "two-factor-enabled": twoFactorEnabled,
  "two-factor-reset": twoFactorReset,
  notification,
  "daily-digest": dailyDigest,
  "budget-warning": budgetWarning,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATES;
