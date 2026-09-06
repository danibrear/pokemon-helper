import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";

import type { Route } from "./+types/root";
import "./app.css";
import theme from "./theme";
import {
  OG_IMAGE,
  OG_IMAGE_ALT,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "./site";

/**
 * Social meta lives on the ROOT route, not on the index route, and that is
 * load-bearing.
 *
 * This app runs with `ssr: false`, so the only HTML that ever reaches a social
 * crawler is the prerendered shell at build/client/index.html. React Router
 * generates that shell from the root route alone — child routes are resolved
 * client-side, after JS boots. Crawlers (Slack, iMessage, Discord, Facebook,
 * LinkedIn, WhatsApp) do not run JS, so anything exported from
 * routes/home.tsx is invisible to them.
 *
 * Keep these tags here. If they move to a child route, every unfurl silently
 * goes blank again and nothing in the build will warn you.
 */
export const meta: Route.MetaFunction = () => [
  { title: SITE_TITLE },
  { name: "description", content: SITE_DESCRIPTION },

  { property: "og:type", content: "website" },
  { property: "og:site_name", content: SITE_NAME },
  { property: "og:title", content: SITE_TITLE },
  { property: "og:description", content: SITE_DESCRIPTION },
  { property: "og:url", content: `${SITE_URL}/` },
  { property: "og:locale", content: "en_US" },
  { property: "og:image", content: OG_IMAGE },
  // Width/height let crawlers reserve the correct aspect ratio before the
  // image finishes downloading, which is the difference between a large card
  // and a thumbnail on first share.
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { property: "og:image:type", content: "image/png" },
  { property: "og:image:alt", content: OG_IMAGE_ALT },

  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: SITE_TITLE },
  { name: "twitter:description", content: SITE_DESCRIPTION },
  { name: "twitter:image", content: OG_IMAGE },
  { name: "twitter:image:alt", content: OG_IMAGE_ALT },

  { name: "theme-color", content: "#285f8f" },
  { tagName: "link", rel: "canonical", href: `${SITE_URL}/` },
];

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
  { rel: "manifest", href: "/site.webmanifest" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  // `injectFirst` puts emotion's <style> tags ahead of app.css in the document,
  // so the hand-rolled styles keep winning ties against MUI's defaults. Without
  // it MUI is injected last and silently outranks them.
  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <Outlet />
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
