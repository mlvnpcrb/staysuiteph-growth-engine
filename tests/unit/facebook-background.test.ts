import { beforeEach, afterEach, expect, it, vi } from "vitest";
type Sender={id:string;url:string;frameId:number};
type Listener=(message:unknown,sender:Sender,reply:(value:unknown)=>void)=>boolean;
let listener:Listener,cookieChange:(change:{cookie:{name:string;domain:string};removed?:boolean;cause?:string})=>void;
let actor:string,local:Record<string,unknown>,session:Record<string,unknown>;
let release:(value:unknown)=>void;
const removeTab=vi.fn(),getCookie=vi.fn(),readPage=vi.fn();
const prefix="chrome-extension://fixture/";
const area=(data:Record<string,unknown>)=>({get:async(keys:string|string[])=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,data[key]])),set:async(values:Record<string,unknown>)=>{Object.assign(data,structuredClone(values));},remove:async(keys:string|string[])=>{for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}});
async function request(type:string):Promise<{ok:boolean;actorId?:string;library?:unknown}>{return new Promise(resolve=>{if(!listener({type},{id:"fixture",url:`${prefix}popup.html`,frameId:0},value=>resolve(value as Awaited<ReturnType<typeof request>>)))resolve({ok:false});});}
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
beforeEach(async()=>{
 vi.resetModules();actor="123456789";local={};session={};removeTab.mockReset().mockResolvedValue(undefined);getCookie.mockReset().mockImplementation(async({name}:{name:string})=>name==="c_user"?{value:actor}:null);
 readPage.mockReset().mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 vi.stubGlobal("chrome",{runtime:{id:"fixture",getURL:(path:string)=>prefix+path,onMessage:{addListener:(value:Listener)=>{listener=value;}}},storage:{local:area(local),session:area(session)},permissions:{contains:async()=>true,onAdded:{addListener:()=>{}},onRemoved:{addListener:()=>{}}},cookies:{get:getCookie,onChanged:{addListener:(value:typeof cookieChange)=>{cookieChange=value;}}},scripting:{executeScript:readPage},tabs:{create:async()=>({id:1}),get:async()=>({id:1,status:"complete",active:false}),update:async()=>{},remove:removeTab,onRemoved:{addListener:()=>{}}}});
 await import("../../apps/extension/background");
});
afterEach(async()=>{await request("FACEBOOK_STOP");release?.([{result:{error:"cancelled"}}]);await wait();vi.unstubAllGlobals();});
it("starts the bound read-only background request without another extension-page handoff",async()=>{
 expect((await request("FACEBOOK_START")).ok).toBe(true);await wait();
 expect(readPage).toHaveBeenCalledWith(expect.objectContaining({target:{tabId:1},world:"MAIN",args:[actor,null]}));
 expect(getCookie.mock.calls.every(([input])=>["c_user","i_user"].includes(input.name))).toBe(true);
 release([{result:{actorId:actor,actorName:"Host",groups:[{url:"https://www.facebook.com/groups/1/",title:"Host group"}],hasNext:false,cursor:null}}]);
 await wait();await wait();const result=await request("FACEBOOK_STATE");expect(result.library).toMatchObject({phase:"ready",complete:true,groups:[{title:"Host group"}]});
});
it("cancellation prevents an in-flight response from changing the library",async()=>{
 await request("FACEBOOK_START");await wait();expect((await request("FACEBOOK_STOP")).ok).toBe(true);
 release([{result:{actorId:actor,actorName:"Host",groups:[{url:"https://www.facebook.com/groups/1/",title:"Host group"}],hasNext:false,cursor:null}}]);await wait();
 expect((local[`staysuite-facebook-library-v1:${actor}`] as {phase:string;groups:unknown[]}).groups).toEqual([]);expect(removeTab).toHaveBeenCalledWith(1);
});
it("explicit session-cookie removal invalidates without reading its value",async()=>{
 await request("FACEBOOK_START");await wait();const cookie={name:"xs",domain:".facebook.com"};Object.defineProperty(cookie,"value",{get(){throw new Error("Do not read session credentials");}});
 cookieChange({cookie,removed:true,cause:"explicit"});await request("FACEBOOK_STATE");expect(session['staysuite-facebook-job-v1']).toBeUndefined();
});
it("same-identity refresh does not stop collection, but an account switch hides its library",async()=>{
 await request("FACEBOOK_START");await wait();cookieChange({cookie:{name:"c_user",domain:".facebook.com"},removed:false,cause:"explicit"});await request("FACEBOOK_STATE");expect(session['staysuite-facebook-job-v1']).toBeDefined();
 actor="987654321";const result=await request("FACEBOOK_STATE");expect(result.actorId).toBe(actor);expect(result.library).toBeNull();
});
it("does not expose a client checkpoint endpoint",async()=>{expect((await request("FACEBOOK_CHECKPOINT")).ok).toBe(false);});
