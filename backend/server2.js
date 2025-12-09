import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import Tesseract from "tesseract.js";
import fetch from "node-fetch";
import fs from "fs";
import Jimp from "jimp";
import jsQR from "jsqr";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

// For __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// --- Local Whisper transcription via Python ---
async function transcribeAudio(filePath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "whisper_local.py");

    const py = spawn("python", [scriptPath, filePath], {
      cwd: __dirname,
    });

    let output = "";
    let errOutput = "";

    py.stdout.on("data", (data) => {
      output += data.toString();
    });

    py.stderr.on("data", (data) => {
      errOutput += data.toString();
    });

    py.on("close", (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        console.error("Local Whisper error:", errOutput);
        reject(new Error("Local Whisper transcription failed"));
      }
    });
  });
}

// --- Ollama text classification ---
async function getOllamaVerdict(text) {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: `You are a phishing detector. First, analyze the email text normally and determine if it contains phishing indicators such as urgency, generic language, or suspicious instructions. Then, check any URLs or QR codes mentioned: if the email claims a link is for a specific company or service but the actual link points to a domain inconsistent with that claim, consider this suspicious and include it in your reasoning. Classify as "Phishing" or "Safe" and provide a concise reason mentioning both the textual analysis and any mismatched URLs. Message: ${text} Respond in format: Label: <Phishing|Safe> Reason: <short reason>`,
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
// --- OCR + QR Code / Image Classification ---
app.post("/api/classify-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    // 1) OCR with Tesseract
    console.log("Performing OCR on:", req.file.path);
    const ocrResult = await Tesseract.recognize(req.file.path, "eng");
    let ocrText = ocrResult.data.text.trim();

    // 2) QR code scan with jsQR
    const image = await Jimp.read(req.file.path);
    const { width, height } = image.bitmap;
    const imageData = new Uint8ClampedArray(image.bitmap.data);
    const qrCode = jsQR(imageData, width, height);
    const qrText = qrCode ? qrCode.data.trim() : "";

    fs.unlinkSync(req.file.path);

    // 3) Combine OCR and QR text for LLM analysis
    const combinedText = [ocrText, qrText].filter(Boolean).join("\n");

    if (!combinedText) {
      return res.json({
        label: "Safe",
        score: 1,
        reasons: ["No readable text or QR code detected."],
        extracted_text: "",
        urls: [],
        highlights: [],
      });
    }

    // 4) Extract features and get LLM verdict
    const features = extractFeatures(combinedText);
    const ollamaRes = await getOllamaVerdict(combinedText);
    const score = Math.min(5, features.suspicious_words + features.num_links * 2 + 1);

    const reasons = [];
    if (ocrText) reasons.push("OCR completed successfully.");
    if (qrText) reasons.push("QR code detected.");
    reasons.push(`Feature-based: ${features.suspicious_words} suspicious words, ${features.num_links} links.`);
    reasons.push(`LLM verdict: ${ollamaRes.reason}`);

    res.json({
      label: ollamaRes.label,
      score,
      reasons,
      extracted_text: combinedText,
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

// --- Audio / Vishing Classification ---
app.post("/api/classify-audio", upload.single("audio"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded." });
    }

    filePath = req.file.path;

    // 1) Transcribe audio using local Whisper
    const transcript = await transcribeAudio(filePath);

    if (!transcript) {
      return res.json({
        label: "Safe",
        score: 1,
        reasons: ["No speech detected in audio."],
        transcript: "",
        urls: [],
        highlights: [],
      });
    }

    // 2) Extract features and get LLM verdict (same logic as text)
    const features = extractFeatures(transcript);
    const verdict = await getOllamaVerdict(transcript);

    const scoreBase = Math.min(
      5,
      features.suspicious_words + features.num_links * 2 + 1
    );

    res.json({
      label: verdict.label,
      score: scoreBase,
      reasons: [
        "Transcribed audio with local Whisper.",
        `Feature-based: ${features.suspicious_words} suspicious words, ${features.num_links} links.`,
        `LLM verdict: ${verdict.reason}`,
      ],
      transcript,
      urls: features.links.map((u) => ({ url: u, verdict: "unknown" })),
      highlights: features.links,
    });
  } catch (err) {
    console.error("Audio classify error:", err);
    res.status(500).json({ error: "Error analyzing audio." });
  } finally {
    if (filePath) {
      fs.unlink(filePath, () => {});
    }
  }
});


const PORT = 5000;
app.listen(PORT, () => console.log(`✅ Server running on http://127.0.0.1:${PORT}`));
