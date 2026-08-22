/**
 * Single source of truth for the site's public identity.
 *
 * Why this file exists: Open Graph and Twitter card images MUST be absolute
 * URLs. Crawlers fetch them out-of-band with no page context, so a relative
 * "/og-image.png" is silently dropped and the unfurl renders with no image.
 * Everything that needs an origin derives it from SITE_URL below.
 *
 * To point this at a different origin (a preview branch, a staging domain),
 * set VITE_SITE_URL in Amplify Console -> Hosting -> Environment variables.
 * Vite inlines VITE_-prefixed vars at build time, so no redeploy trickery is
 * needed beyond rebuilding the branch.
 */

// TODO(dani): replace with the real custom domain before the next deploy.
const DEFAULT_SITE_URL = "https://pokemon-helper.example.com";

/** Absolute origin, no trailing slash. */
export const SITE_URL = (
  (import.meta.env.VITE_SITE_URL as string | undefined) ?? DEFAULT_SITE_URL
).replace(/\/+$/, "");

export const SITE_NAME = "Dani’s Pokémon Helper";

export const SITE_TITLE = "Dani’s Pokémon Helper — Instant type matchup advice";

export const SITE_DESCRIPTION =
  "Search any Pokémon or pick a type combination and instantly see what it’s weak to, what resists it, and what to bring into battle. Covers the full 18-type chart.";

/** 1200x630. Kept absolute — see the note at the top of this file. */
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

export const OG_IMAGE_ALT =
  "Dani’s Pokémon Helper — find the winning type matchup.";
