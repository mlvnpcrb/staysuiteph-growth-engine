import { expect, it } from "vitest";
import {
  preparePostVariation,
  transformPostText,
} from "../../apps/web/src/components/campaigns/text-tools";
it("styles only selected letters without changing prices, emoji or locations", () => {
  const offer = "Stay 🏡 in Makati — ₱2,500/night";
  const bold = transformPostText(offer, 0, 4, "bold");
  expect(bold.text).toBe("𝐒𝐭𝐚𝐲 🏡 in Makati — ₱2,500/night");
  expect(transformPostText(bold.text, bold.start, bold.end, "bold").text).toBe(
    offer,
  );
  expect(transformPostText("hi", 0, 2, "italic").text).toBe("ℎ𝑖");
});
it("does not insert invented placeholder text when nothing is selected", () => {
  expect(transformPostText("Makati offer", 3, 3, "bold").text).toBe(
    "Makati offer",
  );
});
it("numbers only complete selected lines, preserves blank lines and toggles cleanly", () => {
  const text = "Offer\nMakati\n\n2 guests\nContact us";
  const result = transformPostText(text, 6, 20, "numbers");
  expect(result.text).toBe("Offer\n1. Makati\n\n2. 2 guests\nContact us");
  expect(
    transformPostText(result.text, result.start, result.end, "numbers").text,
  ).toBe(text);
});
it("preserves the complete offer while preparing an explicitly chosen opening", () => {
  const offer = "Makati · ₱2,500/night\nAsk us about availability. 🏡";
  expect(preparePostVariation(offer, "Hello!\nGood day!", () => 0)).toBe(
    "Hello!\n\n" + offer,
  );
  expect(preparePostVariation(offer, "Hello!\nGood day!", () => 0.99)).toBe(
    "Good day!\n\n" + offer,
  );
  expect(offer).toBe("Makati · ₱2,500/night\nAsk us about availability. 🏡");
});
it("rejects empty and oversized variation previews", () => {
  expect(preparePostVariation("", "Hello!")).toBeNull();
  expect(preparePostVariation("Offer", "  ")).toBeNull();
  expect(preparePostVariation("a".repeat(10000), "Hello!")).toBeNull();
});
