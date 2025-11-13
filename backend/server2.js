import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import Tesseract from "tesseract.js";
import fetch from "node-fetch";
import fs from "fs";
import Jimp from "jimp";
import jsQR from "jsqr";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// --- Feature extraction ---
function extractFeatures(text) {
  const suspiciousWords = ["urgent", "verify", "account", "password", "suspended", "click", "login"];
  const links = [...text.matchAll(/https?:\/\/[^\s]+/g)].map(m => m[0]);
  const suspicious = suspiciousWords.filter(w => text.toLowerCase().includes(w));
  return {
    suspicious_words: suspicious.length,
    num_links: links.length,
    links,
  };
}

// --- Ollama text classification ---
async function getOllamaVerdict(text) {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: `You are a phishing detector. Classify this as "Phishing" or "Safe" and briefly explain.\n\nMessage:\n${text}\n\nRespond in format:\nLabel: <Phishing|Safe>\nReason: <short reason>`,
        stream: false,
      }),
    });

    const data = await response.json();
    const output = data.response || "";
    const labelMatch = output.match(/Label:\s*(Phishing|Safe)/i);
    const reasonMatch = output.match(/Reason:\s*(.+)/i);

    return {
      label: labelMatch ? labelMatch[1] : "Safe",
      reason: reasonMatch ? reasonMatch[1] : "No reason provided.",
    };
  } catch (err) {
    console.error("Ollama request failed:", err);
    return { label: "Safe", reason: "Ollama unavailable." };
  }
}

// --- Text / URL Classification ---
app.post("/api/classify", async (req, res) => {
  try {
    const { text = "", url = "" } = req.body;
    const input = (text || url || "").trim();
    if (!input) return res.status(400).json({ error: "No text or URL provided." });

    const features = extractFeatures(input);
    const baseScore = Math.min(5, features.suspicious_words + features.num_links * 2 + 1);
    const ollamaRes = await getOllamaVerdict(input);

    res.json({
      label: ollamaRes.label,
      score: baseScore,
      reasons: [
        `Feature-based: ${features.suspicious_words} suspicious words, ${features.num_links} links.`,
        `LLM verdict: ${ollamaRes.reason}`,
      ],
      urls: features.links.map(u => ({ url: u, verdict: "unknown" })),
      highlights: [],
    });
  } catch (err) {
    console.error("Text classify error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// --- OCR / Image Classification ---
app.post("/api/classify-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    console.log("Performing OCR on:", req.file.path);
    const result = await Tesseract.recognize(req.file.path, "eng");
    const extractedText = result.data.text.trim();
    fs.unlinkSync(req.file.path);

    if (!extractedText) {
      return res.json({ label: "Safe", score: 1, reasons: ["No readable text found."], highlights: [] });
    }

    const features = extractFeatures(extractedText);
    const ollamaRes = await getOllamaVerdict(extractedText);
    const score = Math.min(5, features.suspicious_words + features.num_links * 2 + 1);

    res.json({
      label: ollamaRes.label,
      score,
      reasons: [
        "OCR completed successfully.",
        `Feature-based: ${features.suspicious_words} suspicious words, ${features.num_links} links.`,
        `LLM verdict: ${ollamaRes.reason}`,
      ],
      extracted_text: extractedText,
      urls: features.links.map(u => ({ url: u, verdict: "unknown" })),
      highlights: [],
    });
  } catch (err) {
    console.error("Image classify error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// --- QR Code Detection ---
app.post("/api/classify-qr", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    const image = await Jimp.read(req.file.path);
    const { width, height } = image.bitmap;
    const imageData = new Uint8ClampedArray(image.bitmap.data);

    const code = jsQR(imageData, width, height);
    fs.unlinkSync(req.file.path);

    if (code) {
      const features = extractFeatures(code.data);
      const ollamaRes = await getOllamaVerdict(code.data);
      const score = Math.min(5, features.suspicious_words + features.num_links * 2 + 1);

      res.json({
        label: ollamaRes.label,
        score,
        reasons: [
          "QR code detected.",
          `Feature-based: ${features.suspicious_words} suspicious words, ${features.num_links} links.`,
          `LLM verdict: ${ollamaRes.reason}`,
        ],
        extracted_text: code.data,
        urls: features.links.map(u => ({ url: u, verdict: "unknown" })),
        highlights: [],
      });
    } else {
      res.json({ label: "Safe", score: 1, reasons: ["No QR code detected."], extracted_text: "", urls: [], highlights: [] });
    }
  } catch (err) {
    console.error("QR classify error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`✅ Server running on http://127.0.0.1:${PORT}`));
