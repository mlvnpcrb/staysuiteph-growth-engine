/* global chrome */
import { URL, URLSearchParams } from "node:url";
import { chromium, expect } from "@playwright/test";
import { mkdtemp, rm, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const extensionPath=resolve("apps/extension/build/chrome-mv3-prod");
const profile=await mkdtemp(join(tmpdir(),"staysuite-extension-test-"));
let context;
let fixtureRequests=0;
const collectorErrors=[];
try {
  context=await chromium.launchPersistentContext(profile,{channel:"chromium",headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:["--enable-unsafe-extension-debugging"],ignoreDefaultArgs:["--disable-extensions"]});
  context.on("page",page=>page.on("pageerror",error=>{if(page.url().includes("/tabs/collector.html"))collectorErrors.push(error.message.slice(0,200));}));
  const session=await context.browser().newBrowserCDPSession();
  const {id}=await session.send("Extensions.loadUnpacked",{path:extensionPath});
  const popup=await context.newPage();const errors=[];popup.on("pageerror",error=>errors.push(error.message));
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(popup.getByRole("heading",{name:"Your Facebook groups."})).toBeVisible();
  const opened=context.waitForEvent("page");await popup.getByRole("button",{name:"Open full workspace"}).click();
  const workspace=await opened;
  await expect(workspace.getByRole("heading",{name:"Your Facebook groups."})).toBeVisible();
  await expect(workspace.getByRole("button",{name:"Sync Groups"})).toBeEnabled();
  await expect(workspace.getByRole("button",{name:"Save groups to My Groups"})).toBeDisabled();
  if(errors.length)throw new Error("Extension launch produced runtime errors.");
  await workspace.close();await popup.close();

  // Test-only clone models optional permission already approved by a user. The
  // shipped manifest is unchanged. All Facebook traffic is fulfilled locally.
  const fixturePath=join(profile,"approved-extension-fixture");await cp(extensionPath,fixturePath,{recursive:true});
  const manifest=JSON.parse(await readFile(join(fixturePath,"manifest.json"),"utf8"));
  manifest.permissions=[...manifest.permissions,"cookies"];
  manifest.optional_permissions=[];manifest.host_permissions=["https://www.facebook.com/*"];
  await writeFile(join(fixturePath,"manifest.json"),JSON.stringify(manifest));
  const actor="123456789",csrf="fixture-csrf-do-not-export",lsd="fixture-lsd-do-not-export";
  let releaseSecond;
  const secondGate=new Promise(resolve=>{releaseSecond=resolve;});
  await context.route("https://www.facebook.com/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path!=="/api/graphql/"){
      const pageCsrf=path==="/settings"?csrf:"fixture-stale-csrf",pageLsd=path==="/settings"?lsd:"fixture-stale-lsd";
      return route.fulfill({contentType:"text/html",body:`<!doctype html><html lang="en"><head><title>Facebook fixture</title></head><body><main>Group directory fixture</main><script type="application/json">${JSON.stringify({define:[["CurrentUserInitialData",[],{USER_ID:actor,NAME:"Fixture host"}],["DTSGInitialData",[],{token:pageCsrf}],["LSD",[],{token:pageLsd}]]})}</script><script>const data={CurrentUserInitialData:{USER_ID:'${actor}',NAME:'Fixture host'},DTSGInitialData:{token:'${pageCsrf}'},LSD:{token:'${pageLsd}'}};window.require=name=>data[name];</script></body></html>`});
    }
    fixtureRequests++;
    const form=new URLSearchParams(route.request().postData()??"");
    const variables=JSON.parse(form.get("variables")??"{}");
    if(form.get("fb_dtsg")!==csrf || form.get("lsd")!==lsd)throw new Error("Fixture page request did not use its local context.");
    if(variables.cursor)await secondGate;
    const start=variables.cursor?7:1;
    return route.fulfill({json:{data:{viewer:{groups_tab:{pinned_groups:{edges:[]},tab_groups_list:{edges:Array.from({length:6},(_,i)=>({node:{id:String(start+i),name:`Fixture group ${start+i}`}})),page_info:{has_next_page:!variables.cursor,end_cursor:variables.cursor?null:"next-page"}}}}}}});
  });
  await context.addCookies([{name:"c_user",value:actor,domain:".facebook.com",path:"/",secure:true,sameSite:"Lax"}]);
  const facebook=await context.newPage();await facebook.goto("https://www.facebook.com/groups/joins/");
  const installed=await session.send("Extensions.loadUnpacked",{path:fixturePath});
  const connected=await context.newPage();await connected.goto(`chrome-extension://${installed.id}/popup.html`);
  await connected.getByRole("button",{name:"Sync Groups"}).click();
  await expect(connected.getByRole("button",{name:"Stop collection"})).toBeVisible();
  await expect(connected.locator(".workspace-list li")).toHaveCount(6,{timeout:45000});
  await connected.close();releaseSecond();
  await expect.poll(()=>fixtureRequests,{timeout:15000}).toBe(2);
  const reopened=await context.newPage();await reopened.goto(`chrome-extension://${installed.id}/popup.html`);
  await expect(reopened.locator(".workspace-list li")).toHaveCount(12,{timeout:15000});
  await expect(reopened.getByText("Group-list pagination completed.",{exact:false})).toBeVisible();
  const snapshot=await reopened.evaluate(async()=>JSON.stringify(await chrome.storage.local.get(null)));
  if(snapshot.includes(csrf)||snapshot.includes(lsd)||snapshot.includes('fixture-stale-')||snapshot.includes('"c_user"'))throw new Error("Fixture credentials crossed into persisted extension data.");
  if(fixtureRequests!==2)throw new Error("Restoring the library unexpectedly started another import.");
  await reopened.evaluate(async()=>{await chrome.cookies.set({url:"https://www.facebook.com/",name:"c_user",value:"987654321",domain:".facebook.com",path:"/",secure:true,sameSite:"lax"});});
  await expect(reopened.locator(".workspace-list li")).toHaveCount(0,{timeout:15000});
  console.log("PASS: native MV3 launch; real background/collector/MAIN-world injection against intercepted Facebook fixtures; two pages and 12 groups; popup closure persistence; local restoration; account-switch isolation; no request tokens in persisted data. Live Facebook compatibility is unverified.");
} catch(error){
  if(context && !(error instanceof Error && /disabled by the administrator|Method not available/.test(error.message))) {
    const page=context.pages().find(page=>page.url().startsWith("chrome-extension://") && (page.url().includes("/tabs/groups.html") || page.url().endsWith("/popup.html")));
    const libraries=await page?.evaluate(async()=>{
      const stored=await chrome.storage.local.get(null);
      return Object.values(stored).filter(value=>value && typeof value==="object" && value.schema===1).map(value=>({phase:value.phase,error:value.error,pages:value.pages,count:Array.isArray(value.groups)?value.groups.length:0,diagnostic:value.diagnostic??null}));
    }).catch(()=>[]);
    const tabs=await page?.evaluate(async()=>(await chrome.tabs.query({})).map(tab=>({role:(tab.url??tab.pendingUrl??"").includes("facebook.com")?"facebook":(tab.url??"").includes("collector.html")?"collector":"other",status:tab.status,discarded:tab.discarded}))).catch(()=>[]);
    const collectors=[];
    for(const item of context.pages().filter(page=>page.url().includes("/tabs/collector.html")))collectors.push(await item.getByRole("status").allTextContents().catch(()=>[]));
    const refusal=await page?.evaluate(async()=>(await chrome.storage.session.get("staysuite-facebook-refusal-v1"))["staysuite-facebook-refusal-v1"]??null).catch(()=>null);
    console.error("Native fixture diagnostic:",JSON.stringify({requests:fixtureRequests,libraries,tabs,collectors,collectorErrors,refusal}));
  }
  if(error instanceof Error && /disabled by the administrator|Method not available/.test(error.message)){console.error(`BLOCKED: unpacked extension installation is unavailable: ${error.message}`);process.exitCode=2;}else throw error;
} finally {await context?.close();await rm(profile,{recursive:true,force:true});}
