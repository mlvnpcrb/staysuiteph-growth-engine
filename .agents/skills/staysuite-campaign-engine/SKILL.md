---
name: staysuite-campaign-engine
description: Design sequential campaign preparation queues with configurable delays and explicit user publishing gates. Use for campaign state machines, Posting Queue, scheduling, retries, cancellation, or dashboard-extension synchronization.
---

# StaySuite Campaign Engine

1. Define campaign ownership, ordered group targets, content versions, rule verification evidence, and configurable minimum delays. Store times in UTC and display schedules in Asia/Manila.
2. Model draft, needs_review, ready, waiting_for_user, completed, paused, cancelled, and failed transitions explicitly. A completed preparation task is not proof of Facebook publication; record publication confirmation separately.
3. Process at most one active item per campaign. Use backend transactions, scoped idempotency keys, leases, and version checks to prevent duplicate claims across tabs, extension restarts, and dashboard sessions.
4. Persist next_eligible_at; enforce delays server-side across retries and restarts. Do not use timing to evade Facebook limits or promise safe posting frequency. Pause on restrictions and require review before resuming.
5. Recheck authentication, tenant ownership, group rules, and current draft version before preparing each item. Any rule or content change invalidates earlier readiness as appropriate.
6. Require a fresh explicit user action for every final publish in Facebook's supported interface. Do not schedule unattended publishing or mark composer-open events as publication success.
7. Support pause, resume, cancel, bounded retries for transient backend failures, and auditable state changes. Never automatically retry a possibly successful publish. Reconcile uncertain outcomes with the user.
8. Keep extension/dashboard synchronization on authenticated backend contracts with minimal payloads. Never relay privileged keys or Facebook credentials through extension storage or messages.

When implementing, test ordering, concurrent claims, idempotency, delays across restarts, stale updates, cancellation races, tenant isolation, ambiguous outcomes, and per-item user publishing gates using deterministic clocks.
