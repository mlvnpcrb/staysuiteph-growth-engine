import { expect, type Page } from "@playwright/test";

/** Audit the selected theme's final colors, not intermediate animation frames. */
export async function settleTheme(page: Page, theme: string) {
  await expect(page.locator("html")).toHaveClass(new RegExp(theme));
  await page.evaluate(() => {
    // Offscreen transitions can be suspended by rendering optimizations. Finish
    // finite CSS transitions explicitly instead of awaiting promises indefinitely.
    for (const animation of document.getAnimations()) {
      if (animation instanceof CSSTransition) animation.finish();
    }
  });
}
