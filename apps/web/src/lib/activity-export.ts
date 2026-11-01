import type { CampaignList } from "@staysuite/validation";
/** Quote RFC 4180 cells and neutralize spreadsheet formula prefixes. */
export function activityCsv(campaigns: CampaignList["campaigns"]) {
  const cell = (value: string) => {
    let start = 0;
    while (
      start < value.length &&
      (value.charCodeAt(start) <= 32 || value[start]?.trim() === "")
    )
      start++;
    const safe = /^[=+@-]/u.test(value.slice(start)) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [
      ["Campaign ID", "Title", "Post text", "Status", "Saved at (UTC)"],
      ...campaigns.map((item) => [
        item.id,
        item.title,
        item.plan.text,
        item.state,
        item.created_at,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
