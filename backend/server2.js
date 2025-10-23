import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
// import LLM

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// const client = set up LLM client
const PORT = process.env.PORT;

function extractFeatures(text) {
    // Search the text for any links or keywords that are deemed suspicious
    // return all substrings that start with http:// or htttps://; [] prevents null
    const links = text.match(/https?:\/\/[^\s]+/g) || [];
    // Maybe make a wordlist or something?
    // /i makes search case insensitive
    const suspiciousWords = text.match(/(urgent|verify|suspended|click here|account|password)/gi) || [];
    return {num_links: links.length, suspicious_words: suspiciousWords.length};
}

// classify endpoint
app.post("/api/classify", async (req, res) => {
  const { text, url } = req.body;
  const input = text || url || "";
  if (!input.trim()) {
    return res.status(400).json({ error: "No text or URL provided." });
}

  // Use extractFeatures to breakdown input.
  const features = extractFeatures(input);

  // PROMPT AI HERE: currently unimplemented

  // Proceed with mock output.
  const tempResponse = {
    label: features.suspicious_words > 0 || features.num_links > 0 ? "Phishing" : "Safe",
    // fake score calc lol, 1-5, +1 per word, +2, max 5
    score: Math.min(5, features.suspicious_words + features.num_links * 2 + 1),
    reasons: [
      features.suspicious_words > 0
        ? "Contains suspicious keywords."
        : "No suspicious keywords detected.",
      features.num_links > 0
        ? "Includes link(s) that may be used for phishing."
        : "No external links found.",
    ],
    // LLM can give verdict on link suspicion but we could also do something like that
    urls: (input.match(/https?:\/\/[^\s]+/g) || []).map(u => ({url: u, verdict: "unknown",})), highlights: []
  };

  res.json(tempResponse);
});

app.listen(PORT, () =>
  console.log(`Backend running on http://127.0.0.1:${PORT}`)
);