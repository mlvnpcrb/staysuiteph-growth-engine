"use client";
import { useTheme } from "next-themes";
import { SunMoon } from "lucide-react";
import { Button } from "@staysuite/ui";
export function DesignThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="outline"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunMoon size={17} /> Switch theme
    </Button>
  );
}
