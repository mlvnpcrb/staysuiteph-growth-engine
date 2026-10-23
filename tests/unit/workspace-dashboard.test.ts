import { afterEach, expect, it, vi } from "vitest";
import { dashboardRequest } from "../../apps/extension/lib/workspace-dashboard";
const origin="https://app.vercel.app";
const group={url:"https://www.facebook.com/groups/hosts/",title:"Hosts"};
afterEach(()=>vi.unstubAllGlobals());
function setup(){vi.stubGlobal("location",{origin,pathname:"/dashboard/my-groups"});vi.stubGlobal("window",{dispatchEvent:vi.fn()});}
it("never fetches from a mismatched origin",async()=>{setup();const fetch=vi.fn();vi.stubGlobal("fetch",fetch);expect(await dashboardRequest("https://wrong.vercel.app","",null)).toHaveProperty("error");expect(fetch).not.toHaveBeenCalled();});
it("pins each save to the verified viewer and checks persisted ownership",async()=>{setup();const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({group:{...group,user_id:"viewer"}})});vi.stubGlobal("fetch",fetch);expect(await dashboardRequest(origin,"viewer",group)).toHaveProperty("saved",true);expect(fetch).toHaveBeenCalledWith("/api/groups",expect.objectContaining({credentials:"same-origin",redirect:"error",headers:expect.objectContaining({"x-staysuite-viewer":"viewer"})}));});
it("does not report a save with mismatched ownership or redirect errors",async()=>{setup();vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({group:{...group,user_id:"another"}})}));expect(await dashboardRequest(origin,"viewer",group)).toHaveProperty("error");expect(window.dispatchEvent).not.toHaveBeenCalled();});
it("requires the updated authenticated API before pairing",async()=>{setup();vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({groups:[]})}));expect(await dashboardRequest(origin,"",null)).toHaveProperty("error");});
