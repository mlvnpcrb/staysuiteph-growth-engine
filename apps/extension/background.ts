import { collectFacebookLibrary } from "./lib/facebook-collector";
import { readFacebookGroupPage } from "./lib/facebook-page";
import type { FacebookJob } from "./lib/facebook-store";
import { FacebookFailure, facebookCode } from "./lib/facebook-model";
import { FACEBOOK_ACTIVE, FACEBOOK_JOB, assertFacebookJob, facebookIdentity, libraryKey, loadFacebookLibrary, readFacebookJob, writeFacebookLibrary } from "./lib/facebook-store";
let operations: Promise<unknown> = Promise.resolve();
const running = new Map<string, AbortController>();
function serialized<T>(operation: () => Promise<T>) {
  const next = operations.then(operation,operation); operations = next.catch(() => {}); return next;
}
async function stop(error: "cancelled" | "account_changed" | "permission_required" | "interrupted" = "cancelled") {
  const job = await readFacebookJob();
  if (job) running.get(job.runId)?.abort();
  await chrome.storage.session.remove(FACEBOOK_JOB);
  if (job) {
    const library = await loadFacebookLibrary(job.actorId);
    if (library?.runId === job.runId) await writeFacebookLibrary({...library,phase:error === "cancelled" ? "cancelled" : "partial",complete:false,error,runId:null,updatedAt:new Date().toISOString()});
    if (job.ownFacebookTab) await chrome.tabs.remove(job.tabId).catch(() => {});
  }
  if (error !== "cancelled") await chrome.storage.local.remove(FACEBOOK_ACTIVE);
}
async function state() {
  const actorId = await facebookIdentity();
  const job = await readFacebookJob();
  if (job && (job.actorId !== actorId || Date.now()-job.startedAt>180_000 || !running.has(job.runId))) await stop(job.actorId !== actorId ? "account_changed" : "interrupted");
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
  // Reuse only a page whose public actor matches the current identity. This
  // neither reloads a user's tab nor assumes a cached page is still signed in.
  let tab: chrome.tabs.Tab | undefined;
  const candidates=await chrome.tabs.query({url:"https://www.facebook.com/*"});
  for(const candidate of candidates.slice(0,5)) {
    if(candidate.id === undefined || candidate.status !== "complete")continue;
    try {
      const result=(await chrome.scripting.executeScript({target:{tabId:candidate.id},world:"MAIN",func:readFacebookGroupPage,args:[actorId,null,true]}))[0]?.result;
      if(result && "actorId" in result && result.actorId===actorId){tab=candidate;break;}
    }catch{ /* An unavailable/stale page is never used as account evidence. */ }
  }
  const ownFacebookTab=tab === undefined;
  tab ??= await chrome.tabs.create({url:"https://www.facebook.com/groups/joins/",active:false});
  if (tab.id === undefined) throw new FacebookFailure("network");
  const job = {actorId,tabId:tab.id,ownFacebookTab,runId:crypto.randomUUID(),startedAt:Date.now()};
  await chrome.storage.session.set({[FACEBOOK_JOB]:job});
  await chrome.storage.local.set({[FACEBOOK_ACTIVE]:actorId});
  await writeFacebookLibrary({schema:1,actorId,actorName:prior?.actorName??"Facebook profile",groups:prior?.groups??[],phase:"fetching",pages:0,complete:false,updatedAt:new Date().toISOString(),syncedAt:prior?.syncedAt??null,error:null,runId:job.runId});
  const controller = new AbortController();
  running.set(job.runId,controller);
  void runFacebookJob(job,controller);
  return state();
}
async function runFacebookJob(job: FacebookJob, controller: AbortController) {
  let reviewFacebook = false;
  let stage: "page_load" | "page_injection" | "checkpoint" = "page_load";
  const guard = () => serialized(() => assertFacebookJob(job));
  try {
    const initial = await loadFacebookLibrary(job.actorId);
    if (!initial || initial.runId !== job.runId) throw new FacebookFailure("interrupted");
    const deadline = Date.now()+20000;
    let loaded = false;
    while(Date.now()<deadline) {
      await guard();
      if((await chrome.tabs.get(job.tabId)).status === "complete") {loaded=true;break;}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!loaded)throw new FacebookFailure("network");
    const library=await collectFacebookLibrary({initial,signal:controller.signal,guard,
      read:async cursor=>{
        stage="page_injection";
        try {
          const results=await chrome.scripting.executeScript({target:{tabId:job.tabId},world:"MAIN",func:readFacebookGroupPage,args:[job.actorId,cursor]});
          return results[0]?.result;
        }catch{return {error:"network",diagnostic:{stage:"page_injection",httpStatus:null,query:cursor===null?"initial":"pagination",querySource:"not_started"}};}
      },
      write:next=>serialized(async()=>{
        stage="checkpoint";
        await assertFacebookJob(job);
        if((await loadFacebookLibrary(job.actorId))?.runId !== job.runId)throw new FacebookFailure("cancelled");
        await writeFacebookLibrary(next);
      }),
      wait:()=>new Promise(resolve=>setTimeout(resolve,1000)),
    });
    reviewFacebook=library.error === "challenge" || library.error === "access_denied";
    if(reviewFacebook)await chrome.tabs.update(job.tabId,{active:true});
  }catch(error){
    await serialized(async()=>{
      if((await readFacebookJob())?.runId !== job.runId)return;
      const library=await loadFacebookLibrary(job.actorId);
      if(library?.runId === job.runId)await writeFacebookLibrary({...library,phase:library.groups.length?"partial":"error",error:facebookCode(error),complete:false,runId:null,updatedAt:new Date().toISOString(),diagnostic:{stage,httpStatus:null,query:"not_started",querySource:"not_started"}});
    }).catch(()=>{});
  }finally{
    await serialized(async()=>{
      if((await readFacebookJob())?.runId === job.runId)await chrome.storage.session.remove(FACEBOOK_JOB);
    }).catch(()=>{});
    running.delete(job.runId);
    if(job.ownFacebookTab && !reviewFacebook){
      const tab=await chrome.tabs.get(job.tabId).catch(()=>null);
      if(tab && !tab.active)await chrome.tabs.remove(job.tabId).catch(()=>{});
    }
  }
}
chrome.runtime.onMessage.addListener((message: unknown,sender,reply) => {
  const url=sender.url??"";
  if(sender.id !== chrome.runtime.id || (sender.frameId !== undefined && sender.frameId !== 0) || ![chrome.runtime.getURL("tabs/groups.html"),chrome.runtime.getURL("popup.html")].includes(url.split("?")[0]??""))return false;
  if(!message || typeof message !== "object" || !("type" in message) || !["FACEBOOK_STATE","FACEBOOK_IDENTITY","FACEBOOK_START","FACEBOOK_STOP","FACEBOOK_FORGET"].includes(String(message.type)))return false;
  void serialized(async()=>{
    if(message.type === "FACEBOOK_IDENTITY")return {actorId:await facebookIdentity()};
    if(message.type === "FACEBOOK_STOP")await stop();
    if(message.type === "FACEBOOK_FORGET"){await stop();const actorId=await facebookIdentity();await chrome.storage.local.remove([libraryKey(actorId),FACEBOOK_ACTIVE]);return {actorId,library:null};}
    return message.type === "FACEBOOK_START" ? start() : state();
  }).then(value=>reply({ok:true,...value})).catch(error=>reply({ok:false,error:facebookCode(error)}));
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
  void serialized(async()=>{const job=await readFacebookJob();if(job && job.tabId===tabId) await stop("interrupted");}).catch(()=>{});
});
