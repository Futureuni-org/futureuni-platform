/**
 * Detect the site's platform, generator, jQuery version, legacy signals and copyright year.
 * These feed the Web Development audit (Phase 10) and scoring (Phase 11).
 */

import type { z } from "zod";

import type { TechHintsSchema } from "@/contracts/enrichment";

export type TechHints = z.infer<typeof TechHintsSchema>;

const PLATFORM_SIGS: { platform: TechHints["platforms"][number]; test: RegExp }[] = [
  { platform: "wordpress", test: /wp-content\/|wp-includes\/|<meta[^>]+name=["']generator["'][^>]+wordpress/i },
  { platform: "wix", test: /static\.parastorage\.com|wixstatic\.com|<meta[^>]+name=["']generator["'][^>]+wix/i },
  { platform: "squarespace", test: /squarespace-cdn\.com|<meta[^>]+name=["']generator["'][^>]+squarespace/i },
  { platform: "shopify", test: /cdn\.shopify\.com|<meta[^>]+name=["']shopify-checkout-api-token["']/i },
  { platform: "webflow", test: /webflow\.io|<meta[^>]+name=["']generator["'][^>]+webflow/i },
  { platform: "godaddy", test: /websitebuilder\.godaddy|<meta[^>]+name=["']generator["'][^>]+godaddy/i },
  { platform: "joomla", test: /<meta[^>]+name=["']generator["'][^>]+joomla/i },
  { platform: "drupal", test: /<meta[^>]+name=["']generator["'][^>]+drupal/i },
];

const GENERATOR_RE = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i;
const JQUERY_RE = /jquery[-.]?(\d+(?:\.\d+){1,2})(?:\.min)?\.js/i;
const COPY_RE = /(?:copyright|©|&copy;)\s*(?:\d\s*)*?(\d{4})/i;

/** Legacy tech signals (`docs/contracts/enrichment.md` TechHints.legacyTech). */
const LEGACY_SIGS: { tag: string; test: RegExp }[] = [
  { tag: "flash", test: /<object[^>]+type=["']application\/x-shockwave-flash|\.swf(?:["']|\?)/i },
  { tag: "table-layout", test: /<table[^>]+(?:cellspacing|cellpadding)=["']?\d+["']?[^>]*>[\s\S]{0,4000}<(?:tr|td)\b/i },
  { tag: "http-only-forms", test: /<form[^>]+action=["']http:\/\//i },
  { tag: "frames", test: /<(?:frameset|frame)\b/i },
];

export function extractTechHints(html: string, opts: { isHttps?: boolean } = {}): TechHints {
  const platforms = new Set<TechHints["platforms"][number]>();
  for (const sig of PLATFORM_SIGS) if (sig.test.test(html)) platforms.add(sig.platform);

  const generatorMatch = GENERATOR_RE.exec(html);
  const generator = generatorMatch?.[1]?.slice(0, 120);

  const jqueryMatch = JQUERY_RE.exec(html);
  const jqueryVersion = jqueryMatch?.[1];

  const copyMatch = COPY_RE.exec(html);
  const copyrightYear = copyMatch?.[1] !== undefined ? Number.parseInt(copyMatch[1], 10) : undefined;

  const legacyTech: string[] = [];
  for (const sig of LEGACY_SIGS) if (sig.test.test(html)) legacyTech.push(sig.tag);

  return {
    ...(generator === undefined ? {} : { generator }),
    platforms: [...platforms],
    ...(jqueryVersion === undefined ? {} : { jqueryVersion }),
    legacyTech,
    ...(copyrightYear === undefined || copyrightYear < 1990 || copyrightYear > 2100 ? {} : { copyrightYear }),
    ...(opts.isHttps === undefined ? {} : { httpsAvailable: opts.isHttps }),
  };
}
