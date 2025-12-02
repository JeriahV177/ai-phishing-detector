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
import { QdrantClient } from "@qdrant/js-client-rest";
import { getEmbedding } from "./embedding.js";

// For __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// --- Qdrant Setup (NEW) ---
const qdrant = new QdrantClient({ url: "http://localhost:6333" });
const COLLECTION_NAME = "phishtank";

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

// --- Ollama LLM explanation for Embedding (NEW) ---
async function getOllamaExplanation(text, similarExamples = []) {
  try {
    const context = similarExamples.length
      ? `Similar known phishing urls:\n${similarExamples.join("\n")}\n\n`
      : "";
    const prompt = `${context}Classify this message as "Phishing" or "Safe" and briefly explain.\n\nMessage:\n${text}\n\nRespond in format:\nLabel: <Phishing|Safe>\nReason: <short reason>`;

    console.log("Sending request to Ollama...");
    console.log("Prompt length:", prompt.length);
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt,
        stream: false,
      }),
    });

    const data = await response.json(); 
    console.log("Ollama raw response:", JSON.stringify(data, null, 2));

    const output = data.response || "";
    const labelMatch = output.match(/Label:\s*(Phishing|Safe)/i);
    const reasonMatch = output.match(/Reason:\s*(.+)/i);

    return {
      label: labelMatch ? labelMatch[1] : "Safe",
      reason: reasonMatch ? reasonMatch[1] : "No reason provided.",
    };
  } catch (err) {
    console.error("Ollama explanation failed:", err);
    return { label: "Safe", reason: "Ollama unavailable." };
  }
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


// --- Text / URL Classification (Embedding + LLM Explanation for Suspicious & Phishing) ---
app.post("/api/classify", async (req, res) => {
  try {
    const { text = "", url = "" } = req.body;
    const input = (text || url || "").trim();
    console.log("🔍 Incoming text:", input);

    if (!input) {
      console.log("❌ No input received");
      return res.status(400).json({ error: "No text or URL provided." });
    }

    // --- Generate embedding ---
    console.log("✳ Generating embedding...");
    const embedding = await getEmbedding(input);
    console.log("Embedding length:", embedding?.length);

    if (!embedding) {
      console.log("❌ Embedding failed");
      return res.status(500).json({ error: "Failed to generate embedding." });
    }

    // --- Qdrant Search ---
    console.log("🔎 Searching Qdrant...");

    const response = await fetch(`http://localhost:6333/collections/${COLLECTION_NAME}/points/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vector: embedding,
        limit: 5,
        with_payload: true,
      }),
    });

    const json = await response.json();
    console.log("Qdrant search response:", json);

    const searchResult = json.result || [];

    let similarExamples = [];
    let similarityScore = 0;
    
    console.log("Search results found:", searchResult.length);
    if (searchResult.length > 0) {
      similarExamples = searchResult.map(r => r.payload?.text || "");
      similarityScore = searchResult[0].score; // highest similarity
    }

    // --- Tiered classification based on similarity ---
    let label = "Safe";
    let reason = "No significant similarity to known phishing messages.";

    if (similarityScore >= 0.35) {
      // Medium or high similarity → Suspicious or Phishing
      label = similarityScore >= 0.7 ? "Phishing" : "Suspicious";
    }
    
      // --- Call LLM for explanation ---
      let ollamaReason = "";
      try {
        const ollamaRes = await getOllamaExplanation(input, similarExamples);
        ollamaReason = ollamaRes.reason;
      } catch (err) {
        console.error("LLM explanation failed:", err);
        ollamaReason = "LLM explanation failed";
      }

    res.json({
      label,
      similarity_score: similarityScore.toFixed(2),
      similar_examples: similarExamples,
      llm_reason: ollamaReason,
    });
  } catch (err) {
    console.error("Text classify error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

/*
// OLD TEXT CLASSIFICATION
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
}); */

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
