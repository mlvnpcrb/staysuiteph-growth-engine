import { GroupFinder } from "@/components/groups/finder";
import { MyGroups } from "@/components/groups/my-groups";
import { notFound } from "next/navigation";
import { navigation } from "@staysuite/types";
import { Overview } from "@/components/overview";
import { EmptySection } from "@/components/empty-section";
export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const item = navigation.find((item) => item.slug === section);
  if (!item) notFound();
  if (item.slug === "group-finder") return <GroupFinder />;
  if (item.slug === "my-groups") return <MyGroups />;
  return item.slug === "overview" ? (
    <Overview />
  ) : (
    <EmptySection
      section={item.slug}
      title={item.label}
      description={item.description}
    />
  );
}
