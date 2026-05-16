import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { profileFormSchema, type ProfileFormValues } from "@/features/collections/types";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const onboardingSearch = z.object({
  next: z.string().startsWith("/").optional().catch(undefined),
});

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
  validateSearch: onboardingSearch,
});

/**
 * Hard gate after Google sign-in: a newly created account has no username,
 * and a username is required for the creator profile URL to exist. Users
 * can't bypass this — every protected route bounces them back here until
 * `profiles.username` is set.
 *
 * The page is intentionally minimal (one field) so it feels like one extra
 * click rather than a real onboarding flow.
 */
function OnboardingPage() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile } = useAuth();
  const { next } = Route.useSearch();
  const [checking, setChecking] = useState(false);

  // Default to a sanitized version of the Google display name so most users
  // just hit Save without thinking. The DB has a UNIQUE constraint, so a
  // collision surfaces as an error — handled below.
  const defaultDisplay =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    "";
  const defaultUsername = sanitizeUsername(defaultDisplay) || "creator";

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      username: defaultUsername,
      display_name: defaultDisplay,
    },
  });
  const { reset } = form;

  // Once auth finishes resolving, redirect users who shouldn't be here:
  // (a) not signed in → /login, (b) already have a username → /next.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (profile?.username) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ to: (next ?? "/dashboard") as any, replace: true });
      return;
    }
    // Seed the form with whatever Google gave us once profile loads.
    if (profile && !profile.username) {
      reset({
        username: sanitizeUsername(profile.display_name ?? defaultDisplay) || "creator",
        display_name: profile.display_name ?? defaultDisplay,
      });
    }
  }, [loading, user, profile, next, navigate, reset, defaultDisplay]);

  const onSubmit = async (values: ProfileFormValues) => {
    if (!user) return;
    setChecking(true);
    // Pre-check availability so a collision surfaces as a field error rather
    // than a generic Postgres unique-violation toast. Race conditions (two
    // users claiming the same name in the same second) still bubble up via
    // the .update() error path below.
    const { data: available, error: availErr } = await supabase.rpc("is_username_available", {
      p_username: values.username,
    });
    setChecking(false);
    if (availErr) {
      toast.error(availErr.message);
      return;
    }
    if (!available) {
      form.setError("username", { message: "That username is taken" });
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        username: values.username,
        display_name: values.display_name,
      })
      .eq("id", user.id);

    if (error) {
      // Most likely a race-condition unique violation; surface to the field.
      if (error.message.toLowerCase().includes("unique")) {
        form.setError("username", { message: "That username is taken" });
      } else {
        toast.error(error.message);
      }
      return;
    }
    await refreshProfile();
    toast.success("You're all set!");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: (next ?? "/dashboard") as any, replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Pick a creator name</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="display_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display name</FormLabel>
                      <FormControl>
                        <Input placeholder="How you want to be credited" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="lowercase, letters/numbers/dashes"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                        />
                      </FormControl>
                      <FormDescription>
                        Your profile URL will be{" "}
                        <span className="font-mono">/profile/{field.value || "…"}</span>. You can
                        change it later in Settings.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={form.formState.isSubmitting || checking}
                >
                  {form.formState.isSubmitting || checking ? "Saving…" : "Continue"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

/**
 * Best-effort transform of a display name into a valid username candidate.
 * Lowercases, strips diacritics, replaces non-[a-z0-9] with dashes, trims
 * dashes, caps length. Result may still need user editing if it ends up
 * empty or too short — the form validator catches that.
 */
function sanitizeUsername(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}
