import { expect, it } from "vitest";
import { activityCsv } from "../../apps/web/src/lib/activity-export";
it("quotes commas, multiline text and literal quotes, preserving Unicode", () => {
  const csv = activityCsv([
    {
      id: "fixture",
      description: "",
      title: 'Cebu, "Weekend"',
      plan: { text: "Hello\n世界" },
      revision: 1,
      state: "completed",
      created_at: "2026-11-01T00:00:00Z",
    },
  ]);
  expect(csv).toContain('"Cebu, ""Weekend"""');
  expect(csv).toContain('"Hello\n世界"');
  expect(csv.startsWith("\uFEFF")).toBe(true);
});
it.each(['=HYPERLINK("bad")', "+cmd", "-cmd", "@sum", "\t=cmd", "\n+cmd"])(
  "neutralizes spreadsheet formula injection %s",
  (title) => {
    expect(
      activityCsv([
        {
          id: "fixture",
          description: "",
          title,
          plan: { text: title },
          revision: 1,
          state: "completed",
          created_at: "2026-11-01",
        },
      ]),
    ).toContain(`"'${title.replaceAll('"', '""')}"`);
  },
);
