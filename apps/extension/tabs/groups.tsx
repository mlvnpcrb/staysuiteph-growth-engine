import { useCallback, useEffect, useRef, useState } from "react";
import { facebookLibrarySchema, safeDashboardUrl, type FacebookLibrary } from "@staysuite/validation";
import { facebookMessages } from "../lib/facebook-model";
import { facebookIdentity, FACEBOOK_ORIGIN } from "../lib/facebook-store";
import { requestDashboard } from "../lib/workspace-dashboard";
import "../style.css";
const origin = safeDashboardUrl(process.env.PLASMO_PUBLIC_DASHBOARD_URL || "http://localhost:3000");
const appUrl = `${origin}/dashboard/my-groups`;
export default function GroupsWorkspace() {
  const [library,setLibrary] = useState<FacebookLibrary | null>(null);
  const [actorId,setActorId] = useState<string | null>(null);
  const [ready,setReady] = useState(false);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  const [query,setQuery] = useState("");
  const [shown,setShown] = useState(100);
  const [cloud,setCloud] = useState<{tabId:number;viewer:string}|null>(null);
  const [autoSave,setAutoSave] = useState(false);
  const [saving,setSaving] = useState(false);
  const [cloudStatus,setCloudStatus] = useState("Connect StaySuite when you want these groups in My Groups.");
  const saveController = useRef<AbortController|null>(null);
  const autoSaved = useRef("");
  const loadSequence = useRef(0);
  const reload = useCallback(async()=>{
    const sequence=++loadSequence.current;
    try {
      const result=await chrome.runtime.sendMessage({type:"FACEBOOK_STATE"});
      if(sequence!==loadSequence.current)return;
      if(!result?.ok){setActorId(null);setLibrary(null);if(result?.error && result.error!=="permission_required")setError(facebookMessages[result.error as keyof typeof facebookMessages]??"Facebook could not be checked.");return;}
      const parsed=facebookLibrarySchema.safeParse(result.library);
      setActorId(typeof result.actorId==="string"?result.actorId:null);
      setLibrary(parsed.success?parsed.data:null);
      setError("");
    } catch { if(sequence===loadSequence.current){setActorId(null);setLibrary(null);setError("Reload the extension to reconnect its collector.");} }
    finally {if(sequence===loadSequence.current)setReady(true);}
  },[]);
  useEffect(()=>{
    document.documentElement.lang="en";document.title="StaySuite · Facebook groups";
    void reload();
    const changed=(changes:Record<string,unknown>)=>{if(Object.keys(changes).some(key=>key.startsWith("staysuite-facebook-")))void reload();};
    chrome.storage.onChanged.addListener(changed);
    return()=>{loadSequence.current++;chrome.storage.onChanged.removeListener(changed);saveController.current?.abort();};
  },[reload]);
  useEffect(()=>{
    let active=true;
    const timer=setInterval(()=>{
      if(document.visibilityState!=="visible")return;
      void chrome.runtime.sendMessage({type:"FACEBOOK_IDENTITY"}).then(result=>{
        if(!active)return;
        if((result?.ok && result.actorId!==actorId) || (!result?.ok && actorId!==null))void reload();
      }).catch(()=>{});
    },2000);
    return()=>{active=false;clearInterval(timer);};
  },[actorId,reload]);
  async function connectFacebook() {
    setPending(true);setError("");
    try {
      if(!await chrome.permissions.request({permissions:["cookies"],origins:[FACEBOOK_ORIGIN]})){setError("Facebook connection was declined. No account data was read.");return;}
      const result=await chrome.runtime.sendMessage({type:"FACEBOOK_START"});
      if(!result?.ok)throw new Error(facebookMessages[result?.error as keyof typeof facebookMessages]??"Facebook could not be connected.");
      await reload();
    } catch(cause){setError(cause instanceof Error?cause.message:"Facebook could not be connected.");}
    finally{setPending(false);}
  }
  async function stop(){setPending(true);try{await chrome.runtime.sendMessage({type:"FACEBOOK_STOP"});await reload();}finally{setPending(false);}}
  async function forget(){setPending(true);saveController.current?.abort();try{await chrome.runtime.sendMessage({type:"FACEBOOK_FORGET"});autoSaved.current="";await reload();}finally{setPending(false);}}
  async function connectStaySuite(){
    setPending(true);setCloud(null);
    try{
      const destination=new URL(origin);
      if(!await chrome.permissions.request({origins:[`${destination.protocol}//${destination.hostname}/*`]}))throw new Error("StaySuite site access was declined.");
      const tabs=await chrome.tabs.query({url:`${destination.protocol}//${destination.hostname}/*`});
      const tab=tabs.find(item=>{try{const url=new URL(item.url??"");return url.origin===origin && url.pathname==="/dashboard/my-groups";}catch{return false;}});
      if(tab?.id===undefined){await chrome.tabs.create({url:appUrl});throw new Error("My Groups is opening. Sign in, then connect StaySuite again.");}
      const result=await requestDashboard(tab.id,origin);
      if(!result.viewer)throw new Error("StaySuite could not verify your account.");
      setCloud({tabId:tab.id,viewer:result.viewer});setCloudStatus("StaySuite account verified. Your Facebook library is ready to save.");
    }catch(cause){setCloudStatus(cause instanceof Error?cause.message:"StaySuite could not be connected.");}
    finally{setPending(false);}
  }
  const saveGroups = useCallback(async()=>{
    if(!cloud || !library?.groups.length || library.phase==="fetching" || saveController.current)return;
    const controller=new AbortController();saveController.current=controller;setSaving(true);
    let saved=0;
    try{
      const account=await requestDashboard(cloud.tabId,origin,cloud.viewer);
      if(account.viewer!==cloud.viewer)throw new Error("Your StaySuite account changed. Reconnect before saving.");
      for(const group of library.groups){
        if(controller.signal.aborted)break;
        if(await facebookIdentity()!==library.actorId)throw new Error("Facebook account changed. Saving stopped.");
        await requestDashboard(cloud.tabId,origin,cloud.viewer,group);
        saved++;setCloudStatus(`${saved} of ${library.groups.length} groups confirmed in My Groups…`);
      }
      await requestDashboard(cloud.tabId,origin,cloud.viewer);
      setCloudStatus(`${saved} groups confirmed in My Groups.${controller.signal.aborted?" Stopped after the current save.":" Existing notes and rule reviews were preserved."}`);
    }catch(cause){setCloudStatus(`${saved} saves confirmed. ${cause instanceof Error?cause.message:"Saving stopped. Reconnect and retry."}`);}
    finally{saveController.current=null;setSaving(false);}
  },[cloud,library]);
  useEffect(()=>{
    if(!autoSave || !cloud || !library?.complete || library.phase!=="ready" || saving)return;
    const key=`${cloud.viewer}:${library.actorId}:${library.updatedAt}`;
    if(autoSaved.current===key)return;
    autoSaved.current=key;void saveGroups();
  },[autoSave,cloud,library,saving,saveGroups]);
  function diagnostics(){
    const value={extension_version:chrome.runtime.getManifest().version,method:"facebook-internal-v1",phase:library?.phase??"disconnected",diagnostic:library?.diagnostic??null,error:library?.error??null,pages:library?.pages??0,group_count:library?.groups.length??0,complete:library?.complete??false,updated_at:library?.updatedAt??null};
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download="staysuite-collection-diagnostics.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const busy=library?.phase==="fetching";
  const groups=library?.groups??[];
  const visible=groups.filter(group=>group.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <main className="workspace">
    <header className="brand-header"><div className="brand"><span className="brand-icon" aria-hidden="true">S</span><div className="wordmark">StaySuite<small>Group companion</small></div></div><span className="badge">Experimental connection</span></header>
    <div className="intro"><h1>Your Facebook groups.</h1><p>Connect your personal Facebook profile. Your groups appear here automatically and stay saved when you reopen the extension.</p></div>
    <section className="collect-panel" aria-labelledby="facebook-connection"><div className="section-heading"><h2 id="facebook-connection">Facebook</h2><span className="badge">{!ready?"Checking…":busy?"Collecting…":actorId?"Profile detected":"Not connected"}</span></div><p>{actorId?library?.actorName??"Facebook profile detected":"Sign in to Facebook in this Chrome profile before connecting."}</p><div className="workspace-actions"><button disabled={!ready||pending||saving||busy} onClick={()=>void connectFacebook()}>{actorId?"Refresh groups":"Connect Facebook"}</button>{busy&&<button className="secondary" disabled={pending} onClick={()=>void stop()}>Stop collection</button>}<a href="https://www.facebook.com/" target="_blank" rel="noreferrer">Open Facebook</a></div><p role="status" aria-live="polite">{busy?`${library.pages} pages received · ${groups.length} groups in your library`:library?.complete?`Group-list pagination completed. ${groups.length} groups saved in this extension.`:library?.phase==="error"&&!groups.length?"Import failed before any groups were collected.":library?"Saved library restored. This list may include earlier results and is not confirmed complete.":"Connecting starts a read-only group import; no manual scrolling is needed."}</p>{library?.syncedAt&&<p>Last completed import: {new Date(library.syncedAt).toLocaleString()}</p>}{(error||library?.error)&&<p className="workspace-error" role="alert">{error||(library?.error?library.error==="unsupported"&&library.diagnostic?.stage==="group_connection"?"Facebook responded, but its group-list data did not match this collector. Download diagnostics to report the compatibility failure.":facebookMessages[library.error]:"")}</p>}<p>Uses your local Facebook session for group names and links. No publishing. Cookies and request tokens are never sent to StaySuite or saved by this extension.</p></section>
    <section className="collect-panel" aria-labelledby="library"><div className="section-heading"><h2 id="library">Your group library</h2><span>{groups.length} groups</span></div><label className="search-label">Find a group<input type="search" value={query} onChange={event=>{setQuery(event.target.value);setShown(100);}} placeholder="Search Facebook groups"/></label>{visible.length?<ul className="workspace-list">{visible.slice(0,shown).map(group=><li key={group.url}><a href={group.url} target="_blank" rel="noreferrer">{group.title}</a><span>Saved locally</span></li>)}</ul>:<p>{busy?"Waiting for Facebook’s first group-list response…":groups.length?"No groups match your search.":"Your groups will appear here after connecting."}</p>}{visible.length>shown&&<button className="secondary" onClick={()=>setShown(value=>value+100)}>Show more groups ({visible.length-shown} remaining)</button>}<div className="workspace-actions">{library&&<button className="secondary" disabled={busy||pending||saving} onClick={()=>void forget()}>Clear local library</button>}<button className="text-button" onClick={diagnostics}>Download diagnostics</button></div></section>
    <section className="collect-panel" aria-labelledby="cloud"><h2 id="cloud">Save to StaySuite</h2><p>Your Facebook library works independently of StaySuite login.</p><div className="workspace-actions"><button className="secondary" disabled={pending||saving} onClick={()=>void connectStaySuite()}>{cloud?"Reconnect StaySuite":"Connect StaySuite"}</button><a href={appUrl} target="_blank" rel="noreferrer">Open My Groups</a></div><label className="consent"><input type="checkbox" checked={autoSave} disabled={!cloud||saving} onChange={event=>setAutoSave(event.target.checked)}/>Automatically save completed imports while this workspace is open.</label><button disabled={!cloud||!groups.length||busy||saving||pending} onClick={()=>void saveGroups()}>Save groups to My Groups</button>{saving&&<button className="secondary" onClick={()=>saveController.current?.abort()}>Stop saving</button>}<p role="status">{cloudStatus}</p></section>
    <p>Facebook’s internal interface can change. Incompatible responses stop collection; they are not replaced with a visible-link scan. Group rules and marketing evidence still need your review.</p>
  </main>;
}
