/**
 * File upload utilities for editor and viewer modes
 */

let viewerSessionCounter = 0;

export function createViewerUploadSessionId() {
  return `viewer_${Date.now()}_${++viewerSessionCounter}`;
}

export async function uploadAsset({ file, mode, sessionId, nodeId }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", mode);
  
  if (mode === "viewer") {
    formData.append("sessionId", sessionId);
  } else if (mode === "editor") {
    formData.append("nodeId", nodeId);
  }

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.statusText}`);
  }

  const data = await res.json();
  return { path: data.path, url: data.url };
}

export async function cleanupViewerAssets(sessionId) {
  try {
    await fetch("/api/cleanup-viewer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    });
  } catch (e) {
    console.warn("Cleanup failed:", e);
  }
}



