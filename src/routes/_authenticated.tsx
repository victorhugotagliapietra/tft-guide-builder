import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/_authenticated")({
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Two redirects to manage here, in priority order:
  //
  //   1. Not signed in → /login (preserve return path so deep-linked
  //      protected URLs resume after Google completes).
  //   2. Signed in but no `username` set → /onboarding. A username is
  //      required for the public profile URL to exist, so we can't let a
  //      user create guides or collections before claiming one.
  //
  // Once both conditions are satisfied, the layout simply renders its
  // children. The username gate is intentionally enforced ABOVE the
  // protected routes (not inside each one) so adding new authed pages
  // never accidentally bypasses it.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({
        to: "/login",
        search: { next: location.pathname },
        replace: true,
      });
      return;
    }
    if (!profile?.username) {
      navigate({
        to: "/onboarding",
        search: { next: location.pathname },
        replace: true,
      });
    }
  }, [user, profile, loading, navigate, location.pathname]);

  if (loading || !user || !profile?.username) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center text-muted-foreground">
          Loading...
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
