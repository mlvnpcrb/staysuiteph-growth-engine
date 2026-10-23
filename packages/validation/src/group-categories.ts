export const groupCategories = [
  {id:"staycation",label:"Staycation",terms:["staycation","staycations","stay cation","transient","transients","short stay","short stays","vacation rental","vacation rentals"]},
  {id:"airbnb",label:"Airbnb",terms:["airbnb","air bnb"]},
  {id:"resorts",label:"Resorts & hotels",terms:["resort","resorts","hotel","hotels","villa","villas","private pool"]},
  {id:"travel",label:"Travel",terms:["travel","travels","travelers","travellers","tourism","tourist","tourists","backpackers","biyahero","biyaheros","bakasyon"]},
  {id:"hosts",label:"Hosts & owners",terms:["airbnb host","airbnb hosts","staycation host","staycation hosts","accommodation hosts","property owner","property owners","property manager","property managers","cohost","cohosts","co host","co hosts"]},
  {id:"property",label:"Condos & property",terms:["condo","condos","condominium","condominiums","apartment","apartments","real estate","property rental","property rentals"]},
  {id:"other",label:"Other",terms:[]},
] as const;
export type GroupCategoryId = typeof groupCategories[number]["id"];
export type CategoryMatch = {id:GroupCategoryId;label:string;matchedTerms:readonly string[]};
/** Local, explainable suggestions from names only; never infer posting eligibility. */
export function categorizeGroupName(title:string):CategoryMatch[]{
  const normalized=` ${title.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu," ").trim()} `;
  const matches:CategoryMatch[]=[];
  for(const category of groupCategories){
    if(category.id==="other")continue;
    const matchedTerms=category.terms.filter(term=>normalized.includes(` ${term} `));
    if(matchedTerms.length)matches.push({id:category.id,label:category.label,matchedTerms});
  }
  return matches.length?matches:[{id:"other",label:"Other",matchedTerms:[]}];
}
