"use client";
import { useEffect, useState } from "react";

const SCRIPT_SRC =
  "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";

// Renders GLB / glTF NFTs with Google's <model-viewer> web component.
// The script is only loaded when a 3D piece is actually on stage.
const ModelViewer = ({ src, alt, poster }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.customElements?.get("model-viewer")) {
      setReady(true);
      return;
    }

    let script = document.querySelector("script[data-model-viewer]");
    if (!script) {
      script = document.createElement("script");
      script.type = "module";
      script.src = SCRIPT_SRC;
      script.dataset.modelViewer = "1";
      document.head.appendChild(script);
    }

    const onLoad = () => setReady(true);
    script.addEventListener("load", onLoad);
    return () => script.removeEventListener("load", onLoad);
  }, []);

  if (!ready) {
    return <p className="loader">Preparing 3D viewer</p>;
  }

  return (
    <model-viewer
      src={src}
      alt={alt || "3D artwork currently on view"}
      poster={poster || undefined}
      camera-controls=""
      auto-rotate=""
      style={{ width: "100%", height: "100%" }}
    />
  );
};

export default ModelViewer;
