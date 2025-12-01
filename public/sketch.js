// ====== FEATURE/03-TRAINING-DATA ======
// Goal: Load real Portuguese hospital feedback comments + build dynamic vocabulary
// Why: Neural network needs labeled examples + consistent vocabulary to learn sentiment patterns
// What happens: 
// 1. Fetch sample-sentiment.json (18 real examples)
// 2. Extract ALL unique Portuguese words → create realVocab array
// 3. Use realVocab for textToVector() instead of testVocab
// Next step: ml5.neuralNetwork will train ON these exact vectors + labels

console.log("Hospital Sentiment Analysis - Step 3: Training Data");

// UI elements
const commentInput = document.getElementById("commentInput");
const predictBtn = document.getElementById("predictBtn");
const resultText = document.getElementById("resultText");

// ====== TRAINING DATA + VOCABULARY ======
let trainingData = [];
let realVocab = [];

// Load JSON data + build vocabulary automatically from it
async function loadTrainingData() {
  try {
    console.log("📥 Loading training data...");
    const response = await fetch('../data/sample-sentiment.json');
    trainingData = await response.json();
    
    // Build REAL vocabulary from YOUR 18 hospital examples
    const { buildVocabulary } = await import('../src/text-utils.js');
    realVocab = buildVocabulary(trainingData);
    
    console.log(`✅ Loaded ${trainingData.length} examples`);
    console.log(`📚 Vocabulary size: ${realVocab.length} words`);
    console.log('Sample vocab:', realVocab.slice(0, 10));
    console.log('Sample data:', trainingData.slice(0, 2));
    
    // Update UI status
    resultText.innerHTML = `Data loaded: ${trainingData.length} examples, ${realVocab.length} words in vocabulary`;
  } catch (error) {
    console.error('❌ Error loading data:', error);
    resultText.innerHTML = '❌ Error loading training data';
  }
}

// ====== TEXT PROCESSING (from Step 2) ======
const { cleanText, tokenize, textToVector } = await import('../src/text-utils.js');

// Fallback test vocab (used before real data loads)
const testVocab = ['bom', 'ruim', 'espera', 'enfermeira', 'médico', 'rápido', 'lento'];

// Temporary fake predictor (replace in Step 4 with real neural network)
function fakePredictSentiment(text) {
  const t = text.toLowerCase();
  if (!t.trim()) return "Por favor, insira um comentário.";
  
  if (t.includes("bom") || t.includes("excelente") || t.includes("atenciosa")) {
    return "Sentimento previsto: positivo (dummy)";
  }
  if (t.includes("péssimo") || t.includes("arrogante") || t.includes("demorámos")) {
    return "Sentimento previsto: negativo (dummy)";
  }
  return "Sentimento previsto: neutro (dummy)";
}

// ====== MAIN BUTTON HANDLER ======
predictBtn.addEventListener("click", () => {
  const text = commentInput.value || "";
  
  if (!text.trim()) {
    resultText.textContent = "Por favor, insira um comentário.";
    return;
  }
  
  // Process text → vector using REAL vocabulary (or testVocab fallback)
  const cleaned = cleanText(text);
  const tokens = tokenize(text);
  const vector = textToVector(text, realVocab.length > 0 ? realVocab : testVocab);
  
  // Debug info
  console.log('Cleaned:', cleaned);
  console.log('Tokens:', tokens);
  console.log('Vector length:', vector.length);
  console.log('Vector sample:', vector.slice(0, 10));
  
  // Show results
  const message = fakePredictSentiment(text);
  resultText.innerHTML = `
    ${message}<br>
    <small>
      Cleaned text: "${cleaned}"<br>
      Tokens extracted: [${tokens.join(', ')}]<br>
      Vector length (features): ${vector.length}
    </small>
  `;
});

// ====== STARTUP ======
loadTrainingData();  // Load data + build vocab on page load
console.log("🚀 App ready for Step 3: Prepare Training Data (Pre-Training)");