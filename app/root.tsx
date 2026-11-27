import { configureTracking } from "@agent-native/core/client/analytics";
import { appPath } from "@agent-native/core/client/api-path";
import { useDbSync } from "@agent-native/core/client/hooks";
import { createAgentNativeQueryClient } from "@agent-native/core/client/hooks";
import { getThemeInitScript } from "@agent-native/core/client/ui";
import { AppProviders } from "@agent-native/toolkit/app/providers";
import { ClientOnly } from "@agent-native/toolkit/app/shared/ClientOnly";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from "react-router";
import type { LinksFunction } from "react-router";

import { Layout as AppLayout } from "@/components/layout/Layout";
import { CafeProvider } from "@/components/cafe";
import { AppToolkitProvider } from "@/components/ui/toolkit-provider";
import { useNavigationState } from "@/hooks/use-navigation-state";
import { APP_NAME, APP_TITLE } from "@/lib/app-config";
import { TAB_ID } from "@/lib/tab-id";

import stylesheet from "./global.css?url";

configureTracking({
  getDefaultProps: (_name, properties) => ({
    ...properties,
    app: APP_NAME,
  }),
});

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
];

const THEME_INIT_SCRIPT = getThemeInitScript();
const PUBLIC_PATHS = ["/", "/menu", "/checkout", "/order", "/staff"];

function isPublicCafePath(pathname: string) {
  return PUBLIC_PATHS.some((path) =>
    path === "/"
      ? pathname === path
      : pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        {/* guard:allow-raw-color - theme-color metadata requires a concrete browser-chrome color. */}
        <meta name="theme-color" content="#18181B" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content={APP_TITLE} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
        <link rel="icon" type="image/svg+xml" href={appPath("/favicon.svg")} />
        <link rel="apple-touch-icon" href={appPath("/icon-180.svg")} />
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

function DbSyncSetup() {
  const qc = useQueryClient();
  useNavigationState();
  useDbSync({
    queryClient: qc,
    ignoreSource: TAB_ID,
  });
  return null;
}

export default function Root() {
  const [queryClient] = useState(() => createAgentNativeQueryClient());
  const { pathname } = useLocation();
  return (
    <AppToolkitProvider>
      <AppProviders queryClient={queryClient} isPublicPath={isPublicCafePath(pathname)}>
        <ClientOnly>
          <DbSyncSetup />
        </ClientOnly>
        <CafeProvider>
          <AppLayout>
            <Outlet />
          </AppLayout>
        </CafeProvider>
      </AppProviders>
    </AppToolkitProvider>
  );
}

export { ErrorBoundary } from "@agent-native/toolkit/app/shared";
