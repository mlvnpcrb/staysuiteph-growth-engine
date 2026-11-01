# StaySuite Coastal

StaySuite's design language connects Philippine hospitality with a practical daily workspace. Deep navy anchors reading, French Blue identifies primary actions, and aqua supports selection and illustration. White working surfaces carry the information; color is not a substitute for labels.

## Source of truth

- Palette, semantic colors, type, spacing, radii, and motion: `apps/web/src/app/design-tokens.css`.
- Shared button roles: `packages/ui/src/button.tsx`.
- Review status treatments and workspace integration: `apps/web/src/app/globals.css`.
- Interactive reference page: `/design-language` (contains labeled examples only).
- Stageshow walkthrough: `apps/web/src/components/onboarding/group-review-demo.tsx`. Available on the reference page and in Overview's “See how group review works” disclosure.

## Color

| Primitive | Value | Role |
| --- | --- | --- |
| Deep Twilight | `#03045e` | Light-theme headings and primary text |
| French Blue | `#023e8a` | Primary action background, white foreground |
| Bright Teal Blue | `#0077b6` | Light-theme links and focus |
| Blue Green | `#0096c7` | Supporting illustration/chart color |
| Turquoise Surf | `#00b4d8` | Supporting illustration/chart color |
| Sky Aqua | `#48cae4` | Highlights and dark-theme focus |
| Frosted Blue | `#90e0ef` | Dark-theme primary action, navy foreground |
| Pale Frost | `#ade8f4` | Dark-theme hover and illustration support |
| Light Cyan | `#caf0f8` | Selected accents and illustration support |

Components consume semantic roles such as `--text`, `--action`, `--selected`, and `--focus`, rather than choosing a palette step directly. The page canvas is a near-white blue (`#f4f9fc`), with white surfaces and cool borders. Dark mode uses navy surfaces and lighter blue actions, preserving hierarchy instead of inverting each color.

Success (`--success`), warning (`--warning`), and danger (`--danger`) each have separate foreground and surface tokens in both themes. “Personally reviewed,” “Rules need review,” and “Not suitable” retain explicit labels. A reviewed status does not establish publishing permission. Unknown evidence must not be styled as success.

Do not use white text on the bright aqua colors. Reserve bright accents for non-text decoration or pair them with navy. Meaningful chart marks must remain distinguishable beyond color alone.

## Typography and structure

Manrope is self-hosted as a variable font, with its SIL Open Font License preserved under `apps/web/public/fonts/`. Use one family, with 500/600/650 weights for hierarchy and tabular numeric alignment for comparisons. Body copy is 14px with generous line height; supporting information should generally be 12px or larger. Large headings belong to page entry points, not every card.

Use 4, 8, 12, 16, 24, and 32px spacing tokens. Controls have 8px corners and working cards 12px corners. Existing real buttons retain a 44px minimum height. Borders organize adjacent information; shadows are reserved for raised surfaces. Main lists stay compact and details expand near the selected group.

Use the existing Lucide outline family consistently. Focus rings are visible in both themes, status includes text, and contrast must be checked on the actual surface. Preserve keyboard navigation and mobile layouts.

## Motion and Stageshow

Functional feedback uses 160ms; surface transitions use 240ms with `cubic-bezier(0.25, 0.8, 0.25, 1)`. Honor the app's reduced-motion setting.

The onboarding illustration uses the actual Stageshow kit, adapted from its `form-error` gold. Its story is: record a rule excerpt → confirm personal review → save → hold the result. It plays once and has an explicit replay control. Reduced motion shows the completed review immediately, including after replay. The narrow layout is a compact form composition, rather than a scaled desktop window.

The illustration is marked as an example, excluded from the accessibility tree, and accompanied by a plain-language caption. It makes no requests to the group API and never edits a real group. Accessible real controls remain outside the simulated interface.

The vendored MIT runtime and source are documented in `apps/web/vendor/stageshow/README.md`. The app's strict TypeScript configuration is unchanged. Regenerate runtime files with `node scripts/build-stageshow.mjs`; do not hand-edit generated output.

## Scope

This pass applies the shared language to the web shell, buttons, Overview, My Groups, and the Stageshow reference. It does not reconcile the older UI branch with the newer campaign branch, alter authentication or data, or authorize a production merge.
