import { redirect, notFound } from "next/navigation";
import { navigation } from "@staysuite/types";
import { MyGroups } from "@/components/groups/my-groups";
import { CampaignBuilder } from "@/components/campaigns/campaign-builder";
import { PostingQueue } from "@/components/campaigns/posting-queue";
import { TemplateLibrary } from "@/components/templates/template-library";
import { EmptySection } from "@/components/empty-section";
export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "overview") redirect("/dashboard/compose");
  if (section === "campaigns") redirect("/dashboard/automations");
  if (section === "posting-queue") redirect("/dashboard/activity");
  const item = navigation.find((item) => item.slug === section);
  if (!item) notFound();
  if (item.slug === "templates") return <TemplateLibrary />;
  if (item.slug === "my-groups") return <MyGroups />;
  if (item.slug === "compose") return <CampaignBuilder view="compose" />;
  if (item.slug === "automations")
    return <CampaignBuilder view="automations" />;
  if (item.slug === "activity") return <PostingQueue />;
  return (
    <EmptySection
      section={item.slug}
      title={item.label}
      description={item.description}
    />
  );
}
