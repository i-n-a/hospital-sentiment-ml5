// Goal:
// Takes a comment as input.
// Outputs one of: positive, neutral, negative.
// Runs in the browser with a simple UI.

console.log("App loaded");

// Grab elements
const commentInput = document.getElementById("commentInput");
const predictBtn = document.getElementById("predictBtn");
const resultText = document.getElementById("resultText");

// Temporary fake predictor so the UI works
function fakePredictSentiment(text) {
  const t = text.toLowerCase();

  if (!t.trim()) return "Please enter a comment.";

  if (t.includes("good") || t.includes("great") || t.includes("bom") || t.includes("excelente")) {
    return "Predicted sentiment: positive (dummy)";
  }

  if (t.includes("bad") || t.includes("terrible") || t.includes("mau") || t.includes("horrível")) {
    return "Predicted sentiment: negative (dummy)";
  }

  return "Predicted sentiment: neutral (dummy)";
}

// Button handler
predictBtn.addEventListener("click", () => {
  const text = commentInput.value || "";
  const message = fakePredictSentiment(text);
  resultText.textContent = message;
});