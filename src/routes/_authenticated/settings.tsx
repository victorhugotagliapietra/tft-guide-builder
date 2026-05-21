import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { profileFormSchema, type ProfileFormValues } from "@/features/collections/types";
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

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

/**
 * Lets a creator edit their username + display name post-onboarding.
 *
 * Username changes break every old `/profile/<old-username>` link, so we
 * surface that warning inline. We re-use the same form schema as the
 * onboarding gate to keep validation rules in one place.
 */
function SettingsPage() {
  const { user, profile, refreshProfile, loading } = useAuth();
  const [checking, setChecking] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { username: "", display_name: "" },
  });
  const { reset } = form;

  useEffect(() => {
    if (profile) {
      reset({
        username: profile.username ?? "",
        display_name: profile.display_name ?? "",
      });
    }
  }, [profile, reset]);

  const onSubmit = async (values: ProfileFormValues) => {
    if (!user || !profile) return;

    // Only run the availability check if the username actually changed —
    // otherwise the user gets a false "taken" error caused by their own row.
    if (values.username !== profile.username) {
      setChecking(true);
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
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        username: values.username,
        display_name: values.display_name,
      })
      .eq("id", user.id);

    if (error) {
      if (error.message.toLowerCase().includes("unique")) {
        form.setError("username", { message: "That username is taken" });
      } else {
        toast.error(error.message);
      }
      return;
    }
    await refreshProfile();
    toast.success("Settings saved");
  };

  if (loading || !profile) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-muted-foreground">Loading…</div>;
  }

  const currentUsername = profile.username;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">How you're shown across the platform.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Creator profile</CardTitle>
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
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>Shown on your profile and guides.</FormDescription>
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
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                      />
                    </FormControl>
                    <FormDescription className="space-y-1">
                      <span>
                        Profile URL:{" "}
                        <span className="font-mono">/profile/{field.value || "…"}</span>
                      </span>
                      {currentUsername && currentUsername !== field.value && (
                        <span className="block text-amber-500">
                          Changing your username breaks any old /profile/{currentUsername} links
                          you've shared.
                        </span>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={form.formState.isSubmitting || checking}>
                  {form.formState.isSubmitting || checking ? "Saving…" : "Save"}
                </Button>
                {currentUsername && (
                  <Button asChild variant="outline" type="button">
                    <Link to="/profile/$username" params={{ username: currentUsername }}>
                      <ExternalLink className="h-4 w-4 mr-1" /> View public profile
                    </Link>
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
