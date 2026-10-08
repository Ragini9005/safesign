// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchUrlText") {
    // Add custom credential routing modes to bypass bot blockers
    fetch(request.url, {
      method: "GET",
      mode: "cors",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
      }
    })
      .then(res => {
        if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
        return res.text();
      })
      .then(html => sendResponse({ success: true, html: html }))
      .catch(err => {
        console.error("Background fetch failed:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open
  }

  if (request.action === "fetchGemini") {
    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${request.apiKey}`;
    
    fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: request.prompt }] }] })
    })
    .then(res => {
      if (!res.ok) throw new Error(`API returned status ${res.status}`);
      return res.json();
    })
    .then(data => sendResponse({ success: true, data: data }))
    .catch(err => sendResponse({ success: false, error: err.message }));
    
    return true; 
  }
});