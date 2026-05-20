import { useCallback, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single-button Google sign-in. The OAuth flow with Supabase auto-creates an
 * `auth.users` row on first sign-in — there is no separate signup step. The
 * email/displayName/avatar from Google land in `user.user_metadata` and the
 * stable identifier is `user.id` (used as `guides.author_id`).
 *
 * `returnTo` is appended to the OAuth redirect so a user who clicked
 * "Create guide" while signed out lands directly on /guides/new (or wherever)
 * after Google completes — no dead-end stop on /login.
 */
export function useGoogleSignIn() {
  const [signingIn, setSigningIn] = useState(false);

  const signInWithGoogle = useCallback(async (returnTo?: string) => {
    setSigningIn(true);
    try {
      const redirectTo =
        typeof window === "undefined"
          ? undefined
          : returnTo
            ? new URL(returnTo, window.location.origin).toString()
            : window.location.origin;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (error) {
        toast.error(error.message ?? "Google sign-in failed");
        setSigningIn(false);
        return false;
      }
      // signInWithOAuth redirects the window on success; control rarely returns here.
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
