import type { ClassicPublishInput, ClassicPublishResult } from "./classic-publisher";
/** Serialized into Facebook's MAIN world. CSRF context stays inside this function.
 * Original implementation of the reference's upload -> story mutation protocol.
 * No cookies, access tokens, vendor service, composer navigation or fallback send.
 */
export async function directPublisherPage(input: ClassicPublishInput): Promise<ClassicPublishResult> {
    type Row = Record<string, unknown>;
    const object = (v: unknown): Row | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Row : null;
    const result = (outcome: ClassicPublishResult["outcome"], code: string, postUrl?: string): ClassicPublishResult => ({ outcome, code, ...(postUrl ? { postUrl } : {}) });
    let dispatched = false;
    const group = /^https:\/\/www\.facebook\.com\/groups\/([1-9]\d*)\/$/.exec(input.groupUrl)?.[1];
    if (location.origin !== "https://www.facebook.com" || !group || !/^[1-9]\d{0,79}$/.test(input.actorId) || !/^[a-f0-9]{64}$/.test(input.approvalDigest) || !/^[a-f0-9-]{36}$/.test(input.attemptToken) || !input.text.trim() || input.text.length > 10000 || input.media.length > 10)
        return result("not_sent", "direct_invalid_input");
    const blocked = () => /\/(?:login|checkpoint|recover|disabled)(?:\/|$)/.test(location.pathname) || /captcha|security check|account restricted|temporarily blocked/i.test(document.title) || Array.from(document.querySelectorAll('iframe[src*="captcha"],form[action*="checkpoint"],input[name="approvals_code"],[role="alertdialog"]')).some(n => n.getClientRects().length > 0);
    const loader: unknown = Reflect.get(globalThis, "require");
    if (typeof loader !== "function")
        return result("not_sent", "direct_session_unavailable");
    const module = (name: string) => { try {
        return object(loader(name));
    }
    catch {
        return null;
    } };
    const actor = () => {
        const initial = module("CurrentUserInitialData"), current = module("CurrentUser");
        const get = current?.getID;
        return initial?.USER_ID === input.actorId && (initial.PROFILE_ID == null || initial.PROFILE_ID === input.actorId) && typeof get === "function" && String(get.call(current)) === input.actorId;
    };
    const guard = () => {
        if (blocked())
            throw new Error("direct_restricted");
        if (!actor())
            throw new Error("direct_actor_changed");
        if (input.allowSubmit && (!Number.isFinite(input.expiresAt) || input.expiresAt! <= Date.now()))
            throw new Error("direct_claim_expired");
    };
    const context = () => {
        const dtsg = module("DTSGInitialData")?.token, lsd = module("LSD")?.token;
        if (typeof dtsg !== "string" || typeof lsd !== "string" || !dtsg || !lsd || dtsg === lsd)
            throw new Error("direct_session_unavailable");
        return { dtsg, lsd };
    };
    const parse = (text: string): Row => {
        const clean = text.replace(/^for\s*\(\s*;\s*;\s*\)\s*;\s*/, "");
        // Reject multiple/streamed results rather than infer a successful mutation.
        const value = object(JSON.parse(clean));
        if (!value)
            throw new Error("direct_response_unreadable");
        if (value.error || value.errors || object(value.payload)?.error)
            throw new Error("direct_refused");
        return value;
    };
    const fields = () => {
        const { dtsg, lsd } = context();
        return new URLSearchParams({ av: input.actorId, __user: input.actorId, __a: "1", fb_dtsg: dtsg, lsd, jazoest: "2" + Array.from(dtsg).reduce((sum, c) => sum + c.charCodeAt(0), 0), fb_api_caller_class: "RelayModern" });
    };
    const send = async (url: string, init: RequestInit): Promise<Row> => {
        guard();
        const response = await fetch(url, { ...init, credentials: "include", redirect: "error", signal: AbortSignal.timeout(Math.max(1, Math.min(45000, (input.expiresAt ?? Date.now() + 45000) - Date.now()))) });
        if (response.status === 429 || response.status === 401 || response.status === 403)
            throw new Error("direct_restricted");
        if (!response.ok)
            throw new Error("direct_transport");
        const text = await response.text();
        guard();
        if (text.length > 2000000)
            throw new Error("direct_response_unreadable");
        return parse(text);
    };
    try {
        guard();
        context();
        const document = object(module("ComposerStoryCreateMutation.graphql")?.params);
        // Exact compatibility identifiers from reference ZIP 2.11.30; current module wins.
        const documentId = typeof document?.id === "string" && /^\d+$/.test(document.id) ? document.id : input.media.length ? "9286110778162996" : "9469644099759635";
        const bytes: Blob[] = [];
        let total = 0;
        for (const media of input.media) {
            if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(media.type))
                return result("not_sent", "direct_image_only");
            const raw = atob(media.base64), data = Uint8Array.from(raw, c => c.charCodeAt(0));
            total += data.length;
            if (!data.length || total > 20 * 1024 * 1024)
                return result("not_sent", "direct_media_limit");
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), b => b.toString(16).padStart(2, "0")).join("");
            if (hash !== media.sha256)
                return result("not_sent", "direct_media_changed");
            const signature = media.type === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => data[i] === v) : media.type === "image/jpeg" ? data[0] === 255 && data[1] === 216 && data[2] === 255 : media.type === "image/gif" ? /^GIF8[79]a/.test(raw.slice(0, 6)) : raw.slice(0, 4) === "RIFF" && raw.slice(8, 12) === "WEBP";
            if (!signature)
                return result("not_sent", "direct_media_changed");
            bytes.push(new Blob([data], { type: media.type }));
        }
        guard();
        if (!input.allowSubmit)
            return result("ready", "direct_context_ready");
        const fingerprint = JSON.stringify([input.actorId, group, input.text, input.approvalDigest, input.media.map(m => m.sha256)]);
        const key = "__staysuiteDirectAttemptsV1";
        let journal = Reflect.get(globalThis, key) as Map<string, {
            fingerprint: string;
            receipt: ClassicPublishResult;
        }> | undefined;
        if (!(journal instanceof Map)) {
            journal = new Map();
            Reflect.set(globalThis, key, journal);
        }
        const prior = journal.get(input.attemptToken);
        if (prior)
            return prior.fingerprint === fingerprint ? prior.receipt : result("stopped", "direct_attempt_changed");
        if (journal.size >= 500)
            return result("not_sent", "direct_journal_full");
        const entry = { fingerprint, receipt: result("uncertain", "direct_in_progress") };
        journal.set(input.attemptToken, entry);
        try {
            const attachments: {
                photo: {
                    id: string;
                };
            }[] = [];
            for (let i = 0; i < bytes.length; i++) {
                const form = new FormData();
                form.append("source", "8");
                form.append("profile_id", input.actorId);
                form.append("waterfallxapp", "comet");
                form.append("upload_id", crypto.randomUUID());
                form.append("farr", bytes[i]!, input.media[i]!.name);
                const uploaded = await send("https://upload.facebook.com/ajax/react_composer/attachments/photo/upload?" + fields(), { method: "POST", body: form });
                const payload = object(uploaded.payload), image = object(object(uploaded.data)?.upload_image);
                const id = payload?.photoID ?? payload?.fbid ?? uploaded.photoID ?? uploaded.fbid ?? image?.fbid;
                if (typeof id !== "string" || !/^[1-9]\d*$/.test(id))
                    throw new Error("direct_upload_unconfirmed");
                attachments.push({ photo: { id } });
            }
            guard();
            const variables = { input: { composer_entry_point: attachments.length ? "publisher_bar_media" : "inline_composer", composer_source_surface: "group", composer_type: "group", source: "WWW", message: { text: input.text, ranges: [] }, attachments, audience: { to_id: group }, actor_id: input.actorId, client_mutation_id: input.attemptToken, idempotence_token: "client:" + input.attemptToken, text_format_preset_id: "0", inline_activities: [], with_tags_ids: null, tracking: [null], logging: { composer_session_id: "" } }, feedLocation: "GROUP", feedbackSource: 0, focusCommentID: null, groupID: group, scale: 1, privacySelectorRenderLocation: "COMET_STREAM", renderLocation: "group", useDefaultActor: false, isGroup: true, isFeed: false, isTimeline: false };
            const body = fields();
            body.set("fb_api_req_friendly_name", "ComposerStoryCreateMutation");
            body.set("doc_id", documentId);
            body.set("variables", JSON.stringify(variables));
            body.set("server_timestamps", "true");
            // Mark before fetch: interrupted submission must never be retried as not-sent.
            dispatched = true;
            const reply = await send("https://www.facebook.com/api/graphql/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-FB-Friendly-Name": "ComposerStoryCreateMutation", "X-FB-LSD": context().lsd }, body });
            const story = object(object(object(reply.data)?.story_create)?.story);
            const postId = story?.legacy_story_hideable_id ?? story?.post_id;
            const recipient = object(story?.to), author = object(story?.default_actor);
            if (!story || typeof postId !== "string" || !/^[1-9]\d*$/.test(postId) || typeof story.id !== "string" || recipient?.__typename !== "Group" || recipient.id !== group || author?.__typename !== "User" || author.id !== input.actorId || !Object.prototype.hasOwnProperty.call(story, "if_viewer_can_learn_more_about_pending_post") || (story.if_viewer_can_learn_more_about_pending_post !== null && story.if_viewer_can_learn_more_about_pending_post !== true && object(story.if_viewer_can_learn_more_about_pending_post) === null) || story.is_marked_as_spam === true || story.is_marked_as_spam_by_admin_assistant === true)
                throw new Error("direct_receipt_unconfirmed");
            entry.receipt = result(story.if_viewer_can_learn_more_about_pending_post !== null ? "pending_admin" : "live", "direct_story_receipt", `https://www.facebook.com/groups/${group}/posts/${postId}/`);
        }
        catch (e) {
            const code = e instanceof Error && /^direct_[a-z_]+$/.test(e.message) ? e.message : "direct_interrupted";
            entry.receipt = result(dispatched ? "uncertain" : "stopped", code);
        }
        return entry.receipt;
    }
    catch (e) {
        return result(dispatched ? "uncertain" : "not_sent", e instanceof Error && /^direct_[a-z_]+$/.test(e.message) ? e.message : "direct_interrupted");
    }
}
