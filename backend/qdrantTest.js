import fs from "fs";
import csv from "csv-parser";
import fetch from "node-fetch";

// Config
const QDRANT_URL = "http://localhost:6333";
const COLLECTION_NAME = "phishtank";
const VECTOR_SIZE = 1536; // match your embedding dimension
const CSV_PATH = "./phishtank.csv"; // your downloaded CSV

// Replace with your real embedding function
async function getEmbedding(text) {
  // Example: dummy embedding
  return Array(VECTOR_SIZE).fill(0).map(() => Math.random());
}

// --- Ensure collection exists ---
async function ensureCollection() {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vectors: { size: VECTOR_SIZE, distance: "Cosine" },
      }),
    });
    const data = await res.json();
    console.log("Collection ensured:", data);
  } catch (err) {
    console.error("Error creating collection:", err.message);
  }
}

// --- Upsert points into Qdrant ---
async function upsertPoints(points) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
    const data = await res.json();
    console.log(`Upserted ${points.length} points`, data);
  } catch (err) {
    console.error("Error upserting points:", err.message);
  }
}

// --- Load CSV and generate points ---
async function loadCSVAndGeneratePoints() {
  return new Promise((resolve, reject) => {
    const points = [];
    let idCounter = 1;

    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on("data", async (row) => {
        // Example: CSV has 'url' and 'phish_label' columns
        const text = row.url || row.URL || "";
        const label = row.phish_label || row.label || "unknown";

        if (!text) return;

        const embedding = await getEmbedding(text);

        points.push({
          id: idCounter++,
          vector: embedding,
          payload: { text, label },
        });
      })
      .on("end", () => resolve(points))
      .on("error", reject);
  });
}

// --- Main pipeline ---
async function main() {
  await ensureCollection();
  console.log("Loading CSV and generating embeddings...");
  const points = await loadCSVAndGeneratePoints();

  console.log(`Generated ${points.length} embeddings, upserting...`);
  // Insert in batches of 100 to avoid large payloads
  const batchSize = 100;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await upsertPoints(batch);
  }

  console.log("✅ PhishTank ingestion complete!");
}

main();