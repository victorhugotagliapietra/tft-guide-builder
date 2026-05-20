import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useGoogleSignIn } from "@/hooks/use-google-signin";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Optional `?next=/some/path` so deep-linked protected routes survive the
// OAuth round-trip. Any external URL is rejected by the schema: we only allow
// same-origin paths starting with "/".
const loginSearch = z.object({
  next: z.string().startsWith("/").optional().catch(undefined),
});

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: loginSearch,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { next } = Route.useSearch();
  const { signInWithGoogle, signingIn } = useGoogleSignIn();

  // If the user is already signed in, bounce them to wherever they intended
  // to go (or their guides). No reason to ever show this page to a logged-in
  // user — it would just be a dead end.
  useEffect(() => {
    if (loading) return;
    if (user) {
      // `next` is an arbitrary same-origin path validated by the search
      // schema; TanStack's typed-path `to` doesn't accept dynamic strings,
      // so we cast at this boundary. Safety is enforced by the zod schema
      // (must start with "/") rather than the type system.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ to: (next ?? "/dashboard") as any, replace: true });
    }
  }, [user, loading, next, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center space-y-1">
            <CardTitle className="font-display text-2xl tracking-tight">
              Enter the workshop
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Sign in to publish and manage your own guides.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              size="lg"
              className="w-full"
              onClick={() => signInWithGoogle(next)}
              disabled={signingIn}
            >
              <GoogleMark className="mr-2 h-4 w-4" />
              {signingIn ? "Redirecting…" : "Continue with Google"}
            </Button>
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Reading and sharing guides on Hexcraft is always free and anonymous.
              <br />
              You only need an account to <strong>create</strong>.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// Inline Google "G" mark — no extra dependency, scales with text size.
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.9 2.5 2.8 6.6 2.8 11.7S6.9 21 12 21c6.9 0 9.2-4.8 9.2-7.3 0-.5-.1-.9-.1-1.3H12z"
      />
    </svg>
  );
}
