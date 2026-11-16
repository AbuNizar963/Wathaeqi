import React from "react";
import ReactDOM from "react-dom/client";
import WathaeqiApp from "./wathaeqi/App";
import "./wathaeqi/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WathaeqiApp />
  </React.StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error) => console.warn("Wathaeqi offline shell registration failed", error));
  });
}
