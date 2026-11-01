import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";
import "./reference-compose.css";
import "./reference-automations.css";
import "./reference-radar.css";
export const metadata: Metadata = {
  title: { default: "StaySuite · Growth Engine", template: "%s · StaySuite" },
  description: "Group posting, automations, and activity.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
