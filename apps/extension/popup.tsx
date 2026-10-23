import { useEffect, useState } from "react";
import "./style.css";
export default function Popup() {
  const [error, setError] = useState("");
  useEffect(() => { document.documentElement.lang = "en"; document.title = "StaySuite · Group companion"; }, []);
  async function open() {
    try { await chrome.windows.create({url:chrome.runtime.getURL("tabs/groups.html"), type:"popup", width:620, height:820}); window.close(); }
    catch { setError("Could not open the workspace. Reload the extension and try again."); }
  }
  return <main><header className="brand"><span className="brand-icon" aria-hidden="true">S</span><div className="wordmark">StaySuite<small>Group companion</small></div></header><div className="intro"><h1>Your groups, in one place.</h1><p>Connect Facebook in your workspace. Your group library loads automatically.</p></div><button onClick={() => void open()}>Open Sync workspace</button><p>Your group library is saved locally. Session cookies and request tokens stay out of StaySuite. No posting.</p>{error && <p role="alert">{error}</p>}</main>;
}
