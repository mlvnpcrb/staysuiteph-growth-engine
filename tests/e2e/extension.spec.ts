import AxeBuilder from "@axe-core/playwright";
import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
async function serve(context:BrowserContext) {
  const directory=resolve("apps/extension/build/chrome-mv3-prod");
  await context.route("http://extension-fixture.test/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.includes(".."))return route.abort();
    await route.fulfill({body:await readFile(`${directory}${path}`),contentType:({".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png"} as Record<string,string>)[extname(path)]??"application/octet-stream",headers:{"Content-Security-Policy":"script-src 'self'; object-src 'none'; base-uri 'none'"}});
  });
}
test("popup launches a persistent workspace without collecting data",async({context,page})=>{
  await serve(context);
  await page.addInitScript(()=>{Object.assign(window,{chrome:{runtime:{getURL:(path:string)=>`http://extension-fixture.test/${path}`},windows:{create:async({url}:{url:string})=>{window.open(url);}}}});});
  await page.goto("http://extension-fixture.test/popup.html");
  await expect(page.getByRole("heading",{name:"Your groups, in one place."})).toBeVisible();
  const opened=context.waitForEvent("page");await page.getByRole("button",{name:"Open Sync workspace"}).click();
  await expect((await opened).getByRole("heading",{name:"Your groups. Together in StaySuite."})).toBeVisible();
});
test("workspace requires connection and explicit save consent; denied access does not read tabs",async({context,page})=>{
  await serve(context);
  await page.addInitScript(()=>{Object.assign(window,{chrome:{permissions:{request:async()=>false},tabs:{query:()=>{throw new Error("Unexpected tab access");}}}});});
  await page.goto("http://extension-fixture.test/tabs/groups.html");
  await expect(page.getByRole("button",{name:"Sync groups",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Connect workspace"}).click();
  await expect(page.getByRole("alert")).toContainText("Site access was declined");
  for(const colorScheme of ["light","dark"] as const){await page.emulateMedia({colorScheme});expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);}
});
test("workspace connects, collects multiple viewports and confirms saves in its library (mock Chrome)",async({context,page})=>{
  await serve(context);
  await page.addInitScript(()=>{
    let reads=0;const saved:{url:string;title:string}[]=[];
    Object.assign(window,{chrome:{permissions:{request:async()=>true},tabs:{query:async({url}:{url:string})=>url.includes("facebook")?[{id:2,url:"https://www.facebook.com/groups/joins/",windowId:1}]:[{id:1,url:"http://localhost:3000/dashboard/my-groups"}],update:async()=>{}},windows:{update:async()=>{}},scripting:{executeScript:async({func,args}:{func: (...args: never[]) => unknown;args:unknown[]})=>{
      if(func.toString().includes("/api/groups")){
        const group=args[2] as {url:string;title:string}|null;
        if(group){saved.push(group);return [{result:{saved:true}}];}
        return [{result:{viewer:"viewer-a",groups:saved}}];
      }
      if(func.toString().includes("directory_unavailable"))return [{result:{moved:reads<2,atEnd:reads>=2}}];
      reads++;return [{result:{format:"staysuite-visible-groups-v1",collected_at:new Date().toISOString(),groups:Array.from({length:6},(_,i)=>({url:`https://www.facebook.com/groups/hosts${i+(reads===1?0:6)}/`,title:`Hosts ${i+(reads===1?0:6)}`}))}}];
    }}}});
  });
  await page.goto("http://extension-fixture.test/tabs/groups.html");
  await page.getByRole("button",{name:"Connect workspace"}).click();
  await expect(page.getByText("StaySuite account verified for this session.")).toBeVisible();
  await page.getByRole("checkbox").check();await page.getByRole("button",{name:"Sync groups",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("12 groups confirmed",{timeout:15000});
  await expect(page.locator(".workspace-list li")).toHaveCount(12);
  await page.getByRole("searchbox").fill("Hosts 11");await expect(page.locator(".workspace-list li")).toHaveCount(1);
});
