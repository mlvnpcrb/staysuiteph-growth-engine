# Stageshow runtime subset

Source: https://github.com/benjitaylor/skills/tree/main/stageshow/kit

Copied from the user-requested Stageshow skill installed for this chat. The installer recorded skill hash `bf9f07985a62882deae7935b5b1162fb5bf66b248930bb14a75dcaf9d67291b7`. MIT license is preserved in LICENSE. Only the transitive runtime files required by Stage, Window, Row, Check, and States are included; source files are unchanged apart from a local export entry.

`source/` is the upstream TypeScript. `../../src/vendor/stageshow/` contains generated JavaScript, declarations, and CSS. Run `node scripts/build-stageshow.mjs` from the workspace root to regenerate it. Committed runtime output makes deployment independent of an extra bundler or package install.

The upstream source compiles with its own strict configuration. The host application retains `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`; it consumes generated declarations. ESLint excludes upstream and generated vendor files; authored integration components remain checked. No application lint/type rules were relaxed.

The application demo adapts the `form-error` gold's fixed message lanes, measured cursor, once-only choreography, and payoff poster. It changes the task to personal group-rule review, uses StaySuite tokens, and supplies a compact form composition rather than a narrow desktop frame.
