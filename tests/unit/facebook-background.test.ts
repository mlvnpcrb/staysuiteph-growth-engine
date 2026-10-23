import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { FacebookJob } from "../../apps/extension/lib/facebook-store";
type Listener=(message:unknown,sender:{id:string;url:string;frameId:number;tab:{id:number}},reply:(value:unknown)=>void)=>boolean;
let listener:Listener;
let cookieChange:(change:{cookie:{name:string;domain:string}})=>void;
let actor:string;
let local:Record<string,unknown>,session:Record<string,unknown>;
const removeTab=vi.fn();
const getCookie=vi.fn();
const prefix="chrome-extension://fixture/";
const area=(data:Record<string,unknown>)=>({
  get:async(keys:string|string[])=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,data[key]])),
  set:async(values:Record<string,unknown>)=>{Object.assign(data,structuredClone(values));},
  remove:async(keys:string|string[])=>{for(const key of Array.isArray(keys)?keys:[keys])delete data[key];},
});
async function request(type:string,extra:Record<string,unknown>={},collector=false,tabId=2):Promise<{ok:boolean;error?:string;library?:unknown;actorId?:string}>{
 return new Promise(resolve=>{const job=session['staysuite-facebook-job-v1'] as FacebookJob|undefined;const url=collector?`${prefix}tabs/collector.html?run=${job?.runId??"stale"}`:`${prefix}tabs/groups.html`;listener({type,...extra},{id:"fixture",url,frameId:0,tab:{id:tabId}},value=>resolve(value as Awaited<ReturnType<typeof request>>));});
}
beforeEach(async()=>{
 vi.resetModules();actor="123456789";local={};session={};removeTab.mockReset().mockResolvedValue(undefined);getCookie.mockReset().mockImplementation(async({name}:{name:string})=>name==="c_user"?{value:actor}:null);
 vi.stubGlobal("chrome",{
  runtime:{id:"fixture",getURL:(path:string)=>prefix+path,onMessage:{addListener:(value:Listener)=>{listener=value;}}},
  storage:{local:area(local),session:area(session)},
  permissions:{contains:async()=>true,onAdded:{addListener:()=>{}},onRemoved:{addListener:()=>{}}},
  cookies:{get:getCookie,onChanged:{addListener:(value:typeof cookieChange)=>{cookieChange=value;}}},
  tabs:{query:async()=>[{id:1,url:"https://www.facebook.com/groups/joins/"}],create:async({url}:{url:string})=>({id:url.startsWith("https:")?1:2}),remove:removeTab,onRemoved:{addListener:()=>{}}},
 });
 await import("../../apps/extension/background");
});
afterEach(()=>vi.unstubAllGlobals());
it("starts an account-bound background job and permits only its own collector checkpoints",async()=>{
 expect((await request("FACEBOOK_START")).ok).toBe(true);
 const job=session['staysuite-facebook-job-v1'] as FacebookJob;
 expect(job.collectorTabId).toBe(2);
 const library=local[`staysuite-facebook-library-v1:${actor}`] as Record<string,unknown>;
 const next={...library,pages:1,groups:[{url:"https://www.facebook.com/groups/1/",title:"Host group"}]};
 expect((await request("FACEBOOK_CHECKPOINT",{library:next},true,99)).ok).toBe(false);
 expect((await request("FACEBOOK_CHECKPOINT",{library:next},true)).ok).toBe(true);
 expect(getCookie.mock.calls.every(([input])=>["c_user","i_user"].includes(input.name))).toBe(true);
});
it("cancellation invalidates in-flight checkpoints and removes only extension-owned tabs",async()=>{
 await request("FACEBOOK_START");const library=local[`staysuite-facebook-library-v1:${actor}`];
 expect((await request("FACEBOOK_STOP")).ok).toBe(true);
 expect(session['staysuite-facebook-job-v1']).toBeUndefined();expect(removeTab).toHaveBeenCalledWith(2);expect(removeTab).toHaveBeenCalledWith(1);expect(removeTab).not.toHaveBeenCalledWith(99);
 expect((await request("FACEBOOK_CHECKPOINT",{library},true)).ok).toBe(false);
 expect((local[`staysuite-facebook-library-v1:${actor}`] as {phase:string}).phase).toBe("cancelled");
});
it("session-cookie change invalidates the job without reading that cookie value",async()=>{
 await request("FACEBOOK_START");
 const cookie={name:"xs",domain:".facebook.com"};Object.defineProperty(cookie,"value",{get(){throw new Error("Session cookie value must not be read");}});
 cookieChange({cookie});await request("FACEBOOK_STATE");
 expect(session['staysuite-facebook-job-v1']).toBeUndefined();
 expect((local[`staysuite-facebook-library-v1:${actor}`] as {error:string}).error).toBe("account_changed");
});
it("account switching never returns the old account's library",async()=>{
 await request("FACEBOOK_START");actor="987654321";
 const result=await request("FACEBOOK_STATE");expect(result.actorId).toBe(actor);expect(result.library).toBeNull();
});
it("refuses to persist request tokens supplied in a checkpoint",async()=>{
 await request("FACEBOOK_START");const library=local[`staysuite-facebook-library-v1:${actor}`];
 expect((await request("FACEBOOK_CHECKPOINT",{library:{...library as object,token:"DO_NOT_STORE"}},true)).ok).toBe(false);
 expect(JSON.stringify(local)).not.toContain("DO_NOT_STORE");
});
