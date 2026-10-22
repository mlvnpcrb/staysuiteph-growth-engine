# Extension group batches (0.0.4)

The collector intentionally reads only visible group-link labels on Facebook's
joined-groups directory. Six results can mean six visible cards, not six total
memberships. It does not fetch Facebook APIs, scroll automatically, or read posts.
Live Facebook layout compatibility still requires verification in the user's browser.

The popup now appends each explicitly requested collection to the current batch,
deduplicates canonical URLs, preserves earlier deselections, and shows how many
new groups were added. Scroll the Facebook directory yourself, reopen the popup,
authorize collection, then choose **Add more visible groups**. Send or export at
100 groups (the existing transfer limit), import them in My Groups, clear the
extension batch, and continue. Repeating a screen does not duplicate groups.

The new `storage` permission is used only for `chrome.storage.session`, which is
extension-only by default. Validated group names/links and selections are scoped
to the configured StaySuite origin and expire four hours after the popup's last
use. Chrome also clears session storage when the browser session ends. Consent is
not persisted; no content script or background worker was added. Clear removes
the draft. Storage failures display a warning to send/export before closing.

Search filters the visible batch without changing the selection. Select all and
Deselect all apply to the whole batch. Sending confirms receipt for review in My
Groups, not a completed database import. The dashboard remains responsible for
validation, authentication, ownership and persistence.

UI changes include a compact collected-state header, distinct collect/review/send
steps, searchable selection list, sticky send controls, readable errors, dark mode,
keyboard focus, reduced motion and document language/title. Browser fixtures test
reopening, six-to-eight accumulation, duplicate deselection, clear, export, delivery
and automated light/dark WCAG checks. Fixtures do not establish live Facebook support.

## Install/update

Extract the supplied ZIP into a permanent folder. At `chrome://extensions`, enable
Developer mode, choose Load unpacked and select the folder containing manifest.json.
To update an existing unpacked install, replace its files and click Reload. Confirm
version 0.0.4. The supplied build targets the existing tested StaySuite Preview:
https://staysuiteph-growth-engine-l9ark24bv-mlvnpcrbs-projects.vercel.app
Sign in there first. Changing the configured dashboard origin requires a new build.

The GroupPosting reference site could not be inspected in this environment:
HTTPS CONNECT returned 403. No claims about its collection implementation are made.
This change does not implement campaign posting or broaden Facebook host access.
