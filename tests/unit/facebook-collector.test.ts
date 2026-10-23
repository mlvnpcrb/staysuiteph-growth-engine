import { expect, it, vi } from "vitest";
import { facebookLibrarySchema, type FacebookLibrary } from "@staysuite/validation";
import { collectFacebookLibrary } from "../../apps/extension/lib/facebook-collector";
import { FacebookFailure } from "../../apps/extension/lib/facebook-model";
const actorId="123456789";
const group=(id:number)=>({url:`https://www.facebook.com/groups/${id}/`,title:`Hosts ${id}`});
const initial:FacebookLibrary={schema:1,actorId,actorName:"Profile",groups:[],phase:"fetching",pages:0,complete:false,updatedAt:new Date().toISOString(),syncedAt:null,error:null,runId:"11111111-1111-4111-8111-111111111111"};
const page=(ids:number[],hasNext=false,cursor:string|null=null)=>({actorId,actorName:"My profile",groups:ids.map(group),hasNext,cursor});
function run(read:()=>Promise<unknown>,overrides:Partial<Parameters<typeof collectFacebookLibrary>[0]>={}){
  return collectFacebookLibrary({initial,read,guard:async()=>{},write:async()=>{},wait:async()=>{},signal:new AbortController().signal,...overrides});
}
it("follows cursor pages beyond six, deduplicates and replaces stale memberships only after completion",async()=>{
  const read=vi.fn().mockResolvedValueOnce(page([1,2,3,4,5,6],true,"next")).mockResolvedValueOnce(page([6,7,8,9,10,11,12]));
  const writes:FacebookLibrary[]=[];
  const result=await run(read,{initial:{...initial,groups:[group(99)]},write:async value=>{writes.push(value);}});
  expect(read.mock.calls).toEqual([[null],["next"]]);expect(result.groups).toHaveLength(12);expect(result.groups).not.toContainEqual(group(99));expect(result.complete).toBe(true);expect(result.phase).toBe("ready");expect(writes[0]?.groups).toContainEqual(group(99));
});
it("retains confirmed and previous groups but labels partial if pagination fails",async()=>{
  const read=vi.fn().mockResolvedValueOnce(page([1,2],true,"next")).mockResolvedValue({error:"rate_limited"});
  const result=await run(read,{initial:{...initial,groups:[group(99)]}});
  expect(result.groups).toHaveLength(3);expect(result.complete).toBe(false);expect(result.error).toBe("rate_limited");expect(result.phase).toBe("partial");expect(read).toHaveBeenCalledTimes(2);
});
it("does not accept a response belonging to another actor",async()=>{
  const result=await run(async()=>({...page([1]),actorId:"999"}));
  expect(result.groups).toEqual([]);expect(result.error).toBe("account_changed");
});
it("invalidates a response if the account changes during the request",async()=>{
  let changed=false;
  const result=await run(async()=>{changed=true;return page([1]);},{guard:async()=>{if(changed)throw new FacebookFailure("account_changed");}});
  expect(result.groups).toEqual([]);expect(result.error).toBe("account_changed");
});
it("stops repeated cursors without another request",async()=>{
  const read=vi.fn().mockResolvedValue(page([1],true,"same"));
  const result=await run(read);expect(result.error).toBe("repeated_cursor");expect(read).toHaveBeenCalledTimes(2);
});
it("cancels without reading another page",async()=>{
  const controller=new AbortController();const read=vi.fn().mockResolvedValue(page([1],true,"next"));
  const result=await run(read,{signal:controller.signal,wait:async()=>controller.abort()});expect(result.phase).toBe("cancelled");expect(read).toHaveBeenCalledTimes(1);
});
it("fails closed on malformed replies and discards unknown credential fields",async()=>{
  const result=await run(async()=>({...page([1]),cookie:"DO_NOT_EXPORT"}));expect(result.error).toBe("malformed_response");expect(JSON.stringify(result)).not.toContain("DO_NOT_EXPORT");
  expect(facebookLibrarySchema.safeParse({...initial,token:"DO_NOT_EXPORT"}).success).toBe(false);
});
it("accepts a validated empty complete list without keeping old membership records",async()=>{
  const result=await run(async()=>page([]),{initial:{...initial,groups:[group(99)]}});expect(result.complete).toBe(true);expect(result.groups).toEqual([]);
});
