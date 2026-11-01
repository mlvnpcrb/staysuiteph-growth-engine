# Group review illustration rehearsal

Gold: Stageshow `examples/form-error`. Retained its measured cursor, fixed message lanes, once-only script, result hold, and reduced-motion payoff poster. Changed the task to personally reviewing a sample group's rules, replaced the form's content and colors with StaySuite tokens, and redesigned compact view as an in-app form rather than a narrow desktop window.

## Evidence

- The actual authored React components were bundled into an isolated local HTTP rehearsal harness, using the app's compiled Tailwind/global styles, locally hosted Manrope font, and real Stageshow runtime. The harness also rendered the unmodified gold component for comparison.
- Chromium checks passed at 1200px and 390px in light/dark themes: no horizontal overflow, reduced-motion payoff survives replay, zero automated WCAG A/AA violations in the reference page. Animation completed and replayed, with zero non-GET requests.
- Desktop and mobile contact sheets cover 12 frames over approximately 12 seconds. The latest gate runs reported “rehearsal passed” with no never-intentional findings. However, recordings contained sampling gaps (desktop maximum 45.6ms, compact maximum 39.3ms), so the motion coverage reports remain inconclusive. Do not treat the gate message as full motion approval.
- A fresh-eye reviewer inspected the gold still, both contact sheets, and light-desktop/dark-mobile host stills. Their finding was a weak saved payoff; the final confirmation now uses a stronger success fill. No framing or wrapping finding was identified in the supplied frames. The reviewer could not judge rapid transitions, press choreography, or 4× glyph details from these artifacts.
- Source-level lint, strict TypeScript, and 182 unit tests passed. The vendored runtime also rebuilds successfully with its own strict TypeScript config. No application type-checking rules were relaxed.

## Limits

The isolated harness verifies authored component behavior and visual layout, not deployed Next.js routing or a logged-in backend flow. The local Next.js production build stalled in this environment's compiler stage and was stopped; the full application browser suite could not start without a production build. The new route's integration tests are committed but not claimed as run successfully here. Hosted build status is reported separately when deployed.

No real group data, sign-in session, publishing, campaign, or API write was used for the illustration. The final success-fill polish is rechecked through the same component browser harness; frame-perfect animation at 40–80ms remains unverified.
