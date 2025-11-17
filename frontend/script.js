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

