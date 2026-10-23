import { useEffect, useState } from "react";
import { collectFacebookLibrary } from "../lib/facebook-collector";
import { readFacebookGroupPage } from "../lib/facebook-page";
import { FacebookFailure, facebookCode } from "../lib/facebook-model";
import { FACEBOOK_JOB, type FacebookJob } from "../lib/facebook-store";
import "../style.css";
export default function FacebookCollector() {
  const [status,setStatus]=useState("Connecting to your Facebook group list…");
  useEffect(()=>{
    const controller=new AbortController();
    const runId=new URL(location.href).searchParams.get("run");
    const changed=(changes:Record<string,chrome.storage.StorageChange>)=>{
      if(changes[FACEBOOK_JOB] && changes[FACEBOOK_JOB].newValue?.runId!==runId)controller.abort();
    };
    chrome.storage.onChanged.addListener(changed);
    document.documentElement.lang="en"; document.title="StaySuite · Facebook collector";
    let alive=true;
    const guard=async()=>{const reply=await chrome.runtime.sendMessage({type:"FACEBOOK_COLLECTOR_GUARD"});if(!reply?.ok)throw new FacebookFailure("cancelled");};
    void (async()=>{
      let job:FacebookJob|null=null;
      let reviewFacebook=false;
      let stage="collector_start", closeCollector=true;
      let refusal="";
      try {
        // The background owns job initialization and commits. Awaiting its
        // handshake prevents reading a half-initialized job from another context.
        const initialized=await chrome.runtime.sendMessage({type:"FACEBOOK_COLLECTOR_INIT"});
        if(!initialized?.ok || !initialized.job || !initialized.library){
          if(["job","nonce","sender_tab","owned_tab"].includes(initialized?.refusal))refusal=` (${initialized.refusal})`;
          throw new FacebookFailure("interrupted");
        }
        job=initialized.job as FacebookJob;
        const targetTabId=job.tabId;
        const initial=initialized.library;
        stage="page_load";
        const deadline=Date.now()+20000;
        let loaded=false;
        while(Date.now()<deadline){
          await guard();
          if((await chrome.tabs.get(targetTabId)).status==="complete"){loaded=true;break;}
          await new Promise(resolve=>setTimeout(resolve,250));
        }
        if(!loaded)throw new FacebookFailure("network");
        const library=await collectFacebookLibrary({initial,signal:controller.signal,guard,
          read:async cursor=>{
            stage="page_injection";
            try {
              const results=await chrome.scripting.executeScript({target:{tabId:targetTabId},world:"MAIN",func:readFacebookGroupPage,args:[initial.actorId,cursor]});
              return results[0]?.result;
            }catch{return {error:"network",diagnostic:{stage:"page_injection",httpStatus:null,query:cursor===null?"initial":"pagination",querySource:"not_started"}};}
          },
          write:async next=>{
            stage="checkpoint";
            const reply=await chrome.runtime.sendMessage({type:"FACEBOOK_CHECKPOINT",library:next});
            if(!reply?.ok)throw new FacebookFailure("cancelled");
            if(alive)setStatus(`${next.groups.length} groups · ${next.phase}`);
          },
          wait:()=>new Promise(resolve=>setTimeout(resolve,1000)),
        });
        reviewFacebook=library.error==="challenge" || library.error==="access_denied";
        if(reviewFacebook)await chrome.tabs.update(targetTabId,{active:true});
        if(alive)setStatus(library.phase==="ready"?"Collection finished. Your groups are saved in the extension.":"Collection stopped. Open the workspace for details.");
      }catch(error){
        closeCollector=false;
        await chrome.runtime.sendMessage({type:"FACEBOOK_COLLECTOR_FAILED",code:facebookCode(error),stage}).catch(()=>{});
        if(alive)setStatus(`Collection stopped during ${stage}${refusal}. Open the workspace for details.`);
      }finally{
        await chrome.runtime.sendMessage({type:"FACEBOOK_COLLECTOR_FINISH"}).catch(()=>{});
        if(job?.ownFacebookTab && !reviewFacebook){
          const tab=await chrome.tabs.get(job.tabId).catch(()=>null);
          if(tab && !tab.active)await chrome.tabs.remove(job.tabId).catch(()=>{});
        }
        const own=await chrome.tabs.getCurrent();
        if(closeCollector && own?.id!==undefined)await chrome.tabs.remove(own.id);
      }
    })().catch(()=>{if(alive)setStatus("Collector closed. Open the workspace for details.");});
    return()=>{alive=false;controller.abort();chrome.storage.onChanged.removeListener(changed);};
  },[]);
  return <main><h1>Facebook group collection</h1><p role="status">{status}</p><p>This collector keeps running when you close the popup. Leave this tab open until it finishes. No posting occurs.</p></main>;
}
