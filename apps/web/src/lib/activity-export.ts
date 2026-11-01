import type { CampaignList } from "@staysuite/validation";
export function csvCell(value: string) {
  let start = 0;
  while (
    start < value.length &&
    (value.charCodeAt(start) <= 32 || value[start]?.trim() === "")
  )
    start++;
  const safe = /^[=+@-]/u.test(value.slice(start)) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Quote RFC 4180 cells and neutralize spreadsheet formula prefixes. */
export function activityCsv(campaigns: CampaignList["campaigns"]) {
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
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
