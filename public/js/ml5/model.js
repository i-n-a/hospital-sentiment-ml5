/**
 * ML5 Neural Network Core - COMPLETE (NO DUPLICATES)
 */
export async function setupBackend() {
  try {
    await ml5.tf.setBackend('webgl');
    await ml5.tf.ready();
    console.log('✅ WebGL backend initialized');
  } catch (e) {
    await ml5.tf.setBackend('cpu');
    await ml5.tf.ready();
    console.log('✅ CPU backend fallback');
  }
}

export async function createNeuralNetwork(vocabSize) {
  await setupBackend();
  const options = {
    task: 'classification',
    debug: false,
    layers: [
      { type: 'dense', units: Math.min(128, vocabSize * 2), activation: 'relu' },
      { type: 'dense', units: Math.min(64, vocabSize), activation: 'relu' },
      { type: 'dense', units: 3, activation: 'softmax' }
    ]
  };
  const nn = ml5.neuralNetwork(options);
  console.log(`🧠 NN created: ${vocabSize} inputs → 3 outputs`);
  return nn;
}

export function trainNeuralNetwork(nn, epochs = 320, onEpoch, onComplete) {
  nn.normalizeData();
  const options = { epochs };
  nn.train(options, onEpoch, onComplete);
  console.log(`🎯 Training started: ${epochs} epochs`);
}

export async function predictSentiment(nn, textVector) {
  const results = await nn.classify(textVector);
  const top = results[0];
  return { label: top.label, confidence: top.confidence };
}

export async function saveModel(nn, filename = 'sentiment-model') {
  try {
    await nn.save(`downloads://${filename}`);
    console.log(`💾 Model saved: ${filename}`);
  } catch (error) {
    console.error('Save failed:', error);
  }
}

export async function loadModel(file) {
  await setupBackend();
  const nn = ml5.neuralNetwork({ task: 'classification' });
  await nn.load(URL.createObjectURL(file));
  console.log('📂 Model loaded');
  return nn;
}

export function saveTrainingData(data, filename = 'training-data.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log(`💾 Data saved: ${filename}`);
}
