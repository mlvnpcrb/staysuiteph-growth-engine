import { expect, it, vi } from "vitest";
import { scanDirectory } from "../../apps/extension/lib/directory-sync";
const batch = (start: number) => ({format:"staysuite-visible-groups-v1", collected_at:new Date().toISOString(), groups:Array.from({length:6},(_,i)=>({url:`https://www.facebook.com/groups/group${start+i}/`, title:`Group ${start+i}`}))});
it("accumulates virtualized batches beyond the first six and deduplicates", async () => {
  let pass=0;
  const result=await scanDirectory({read:async()=>batch(Math.min(pass++*6,12)),scroll:async()=>({moved:pass<3,atEnd:pass>=3}),wait:async()=>{},signal:new AbortController().signal,progress:vi.fn()});
  expect(result.reason).toBe("loaded_end");expect(result.groups).toHaveLength(18);
});
it("preserves a partial result but stops before scrolling on a challenge",async()=>{
  const read=vi.fn().mockResolvedValueOnce(batch(0)).mockResolvedValue({error:"Facebook account check"});
  const scroll=vi.fn().mockResolvedValue({moved:true,atEnd:false});
  const result=await scanDirectory({read,scroll,wait:async()=>{},signal:new AbortController().signal,progress:vi.fn()});
  expect(result.reason).toBe("blocked");expect(result.groups).toHaveLength(6);expect(scroll).toHaveBeenCalledTimes(1);
});
it("cancellation stops before another read or scroll",async()=>{
  const controller=new AbortController();const scroll=vi.fn();
  const result=await scanDirectory({read:async()=>batch(0),scroll,wait:async()=>{},signal:controller.signal,progress:()=>controller.abort()});
  expect(result.reason).toBe("cancelled");expect(scroll).not.toHaveBeenCalled();
});
it("fails closed on invalid data and never scrolls",async()=>{
  const scroll=vi.fn();const result=await scanDirectory({read:async()=>({groups:[{url:"https://evil.test",title:"Bad"}]}),scroll,wait:async()=>{},signal:new AbortController().signal,progress:vi.fn()});
  expect(result.reason).toBe("blocked");expect(scroll).not.toHaveBeenCalled();
});
