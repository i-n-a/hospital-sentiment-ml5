// ====== Step 2: Text Preprocessing ======

// Goal:
// In this step, we prepare Portuguese patient comments for ML models.
// We clean and tokenize text, then convert it into numeric vectors (bag-of-words).
// This numeric representation is required for training and predicting with ml5.neuralNetwork.

// Why this matters:
// Neural networks require numbers as input (not raw text).
// The bag-of-words vector captures presence of key words in a fixed-length array,
// allowing the model to learn sentiment patterns from Portuguese words.

// What the code does:
// - cleanText(): normalizes Portuguese text (removes punctuation, lowers case, trims whitespace)
// - tokenize(): splits cleaned text into an array of words (tokens)
// - textToVector(): creates a binary vector of word presence from the vocabulary
// - Shows the cleaned text, tokens, and vector length in the UI for debugging

// Later steps (3-5) will:
// - Load real labeled data from JSON,
// - Build vocabulary from data
// - Train ml5.neuralNetwork on vectors and labels
// - Predict sentiment on new comments

// This is the foundation for the Portuguese sentiment analysis tool.

console.log("App loaded");

// Grab elements
const commentInput = document.getElementById("commentInput");
const predictBtn = document.getElementById("predictBtn");
const resultText = document.getElementById("resultText");

// --- TEXT PROCESSING (NEW) ---
// Import preprocessing functions
import { cleanText, tokenize, textToVector } from '../src/text-utils.js';

// Tiny fake vocabulary for testing
const testVocab = ['bom', 'ruim', 'espera', 'enfermeira', 'médico', 'rápido', 'lento'];

// Temporary fake predictor to keep UI responsive
function fakePredictSentiment(text) {
  const t = text.toLowerCase();
  if (!t.trim()) return "Por favor, insira um comentário.";

  if (t.includes("bom") || t.includes("ruim") || t.includes("excelente")) {
    return "Sentimento previsto: positivo (dummy)";
  }
  if (t.includes("mau") || t.includes("terrível") || t.includes("péssimo")) {
    return "Sentimento previsto: negativo (dummy)";
  }
  return "Sentimento previsto: neutro (dummy)";
}

// Test text processing when button clicked
// Unified button handler - shows both preprocessing info and fake sentiment for now
predictBtn.addEventListener("click", () => {
  const text = commentInput.value || "";

  // Show text processing results
  const cleaned = cleanText(text);
  const tokens = tokenize(text);
  const vector = textToVector(text, testVocab);

  console.log('Cleaned:', cleaned);
  console.log('Tokens:', tokens);
  console.log('Vector:', vector);

  // Show message with fake prediction
  const message = fakePredictSentiment(text);
  resultText.innerHTML = `
    ${message}<br>
    <small>Cleaning: "${cleaned}" → Tokens: [${tokens.join(', ')}] → Vector length: ${vector.length}</small>
  `;
});