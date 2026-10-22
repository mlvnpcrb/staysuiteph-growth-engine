import Link from "next/link";
import { House } from "lucide-react";
import { Button } from "@staysuite/ui";
import { environment } from "@/lib/env";
import { signIn, signOut, signInWithGoogle } from "./actions";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const env = environment();
  const { error } = await searchParams;
  return (
    <main className="auth-page">
      <div className="panel auth-panel">
        <House className="text-teal-700" size={32} />
        <h1>Welcome to StaySuite.</h1>
        <p className="muted">
          A thoughtful place to grow your hosting journey.
        </p>
        {!env.configured ? (
          <p className="my-5 rounded-lg bg-amber-100 p-4 text-sm text-amber-950">
            Authentication is not configured. Ask your administrator to connect
            Supabase, or explicitly enable demo mode locally.
          </p>
        ) : (
          <>
            <form action={signInWithGoogle}>
              <Button type="submit" variant="outline">
                Continue with Google
              </Button>
            </form>
            <p className="muted mt-5 text-center text-sm">
              Or sign in with email
            </p>
            <form action={signIn}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                minLength={8}
                maxLength={128}
                required
              />
              {error ? (
                <p role="alert" className="mt-4 text-red-700 dark:text-red-300">
                  {error === "logout"
                    ? "Sign-out could not be confirmed. Retry before leaving a shared device."
                    : error === "oauth" || error === "callback"
                      ? "Google sign-in could not be completed. Please try again."
                      : error === "configuration"
                        ? "Authentication configuration is incomplete. Contact your administrator."
                        : "Sign-in failed. Check your details or contact your administrator."}
                </p>
              ) : null}
              <Button type="submit">Sign in</Button>
              <p className="muted mt-4 text-xs">
                Use Google or an email account provisioned in Supabase. Google
                may create an account on first sign-in. Email registration and
                password recovery are not included in this foundation.
              </p>
            </form>
          </>
        )}
        {error === "logout" && env.configured ? (
          <form action={signOut}>
            <Button type="submit" variant="outline">
              Retry sign out
            </Button>
          </form>
        ) : null}
        {env.demo ? (
          <Link
            className="mt-5 block text-teal-700 underline dark:text-teal-300"
            href="/dashboard/overview"
          >
            Explore the demo workspace
          </Link>
        ) : null}
      </div>
    </main>
  );
}
