import { useState } from "react";
import GroupsWorkspace from "./tabs/groups";
import "./style.css";
export default function Popup() {
  const [error,setError]=useState("");
  async function expand(){
    try {await chrome.windows.create({url:chrome.runtime.getURL("tabs/groups.html"),type:"popup",width:960,height:820});window.close();}
    catch {setError("Could not open the full workspace. Your library remains available here.");}
  }
  return <div className="popup-library"><div className="popup-expand"><button className="text-button" onClick={()=>void expand()}>Open full workspace</button>{error&&<p role="alert">{error}</p>}</div><GroupsWorkspace/></div>;
}
