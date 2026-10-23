import { facebookLibrarySchema } from "@staysuite/validation";
import { FacebookFailure, facebookCode } from "./lib/facebook-model";
import { FACEBOOK_ACTIVE, FACEBOOK_JOB, assertFacebookJob, facebookIdentity, libraryKey, loadFacebookLibrary, readFacebookJob, writeFacebookLibrary } from "./lib/facebook-store";
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
    const collector = await chrome.tabs.create({url:chrome.runtime.getURL(`tabs/collector.html?run=${job.runId}`),active:false});
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
  if (collector && message.type !== "FACEBOOK_CHECKPOINT") return false;
  if (workspace && !["FACEBOOK_STATE","FACEBOOK_START","FACEBOOK_STOP","FACEBOOK_FORGET"].includes(String(message.type))) return false;
  void serialized(async () => {
    if (message.type === "FACEBOOK_CHECKPOINT") {
      const job = await readFacebookJob();
      if (!job || sender.tab?.id !== job.collectorTabId || new URL(url).searchParams.get("run") !== job.runId) throw new FacebookFailure("cancelled");
      await assertFacebookJob(job);
      const library = facebookLibrarySchema.parse("library" in message ? message.library : null);
      if (library.actorId !== job.actorId || (library.runId !== null && library.runId !== job.runId)) throw new FacebookFailure("account_changed");
      if ((await loadFacebookLibrary(job.actorId))?.runId !== job.runId) throw new FacebookFailure("cancelled");
      await writeFacebookLibrary(library);
      return {};
    }
    if (message.type === "FACEBOOK_STOP") await stop();
    if (message.type === "FACEBOOK_FORGET") { await stop(); const actorId = await facebookIdentity(); await chrome.storage.local.remove([libraryKey(actorId),FACEBOOK_ACTIVE]); return {actorId,library:null}; }
    return message.type === "FACEBOOK_START" ? start() : state();
  }).then(value=>reply({ok:true,...value})).catch(error=>reply({ok:false,error:facebookCode(error)}));
  return true;
});
let observingCookies = false;
function observeCookies() {
  if (observingCookies || !chrome.cookies?.onChanged) return;
  chrome.cookies.onChanged.addListener(change => {
    // Observe credential-cookie changes only as events, without accessing values.
    if (/(^|\.)facebook\.com$/.test(change.cookie.domain) && ["c_user","i_user","xs"].includes(change.cookie.name)) void serialized(()=>stop("account_changed")).catch(()=>{});
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
