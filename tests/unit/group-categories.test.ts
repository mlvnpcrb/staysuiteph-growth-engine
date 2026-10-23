import { expect, it } from "vitest";
import { categorizeGroupName } from "../../apps/extension/lib/group-categories";
it("suggests overlapping accommodation categories and explains matched terms",()=>{
  const result=categorizeGroupName("Ｃｅｂｕ AIRBNB / Staycation Hosts & Condo Owners");
  expect(result.map(item=>item.id)).toEqual(["staycation","airbnb","hosts","property"]);
  expect(result.find(item=>item.id==="hosts")?.matchedTerms).toContain("staycation hosts");
});
it("avoids substring and unrelated hosting/rental matches",()=>{
  for(const title of ["Hairbnb Salon","Web Hosting Philippines","Cebu Car Rentals","Pool players"])
    expect(categorizeGroupName(title).map(item=>item.id)).toEqual(["other"]);
});
it("handles local travel terms and punctuation in accommodation names",()=>{
  expect(categorizeGroupName("Bakasyon: Private-Pool Resorts").map(item=>item.id)).toEqual(["resorts","travel"]);
  expect(categorizeGroupName("Air BnB — Co-hosts PH").map(item=>item.id)).toEqual(["airbnb","hosts"]);
});
