import { afterEach, expect, it, vi } from "vitest";
import { facebookIdentity } from "../../apps/extension/lib/facebook-store";
afterEach(()=>vi.unstubAllGlobals());
it("reads only identity cookies after scoped permission is granted",async()=>{
 const get=vi.fn(async({name}:{name:string})=>name==="c_user"?{value:"123456789"}:null);
 vi.stubGlobal("chrome",{permissions:{contains:async()=>true},cookies:{get}});
 expect(await facebookIdentity()).toBe("123456789");expect(get.mock.calls.map(([arg])=>arg.name)).toEqual(["c_user","i_user"]);
});
it("does not read cookies without permission",async()=>{
 const get=vi.fn();vi.stubGlobal("chrome",{permissions:{contains:async()=>false},cookies:{get}});
 await expect(facebookIdentity()).rejects.toHaveProperty("code","permission_required");expect(get).not.toHaveBeenCalled();
});
it("rejects a Page acting session and missing identity",async()=>{
 const get=vi.fn(async({name}:{name:string})=>({value:name==="c_user"?"123":"456"}));vi.stubGlobal("chrome",{permissions:{contains:async()=>true},cookies:{get}});
 await expect(facebookIdentity()).rejects.toHaveProperty("code","page_profile");get.mockResolvedValue(null as never);await expect(facebookIdentity()).rejects.toHaveProperty("code","signed_out");
});
