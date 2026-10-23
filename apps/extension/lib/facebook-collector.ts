import { facebookDiagnosticSchema, facebookPageSchema, type FacebookLibrary, type FacebookError } from "@staysuite/validation";
import { FacebookFailure, facebookCode } from "./facebook-model";
export async function collectFacebookLibrary(options: {
  initial: FacebookLibrary;
  read: (cursor: string | null) => Promise<unknown>;
  guard: () => Promise<void>;
  write: (library: FacebookLibrary) => Promise<void>;
  wait: () => Promise<void>;
  signal: AbortSignal;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const deadline = now() + 120_000;
  const found = new Map<string, FacebookLibrary["groups"][number]>();
  const cursors = new Set<string>();
  let library = options.initial, cursor: string | null = null;
  const checked = async () => { if (options.signal.aborted) throw new FacebookFailure("cancelled"); await options.guard(); if (options.signal.aborted) throw new FacebookFailure("cancelled"); };
  const merged = () => [...new Map([...found.values(), ...options.initial.groups.filter(group => !found.has(group.url))].map(group => [group.url,group])).values()].slice(0,5000);
  const save = async (patch: Partial<FacebookLibrary>) => {
    library = {...library,...patch,updatedAt:new Date(now()).toISOString()};
    await options.write(library);
  };
  try {
    await checked();
    while (now() < deadline && library.pages < 100) {
      await checked();
      const raw = await options.read(cursor);
      await checked();
      if (raw && typeof raw === "object" && "error" in raw) {
        // Only the known error vocabulary crosses the page boundary.
        const codes: FacebookError[] = ["signed_out","page_profile","account_changed","challenge","rate_limited","access_denied","network","unsupported","malformed_response"];
        const diagnostic = facebookDiagnosticSchema.safeParse("diagnostic" in raw ? raw.diagnostic : null);
        library = {...library,diagnostic:diagnostic.success?diagnostic.data:null};
        throw new FacebookFailure(codes.includes(raw.error as FacebookError) ? raw.error as FacebookError : "malformed_response");
      }
      const parsed = facebookPageSchema.safeParse(raw);
      if (!parsed.success) throw new FacebookFailure("malformed_response");
      const page = parsed.data;
      if (page.actorId !== library.actorId) throw new FacebookFailure("account_changed");
      for (const group of page.groups) {
        if (found.size >= 5000 && !found.has(group.url)) throw new FacebookFailure("limit");
        found.set(group.url,group);
      }
      await save({actorName:page.actorName,groups:merged(),pages:library.pages+1,complete:false,phase:"fetching",error:null,diagnostic:null});
      if (!page.hasNext) {
        await checked();
        await save({groups:[...found.values()],complete:true,phase:"ready",error:null,syncedAt:new Date(now()).toISOString(),runId:null});
        return library;
      }
      if (!page.cursor || cursors.has(page.cursor)) throw new FacebookFailure("repeated_cursor");
      if (found.size >= 5000) throw new FacebookFailure("limit");
      cursors.add(page.cursor); cursor = page.cursor;
      await options.wait();
    }
    throw new FacebookFailure("limit");
  } catch (error) {
    const code = facebookCode(error);
    // Session change/cancel may already have invalidated the job. The storage
    // adapter verifies ownership before every write, including this terminal one.
    await save({groups:merged(),complete:false,phase:code === "cancelled" ? "cancelled" : found.size ? "partial" : "error",error:code,runId:null});
    return library;
  }
}
