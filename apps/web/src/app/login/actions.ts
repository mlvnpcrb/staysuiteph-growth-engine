"use server";
import { redirect } from "next/navigation";
import { signInSchema } from "@staysuite/validation";
import { environment } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase";
export async function signIn(form: FormData) {
  if (!environment().configured) redirect("/login?error=configuration");
  const result = signInSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!result.success) redirect("/login?error=invalid");
  const client = await supabaseServer();
  const { error } = await client.auth.signInWithPassword(result.data);
  if (error) redirect("/login?error=credentials");
  redirect("/dashboard/overview");
}
export async function signOut() {
  if (environment().configured) {
    const client = await supabaseServer();
    await client.auth.signOut();
  }
  redirect("/login");
}
