// popup.js
document.getElementById("scan-btn").addEventListener("click", async () => {
  const scanBtn = document.getElementById("scan-btn");
  const statusDiv = document.getElementById("status");
  const metricsSection = document.getElementById("metricsSection");
  const warningsSection = document.getElementById("warningsSection");
  const trapsSection = document.getElementById("trapsSection");
  const recSection = document.getElementById("recSection");
  const trapsList = document.getElementById("trapsList");

  // Reset UI State
  scanBtn.disabled = true;
  statusDiv.style.color = "#feca57";
  metricsSection.style.display = "none";
  warningsSection.style.display = "none";
  trapsSection.style.display = "none";
  recSection.style.display = "none";
  trapsList.innerHTML = "";
  statusDiv.textContent = "Verifying page context... 🔍";

  const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
  
  if (GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE" || !GEMINI_API_KEY) {
    statusDiv.style.color = "#ff6b6b";
    statusDiv.textContent = "❌ Missing API Key in popup.js!";
    scanBtn.disabled = false;
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) throw new Error("Cannot access active viewport.");
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
      throw new Error("Cannot audit internal system pages.");
    }

    const currentDomain = new URL(tab.url).hostname;

    // Execute content script to check if this is EXCLUSIVELY a legal document page
    const [scriptResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const urlStr = window.location.href.toLowerCase();
        const titleStr = document.title.toLowerCase();
        
        // Strict legal indicators matching your statement
        const legalKeywords = ["terms", "tos", "condition", "privacy", "policy", "legal", "agreement"];
        const isCurrentlyOnLegalPage = legalKeywords.some(keyword => urlStr.includes(keyword) || titleStr.includes(keyword));

        if (isCurrentlyOnLegalPage) {
          return {
            isLegalPage: true,
            text: document.body.innerText.replace(/\s+/g, ' ').substring(0, 9000)
          };
        }

        return { isLegalPage: false };
      }
    });

    const executionResult = scriptResult?.result;

    // 🌟 STRICT ENFORCEMENT: Only show the error if it's not a T&C page
    if (!executionResult || !executionResult.isLegalPage) {
      statusDiv.style.color = "#ff6b6b";
      statusDiv.textContent = "❌ No Terms and Conditions found on the current page.";
      scanBtn.disabled = false;
      return; // Stop right here, do not look for links or call the API
    }

    // If it IS a legal page, run the audit pipeline directly
    statusDiv.textContent = "Auditing active legal text... ⚙️";

    const accuratePrompt = `You are a compliance threat auditor reviewing the actual Terms or Privacy document text on "${currentDomain}".

[EXTRACTED TERMS & CONDITIONS CONTEXT]
${executionResult.text}
[END CONTEXT]

Analyze the legal rules above. Return EXACTLY this format structure without any markdown bold characters or asterisks:
SCORE: [Single integer value 0-100 indicating consumer protection score]
TIME_ESTIMATE: [Estimated minutes it would take a human to read full terms document text based on context scope, e.g., 18]
PHISH: [Start text with "Green", "Yellow", or "Red" followed by a space and a short 1-sentence legal/brand clarity check]
SSL: [Start text with "Green", "Yellow", or "Red" followed by a space and a short 1-sentence transmission safety check]
AGE: [Start text with "Green", "Yellow", or "Red" followed by a space and a short 1-sentence legal historical footprint check]
TRACK: [Start text with "Green", "Yellow", or "Red" followed by a space and a short 1-sentence summary of data retention policies found in the text]
TRAPS: [Provide a comma-separated list of 2 or 3 brief hidden conditions, auto-billing renewals, waivers of rights, or arbitration clauses. If clear, write "No major traps found"]
RECOMMENDATION: [Write a short, clean 1-line action recommendation for the user]`;

    chrome.runtime.sendMessage({
      action: "fetchGemini",
      apiKey: GEMINI_API_KEY,
      prompt: accuratePrompt
    }, (response) => {
      if (chrome.runtime.lastError) {
        handleError(chrome.runtime.lastError.message);
        return;
      }
      if (!response.success) {
        handleError(response.error);
        return;
      }
      parseAndRender(response.data);
    });

  } catch (error) {
    handleError(error.message);
  }

  function handleError(msg) {
    console.error(msg);
    statusDiv.style.color = "#ff6b6b";
    statusDiv.textContent = msg || "Transmission failure.";
    scanBtn.disabled = false;
  }

  function parseAndRender(dataPayload) {
    try {
      if (!dataPayload.candidates || !dataPayload.candidates[0]?.content?.parts[0]?.text) {
        throw new Error("Malformed payload returned from engine.");
      }

      const rawAiOutput = dataPayload.candidates[0].content.parts[0].text;
      statusDiv.textContent = "";

      const scoreMatch = rawAiOutput.match(/SCORE:\s*(\d+)/i);
      const timeMatch = rawAiOutput.match(/TIME_ESTIMATE:\s*(\d+)/i);
      const phishMatch = rawAiOutput.match(/PHISH:\s*(.*)/i);
      const sslMatch = rawAiOutput.match(/SSL:\s*(.*)/i);
      const ageMatch = rawAiOutput.match(/AGE:\s*(.*)/i);
      const trackMatch = rawAiOutput.match(/TRACK:\s*(.*)/i);
      const trapsMatch = rawAiOutput.match(/TRAPS:\s*(.*)/i);
      const recMatch = rawAiOutput.match(/RECOMMENDATION:\s*(.*)/i);

      if (scoreMatch) {
        const numericScore = parseInt(scoreMatch[1]);
        const scoreElement = document.getElementById("trustVal");
        scoreElement.textContent = numericScore;
        
        if (numericScore >= 80) scoreElement.style.color = "#1dd1a1";
        else if (numericScore >= 50) scoreElement.style.color = "#feca57";
        else scoreElement.style.color = "#ff6b6b";

        const originalTime = timeMatch ? parseInt(timeMatch[1]) : 20;
        document.getElementById("timeVal").textContent = `${originalTime}m`;
        document.getElementById("timeSub").textContent = `${originalTime}min doc → 30s check`;

        metricsSection.style.display = "grid";
      }

      if (trapsMatch) {
        const trapsText = trapsMatch[1].trim();
        if (trapsText.toLowerCase().includes("no major traps")) {
          trapsList.innerHTML = `<li>🟢 No hidden operational dark patterns found.</li>`;
        } else {
          const trapsArray = trapsText.split(",");
          trapsArray.forEach(trap => {
            if (trap.trim()) {
              trapsList.innerHTML += `<li>🔴 ${trap.trim()}</li>`;
            }
          });
        }
        trapsSection.style.display = "block";
      }

      processRiskCard("cardPhish", "txtPhish", phishMatch ? phishMatch[1] : "Green Scan complete.");
      processRiskCard("cardSsl", "txtSsl", sslMatch ? sslMatch[1] : "Green Security complete.");
      processRiskCard("cardAge", "txtAge", ageMatch ? ageMatch[1] : "Green Longevity verified.");
      processRiskCard("cardData", "txtData", trackMatch ? trackMatch[1] : "Green Constraints normal.");
      warningsSection.style.display = "grid";

      if (recMatch) {
        document.getElementById("recVal").textContent = recMatch[1].trim();
        recSection.style.display = "block";
      }
    } catch (e) {
      handleError(e.message);
    } finally {
      scanBtn.disabled = false;
    }
  }
});

function processRiskCard(cardId, textId, rawResponseStr) {
  const targetCard = document.getElementById(cardId);
  const targetText = document.getElementById(textId);
  if (!targetCard || !targetText) return;
  
  let cleanText = rawResponseStr.trim();
  let riskIndicator = "green";

  if (cleanText.toLowerCase().startsWith("red")) {
    riskIndicator = "red";
    cleanText = "🔴 " + cleanText.substring(3).trim();
  } else if (cleanText.toLowerCase().startsWith("yellow")) {
    riskIndicator = "yellow";
    cleanText = "🟡 " + cleanText.substring(6).trim();
  } else if (cleanText.toLowerCase().startsWith("green")) {
    riskIndicator = "green";
    cleanText = "🟢 " + cleanText.substring(5).trim();
  }

  targetText.textContent = cleanText;
  targetCard.classList.remove("risk-high", "risk-medium", "risk-safe");
  
  if (riskIndicator === "red") targetCard.classList.add("risk-high");
  else if (riskIndicator === "yellow") targetCard.classList.add("risk-medium");
  else targetCard.classList.add("risk-safe");
}