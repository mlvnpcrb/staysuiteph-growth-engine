import { useEffect, useState } from "react";
import { collectFacebookLibrary } from "../lib/facebook-collector";
import { readFacebookGroupPage } from "../lib/facebook-page";
import { FacebookFailure } from "../lib/facebook-model";
import { FACEBOOK_JOB, assertFacebookJob, loadFacebookLibrary, readFacebookJob } from "../lib/facebook-store";
import "../style.css";
export default function FacebookCollector() {
  const [status,setStatus]=useState("Connecting to your Facebook group list…");
  useEffect(()=>{
    const controller=new AbortController();
    const runId=new URL(location.href).searchParams.get("run");
    const changed=()=>{void readFacebookJob().then(job=>{if(job?.runId!==runId)controller.abort();});};
    chrome.storage.onChanged.addListener(changed);
    document.documentElement.lang="en"; document.title="StaySuite · Facebook collector";
    let alive=true;
    void (async()=>{
      const job=await readFacebookJob();
      if(!job || job.runId!==runId) return;
      const initial=await loadFacebookLibrary(job.actorId);
      if(!initial || initial.runId!==runId)return;
      let reviewFacebook = false;
      try {
        const deadline=Date.now()+20000;
        while(Date.now()<deadline) {
          await assertFacebookJob(job);
          if((await chrome.tabs.get(job.tabId)).status==="complete")break;
          await new Promise(resolve=>setTimeout(resolve,250));
        }
        const library=await collectFacebookLibrary({initial,signal:controller.signal,guard:()=>assertFacebookJob(job),
          read:async cursor=>{
            const results=await chrome.scripting.executeScript({target:{tabId:job.tabId},world:"MAIN",func:readFacebookGroupPage,args:[job.actorId,cursor]});
            return results[0]?.result;
          },
          write:async next=>{
            const reply = await chrome.runtime.sendMessage({type:"FACEBOOK_CHECKPOINT",library:next});
            if(!reply?.ok)throw new FacebookFailure("cancelled");
            if(alive)setStatus(`${next.groups.length} groups · ${next.phase}`);
          },
          wait:()=>new Promise(resolve=>setTimeout(resolve,1000)),
        });
        reviewFacebook = library.error === "challenge" || library.error === "access_denied";
        if(reviewFacebook) await chrome.tabs.update(job.tabId,{active:true});
        if(alive)setStatus(library.phase==="ready" ? "Collection finished. Your groups are saved in the extension." : "Collection stopped. Open the workspace for details.");
      } finally {
        if((await readFacebookJob())?.runId===runId)await chrome.storage.session.remove(FACEBOOK_JOB);
        if(job.ownFacebookTab && !reviewFacebook){
          const tab=await chrome.tabs.get(job.tabId).catch(()=>null);
          if(tab && !tab.active)await chrome.tabs.remove(job.tabId).catch(()=>{});
        }
        const own = await chrome.tabs.getCurrent();
        if(own?.id !== undefined) await chrome.tabs.remove(own.id);
      }
    })().catch(()=>{if(alive)setStatus("Collection stopped. Open the workspace for details.");});
    return ()=>{alive=false;controller.abort();chrome.storage.onChanged.removeListener(changed);};
  },[]);
  return <main><h1>Facebook group collection</h1><p role="status">{status}</p><p>This collector keeps running when you close the popup. Leave this tab open until it finishes. No posting occurs.</p></main>;
}
