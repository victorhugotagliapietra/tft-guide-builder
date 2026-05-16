import { Link, useNavigate } from "@tanstack/react-router";
import { Folders, LayoutDashboard, LogOut, Settings, Swords, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useGoogleSignIn } from "@/hooks/use-google-signin";

/**
 * Top bar shown on every page.
 *
 * Logged out → single "Sign in with Google" button. There is no separate
 * signup flow; Google OAuth auto-creates an account on first use.
 *
 * Logged in → avatar dropdown with display name/email, "My Guides", and
 * Sign out. Avoids the visual weight of two buttons in the header for a
 * platform whose dominant audience is anonymous viewers.
 */
export function SiteHeader() {
  const { user, profile, signOut } = useAuth();
  const { signInWithGoogle, signingIn } = useGoogleSignIn();
  const navigate = useNavigate();

  // user_metadata is the standard Supabase OAuth landing pad — Google fills
  // these in automatically on first sign-in. Falling back gracefully keeps
  // the header readable even if a provider omits a field.
  const meta = (user?.user_metadata ?? {}) as {
    avatar_url?: string;
    picture?: string;
    full_name?: string;
    name?: string;
    email?: string;
  };
  const avatarUrl = meta.avatar_url ?? meta.picture;
  const displayName = meta.full_name ?? meta.name ?? user?.email ?? "Account";
  const email = meta.email ?? user?.email ?? "";
  const initial = (displayName[0] ?? "?").toUpperCase();

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Swords className="h-5 w-5 text-primary" />
          <span>TFT Guides</span>
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-full outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Account menu"
                >
                  <Avatar className="h-9 w-9">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                    <AvatarFallback>{initial}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium leading-tight">{displayName}</span>
                  {email && (
                    <span className="text-xs text-muted-foreground leading-tight">{email}</span>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {profile?.username && (
                  <DropdownMenuItem
                    onSelect={() =>
                      navigate({
                        to: "/profile/$username",
                        params: { username: profile.username! },
                      })
                    }
                  >
                    <User className="h-4 w-4 mr-2" />
                    Public profile
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => navigate({ to: "/dashboard" })}>
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  My Guides
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate({ to: "/collections" })}>
                  <Folders className="h-4 w-4 mr-2" />
                  My Collections
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate({ to: "/settings" })}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async () => {
                    await signOut();
                    navigate({ to: "/" });
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => signInWithGoogle()}
              disabled={signingIn}
            >
              <GoogleMark className="mr-2 h-4 w-4" />
              Sign in with Google
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.9 2.5 2.8 6.6 2.8 11.7S6.9 21 12 21c6.9 0 9.2-4.8 9.2-7.3 0-.5-.1-.9-.1-1.3H12z"
      />
    </svg>
  );
}
