// embed generation.
export async function getEmbedding(text) {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text",
        input: text,
      }),
    });
    const data = await response.json();
    return data.embeddings[0];
  } catch (err) {
    console.error("Embedding request failed:", err);
    return null;
  }
}

