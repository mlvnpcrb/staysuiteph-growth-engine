# Standalone StaySuite extension — 0.6.0

The default Chrome action now opens the StaySuite application itself. Compose, Templates, Automations, Lead Radar, Activity and All groups render as packaged React views. No website iframe, dashboard-tab pairing, site-cookie extraction or website tab is required for this mode. The existing website and legacy extension pages remain available for compatibility.

## Account and backend

The owner chose email/password sign-in for this version. Use an existing StaySuite account with a password; an account created only through Google must have a password configured before using this sign-in method. No Google redirect setup is required or used. There is no Facebook password input.

The extension requests optional access to the single StaySuite Supabase project when the user signs in. Only the project's public publishable configuration is packaged. The Supabase SDK stores the account session in Chrome local storage restricted to TRUSTED_CONTEXTS. Background messages return a verified user ID/email, never access/refresh tokens. Every request carries a pinned owner, and handlers independently validate the current session using getUser. Sign-out pauses owned active runs before discarding the extension session; failures are shown rather than claiming a confirmed sign-out.

The framework-neutral @staysuite/backend package contains the existing handlers for groups, library, campaigns, publisher readiness, templates, schedules, flows and Radar. The website supplies its cookie-authenticated client; the extension supplies its own unprivileged authenticated client. Both use the same schemas, ownership checks, revision gates and database RLS/RPC policies. Supabase signing/storage calls stay scoped to the signed-in owner. No service-role key or new database privilege was introduced. This is direct backend access, not CORS/authentication bypass of a protected Vercel preview.

Native API messages are accepted only from this extension's popup or suite page in its top frame. Request destinations and methods are allowlisted; arbitrary external destinations, forged ownership and extra credential fields are rejected. Website/content-script senders cannot call these native commands. Existing web pairing messages remain separate for legacy compatibility.

## Facebook and posting

Connect Facebook grants the existing optional Facebook/tab access. The current experimental Direct adapter still needs an existing signed-in Facebook tab, which it reuses without changing its URL or focus. Post Now does not create an engine/Facebook tab. Facebook request context remains inside the Facebook page function and is never returned to StaySuite storage or backend.

The Post click captures exact content, media, groups and actor. A verified profile runs through the session-scoped extension queue, server claims/eligibility and Chrome alarm continuation. Closing the popup does not require a dashboard driver. Reopening Compose restores progress for a running owned campaign; Activity provides saved receipts and native pause/cancel actions. A request already submitted may finish after pause/cancel. An interrupted or uncertain operation is never automatically resubmitted.

An unverified profile gets a first-post check inside the extension. The user reviews the exact message, attachment manifests and first group's name/URL, explicitly authorizes one real post, inspects its confirmed Facebook receipt and confirms compatibility. It does not automatically send to the remaining groups. The test post already exists and must be accounted for before creating another run.

Native schedule checks are armed when the user signs in and on browser startup with a valid stored session. They honor owner-enabled schedules/flows and publisher readiness, adopt one server-authorized run at a time and use the same direct queue. Native Compose's Schedule action approves the captured content; enabling the saved recurrence is still an explicit action. Changing content/account/rules invalidates readiness. Alarms may run late; server-side eligibility prevents an early send. A full browser restart is not automatic authorization to retry an interrupted Compose claim.

Facebook group import uses the existing read-only collector and then saves imported groups directly to the owner's backend, with actor/owner rechecks. Imported groups still need current permission/rule reviews before posting. The collector's optional identity-cookie permission is limited to that previously authorized read-only import; posting does not add Facebook cookie access.

## Limits and release status

This migration does not establish 100% Group Posting PRO parity. Existing gaps remain: reference timing defaults, multi-template rotation, true per-target variations, backgrounds, Card editor, first comments, video and Page publishing. AI stays unavailable. Radar's existing unsupported scanning/reply capabilities remain explicitly unavailable; moving its screen does not implement them. Paused/interrupted jobs still require outcome review; recovery does not silently retry publication.

Native extension loading is administrator-blocked in the development environment. Browser fixture and unit results must be reported separately from real Chrome/Facebook acceptance. No live posting or real user sign-in is performed by fixture tests. The owner must verify both in their own Chrome profile. The build remains unpacked/manual distribution; Chrome Web Store automatic updates are not configured.
