import {expect, it} from "vitest";
import {detectCampaignDashboard} from "../../apps/extension/lib/campaign-browser";
const origin = "https://staysuiteph-growth-engine-me9zwj9vs-mlvnpcrbs-projects.vercel.app";
it("detects a supported signed-in dashboard without a pasted URL",()=>{
 expect(detectCampaignDashboard([{id:1,active:false,url:origin+"/dashboard/campaigns"}])).toMatchObject({tabId:1,origin});
});
it("ignores hidden URLs, login pages and unrelated or lookalike sites",()=>{
 expect(detectCampaignDashboard([{id:1,active:true},{id:2,active:false,url:origin+"/login"},{id:3,active:false,url:"https://another-project.vercel.app/dashboard/campaigns"},{id:4,active:false,url:origin+".evil.test/dashboard/campaigns"}])).toBeNull();
});
it("prefers the active supported dashboard and accepts local development",()=>{
 expect(detectCampaignDashboard([{id:1,active:false,url:origin+"/dashboard/campaigns"},{id:2,active:true,url:"http://localhost:3020/dashboard/campaigns"}])).toMatchObject({tabId:2,origin:"http://localhost:3020"});
});
it("chooses the most recently used dashboard when the extension tab has focus",()=>{
 expect(detectCampaignDashboard([{id:1,active:false,lastAccessed:10,url:origin+"/dashboard/campaigns"},{id:2,active:false,lastAccessed:20,url:"http://localhost:3020/dashboard/campaigns"}])).toMatchObject({tabId:2});
});
