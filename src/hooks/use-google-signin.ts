import { useCallback, useState } from "react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable/index";

/**
 * Single-button Google sign-in. The OAuth flow with Supabase auto-creates an
 * `auth.users` row on first sign-in — there is no separate signup step. The
 * email/displayName/avatar from Google land in `user.user_metadata` and the
 * stable identifier is `user.id` (used as `guides.author_id`).
 *
 * `returnTo` is appended to the OAuth redirect_uri so a user who clicked
 * "Create guide" while signed out lands directly on /guides/new (or wherever)
 * after Google completes — no dead-end stop on /login.
 */
export function useGoogleSignIn() {
  const [signingIn, setSigningIn] = useState(false);

  const signInWithGoogle = useCallback(async (returnTo?: string) => {
    setSigningIn(true);
    try {
      // Build absolute redirect URI from current origin + optional path.
      // The Supabase callback handler will preserve the path after token exchange.
      const redirectUri =
        typeof window === "undefined"
          ? undefined
          : returnTo
            ? new URL(returnTo, window.location.origin).toString()
            : window.location.origin;

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectUri,
      });

      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        setSigningIn(false);
        return false;
      }
      // If the OAuth flow redirected the window, control never returns here.
      if (result.redirected) return true;
      setSigningIn(false);
      return true;
    } catch (err) {
      console.error("[auth] Google sign-in threw:", err);
      toast.error("Google sign-in failed");
      setSigningIn(false);
      return false;
    }
  }, []);

  return { signInWithGoogle, signingIn };
}
