---
name: staysuite-facebook-safety
description: Review Facebook Groups workflows for supported access, rule verification, explicit user publishing, and restriction handling. Use when designing extension permissions, group interactions, posting assistance, campaign controls, or account safety states.
---

# StaySuite Facebook Safety

1. Inventory the intended Facebook interaction, user action, data source, required permission, and evidence that the interface or API is currently supported. Unknown support is a blocker, not a reason to fabricate an integration.
2. Limit scope to Facebook Groups and authorized user-provided information. Do not scrape private groups, harvest member data, request Facebook passwords/cookies, or intercept access tokens.
3. Require current group rule verification, posting eligibility, content review, and any applicable admin approval. Treat unknown rules as blocked readiness.
4. Preserve explicit user control of each final publish in the supported Facebook interface. Draft generation and queue scheduling may assist preparation; they must not silently publish.
5. Stop affected workflows on CAPTCHA, challenge, restriction, rate limit, or permission denial. Explain the observed condition and allow compliant user review. Never bypass CAPTCHA, simulate identities, rotate accounts/proxies, conceal automation, or circumvent limits.
6. Minimize Manifest V3 permissions and host access; use optional permissions where practical. Authenticate backend requests, validate message origins and payloads, and keep secrets server-side. Do not assert CORS or extension identity alone authorizes access.
7. Distinguish observed account warnings from inferred risk. Do not fabricate safety scores or claim guaranteed account protection. Label demo safety data explicitly.
8. Output findings with evidence, severity, blocked behavior, and a compliant alternative. Check current official platform documentation before claiming support; report access failures rather than guessing.

When implementing, test unknown rules, denied access, challenges, per-post user gates, spoofed messages, unauthorized backend requests, and prevention of false publication confirmations.
