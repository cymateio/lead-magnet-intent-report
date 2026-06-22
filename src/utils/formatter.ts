import {
  EnrichedCompany,
  Meta,
  ResearchData,
  ResearchResponse,
} from "../types";
import { resolveDomain } from "./domainResolver";

/**
 * Single source of truth for branding. Light theme (clean) with a dark-blue header,
 * orange primary accents, and cyan kept as the secondary "blue" accent.
 */
const brand = {
  name: "Cymate",
  tagline: "AI Outbound Systems for B2B SaaS",
  // Served by the app at /brand/logo.png. Set BRAND_LOGO_URL to an absolute hosted
  // URL so the logo also loads inside emails.
  logoUrl: process.env.BRAND_LOGO_URL || "/brand/logo.png",
  ctaUrl: "https://cymate.io/intro-meeting",
  ctaTopLabel: "Schedule a call",
  disclaimer:
    "This report is built from automated web research and signal analysis, so some details may be incomplete or imprecise. A quick call is the best way to get the full, accurate picture.",
  ctaBottomLink: "Book a quick intro",
  ctaBottomRest:
    " and we'll walk you through how we'd run your outbound, plus the qualified contacts we found for you in this first pass.",
  colors: {
    primary: "#FD5E02", // orange (replaces the old purple accents)
    accent: "#08d5e7", // cyan/teal — kept ONLY for the company-card border
    link: "#233362", // dark blue — link text (was teal)
    dark: "#08070e", // near-black, for the header/footer gradient start
    headerBg: "#233362", // dark blue header (was purple)
    headerText: "#ffffff",
    headerMuted: "#cdd6e8",
    chipBg: "#ffe9da", // light orange tint for the ICP chip
    noteBg: "#fbf4ee", // light tint for the top disclaimer note
    page: "#f5f5f5",
    card: "#ffffff",
    text: "#1b1b27",
    muted: "#5f5f71",
    border: "#e6e6ef",
    onPrimary: "#ffffff", // text on the orange button
  },
  // Email-safe stacks: custom fonts degrade gracefully where they can't load.
  fontHeading: "'Inter Tight', Arial, Helvetica, sans-serif",
  fontBody: "'DM Sans', Arial, Helvetica, sans-serif",
};

/** Build the full API response (structured data + HTML + text + meta). */
export function formatResponse(data: ResearchData, inputDomain: string): ResearchResponse {
  const totalContacts = data.companies.reduce((n, c) => n + c.contacts.length, 0);
  const meta: Meta = {
    generatedAt: new Date().toISOString(),
    inputDomain,
    totalCompanies: data.companies.length,
    totalContacts,
  };

  return {
    data,
    formattedHTML: buildHtml(data, meta),
    formattedText: buildText(data, meta),
    meta,
  };
}

/* ----------------------------- HTML ----------------------------- */

function ctaButton(label: string): string {
  const c = brand.colors;
  return `<a href="${esc(brand.ctaUrl)}" style="display:inline-block;background:${c.primary};color:${c.onPrimary};font-family:${brand.fontHeading};font-size:13px;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px;">${esc(label)}</a>`;
}

function buildHtml(data: ResearchData, meta: Meta): string {
  const c = brand.colors;
  const { inputCompany, signals, companies } = data;

  const logoBlock = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name)}" height="40" style="display:inline-block;vertical-align:middle;border:0;outline:none;max-height:40px;" />`
    : `<span style="font-family:${brand.fontHeading};font-size:24px;font-weight:700;letter-spacing:-0.5px;color:${c.headerText};">${esc(brand.name)}</span>`;

  const signalsRows = signals.signals
    .map((s, i) => {
      const line = s.summary || s.signal;
      return `
        <tr>
          <td style="padding:11px 0;border-bottom:1px solid ${c.border};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td valign="top" width="26" style="font-family:${brand.fontHeading};font-size:14px;font-weight:700;color:${c.primary};">${i + 1}.</td>
              <td valign="top" style="font-family:${brand.fontBody};font-size:14px;color:${c.text};line-height:1.5;">${esc(line)}</td>
            </tr></table>
          </td>
        </tr>`;
    })
    .join("");

  const companyCards = companies.map((co) => companyCardHtml(co)).join("");

  return `<!-- Signal Research Engine formatted output -->
<div style="margin:0;padding:0;background:${c.page};font-family:${brand.fontBody};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.page};padding:0;margin:0;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${c.card};border-radius:14px;overflow:hidden;border:1px solid ${c.border};">

          <!-- Header -->
          <tr>
            <td style="background:${c.headerBg};background:linear-gradient(135deg, ${c.dark} 0%, ${c.headerBg} 100%);padding:22px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" valign="middle">${logoBlock}</td>
                  <td align="right" valign="middle">${ctaButton(brand.ctaTopLabel)}</td>
                </tr>
              </table>
              <div style="font-family:${brand.fontHeading};font-size:22px;font-weight:700;color:${c.headerText};margin-top:20px;line-height:1.25;">High-Intent Signal Report</div>
              <div style="font-family:${brand.fontBody};font-size:14px;color:${c.headerMuted};margin-top:4px;">Buyers for <strong style="color:${c.headerText};">${esc(inputCompany.companyName)}</strong> <span style="color:${c.headerText};">&middot; ${esc(inputCompany.domain)}</span></div>
            </td>
          </tr>

          <!-- Disclaimer (top, sets expectations) -->
          <tr>
            <td style="padding:18px 28px 0 28px;">
              <div style="background:${c.noteBg};border-left:3px solid ${c.primary};border-radius:6px;padding:12px 14px;font-family:${brand.fontBody};font-size:12px;color:${c.muted};line-height:1.5;">${esc(brand.disclaimer)}</div>
            </td>
          </tr>

          <!-- ICP pattern -->
          <tr>
            <td style="padding:18px 28px 6px 28px;">
              <div style="display:inline-block;background:${c.chipBg};color:${c.primary};font-family:${brand.fontBody};font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:4px 10px;border-radius:20px;">ICP Pattern</div>
              <div style="font-family:${brand.fontBody};font-size:15px;color:${c.text};line-height:1.5;margin-top:10px;">${esc(signals.icpPattern)}</div>
            </td>
          </tr>

          <!-- Signals -->
          <tr>
            <td style="padding:18px 28px 6px 28px;">
              <div style="font-family:${brand.fontHeading};font-size:15px;font-weight:700;color:${c.text};">Buying signals we're tracking</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">${signalsRows}</table>
            </td>
          </tr>

          <!-- Companies -->
          <tr>
            <td style="padding:18px 28px 6px 28px;">
              <div style="font-family:${brand.fontHeading};font-size:15px;font-weight:700;color:${c.text};">Companies showing intent (${meta.totalCompanies})</div>
            </td>
          </tr>
          <tr><td style="padding:0 28px 8px 28px;">${companyCards}</td></tr>

          <!-- Bottom CTA -->
          <tr>
            <td style="background:${c.headerBg};background:linear-gradient(135deg, ${c.dark} 0%, ${c.headerBg} 100%);padding:22px 28px;">
              <div style="font-family:${brand.fontBody};font-size:15px;color:${c.headerText};line-height:1.55;"><a href="${esc(brand.ctaUrl)}" style="color:${c.primary};font-weight:700;text-decoration:underline;">${esc(brand.ctaBottomLink)}</a>${esc(brand.ctaBottomRest)}</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</div>`;
}

function companyCardHtml(co: EnrichedCompany): string {
  const c = brand.colors;
  const url = `https://${esc(co.domain)}`;

  const contactRows =
    co.notFound || co.contacts.length === 0
      ? `<tr><td style="font-family:${brand.fontBody};font-size:13px;color:${c.muted};font-style:italic;padding:6px 0;">No emailable contacts found.</td></tr>`
      : co.contacts
          .map((p) => {
            const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || "(name unavailable)";
            const li = p.linkedIn
              ? ` &middot; <a href="${esc(p.linkedIn)}" style="color:${c.link};text-decoration:none;">LinkedIn</a>`
              : "";
            return `
            <tr>
              <td style="padding:7px 0;border-top:1px solid ${c.border};">
                <div style="font-family:${brand.fontBody};font-size:13px;font-weight:700;color:${c.text};">${esc(name)}</div>
                <div style="font-family:${brand.fontBody};font-size:12px;color:${c.muted};">${esc(p.title)}</div>
                <div style="font-family:${brand.fontBody};font-size:12px;margin-top:2px;"><a href="mailto:${esc(p.email)}" style="color:${c.link};text-decoration:none;">${esc(p.email)}</a>${li}</div>
              </td>
            </tr>`;
          })
          .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;background:${c.card};border:1px solid ${c.border};border-radius:10px;border-left:4px solid ${c.accent};">
      <tr>
        <td style="padding:14px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-family:${brand.fontHeading};font-size:15px;font-weight:700;color:${c.text};">
                <a href="${url}" style="color:${c.text};text-decoration:none;">${esc(co.name)}</a>
              </td>
              <td align="right" style="font-family:${brand.fontBody};font-size:12px;"><a href="${url}" style="color:${c.link};text-decoration:none;">${esc(co.domain)}</a></td>
            </tr>
          </table>
          <div style="font-family:${brand.fontBody};font-size:13px;color:${c.muted};line-height:1.45;margin-top:6px;">${esc(co.matchReason)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">${contactRows}</table>
        </td>
      </tr>
    </table>`;
}

/* ----------------------------- Plain text ----------------------------- */

function buildText(data: ResearchData, meta: Meta): string {
  const { inputCompany, signals, companies } = data;
  const lines: string[] = [];
  const rule = "=".repeat(60);

  lines.push(`${brand.name.toUpperCase()} HIGH-INTENT SIGNAL REPORT`);
  lines.push(rule);
  lines.push(`Buyers for: ${inputCompany.companyName} (${inputCompany.domain})`);
  lines.push("");
  lines.push(brand.disclaimer);
  lines.push("");
  lines.push(`Schedule a call: ${brand.ctaUrl}`);
  lines.push("");

  lines.push("ICP PATTERN");
  lines.push("-".repeat(60));
  lines.push(signals.icpPattern);
  lines.push("");

  lines.push("BUYING SIGNALS");
  lines.push("-".repeat(60));
  signals.signals.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.summary || s.signal}`);
  });
  lines.push("");

  lines.push(`COMPANIES SHOWING INTENT (${meta.totalCompanies})`);
  lines.push("-".repeat(60));
  companies.forEach((co, i) => {
    lines.push(`${i + 1}. ${co.name} (${co.domain})`);
    lines.push(`   ${co.matchReason}`);
    co.contacts.forEach((p) => {
      const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || "(name unavailable)";
      const li = p.linkedIn ? ` | ${p.linkedIn}` : "";
      lines.push(`   • ${name}, ${p.title}`);
      lines.push(`     ${p.email}${li}`);
    });
    lines.push("");
  });

  lines.push(rule);
  lines.push(`${brand.ctaBottomLink}${brand.ctaBottomRest}`);
  lines.push(brand.ctaUrl);

  return lines.join("\n");
}

/* ----------------------- website-unreachable notice ----------------------- */

/**
 * Build a short, on-brand notice for the rare case where the website a lead entered
 * does not resolve (likely a typo). Same visual shell as the report (logo header,
 * orange CTA, gradient banner) but a single professional line instead of findings.
 * Returns { html, text } ready for sendReportEmail. Keeps exactly one <img> so the
 * mailer's inline-logo CID swap works unchanged.
 */
export function formatWebsiteNotice(enteredWebsite: string): { html: string; text: string } {
  const shown = displayWebsite(enteredWebsite);
  const submitUrl = process.env.SUBMIT_URL || "https://cymate.io";
  const headline = "We could not reach that website";
  // Neutral wording: works for both form submissions and campaign replies (no "you entered"
  // or "reply again" assumptions). The CTA sends everyone to the website form to (re)submit.
  const message =
    `It looks like the website linked to your request (${shown}) could not be reached, so it may have a small typo. ` +
    `Head to our website to submit the correct details and we will run your personalized signal report right away.`;
  return {
    html: buildNoticeHtml(headline, message, submitUrl),
    text: buildNoticeText(headline, message, submitUrl),
  };
}

function displayWebsite(raw: string): string {
  try {
    return resolveDomain(raw).domain;
  } catch {
    return (raw || "").trim().slice(0, 120) || "the address provided";
  }
}

function buildNoticeHtml(headline: string, message: string, submitUrl: string): string {
  const c = brand.colors;
  const noticeBottom =
    "Prefer to talk it through first? <a-link>Book a quick intro</a-link> and we will show you how we would run your outbound.";

  const logoBlock = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name)}" height="40" style="display:inline-block;vertical-align:middle;border:0;outline:none;max-height:40px;" />`
    : `<span style="font-family:${brand.fontHeading};font-size:24px;font-weight:700;letter-spacing:-0.5px;color:${c.headerText};">${esc(brand.name)}</span>`;

  const submitButton = `<a href="${esc(submitUrl)}" style="display:inline-block;background:${c.primary};color:${c.onPrimary};font-family:${brand.fontHeading};font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;">Submit the correct website</a>`;

  const bottomHtml = noticeBottom
    .replace("<a-link>", `<a href="${esc(brand.ctaUrl)}" style="color:${c.primary};font-weight:700;text-decoration:underline;">`)
    .replace("</a-link>", "</a>");

  return `<!-- Signal Research Engine website-unreachable notice -->
<div style="margin:0;padding:0;background:${c.page};font-family:${brand.fontBody};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.page};padding:0;margin:0;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${c.card};border-radius:14px;overflow:hidden;border:1px solid ${c.border};">

          <!-- Header -->
          <tr>
            <td style="background:${c.headerBg};background:linear-gradient(135deg, ${c.dark} 0%, ${c.headerBg} 100%);padding:22px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" valign="middle">${logoBlock}</td>
                  <td align="right" valign="middle">${ctaButton(brand.ctaTopLabel)}</td>
                </tr>
              </table>
              <div style="font-family:${brand.fontHeading};font-size:22px;font-weight:700;color:${c.headerText};margin-top:20px;line-height:1.25;">${esc(headline)}</div>
              <div style="font-family:${brand.fontBody};font-size:14px;color:${c.headerMuted};margin-top:4px;">About your signal report request</div>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding:24px 28px 6px 28px;">
              <div style="font-family:${brand.fontBody};font-size:15px;color:${c.text};line-height:1.6;">${esc(message)}</div>
            </td>
          </tr>

          <!-- Submit CTA -->
          <tr>
            <td style="padding:6px 28px 22px 28px;">${submitButton}</td>
          </tr>

          <!-- Bottom CTA -->
          <tr>
            <td style="background:${c.headerBg};background:linear-gradient(135deg, ${c.dark} 0%, ${c.headerBg} 100%);padding:22px 28px;margin-top:8px;">
              <div style="font-family:${brand.fontBody};font-size:15px;color:${c.headerText};line-height:1.55;">${bottomHtml}</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</div>`;
}

function buildNoticeText(headline: string, message: string, submitUrl: string): string {
  const rule = "=".repeat(60);
  return [
    `${brand.name.toUpperCase()}`,
    rule,
    headline.toUpperCase(),
    "",
    message,
    "",
    `Submit the correct website: ${submitUrl}`,
    "",
    rule,
    `Book a quick intro: ${brand.ctaUrl}`,
  ].join("\n");
}

/* ----------------------------- helpers ----------------------------- */

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
