// text-utils.js - Portuguese text preprocessing for sentiment analysis
// Converts comments to bag-of-words vectors for ml5 neural network

// Simple Portuguese text cleaning (lowercase, remove punctuation, normalize spaces)
export function cleanText(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Lowercase + remove extra spaces/quotes/punctuation (keep accents)
  let cleaned = text.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')  // Remove non-letters/numbers/spaces
    .replace(/\s+/g, ' ')                 // Collapse multiple spaces
    .trim();
  
  return cleaned;
}

// Split into words (tokens)
export function tokenize(text) {
  return cleanText(text).split(/\s+/).filter(word => word.length > 1);
}

// Build vocabulary from training data
export function buildVocabulary(data) {
  const vocab = new Set();
  
  data.forEach(item => {
    if (item.text) {
      tokenize(item.text).forEach(word => vocab.add(word));
    }
  });
  
  return Array.from(vocab);  // Convert to array for consistent indexing
}

// Convert text to fixed-length vector (bag of words)
export function textToVector(text, vocabulary) {
  const tokens = tokenize(text);
  const vector = new Array(vocabulary.length).fill(0);
  
  tokens.forEach(token => {
    const index = vocabulary.indexOf(token);
    if (index !== -1) {
      vector[index] = 1;  // Binary bag-of-words (presence/absence)
    }
  });
  
  return vector;
}

// Get vector length (vocab size)
export function getVectorSize(vocabulary) {
  return vocabulary.length;
}
