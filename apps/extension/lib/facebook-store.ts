import { facebookActorSchema, facebookLibrarySchema, type FacebookLibrary } from "@staysuite/validation";
import { FacebookFailure } from "./facebook-model";
export const FACEBOOK_ORIGIN = "https://www.facebook.com/*";
export const FACEBOOK_JOB = "staysuite-facebook-job-v1";
export const FACEBOOK_ACTIVE = "staysuite-facebook-active-v1";
export const libraryKey = (actorId: string) => `staysuite-facebook-library-v1:${facebookActorSchema.parse(actorId)}`;
export type FacebookJob = {runId: string; actorId: string; tabId: number; startedAt: number; ownFacebookTab?: boolean};
export async function facebookIdentity() {
  if (!await chrome.permissions.contains({permissions:["cookies"],origins:[FACEBOOK_ORIGIN]})) throw new FacebookFailure("permission_required");
  const [personal, acting] = await Promise.all([
    chrome.cookies.get({url:"https://www.facebook.com/",name:"c_user"}),
    chrome.cookies.get({url:"https://www.facebook.com/",name:"i_user"}),
  ]);
  const parsed = facebookActorSchema.safeParse(personal?.value);
  if (!parsed.success) throw new FacebookFailure("signed_out");
  if (acting?.value && acting.value !== parsed.data) throw new FacebookFailure("page_profile");
  return parsed.data;
}
export async function loadFacebookLibrary(actorId: string) {
  const key = libraryKey(actorId);
  const data = await chrome.storage.local.get(key);
  const parsed = facebookLibrarySchema.safeParse(data[key]);
  if (!parsed.success || parsed.data.actorId !== actorId) return null;
  // Retain metadata for at most 30 days; expired libraries are removed, not shown.
  if (Date.now()-Date.parse(parsed.data.updatedAt)>30*86400_000) { await chrome.storage.local.remove(key); return null; }
  return parsed.data;
}
export async function writeFacebookLibrary(library: FacebookLibrary) {
  const safe = facebookLibrarySchema.parse(library);
  await chrome.storage.local.set({[libraryKey(safe.actorId)]:safe});
}
export async function readFacebookJob(): Promise<FacebookJob | null> {
  const data = await chrome.storage.session.get(FACEBOOK_JOB);
  const value: unknown = data[FACEBOOK_JOB];
  if (!value || typeof value !== "object") return null;
  const job = value as Partial<FacebookJob>;
  if (typeof job.runId !== "string" || !/^[0-9a-f-]{36}$/.test(job.runId) || !facebookActorSchema.safeParse(job.actorId).success || !Number.isInteger(job.tabId) || typeof job.startedAt !== "number" || !Number.isFinite(job.startedAt)) return null;
  return job as FacebookJob;
}
export async function assertFacebookJob(expected: FacebookJob) {
  const current = await readFacebookJob();
  if (!current || current.runId !== expected.runId) throw new FacebookFailure("cancelled");
  if (Date.now()-current.startedAt>180_000) throw new FacebookFailure("interrupted");
  if (await facebookIdentity() !== expected.actorId) throw new FacebookFailure("account_changed");
}
