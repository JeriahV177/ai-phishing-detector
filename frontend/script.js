const API_BASE = "http://127.0.0.1:5001";
const USE_MOCK = false; // change to false when backend is ready

function mockResponse() {
  return {
    label: "Phishing",
    score: 3,
    reasons: ["keyword: suspended", "brand_impersonation: paypaI→paypal"],
    urls: [{url:"https://paypaI.com/login", verdict:"suspicious"}],
    highlights: [{start:25,end:34,type:"keyword"}]
  };
}

function applyHighlights(text, ranges){
  if(!ranges || !ranges.length) return text;
  let html = "", i = 0;
  ranges.sort((a,b)=>a.start-b.start);
  for(const r of ranges){
    html += escapeHtml(text.slice(i, r.start));
    html += "<mark>" + escapeHtml(text.slice(r.start, r.end)) + "</mark>";
    i = r.end;
  }
  html += escapeHtml(text.slice(i));
  return html;
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function classify(){
  const status = document.getElementById("status");
  const labelEl = document.getElementById("label");
  const reasonsEl = document.getElementById("reasons");
  const previewEl = document.getElementById("preview");
  const text = document.getElementById("text").value;
  const url = document.getElementById("url").value;

  status.textContent = "Classifying...";
  labelEl.innerHTML = "";
  reasonsEl.textContent = "";
  previewEl.innerHTML = "";

  try {
    const data = USE_MOCK ? mockResponse() :
      await (await fetch(`${API_BASE}/api/classify`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ text, url })
      })).json();

    const badge = document.createElement("span");
    badge.className = "badge " + (data.label.toLowerCase());
    badge.textContent = `${data.label} (score ${data.score})`;
    labelEl.appendChild(badge);

    reasonsEl.textContent = (data.reasons||[]).map(r=>"• "+r).join("\n");
    previewEl.innerHTML = applyHighlights(text, data.highlights||[]);
    status.textContent = "Done.";
  } catch(err){
    status.textContent = "Error contacting API.";
    console.error(err);
  }
}

document.getElementById("btn").addEventListener("click", classify);

