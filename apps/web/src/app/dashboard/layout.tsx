import { redirect } from "next/navigation";
import { environment } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase";
import { DashboardShell } from "@/components/dashboard-shell";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const env = environment();
  if (!env.demo) {
    if (!env.configured) redirect("/login");
    const client = await supabaseServer();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) redirect("/login");
  }
  return <DashboardShell demo={env.demo}>{children}</DashboardShell>;
}
