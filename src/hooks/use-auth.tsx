import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Lightweight subset of the profiles row that the rest of the app reads.
// Keeping the slice narrow avoids re-rendering when columns we don't care
// about (e.g. avatar_url) change in another tab.
export type AuthProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  // True while we're either resolving the initial session OR fetching the
  // profile row for the current user. Routes that gate on the username
  // (e.g. the onboarding redirect) MUST wait for this to settle, otherwise
  // they'd bounce a freshly signed-in user before their profile is loaded.
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // Re-fetched whenever the user id changes. Exposed via `refreshProfile`
  // so the onboarding / settings pages can ping it after they mutate.
  async function loadProfile(userId: string) {
    setProfileLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.warn("[auth] profile fetch failed:", error.message);
      setProfile(null);
    } else {
      setProfile(data ?? null);
    }
    setProfileLoading(false);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setSessionLoading(false);
      if (s?.user) {
        void loadProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
      if (data.session?.user) {
        void loadProfile(data.session.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading: sessionLoading || profileLoading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
        refreshProfile: async () => {
          if (session?.user) await loadProfile(session.user.id);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
