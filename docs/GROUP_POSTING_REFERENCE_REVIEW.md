# Group Posting Pro: bulk posting review

## Provenance and inspection boundary

Re-read the owner-provided ZIP, version 2.11.30, SHA-256
`961a77059db7198e9610dd1a81c9a84556759c013bf4ac6305895533406a52e1`.
It contains 159 entries. Vendor scripts were inspected as untrusted data, not
installed, executed or copied into StaySuite. No vendor services, Facebook session
credentials or posting endpoints were called. The following is static code evidence,
not proof of live Facebook compatibility, account safety or vendor approval by Meta.

Line references below refer to locally reformatted files in the inspection folder,
not the minified ZIP's line numbers. Symbol and literal names also locate the logic
in the original files. Vendor source is not redistributed with this document.

## What the package actually does

| Area | Observed behavior | Evidence locator |
| --- | --- | --- |
| Media selection | One inspected editor accepts JPEG/PNG/GIF/WebP and MP4/WebM/QuickTime. It recognizes file type, stores media through its local DB helper, makes blob previews and supports removing attachments. That editor has its own 10-attachment and 35-MB-per-file checks; these are application settings, not verified Facebook platform limits. | `popup.readable.js:48800–48865`, `iY`, `rY`, `GPPDB.saveMedia` |
| Direct posting | A worker constructs internal `ComposerStoryCreateMutation` requests and submits them using the browser session. This is not evidence of a supported public OAuth publishing integration. | `worker.readable.js:1514`, `ar` at 3327, request construction around 3931–3948 |
| Composer posting | Background completion handlers separately handle composer/visual results and direct worker results. Opening the composer and receiving publication evidence are separate operations. | `background.readable.js`, `popupPostComplete`, `directApiPostComplete`, sections around 23323 and 25268 |
| Duplicate guards | Run/request identity and per-item idempotence tokens bind dispatches and remembered results. The worker can recover a stored response rather than necessarily submit again. | `worker.readable.js:5352–5394`, `Sr`, `vr`; background `clientMutationId`, `idempotenceToken` |
| Uncertain submissions | A timeout or interrupted response can be recorded as unconfirmed. It is not reliably equivalent to a failed post. | `worker.readable.js:4731`, `publish_timeout_unconfirmed`; `posting-outcomes.js`, `classify` |
| Admin moderation | Pending admin approval is distinguished from a post confirmed live. | `worker.readable.js:3324`; `posting-outcomes.js`, `MODERATION` and `waiting` |
| Outcome confirmation | Some paths use explicit post IDs, URLs and feed/permalink evidence; ambiguous outcomes have separate handling. | `background.readable.js:8377–8384`, 8653–8654, 9327; `publicationVerified`, `gppConfirmedByPermalink` |
| Restriction detection | Explicit HTTP 429, checkpoint and disabled-account routes produce stop signals. Other branches handle restriction-related messages and failed runs. | `worker.readable.js:611–648`, `X`; background `banClass`, stop branches around 23120–23182 |
| Pacing | Settings include pacing modes, delays and timing jitter. Their existence does not demonstrate a ban-safe frequency or prevent restrictions. | `background.readable.js`, `gppPacingMode`, `timingJitterEnabled`, `timingJitterMinutes`, `ef` |
| Broad privileges | Vendor manifest requests all-site host access and capabilities including cookies, network rules, alarms and power. Importing these wholesale is unnecessary for a campaign editor. | ZIP `manifest.json` |

The package also contains alternative request/fallback and refusal-related branches.
Their presence cannot establish permission to overcome Facebook's rejection. StaySuite
must stop on restrictions rather than reproduce a path that tries to route around
one. Not every fallback is circumvention; its exact context matters, and this review
does not claim a full behavioral audit of every vendor module.

## StaySuite implementation delivered with this review

The Campaigns page now provides an original preparation workspace:

- Post editor and preview, real saved-group selection and ordered targets.
- Local photo/video selection, previews and removal. File signatures are checked;
  filenames/browser MIME claims are not sufficient. SVG/HTML are rejected. This
  is a signature check, not a complete codec validation or malware scan.
- A workspace limit of ten photos or one video and 50 MB total. These deliberately
  bounded product limits are not represented as Facebook's published limits.
- Duplicate attachment detection using SHA-256 of file bytes.
- Keyboard/touch-accessible expandable help for post content, media and intervals.
- Exact-plan approval tied to text, media digests, target order, interval, owner and
  saved rule versions. Edits require review again. Approval is local preparation
  state, not a server-side authorization token.
- Per-target rule/permission blockers. Unknown/stale evidence stays unknown.
- Downloadable plan metadata, explicitly excluding media bytes and explicitly
  recording `publishingEnabled:false`. Media and draft edits remain in this tab;
  they are not saved to a cloud service or restored automatically after reload.

No new Facebook permissions, credential reads, private mutation calls, database
migrations or production changes were introduced. No posts were sent.

## Remaining release gates for live bulk publishing

The preparation workspace is not a functioning bulk publisher. Its disabled Start
control makes that limitation visible. A live release still requires:

1. Validate a current Facebook adapter in an authenticated browser, without a test
   publication until exact content and targets are approved. Import success is not
   proof of composer, media upload or posting compatibility.
2. Implement authenticated durable campaign/media storage and transactional claims,
   account binding, version checks, idempotence and persisted eligibility times.
   Local plan approval cannot replace those server controls.
3. Validate exact text, media order/content and actor identity before dispatch;
   recheck current target membership, rules, content limits and approval requirements.
4. Persist one in-flight target; handle pause/cancel/restart races without duplicate
   sends. A lost receipt must become uncertain and must not automatically retry.
5. Record confirmed live, pending admin, refused, uncertain and stopped outcomes
   separately. Warning/challenge/denial stops the affected campaign.
6. Test native extension, browser/API/storage flow, ownership isolation, worker
   restart, concurrent tabs, cancellation, duplicate prevention and a specifically
   approved live campaign. Report fixture success separately from live evidence.

There is no callable browser tool connected to the owner's authenticated Facebook
session in this runtime. The available local browser is a separate test context.
The direct official Meta documentation fetches for Graph API v19 and Spam policy
returned HTTP 429 during this review; no current official API support claim is made.
No timing, copied algorithm or extension can guarantee that Meta will not restrict
an account.
