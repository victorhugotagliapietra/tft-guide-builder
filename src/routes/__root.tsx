import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import { TFTDataProvider } from "@/features/tft-data/use-tft-data";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-display text-xs uppercase tracking-[0.3em] text-primary/70">
          Empty hex
        </p>
        <h1 className="font-display text-7xl font-bold text-foreground mt-3 tracking-tight">
          404
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Whatever lived here got rolled away. Nothing on this slot.
        </p>
        <div className="mt-7">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to the workshop
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hexcraft — Comps, level by level." },
      {
        name: "description",
        content:
          "Hexcraft is a workshop for TFT creators. Sketch the early game, plan transitions, and ship a public guide your viewers can paste into the client.",
      },
      { name: "theme-color", content: "#1b1a2b" },
      { property: "og:title", content: "Hexcraft — Comps, level by level." },
      {
        property: "og:description",
        content:
          "A workshop for TFT creators. Sketch boards, plan transitions, ship a shareable link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "TFT Guides — Build & Share Teamfight Tactics Comps" },
      { name: "description", content: "Create and share detailed Teamfight Tactics (TFT) guides with progressive board steps." },
      { property: "og:description", content: "Create and share detailed Teamfight Tactics (TFT) guides with progressive board steps." },
      { name: "twitter:description", content: "Create and share detailed Teamfight Tactics (TFT) guides with progressive board steps." },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Display typeface for the brand mark + landing hero. Loaded
      // alongside its woff2 subset (latin) to keep first-paint snappy.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TFTDataProvider>
          <Outlet />
          <Toaster />
        </TFTDataProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
