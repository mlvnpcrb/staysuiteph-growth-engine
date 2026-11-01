import { writeFileSync } from "node:fs";
const destination = process.argv[2];
if (!destination)
  throw new Error(
    "Pass the existing CLI-created migration file to regenerate.",
  );
if (process.versions.unicode !== "17.0")
  throw new Error("Regeneration requires the reviewed Unicode 17.0 runtime.");
const ranges = [];
let start = -1,
  last = -1;
for (let point = 0; point <= 0x10ffff; point++) {
  const word = /[\p{L}\p{M}\p{N}_]/u.test(String.fromCodePoint(point));
  if (word) {
    if (start < 0) start = point;
    last = point;
  } else if (start >= 0) {
    ranges.push([start, last]);
    start = -1;
  }
}
if (start >= 0) ranges.push([start, last]);
const alphabet = ranges
  .map(
    ([start, end]) =>
      String.fromCodePoint(start) +
      (start === end ? "" : "-" + String.fromCodePoint(end)),
  )
  .join("")
  .replaceAll("'", "''");
const sql = `-- Unicode ${process.versions.unicode} L/M/N word boundaries, matching the JavaScript keyword contract.
-- Generated from Node ${process.versions.node} Unicode property escapes; no locale-dependent POSIX approximation.
create or replace function public.radar_phrase(body text,term text) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare escaped text;word_class constant text:='${alphabet}';
begin
 if term='' then return false;end if;
 if term~'[㐀-鿿豈-﫿぀-ヿ฀-๿຀-໿ក-៿က-႟가-힯]' then return strpos(body,term)>0;end if;
 select string_agg(case when strpos(E'\\\\.^$|?*+()[]{}',c)>0 then chr(92)||c else c end,'' order by n) into escaped from regexp_split_to_table(term,'') with ordinality a(c,n);
 return body~('(^|[^'||word_class||'])'||escaped||'($|[^'||word_class||'])');
end $$;
notify pgrst,'reload schema';
`;
writeFileSync(destination, sql);
console.log(ranges.length + " Unicode word ranges.");
