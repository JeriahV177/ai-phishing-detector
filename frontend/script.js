// --- Elements ---
const textForm = document.getElementById("text-form");
const textInput = document.getElementById("text-input");
const textResult = document.getElementById("text-result");
const textPreview = document.getElementById("text-preview");

const imageForm = document.getElementById("image-form");
const imageInput = document.getElementById("image-input");
const previewImg = document.getElementById("preview-img");
const imageResult = document.getElementById("image-result");
const ocrPreview = document.getElementById("ocr-preview");

const qrForm = document.getElementById("qr-form");
const qrInput = document.getElementById("qr-input");
const qrPreviewImg = document.getElementById("qr-preview-img");
const qrResult = document.getElementById("qr-result");
const qrPreview = document.getElementById("qr-preview");

const audioForm = document.getElementById("audio-form");
const audioInput = document.getElementById("audio-input");
const audioTranscript = document.getElementById("audio-transcript");
const audioResult = document.getElementById("audio-result");
const audioPlayer = document.getElementById("audio-player");

// --- Helpers ---
function showLoading(el, message = "Analyzing...") {
  el.textContent = message;
}

function displayTextResult(result, el, previewEl) {
  let html = `<strong>Label:</strong> ${result.label}<br>`;
  html += `<strong>Score:</strong> ${result.score}<br>`;
  html += `<strong>Reasons:</strong><br>`;
  result.reasons.forEach(r => { html += `- ${r}<br>`; });
  if (result.extracted_text) previewEl.textContent = result.extracted_text;
  if (result.urls && result.urls.length > 0) {
    html += `<strong>Links:</strong><br>`;
    result.urls.forEach(u => { html += `- <a href="${u.url}" target="_blank">${u.url}</a><br>`; });
  }
  el.innerHTML = html;
}

function displayQRResult(result, el, previewEl) {
  let html = `<strong>Label:</strong> ${result.label}<br>`;
  html += `<strong>Score:</strong> ${result.score}<br>`;
  html += `<strong>Reasons:</strong><br>`;
  result.reasons.forEach(r => { html += `- ${r}<br>`; });
  if (result.qr_payload) previewEl.textContent = result.qr_payload;
  if (result.urls && result.urls.length > 0) {
    html += `<strong>Links:</strong><br>`;
    result.urls.forEach(u => { html += `- <a href="${u.url}" target="_blank">${u.url}</a><br>`; });
  }
  el.innerHTML = html;
}

function deleteScanById(id) {
  const scans = loadHistory().filter(s => s.id !== id);
  saveHistory(scans);
  renderHistory();
}

function dataURLtoBlob(dataURL) {
  const [meta, b64] = dataURL.split(",");
  const mime = (meta.match(/data:(.*?);base64/) || [])[1] || "application/octet-stream";
  const bin = atob(b64);
  const len = bin.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

function activateTab(tabId) {
  const btn = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
  if (btn) btn.click(); // uses your existing tab-switch handler in index.html
}

async function rerunScan(id) {
  const scans = loadHistory();
  const s = scans.find(x => x.id === id);
  if (!s) return alert("Scan not found.");

  try {
    // ---------- TEXT / URL ----------
    if (s.type === "text") {
      activateTab("text");
      textInput.value = s.input?.text || "";

      if (typeof textForm.requestSubmit === "function") {
        textForm.requestSubmit();
      } else {
        textForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
      return;
    }

    // For image/QR/audio we need the original file.
    if (!s.input?.dataURL) {
      // Navigate to the relevant tab and tell user to re-upload.
      const tabMap = { ocr: "ocr", qr: "qr", audio: "audio" };
      if (tabMap[s.type]) activateTab(tabMap[s.type]);
      alert("Original file wasn’t stored (too large). Please re-upload it on this tab to re-run.");
      return;
    }

    // Convert stored dataURL back to a File so the normal form handler can use it.
    const blob = dataURLtoBlob(s.input.dataURL);
    const fileName = s.input?.name || {
      ocr: "image.png",
      qr: "qr.png",
      audio: "audio.wav",
    }[s.type] || "file.bin";
    const file = new File([blob], fileName, { type: blob.type || blob.mime || "application/octet-stream" });

    const dt = new DataTransfer();
    dt.items.add(file);

    // ---------- OCR IMAGE ----------
    if (s.type === "ocr") {
      activateTab("ocr");
      imageInput.files = dt.files;
      previewImg.src = URL.createObjectURL(file);
      ocrPreview.textContent = "";

      if (typeof imageForm.requestSubmit === "function") {
        imageForm.requestSubmit();
      } else {
        imageForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
      return;
    }

    // ---------- QR CODE ----------
    if (s.type === "qr") {
      activateTab("qr");
      qrInput.files = dt.files;
      qrPreviewImg.src = URL.createObjectURL(file);
      qrPreview.textContent = "";

      if (typeof qrForm.requestSubmit === "function") {
        qrForm.requestSubmit();
      } else {
        qrForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
      return;
    }

    // ---------- AUDIO / VISHING ----------
    if (s.type === "audio") {
      activateTab("audio");
      audioInput.files = dt.files;

      // update audio player preview
      if (audioPlayer.dataset.objectUrl) {
        URL.revokeObjectURL(audioPlayer.dataset.objectUrl);
      }
      const url = URL.createObjectURL(file);
      audioPlayer.src = url;
      audioPlayer.dataset.objectUrl = url;
      audioPlayer.style.display = "block";
      audioPlayer.load();

      if (typeof audioForm.requestSubmit === "function") {
        audioForm.requestSubmit();
      } else {
        audioForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
      return;
    }

    alert("Unsupported type for re-run.");
  } catch (err) {
    console.error(err);
    alert("Failed to re-run this scan.");
  }
}



// --- Preview Handlers ---
imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  previewImg.src = URL.createObjectURL(file);
  ocrPreview.textContent = ""; // Clear previous OCR preview
});

qrInput.addEventListener("change", () => {
  const file = qrInput.files[0];
  if (!file) return;
  qrPreviewImg.src = URL.createObjectURL(file);
  qrPreview.textContent = ""; // Clear previous QR preview
});

// --- Text Form Submission ---
textForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text) return alert("Please enter text or URL");

  showLoading(textResult, "Analyzing...");
  textPreview.textContent = "";
  try {
    const res = await fetch("http://localhost:5000/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.error) textResult.textContent = `Error: ${data.error}`;
    else displayTextResult(data, textResult, textPreview);
    await addScanToHistory({
      id: crypto.randomUUID(),
      type: "text",
      timestamp: Date.now(),
      label: data.label,
      score: data.score,
      reasons: data.reasons || [],
      input: { kind: "text", text },
      extracted_text: data.extracted_text || ""
    });

  } catch (err) {
    console.error(err);
    textResult.textContent = "Error analyzing text.";
  }
});

// --- OCR Image Form Submission ---
imageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = imageInput.files[0];
  if (!file) return alert("Please select an image");

  showLoading(imageResult, "Analyzing...");
  ocrPreview.textContent = "";
  const formData = new FormData();
  formData.append("image", file);

  try {
    const res = await fetch("http://localhost:5000/api/classify-image", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (data.error) imageResult.textContent = `Error: ${data.error}`;
    else displayTextResult(data, imageResult, ocrPreview);
    const imgStore = await fileToDataURLCapped(imageInput.files[0]); // might be large
    await addScanToHistory({
      id: crypto.randomUUID(),
      type: "ocr",
      timestamp: Date.now(),
      label: data.label,
      score: data.score,
      reasons: data.reasons || [],
      input: {
        kind: "image",
        name: imageInput.files[0]?.name || "image",
        ...(imgStore.ok ? { dataURL: imgStore.dataURL } : {})
      },
      extracted_text: data.extracted_text || ""
    });

  } catch (err) {
    console.error(err);
    imageResult.textContent = "Error analyzing image.";
  }
});

// --- QR Code Form Submission ---
qrForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = qrInput.files[0];
  if (!file) return alert("Please select an image for QR code");

  showLoading(qrResult, "Analyzing...");
  qrPreview.textContent = "";
  const formData = new FormData();
  formData.append("image", file);

  try {
    const res = await fetch("http://localhost:5000/api/classify-qr", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (data.error) qrResult.textContent = `Error: ${data.error}`;
    else displayQRResult(data, qrResult, qrPreview);
    const qrStore = await fileToDataURLCapped(qrInput.files[0]);
    await addScanToHistory({
      id: crypto.randomUUID(),
      type: "qr",
      timestamp: Date.now(),
      label: data.label,
      score: data.score,
      reasons: data.reasons || [],
      input: {
        kind: "qr",
        name: qrInput.files[0]?.name || "qr",
        ...(qrStore.ok ? { dataURL: qrStore.dataURL } : {})
      },
      extracted_text: data.extracted_text || "",
      qr_payload: data.qr_payload || data.extracted_text || ""
    });

  } catch (err) {
    console.error(err);
    qrResult.textContent = "Error analyzing QR code.";
  }
});

// --- Audio / Vishing Form Submission ---
audioForm.addEventListener("submit", async (e) => {
  console.log("Audio form submitted handler running");
  console.log("Event target id:", e.target.id);
  e.preventDefault(); // HARD stop default submit

  const file = audioInput.files[0];
  if (!file) {
    alert("Please select an audio file");
    return;
  }

  audioTranscript.textContent = "Transcribing...";
  audioResult.textContent = "Analyzing...";

  const formData = new FormData();
  formData.append("audio", file);

  try {
    const res = await fetch("http://localhost:5000/api/classify-audio", {
      method: "POST",
      body: formData,
    });

    console.log("Audio fetch response status:", res.status);

    const data = await res.json();
    console.log("Audio response JSON:", data);

    if (data.error) {
      audioResult.textContent = "Error: " + data.error;
      return;
    }

    audioTranscript.textContent = data.transcript || "(no transcript)";

    audioResult.innerHTML = `
      <strong>Label:</strong> ${data.label}<br>
      <strong>Score:</strong> ${data.score}<br>
      <strong>Reasons:</strong><br>
      ${data.reasons.map((r) => "- " + r).join("<br>")}
    `;

    const audioStore = await fileToDataURLCapped(audioInput.files[0]);
    await addScanToHistory({
      id: crypto.randomUUID(),
      type: "audio",
      timestamp: Date.now(),
      label: data.label,
      score: data.score,
      reasons: data.reasons || [],
      input: {
        kind: "audio",
        name: audioInput.files[0]?.name || "audio",
        ...(audioStore.ok ? { dataURL: audioStore.dataURL } : {})
      },
      transcript: data.transcript || ""
    });

  } catch (err) {
    console.error("Audio handler error:", err);
    audioTranscript.textContent = "";
    audioResult.textContent = "Error analyzing audio.";
  }
});

audioInput.addEventListener("change", () => {
  const file = audioInput.files[0];

  if (!file) {
    // Hide player if no file selected
    audioPlayer.pause();
    audioPlayer.removeAttribute("src");
    audioPlayer.style.display = "none";
    return;
  }

  // Optional: clean up previous object URL
  if (audioPlayer.dataset.objectUrl) {
    URL.revokeObjectURL(audioPlayer.dataset.objectUrl);
  }

  const objectUrl = URL.createObjectURL(file);
  audioPlayer.src = objectUrl;
  audioPlayer.dataset.objectUrl = objectUrl;
  audioPlayer.style.display = "block";
  audioPlayer.load();
});

// ---------------------- Local History (no login) ----------------------
const HISTORY_KEY = "harpoonScanHistory";

// Utility: format timestamp
function formatWhen(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

// Utility: async read File/Blob -> data URL (with size cap to avoid huge localStorage usage)
function fileToDataURLCapped(file, maxBytes = 2 * 1024 * 1024) { // 2MB cap
  return new Promise((resolve) => {
    if (!file) return resolve({ ok: false, reason: "nofile" });
    if (file.size > maxBytes) return resolve({ ok: false, reason: "toolarge", size: file.size });

    const reader = new FileReader();
    reader.onload = () => resolve({ ok: true, dataURL: reader.result, mime: file.type, name: file.name, size: file.size });
    reader.onerror = () => resolve({ ok: false, reason: "readfail" });
    reader.readAsDataURL(file);
  });
}

// Load/save
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50))); // keep the most recent 50
}

// Push one scan
async function addScanToHistory(scan) {
  const list = loadHistory();
  list.unshift(scan);
  saveHistory(list);
}

// Render list
function renderHistory() {
  const listEl = document.getElementById("history-list");
  const scans = loadHistory();

  if (!scans.length) {
    listEl.innerHTML = "No past scans yet.";
    return;
  }

  const parts = scans.map((s, idx) => {
    const head = `
      <div style="border:1px solid #222; border-radius:10px; padding:12px; margin:10px 0; background:#0d1117;">
        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div><strong>${idx + 1}.</strong> <span style="opacity:.85">${formatWhen(s.timestamp)}</span></div>
          <div><span style="opacity:.9">Type:</span> <strong>${s.type.toUpperCase()}</strong></div>
          <div><span style="opacity:.9">Label:</span> <strong>${s.label}</strong></div>
          <div><span style="opacity:.9">Score:</span> <strong>${s.score}</strong></div>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn-rerun" data-id="${s.id}">Re-run</button>
          <button class="btn-delete" data-id="${s.id}" style="background:#ef4444;">Delete</button>
        </div>
    `;

    // Input preview
    let inputHTML = "";
    if (s.input?.kind === "text") {
      inputHTML = `<div style="margin-top:8px;"><span style="opacity:.9">Input:</span><div class="preview">${s.input.text || ""}</div></div>`;
    } else if (s.input?.kind === "url") {
      const safe = (s.input.url || "").replace(/"/g, "&quot;");
      inputHTML = `<div style="margin-top:8px;"><span style="opacity:.9">URL:</span><div class="preview"><a href="${safe}" target="_blank">${safe}</a></div></div>`;
    } else if (s.input?.kind === "image") {
      if (s.input.dataURL) {
        inputHTML = `
          <div style="margin-top:8px;"><span style="opacity:.9">Image:</span>
            <div class="preview"><img src="${s.input.dataURL}" alt="${s.input.name || "image"}"/></div>
            <a href="${s.input.dataURL}" download="${s.input.name || "image"}">Download image</a>
          </div>`;
      } else {
        inputHTML = `<div style="margin-top:8px;"><span style="opacity:.9">Image:</span> (not stored due to size) — ${s.input?.name || ""}</div>`;
      }
    } else if (s.input?.kind === "qr") {
      // Show decoded payload and (if small) the uploaded image
      const payload = s.qr_payload || s.extracted_text || "(no payload)";
      let media = "";
      if (s.input?.dataURL) {
        media = `<div class="preview"><img src="${s.input.dataURL}" alt="${s.input.name || "qr"}"/></div>
                 <a href="${s.input.dataURL}" download="${s.input.name || "qr"}">Download image</a>`;
      } else if (s.input?.name) {
        media = `(image not stored due to size) — ${s.input.name}`;
      }
      inputHTML = `
        <div style="margin-top:8px;"><span style="opacity:.9">QR Payload:</span><div class="preview">${payload}</div>${media}</div>
      `;
    } else if (s.input?.kind === "audio") {
      if (s.input.dataURL) {
        inputHTML = `
          <div style="margin-top:8px;"><span style="opacity:.9">Audio:</span>
            <audio controls style="width:100%; margin-top:6px;" src="${s.input.dataURL}"></audio>
            <div><a href="${s.input.dataURL}" download="${s.input.name || "audio"}">Download audio</a></div>
          </div>`;
      } else {
        inputHTML = `<div style="margin-top:8px;"><span style="opacity:.9">Audio:</span> (not stored due to size) — ${s.input?.name || ""}</div>`;
      }
    }

    // Results (reasons + transcript/extracted)
    const reasons = (s.reasons || []).map(r => `- ${r}`).join("<br>");
    const body = `
      ${inputHTML}
      ${s.transcript ? `<div style="margin-top:8px;"><span style="opacity:.9">Transcript:</span><div class="preview">${s.transcript}</div></div>` : ""}
      ${s.extracted_text ? `<div style="margin-top:8px;"><span style="opacity:.9">Extracted Text:</span><div class="preview">${s.extracted_text}</div></div>` : ""}
      ${s.qr_payload ? `<div style="margin-top:8px;"><span style="opacity:.9">QR Payload:</span><div class="preview">${s.qr_payload}</div></div>` : ""}
      <div style="margin-top:8px;"><span style="opacity:.9">Reasons:</span><div class="preview">${reasons || "(none)"}</div></div>
    `;

    return head + body + `</div>`;
  });

  listEl.innerHTML = parts.join("\n");
}

// Wire buttons
document.getElementById("refresh-history").addEventListener("click", renderHistory);
document.getElementById("clear-history").addEventListener("click", () => {
  if (confirm("Clear all past scans on this device?")) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }
});

// Hook into your tab switching so that entering the History tab renders fresh
const historyTabButtons = document.querySelectorAll(".tab-button");
historyTabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.getAttribute("data-tab");
    if (tab === "history") {
      renderHistory();
    }
  });
});

document.getElementById("history-list").addEventListener("click", (e) => {
  const tgt = e.target;
  if (tgt.classList.contains("btn-delete")) {
    const id = tgt.getAttribute("data-id");
    deleteScanById(id);
  } else if (tgt.classList.contains("btn-rerun")) {
    const id = tgt.getAttribute("data-id");
    rerunScan(id);
  }
});




