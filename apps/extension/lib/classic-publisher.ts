/** Experimental provider. Runtime execution requires a server-enabled, live-validated publisher. */
export type ClassicPublishInput = {
  actorId: string;
  groupUrl: string;
  text: string;
  attemptToken: string;
  approvalDigest: string;
  allowSubmit: boolean;
  expiresAt?: number;
  media: { name: string; type: string; base64: string; sha256: string }[];
};
export type ClassicPublishResult = {
  outcome:
    | "ready"
    | "not_sent"
    | "live"
    | "pending_admin"
    | "uncertain"
    | "stopped";
  code: string;
  postUrl?: string;
};
/** Self-contained MAIN-world function: no cookie, password, OAuth or request-token reads. */
export async function classicPublisherPage(
  input: ClassicPublishInput,
): Promise<ClassicPublishResult> {
  let dispatched = false;
  const result = (
    outcome: ClassicPublishResult["outcome"],
    code: string,
    postUrl?: string,
  ): ClassicPublishResult => ({
    ...{ outcome, code },
    ...(postUrl ? { postUrl } : {}),
  });
  const normalize = (value: string) =>
    value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const visible = (node: HTMLElement) =>
    node.getClientRects().length > 0 &&
    getComputedStyle(node).visibility !== "hidden";
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 100));
  function currentActor() {
    const loader: unknown = Reflect.get(globalThis, "require");
    if (typeof loader !== "function") throw new Error("actor_unavailable");
    const current: unknown = loader("CurrentUser"),
      initial: unknown = loader("CurrentUserInitialData");
    if (
      !current ||
      typeof current !== "object" ||
      !initial ||
      typeof initial !== "object"
    )
      throw new Error("actor_unavailable");
    const get: unknown = Reflect.get(current, "getID"),
      uid: unknown = Reflect.get(initial, "USER_ID"),
      profile: unknown = Reflect.get(initial, "PROFILE_ID");
    if (
      typeof get !== "function" ||
      typeof uid !== "string" ||
      String(get.call(current)) !== input.actorId ||
      uid !== input.actorId ||
      (profile !== undefined &&
        profile !== null &&
        String(profile) !== input.actorId)
    )
      throw new Error("actor_changed");
  }
  function warning() {
    if (/\/(?:login|checkpoint|disabled)(?:\/|$)/.test(location.pathname))
      return true;
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="alert"],[role="alertdialog"]',
      ),
    )
      .filter(visible)
      .some(
        (node) =>
          node.getAttribute("role") === "alertdialog" ||
          /temporarily blocked|account restricted|too many posts|try again later|you can.t post|captcha|confirm your identity/i.test(
            node.innerText,
          ),
      );
  }
  function guard() {
    if (
      input.allowSubmit &&
      (input.expiresAt === undefined ||
        !Number.isFinite(input.expiresAt) ||
        Date.now() >= input.expiresAt)
    )
      throw new Error("claim_expired");
    if (warning()) throw new Error("facebook_warning");
    currentActor();
    if (
      location.origin !== "https://www.facebook.com" ||
      location.pathname.split("/")[2] !==
        new URL(input.groupUrl).pathname.split("/")[2]
    )
      throw new Error("group_changed");
  }
  function composer() {
    const dialogs = Array.from(
      document.querySelectorAll<HTMLElement>('[role="dialog"]'),
    )
      .filter(visible)
      .filter((node) =>
        node.querySelector('[contenteditable="true"][role="textbox"]'),
      );
    if (dialogs.length > 1) throw new Error("ambiguous_composer");
    return dialogs[0];
  }
  function submitButton(dialog: HTMLElement) {
    const buttons = Array.from(
      dialog.querySelectorAll<HTMLElement>('button,[role="button"]'),
    )
      .filter(visible)
      .filter((node) =>
        ["Post", "I-post"].includes(
          normalize(node.getAttribute("aria-label") || node.innerText),
        ),
      );
    if (buttons.length !== 1) return null;
    const node = buttons[0]!;
    return node.getAttribute("aria-disabled") === "true" ||
      node.hasAttribute("disabled")
      ? null
      : node;
  }
  try {
    if (
      !/^[1-9]\d{0,79}$/.test(input.actorId) ||
      !/^https:\/\/www\.facebook\.com\/groups\/[1-9]\d*\/?$/.test(
        input.groupUrl,
      ) ||
      !/^[-0-9a-f]{36}$/i.test(input.attemptToken) ||
      !/^[a-f0-9]{64}$/.test(input.approvalDigest) ||
      !input.text.trim() ||
      input.text.length > 10000 ||
      input.media.length > 10
    )
      return result("not_sent", "invalid_dispatch");
    guard();
    let dialog = composer();
    if (!dialog) {
      const openers = Array.from(
        document.querySelectorAll<HTMLElement>('button,[role="button"]'),
      )
        .filter(visible)
        .filter((node) =>
          [
            "Write something...",
            "Write something…",
            "Create post",
            "Gumawa ng post",
          ].includes(
            normalize(node.getAttribute("aria-label") || node.innerText),
          ),
        );
      if (openers.length !== 1)
        return result("not_sent", "composer_unavailable");
      openers[0]!.click();
      for (let i = 0; i < 80 && !dialog; i++) {
        await wait();
        guard();
        dialog = composer();
      }
    }
    if (!dialog) return result("not_sent", "composer_unavailable");
    const editor = dialog.querySelector<HTMLElement>(
      '[contenteditable="true"][role="textbox"]',
    );
    if (
      !editor ||
      (!submitButton(dialog) && !dialog.querySelector('button,[role="button"]'))
    )
      return result("not_sent", "composer_shape_unknown");
    if (!input.allowSubmit) return result("ready", "composer_detected_only");
    // Never replace an existing user's draft or attachments.
    if (
      normalize(editor.innerText) ||
      dialog.querySelector(
        '[aria-label^="Remove photo"],[aria-label^="Remove video"]',
      ) ||
      (dialog.querySelector('input[type="file"]') instanceof HTMLInputElement &&
        (dialog.querySelector<HTMLInputElement>('input[type="file"]')?.files
          ?.length ?? 0) > 0)
    )
      return result("not_sent", "existing_draft");
    const files: File[] = [];
    let total = 0;
    for (const media of input.media) {
      if (
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
          "video/mp4",
          "video/webm",
          "video/quicktime",
        ].includes(media.type) ||
        !/^[a-f0-9]{64}$/.test(media.sha256) ||
        media.base64.length > 28_000_000
      )
        return result("not_sent", "unsupported_media");
      const raw = atob(media.base64);
      total += raw.length;
      if (total > 20 * 1024 * 1024)
        return result("not_sent", "dispatch_media_limit");
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (v) => v.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== media.sha256)
        return result("not_sent", "media_digest_changed");
      files.push(new File([bytes], media.name, { type: media.type }));
    }
    guard();
    editor.focus();
    if (!document.execCommand("insertText", false, input.text))
      return result("not_sent", "text_insert_failed");
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: input.text,
      }),
    );
    if (normalize(editor.innerText) !== normalize(input.text))
      return result("not_sent", "text_changed");
    if (files.length) {
      const accepts = (node: HTMLInputElement) =>
        files[0]?.type.startsWith("video/")
          ? node.accept.includes("video")
          : node.accept.includes("image");
      const candidates = () =>
        Array.from(
          dialog!.querySelectorAll<HTMLInputElement>('input[type="file"]'),
        ).filter(accepts);
      let inputs = candidates();
      if (inputs.length === 0) {
        const adders = Array.from(
          dialog.querySelectorAll<HTMLElement>('button,[role="button"]'),
        )
          .filter(visible)
          .filter((node) =>
            /^(photo\/video|photo or video|add photos?\/?videos?|larawan\/video)$/i.test(
              normalize(node.getAttribute("aria-label") || node.innerText),
            ),
          );
        if (adders.length !== 1)
          return result("not_sent", "media_input_unavailable");
        adders[0]!.click();
        for (let i = 0; i < 80 && inputs.length === 0; i++) {
          await wait();
          guard();
          inputs = candidates();
        }
      }
      if (inputs.length !== 1)
        return result("not_sent", "media_input_unavailable");
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      inputs[0]!.files = transfer.files;
      inputs[0]!.dispatchEvent(
        new Event("change", { bubbles: true, composed: true }),
      );
      const ready = () =>
        dialog?.querySelectorAll(
          '[aria-label^="Remove photo"],[aria-label^="Remove video"]',
        ).length === files.length;
      for (let i = 0; i < 300 && !ready(); i++) {
        await wait();
        guard();
      }
      if (!ready()) return result("not_sent", "media_previews_unconfirmed");
    }
    let button = submitButton(dialog);
    for (let i = 0; i < 80 && !button; i++) {
      await wait();
      guard();
      button = submitButton(dialog);
    }
    if (!button) return result("not_sent", "submit_unavailable");
    guard();
    if (normalize(editor.innerText) !== normalize(input.text))
      return result("not_sent", "text_changed");
    const groupId = new URL(input.groupUrl).pathname.split("/")[2];
    const receipts = () =>
      Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          '[role="status"] a[href],[role="alert"] a[href],[role="dialog"] a[href]',
        ),
      )
        .map((a) => {
          const url = new URL(a.href);
          return url.origin + url.pathname;
        })
        .filter((url) => {
          try {
            const value = new URL(url);
            return (
              value.origin === "https://www.facebook.com" &&
              value.pathname.split("/")[2] === groupId &&
              /^\/groups\/[^/]+\/posts\/[0-9]+\/?$/.test(value.pathname)
            );
          } catch {
            return false;
          }
        });
    const before = new Set(receipts());
    button.scrollIntoView({ block: "center", inline: "nearest" });
    guard();
    const bounds = button.getBoundingClientRect();
    const top = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    if (!top || !(top === button || button.contains(top)))
      return result("stopped", "obstructed_composer");
    dispatched = true;
    button.click();
    for (let i = 0; i < 200; i++) {
      await wait();
      if (warning()) return result("stopped", "facebook_warning_after_submit");
      currentActor();
      const receipt = receipts().find((url) => !before.has(url));
      if (receipt) {
        const notices = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="status"],[role="alert"],[role="dialog"]',
          ),
        )
          .filter(visible)
          .filter((node) =>
            Array.from(
              node.querySelectorAll<HTMLAnchorElement>("a[href]"),
            ).some((a) => a.href === receipt),
          );
        if (
          notices.some((node) =>
            /your post.{0,40}(pending approval|submitted for approval)|awaiting admin approval/i.test(
              node.innerText,
            ),
          )
        )
          return result("pending_admin", "reported_ui_receipt", receipt);
        if (
          notices.some((node) =>
            /your post (?:was|has been|is now) published|post published successfully/i.test(
              node.innerText,
            ),
          )
        )
          return result("live", "reported_ui_receipt", receipt);
        return result("uncertain", "post_url_without_confirmation", receipt);
      }
      const pending = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="status"],[role="alert"],[role="dialog"]',
        ),
      )
        .filter(visible)
        .some((node) =>
          /your post.{0,40}(pending approval|submitted for approval)/i.test(
            node.innerText,
          ),
        );
      if (pending) return result("uncertain", "pending_without_post_url");
    }
    return result("uncertain", "publication_unconfirmed");
  } catch (error) {
    const code =
      error instanceof Error &&
      [
        "claim_expired",
        "actor_unavailable",
        "actor_changed",
        "facebook_warning",
        "group_changed",
        "ambiguous_composer",
      ].includes(error.message)
        ? error.message
        : "provider_error";
    return result(
      dispatched
        ? "uncertain"
        : code === "facebook_warning"
          ? "stopped"
          : "not_sent",
      code,
    );
  }
}
