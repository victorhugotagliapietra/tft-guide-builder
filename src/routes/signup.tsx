import { createFileRoute, redirect } from "@tanstack/react-router";

// Signup is no longer a distinct flow — Google OAuth auto-creates an account
// on first sign-in, so /login is the only entry point. This route is kept as
// a permanent redirect so old links / external bookmarks don't 404.
export const Route = createFileRoute("/signup")({
  beforeLoad: () => {
    throw redirect({ to: "/login", replace: true });
  },
});
