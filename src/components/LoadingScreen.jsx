import React from "react";

export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-card glass-panel">
        <div className="loading-icon-wrap">
          <div className="loading-ring"></div>
          <div className="loading-cube"></div>
        </div>
        <div className="loading-text">Loading 3D Model</div>
        <div className="loading-subtext">Preparing geometry & textures…</div>
      </div>
    </div>
  );
}
