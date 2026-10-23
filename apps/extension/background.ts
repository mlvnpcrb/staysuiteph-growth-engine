import { facebookLibrarySchema, facebookDiagnosticSchema, facebookErrorSchema } from "@staysuite/validation";
import { FacebookFailure, facebookCode } from "./lib/facebook-model";
import { FACEBOOK_ACTIVE, FACEBOOK_JOB, assertFacebookJob, facebookIdentity, libraryKey, loadFacebookLibrary, readFacebookJob, writeFacebookLibrary } from "./lib/facebook-store";
class CollectorRefusal extends FacebookFailure {
  constructor(public readonly refusal: "job" | "nonce" | "sender_tab" | "owned_tab") { super("cancelled"); }
}
let operations: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>) {
  const next = operations.then(operation,operation); operations = next.catch(() => {}); return next;
}
async function stop(error: "cancelled" | "account_changed" | "permission_required" | "interrupted" = "cancelled") {
  const job = await readFacebookJob();
  await chrome.storage.session.remove(FACEBOOK_JOB);
  if (job) {
    const library = await loadFacebookLibrary(job.actorId);
    if (library?.runId === job.runId) await writeFacebookLibrary({...library,phase:error === "cancelled" ? "cancelled" : "partial",complete:false,error,runId:null,updatedAt:new Date().toISOString()});
    if (job.collectorTabId !== undefined) await chrome.tabs.remove(job.collectorTabId).catch(() => {});
    if (job.ownFacebookTab) await chrome.tabs.remove(job.tabId).catch(() => {});
  }
  if (error !== "cancelled") await chrome.storage.local.remove(FACEBOOK_ACTIVE);
}
async function state() {
  const actorId = await facebookIdentity();
  const job = await readFacebookJob();
  if (job && (job.actorId !== actorId || Date.now()-job.startedAt>180_000)) await stop(job.actorId !== actorId ? "account_changed" : "interrupted");
  let library = await loadFacebookLibrary(actorId);
  if (library?.phase === "fetching" && !(await readFacebookJob())) {
    library = {...library,phase:"partial",complete:false,error:"interrupted",runId:null};
    await writeFacebookLibrary(library);
  }
  return {actorId,library};
}
async function start() {
  const actorId = await facebookIdentity();
  const existing = await readFacebookJob();
  if (existing && existing.actorId === actorId && Date.now()-existing.startedAt<180_000) return state();
  if (existing) await stop("interrupted");
  const prior = await loadFacebookLibrary(actorId);
  // A fresh extension-owned page gets current request context without reloading
  // or navigating the user's existing Facebook tabs.
  const tab = await chrome.tabs.create({url:"https://www.facebook.com/groups/joins/",active:false});
  if (tab.id === undefined) throw new FacebookFailure("network");
  const job = {actorId,tabId:tab.id,ownFacebookTab:true,runId:crypto.randomUUID(),startedAt:Date.now()};
  await chrome.storage.session.set({[FACEBOOK_JOB]:job});
  await chrome.storage.local.set({[FACEBOOK_ACTIVE]:actorId});
  await writeFacebookLibrary({schema:1,actorId,actorName:prior?.actorName??"Facebook profile",groups:prior?.groups??[],phase:"fetching",pages:0,complete:false,updatedAt:new Date().toISOString(),syncedAt:prior?.syncedAt??null,error:null,runId:job.runId});
  try {
    const collector = await chrome.tabs.create({url:`${chrome.runtime.getURL("tabs/collector.html")}?run=${job.runId}`,active:false});
    await assertFacebookJob(job);
    // Preserve the collector's tab binding even if the page starts immediately.
    await chrome.storage.session.set({[FACEBOOK_JOB]:{...job,collectorTabId:collector.id}});
  } catch { await stop("interrupted"); throw new FacebookFailure("network"); }
  return state();
}
chrome.runtime.onMessage.addListener((message: unknown,sender,reply) => {
  const url = sender.url ?? "";
  if (sender.id !== chrome.runtime.id || (sender.frameId !== undefined && sender.frameId !== 0)) return false;
  const collector = url.split("?")[0] === chrome.runtime.getURL("tabs/collector.html");
  const workspace = [chrome.runtime.getURL("tabs/groups.html"),chrome.runtime.getURL("popup.html")].includes(url.split("?")[0]??"");
  if (!collector && !workspace) return false;
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  if (collector && !["FACEBOOK_COLLECTOR_INIT","FACEBOOK_COLLECTOR_GUARD","FACEBOOK_CHECKPOINT","FACEBOOK_COLLECTOR_FAILED","FACEBOOK_COLLECTOR_FINISH"].includes(String(message.type))) return false;
  if (workspace && !["FACEBOOK_STATE","FACEBOOK_START","FACEBOOK_STOP","FACEBOOK_FORGET"].includes(String(message.type))) return false;
  void serialized(async () => {
    if (collector) {
      const job = await readFacebookJob();
      if (!job || job.collectorTabId === undefined) throw new CollectorRefusal("job");
      if (new URL(url).searchParams.get("run") !== job.runId) throw new CollectorRefusal("nonce");
      if (sender.tab && sender.tab.id !== job.collectorTabId) throw new CollectorRefusal("sender_tab");
      // Extension-page messages do not always populate sender.tab. In that case
      // the exact extension URL + per-run nonce must match the live owned tab.
      const ownedTab = await chrome.tabs.get(job.collectorTabId);
      if (ownedTab.id !== job.collectorTabId || (ownedTab.url !== undefined && ownedTab.url !== url)) throw new CollectorRefusal("owned_tab");
      await assertFacebookJob(job);
      const library = await loadFacebookLibrary(job.actorId);
      if (message.type === "FACEBOOK_COLLECTOR_INIT") {
        if (!library || library.runId !== job.runId) throw new FacebookFailure("cancelled");
        return {job,library};
      }
      if (message.type === "FACEBOOK_COLLECTOR_GUARD") return {};
      if (message.type === "FACEBOOK_COLLECTOR_FINISH") {
        if (library?.phase === "fetching") await writeFacebookLibrary({...library,phase:"error",error:"interrupted",complete:false,runId:null,updatedAt:new Date().toISOString()});
        await chrome.storage.session.remove(FACEBOOK_JOB);
        return {};
      }
      if (message.type === "FACEBOOK_COLLECTOR_FAILED") {
        const diagnostic=facebookDiagnosticSchema.safeParse({stage:"stage" in message?message.stage:null,httpStatus:null,query:"not_started",querySource:"not_started"});
        const code=facebookErrorSchema.safeParse("code" in message?message.code:null);
        if (library?.runId === job.runId) await writeFacebookLibrary({...library,phase:library.groups.length?"partial":"error",error:code.success?code.data:"interrupted",diagnostic:diagnostic.success?diagnostic.data:null,complete:false,runId:null,updatedAt:new Date().toISOString()});
        return {};
      }
      const next = facebookLibrarySchema.parse("library" in message ? message.library : null);
      if (next.actorId !== job.actorId || (next.runId !== null && next.runId !== job.runId)) throw new FacebookFailure("account_changed");
      if (library?.runId !== job.runId) throw new FacebookFailure("cancelled");
      await writeFacebookLibrary(next);
      return {};
    }
    if (message.type === "FACEBOOK_STOP") await stop();
    if (message.type === "FACEBOOK_FORGET") { await stop(); const actorId = await facebookIdentity(); await chrome.storage.local.remove([libraryKey(actorId),FACEBOOK_ACTIVE]); return {actorId,library:null}; }
    return message.type === "FACEBOOK_START" ? start() : state();
  }).then(value=>reply({ok:true,...value})).catch(async error=>{
    if(error instanceof CollectorRefusal) await chrome.storage.session.set({"staysuite-facebook-refusal-v1":error.refusal});
    reply({ok:false,error:facebookCode(error),...(error instanceof CollectorRefusal?{refusal:error.refusal}:{})});
  });
  return true;
});
let observingCookies = false;
function observeCookies() {
  if (observingCookies || !chrome.cookies?.onChanged) return;
  chrome.cookies.onChanged.addListener(change => {
    if (!/(^|\.)facebook\.com$/.test(change.cookie.domain) || !["c_user","i_user","xs"].includes(change.cookie.name)) return;
    // Cookie expiry refreshes must not impersonate an account change. Never read
    // xs values; explicit removal invalidates, while rotations use current actor
    // and server response checks. Ignore the removal half of identity overwrites.
    if (change.removed && change.cause === "overwrite") return;
    void serialized(async () => {
      const job = await readFacebookJob();
      const active = (await chrome.storage.local.get(FACEBOOK_ACTIVE))[FACEBOOK_ACTIVE];
      if (change.cookie.name === "xs") {
        if (change.removed) {
          await stop("account_changed");
          await chrome.storage.session.set({"staysuite-facebook-observed-v1":crypto.randomUUID()});
        }
        return;
      }
      try {
        const current = await facebookIdentity();
        const expected = job?.actorId ?? active;
        if (expected && current !== expected) await stop("account_changed");
      } catch { await stop("account_changed"); }
      await chrome.storage.session.set({"staysuite-facebook-observed-v1":crypto.randomUUID()});
    }).catch(()=>{});
  });
  observingCookies = true;
}
observeCookies();
chrome.permissions.onAdded.addListener(() => observeCookies());
chrome.permissions.onRemoved.addListener(permissions => {
  if (permissions.permissions?.includes("cookies") || permissions.origins?.some(origin=>origin.includes("facebook.com"))) void serialized(()=>stop("permission_required")).catch(()=>{});
});
chrome.tabs.onRemoved.addListener(tabId => {
  void serialized(async()=>{const job=await readFacebookJob();if(job && (job.tabId===tabId || job.collectorTabId===tabId)) await stop("interrupted");}).catch(()=>{});
});
