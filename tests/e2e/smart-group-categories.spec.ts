import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { SavedGroup } from "@staysuite/types";
import { settleTheme } from "./helpers/settle-theme";
test("My Groups categories overlap and combine with existing filters without writing data",async({page})=>{
  const titles=["Cebu Airbnb Staycation Hosts","Tagaytay Staycation Villas","Manila Condo Owners","Travel PH","Book Club"];
  const groups:SavedGroup[]=titles.map((title,index)=>({id:`11111111-1111-4111-8111-${String(index+1).padStart(12,"0")}`,user_id:"11111111-1111-4111-8111-111111111111",identity:`fixture${index}`,url:`https://www.facebook.com/groups/fixture${index}/`,title,destination:"",accommodation:"",audience:"",evidence:"",source:"manual",notes:"",review_status:"review_required",rule_evidence:"",last_reviewed_at:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}));
  let writes=0;
  await page.route("**/api/groups",route=>{
    if(route.request().method()!=="GET"){writes++;return route.fulfill({status:400,json:{error:"Unexpected mutation"}});}
    return route.fulfill({json:{groups,stats:{total:groups.length,reviewed:0,needsReview:groups.length}}});
  });
  await page.goto("/dashboard/my-groups");
  const filters=page.getByRole("group",{name:"Filter groups by category"});
  await expect(page.locator(".saved-group")).toHaveCount(5);
  const first = page.locator(".saved-group").first();
  await expect(first).toContainText("Tagaytay Staycation Villas");
  await expect(first).toContainText("Review first for accommodation posts");
  await expect(first).toContainText("Visibility, competition and buyer intent are unverified");
  await filters.getByRole("button",{name:/^Staycation 2$/}).click();await expect(page.locator(".saved-group")).toHaveCount(2);
  await page.getByLabel("Filter saved groups").fill("Cebu");await expect(page.locator(".saved-group")).toHaveCount(1);
  await filters.getByRole("button",{name:/^Airbnb 1$/}).click();await expect(page.locator(".saved-group")).toHaveCount(1);
  await page.getByLabel("Filter saved groups").fill("");
  await filters.getByRole("button",{name:/^Other 1$/}).focus();await page.keyboard.press("Enter");
  await expect(page.locator(".saved-group")).toHaveCount(1);await expect(page.locator(".saved-group")).toContainText("Book Club");
  await filters.getByRole("button",{name:/^All 5$/}).click();
  for(const colorScheme of ["light","dark"] as const){if(colorScheme==="dark")await page.getByRole("button",{name:"Toggle color theme"}).click();await settleTheme(page,colorScheme);expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);}
  expect(writes).toBe(0);
});
