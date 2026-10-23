import { expect, type Page } from "@playwright/test";

/** Audit the selected theme after its CSS transitions, without disabling contrast checks. */
export async function settleTheme(page: Page, theme: string) {
  await expect(page.locator("html")).toHaveClass(new RegExp(theme));
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}
