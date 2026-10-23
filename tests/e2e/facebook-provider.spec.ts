import { test, expect, type Page } from "@playwright/test";
import { readFacebookGroupPage } from "../../apps/extension/lib/facebook-page";
const actor="123456789";
const csrf="fixture-csrf-never-export", lsd="fixture-lsd-never-export";
function markup(bootstrap=false){
  const data={CurrentUserInitialData:{USER_ID:actor,NAME:"Fixture host"},DTSGInitialData:{token:csrf},LSD:{token:lsd}};
  const script=bootstrap?`<script type="application/json">${JSON.stringify({require:Object.entries(data).map(([name,value])=>[name,[],value])})}</script>`:`<script>window.fixtureModules=${JSON.stringify(data)};window.require=function(name){if(name.endsWith('.graphql'))return {params:{id:'11111111111111',operationKind:'query'}};return window.fixtureModules[name]};</script>`;
  return `<!doctype html><html lang="en"><head><title>Facebook fixture</title></head><body>${script}<main>Joined groups fixture</main></body></html>`;
}
function payload(ids:number[],hasNext=false){return {data:{viewer:{groups_tab:{pinned_groups:{edges:[]},tab_groups_list:{edges:ids.map(id=>({node:{id:String(id),name:`Group ${id}`}})),page_info:{has_next_page:hasNext,end_cursor:hasNext?"page-two":null}}}}}};}
async function invoke(page:Page,cursor:string|null=null){
  return page.evaluate<Awaited<ReturnType<typeof readFacebookGroupPage>>>(`(${readFacebookGroupPage.toString()})(${JSON.stringify(actor)},${JSON.stringify(cursor)})`);
}
test("Facebook page provider follows the read-only request contract and returns metadata without credentials",async({page})=>{
  const cursors:(string|null)[]=[];
  await page.route("https://www.facebook.com/**",async route=>{
    if(new URL(route.request().url()).pathname==="/api/graphql/"){
      const body=new URLSearchParams(route.request().postData()??"");
      expect(body.get("fb_dtsg")).toBe(csrf);expect(body.get("lsd")).toBe(lsd);expect(body.get("doc_id")).toBe("11111111111111");
      const variables=JSON.parse(body.get("variables")??"{}");cursors.push(variables.cursor??null);
      expect(body.get("fb_api_req_friendly_name")).toBe(variables.cursor?"GroupsCometUnpinnedGroupsPaginationListPaginatedQuery":"GroupsCometPinnedGroupsDialogQuery");
      await route.fulfill({json:variables.cursor?payload([7,8,9,10,11,12]):payload([1,2,3,4,5,6],true)});
    }else await route.fulfill({contentType:"text/html",body:markup()});
  });
  await page.goto("https://www.facebook.com/groups/joins/");
  const first=await invoke(page);expect(first).toHaveProperty("hasNext",true);
  const second=await invoke(page,"page-two");expect(second).toHaveProperty("hasNext",false);
  expect(cursors).toEqual([null,"page-two"]);
  expect(JSON.stringify([first,second])).not.toContain(csrf);expect(JSON.stringify([first,second])).not.toContain(lsd);
  expect("groups" in first?first.groups?.length:0).toBe(6);expect("groups" in second?second.groups?.length:0).toBe(6);
});
test("named bootstrap modules work without exporting page request tokens",async({page})=>{
  await page.route("https://www.facebook.com/**",route=>new URL(route.request().url()).pathname==="/api/graphql/"?route.fulfill({json:payload([1])}):route.fulfill({contentType:"text/html",body:markup(true)}));
  await page.goto("https://www.facebook.com/groups/joins/");const result=await invoke(page);expect(result).toHaveProperty("groups");expect(JSON.stringify(result)).not.toContain(csrf);
});
test("a genuine challenge stops before requests, while hidden dialogs do not block the API lane",async({page})=>{
  let requests=0;
  await page.route("https://www.facebook.com/**",route=>{if(new URL(route.request().url()).pathname==="/api/graphql/"){requests++;return route.fulfill({json:payload([1])});}return route.fulfill({contentType:"text/html",body:markup()+'<div role="dialog" hidden>Unrelated</div>'});});
  await page.goto("https://www.facebook.com/groups/joins/");expect(await invoke(page)).toHaveProperty("groups");
  await page.evaluate(()=>{document.title="Security check";});expect(await invoke(page)).toMatchObject({error:"challenge"});expect(requests).toBe(1);
});
test("account changes during a request discard its response",async({page})=>{
  await page.route("https://www.facebook.com/**",async route=>{
    if(new URL(route.request().url()).pathname==="/api/graphql/"){
      await page.evaluate(()=>{const state=window as unknown as {fixtureModules:{CurrentUserInitialData:{USER_ID:string}}};state.fixtureModules.CurrentUserInitialData.USER_ID="999";});
      await route.fulfill({json:payload([1])});
    }else await route.fulfill({contentType:"text/html",body:markup()});
  });
  await page.goto("https://www.facebook.com/groups/joins/");expect(await invoke(page)).toMatchObject({error:"account_changed"});
});
test("rate limiting and unrecognized responses stop without retries or raw error export",async({page})=>{
  let requests=0;
  await page.route("https://www.facebook.com/**",route=>{if(new URL(route.request().url()).pathname==="/api/graphql/"){requests++;return requests===1?route.fulfill({status:429,body:"sensitive response"}):route.fulfill({json:{errors:[{message:csrf}]}});}return route.fulfill({contentType:"text/html",body:markup()});});
  await page.goto("https://www.facebook.com/groups/joins/");expect(await invoke(page)).toMatchObject({error:"rate_limited"});expect(requests).toBe(1);
  expect(await invoke(page)).toMatchObject({error:"unsupported"});expect(requests).toBe(2);
});
