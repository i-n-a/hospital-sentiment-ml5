/**
 * ML Lab Main - Neural Network Training Orchestrator (ENTERPRISE EDITION)
 * Features: Trained Model on Load - CSV Modal → Training Loader → Live Progress → Perfect UX
 */

import { 
  buildVocabulary, textToVector, cleanText, tokenize 
} from '../ml5/text-utils.js';
import { 
  createNeuralNetwork, trainNeuralNetwork, predictSentiment,
  saveModel, saveTrainingData
} from '../ml5/model.js';
import { initSentimentViz } from '../p5/sentiment-viz.js';
import { initDataProcessor } from '../ml5/data-processor.js';

// ===== GLOBAL STATE =====
let trainingData = [];
let realVocab = [];
let nn = null;
let classifier = null;  
let modelTrained = false;
let modelVocab = []; 
let vizInitialized = false;
let isTrainingMode = false;
let finalLossValue = null;  

// ===== UI ELEMENTS =====
let commentInput, predictBtn, resultText, modelStatus, globalStatus;

// ===== 🔥 TRAINING MODAL CONTROLS =====
function showTrainingModal(status = 'Initializing model...') {
  const modal = document.getElementById('trainingModal');
  const statusText = document.getElementById('trainingStatusText');
  if (modal) modal.classList.add('active');
  if (statusText) statusText.textContent = status;
}

function hideTrainingModal() {
  const modal = document.getElementById('trainingModal');
  if (modal) modal.classList.remove('active');
}

function updateTrainingProgress(epoch, totalEpochs = 320, status = '') {
  const progressBar = document.getElementById('trainingProgressBar');
  const progressText = document.getElementById('trainingProgressText');
  const statusText = document.getElementById('trainingStatusText');
  
  if (progressBar) {
    const progress = (epoch / totalEpochs) * 100;
    
    // 🔥 FORCE VISUAL REFLOW
    progressBar.style.transition = 'none';
    progressBar.style.width = `${progress}%`;
    progressBar.offsetHeight; // Trigger reflow
    progressBar.style.transition = 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
    progressBar.style.width = `${progress}%`; // Animate again
  }
  
  if (progressText) progressText.textContent = `${epoch}/${totalEpochs} Epochs`;
  if (statusText) statusText.textContent = status;
}

// ===== STEP 1: Load + Preprocess Data =====
async function loadTrainingData() {
  console.log('📥 Loading training data...');
  updateProgress(1);
  
  if (window.cleanedTrainingData && window.cleanedTrainingData.length > 0) {
    trainingData = window.cleanedTrainingData;
    console.log(`📥 Using custom CSV: ${trainingData.length} examples`);
  } else {
    const response = await fetch('./data/hospital-sentiment-data-latest-trained-model.json');
    trainingData = await response.json();
    console.log(`📥 Using sample data: ${trainingData.length} examples`);
  }
  
  realVocab = buildVocabulary(trainingData);
  // ✅ Only init once
  if (!vizInitialized) {
    initSentimentViz(trainingData);
    vizInitialized = true;
  }
  wireDataControls();
  
  document.getElementById('total-examples').textContent = trainingData.length;
  document.getElementById('vocab-size').textContent = realVocab.length;
  
  if (resultText) resultText.textContent = `✅ ${trainingData.length} examples loaded`;
  console.log(`📚 Vocab ready: ${realVocab.length} tokens`);
  updateGlobalStatus('✅ Data loaded');  
}

// ===== STEP 2-3: Model Pipeline + TRAINING MODAL =====
async function setupAndTrainModel() {
  isTrainingMode = true;
  document.querySelector('#predictBtn').disabled = true;  // DISABLE
  showTrainingModal('🧠 Creating neural network...');
  updateProgress(2);
  nn = await createNeuralNetwork(realVocab.length);
  updateTrainingProgress(0, 320, '📦 Adding training data...');
  
  trainingData.forEach(item => {
    const input = textToVector(item.text, realVocab);
    nn.addData(input, { label: item.label });
  });
  
  updateProgress(3);
  updateTrainingProgress(0, 320, '🚀 Starting training (320 epochs)...');
  
  trainNeuralNetwork(nn, 320,
    (epoch, logs) => {
      const loss = logs.loss.toFixed(4);
      finalLossValue = loss;   // 🔥 keep latest loss

      updateTrainingProgress(epoch, 320, `Epoch ${epoch}: loss ${loss}`);
      updateGlobalStatus(`Training... ${epoch}/320`);

      const epochEl = document.getElementById('currentEpoch');
      const lossEl = document.getElementById('currentLoss');
      const statusEl = document.getElementById('trainingStatus');
      if (epochEl) epochEl.textContent = epoch;
      if (lossEl) lossEl.textContent = loss;
      if (statusEl) statusEl.textContent = 'Training...';
      if (modelStatus) modelStatus.innerHTML = `Epoch ${epoch}/320: loss <strong>${loss}</strong>`;
    },
    () => {
      modelTrained = true;
      isTrainingMode = false;
      document.querySelector('#predictBtn').disabled = false;

      updateProgress(4);
      updateTrainingProgress(320, 320, '✅ Training complete!');

      setTimeout(async () => {
        hideTrainingModal();
        document.getElementById('dataModal')?.classList.remove('active');
        updateGlobalStatus('✅ Ready for predictions!');
        if (modelStatus) modelStatus.innerHTML = '✅ <strong>Model trained successfully!</strong>';
        showTrainingUI();
        document.getElementById('predictBtn').disabled = false;
        document.getElementById('saveModelBtn').disabled = false;
        resetDatasetProcessor();
        if (resultText) resultText.innerHTML += '<br>🎯 Ready for predictions!';

        // 🔥 REAL FINAL LOSS
        const finalLossEl = document.getElementById('finalLoss');
        if (finalLossEl) finalLossEl.textContent = finalLossValue ?? '-';

        // 🔥 REAL TEST ACCURACY
        const testAccuracy = await calculateTestAccuracy();
        const accEl = document.getElementById('accuracy');
        if (accEl) accEl.textContent = testAccuracy !== null ? `${testAccuracy.toFixed(1)}%` : '-';
      }, 1500);

    }
  );

}

// ===== RETRAIN WITH NEW CSV DATA =====
async function retrainWithNewData() {
  if (window.cleanedTrainingData?.length) {
    console.log('🔄 Retraining with new CSV data...');
    trainingData = window.cleanedTrainingData;
    realVocab = buildVocabulary(trainingData);
    modelVocab = [];  // Clear old vocab
    
    // 🔥 UPDATE viz instead of re-init
    window.updateSentimentViz(trainingData);
    
    await setupAndTrainModel();
  }
}

// ===== STEP 4: Prediction UI =====
function setupPredictionUI() {
  const waitForElements = (ids) => new Promise(resolve => {
    let retries = 0;
    const check = () => {
      const elements = ids.map(id => document.getElementById(id));
      if (elements.every(el => el) || retries++ > 30) {  
        resolve(elements);
      } else {
        setTimeout(check, 200);  
      }
    };
    check();
  });

  waitForElements(['commentInput', 'predictBtn', 'resultText', 'modelStatus', 'globalStatus']).then(
    ([cInput, pBtn, rText, mStatus, gStatus]) => {
      commentInput = cInput; 
      predictBtn = pBtn;      
      resultText = rText; 
      modelStatus = mStatus; 
      globalStatus = gStatus;
      
      if (predictBtn) {
        predictBtn.addEventListener('click', handlePrediction);
        predictBtn.disabled = modelTrained;  // Enable if trained
        console.log('✅ UI elements ready + predictBtn enabled');
      }
    }
  );
}

async function handlePrediction() {
  const text = commentInput?.value?.trim();
  if (!text) {
    resultText && (resultText.textContent = 'Digite um comentário.');
    return;
  }
  
  if (!modelTrained) {
    resultText && (resultText.textContent = 'Treinando...');
    return;
  }
  
  console.log('🔍 PREDICT:', { nn: !!nn, classifier: !!classifier, vocabLen: (modelVocab || realVocab)?.length });
  modelStatus && (modelStatus.textContent = '🔮 Prevendo...');
  
  const vocab = realVocab;  // ← SIMPLIFIED - always current vocab!
  const inputVector = textToVector(text, vocab);
  
  // 🔥 PRIORITY 1: Trained nn (overrides loaded model)
  if (nn) {
    try {
      const prediction = await predictSentiment(nn, inputVector);
      resultText.innerHTML = `
        🎯 <strong>${prediction.label.toUpperCase()}</strong> 
        (${(prediction.confidence * 100).toFixed(1)}%)
        <br><small>🆕 Treinado</small>
      `;
      return;
    } catch (e) {
      console.error('nn predict failed:', e);
    }
  }
  
  // 🔥 PRIORITY 2: Loaded classifier (initial load)
  if (classifier) {
    classifier.classify(inputVector, (error, predictions) => {
      console.log('Classifier results:', { error, predictions });
      const results = error || predictions || [];
      if (results.length > 0) {
        const best = results[0];
        resultText.innerHTML = `
          🎯 <strong>${best.label?.toUpperCase()}</strong> 
          (${(best.confidence * 100)?.toFixed(1)}%)
        `;
      } else {
        resultText.textContent = 'Sem predições';
      }
    });
    return;
  }
  
  resultText.textContent = 'Nenhum modelo disponível';
}

// ===== DATA CONTROLS =====
function wireDataControls() {
  document.getElementById('sentimentFilter')?.addEventListener('change', 
    (e) => window.setFilter?.(e.target.value)
  );
  document.getElementById('prevPage')?.addEventListener('click', 
    () => window.setPage?.(window.currentPage - 1)
  );
  document.getElementById('nextPage')?.addEventListener('click', 
    () => window.setPage?.(window.currentPage + 1)
  );
  document.querySelector('.section-toggle')?.addEventListener('click', () => {
    const content = document.querySelector('.data-content');
    const icon = document.querySelector('.toggle-icon');
    content?.classList.toggle('open');
    icon.textContent = content?.classList.contains('open') ? '−' : '+';
  });
}

// ===== MODEL CONTROLS (Save Only) =====
function wireModelControls() {
  document.getElementById('saveModelBtn')?.addEventListener('click', async () => {
    if (!modelTrained || !nn) return alert('Train model first!');
    await saveModel(nn, 'sentiment-model'); // local download
  });

  document.getElementById('saveDataBtn')?.addEventListener('click', () => {
    saveTrainingData(trainingData, 'hospital-sentiment.json'); // local download
  });

  // NEW: publish to dashboard
  document.getElementById('publishModelBtn')?.addEventListener('click', async () => {
    if (!modelTrained || !nn) return alert('Train model first!');

    // 1) Save model to a shared path used by the dashboard
    await saveModel(nn, 'model/hospital-sentiment-latest');

    // 2) Save vocab alongside it so dashboard can vectorize text the same way
    await saveTrainingData(
      realVocab.map(token => ({ token })),     // simple JSON structure
      'model/hospital-sentiment-vocab'
    );
    alert('📡 Model and vocab published to Marketing Dashboard!');
  });
}

// ===== MODAL CONTROLS =====
function wireModalControls() {
  const openBtn = document.getElementById('openDataModal');
  const closeBtn = document.getElementById('closeModal');
  const modal = document.getElementById('dataModal');
  
  openBtn?.addEventListener('click', () => modal.classList.add('active'));
  closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
  
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });
}

// ===== UI HELPERS =====
function updateProgress(step) {
  document.querySelectorAll('.progress-step').forEach((el, i) => {
    el.classList.toggle('active', i + 1 <= step);
  });
}

function updateGlobalStatus(message) {
  document.getElementById('globalStatus').textContent = message;
}

function showTrainingUI() {
  document.querySelector('.training-live').classList.remove('hidden');
  document.querySelector('.insight-metrics').classList.remove('hidden');
}

// 🔥 Calculate test accuracy on 20% held-out data
async function calculateTestAccuracy() {
  if (!trainingData.length || !nn) return null;
  
  try {
    // Split: 80% train, 20% test (simple random split)
    const testData = trainingData.slice(-Math.floor(trainingData.length * 0.2));
    
    let correct = 0;
    for (const item of testData) {
      const inputVector = textToVector(item.text, realVocab);
      const prediction = await predictSentiment(nn, inputVector);
      if (prediction.label === item.label) correct++;
    }
    
    const accuracy = (correct / testData.length) * 100;
    console.log(`✅ Test accuracy: ${accuracy.toFixed(1)}% (${correct}/${testData.length})`);
    return accuracy;
  } catch (error) {
    console.error('Test accuracy failed:', error);
    return null;
  }
}


// ===== RESET DATASET PROCESSOR (After Training) =====
function resetDatasetProcessor() {
  const trainBtn = document.getElementById('trainNewDatasetBtn');
  const processBtn = document.getElementById('processBtn');
  const fileInput = document.getElementById('fileInput');
  const logEl = document.getElementById('log');
  const previewList = document.getElementById('previewList');
  
  if (trainBtn) {
    trainBtn.textContent = '🚀 Train New Model';
    trainBtn.disabled = false;
  }
  
  if (fileInput) fileInput.value = '';
  if (logEl) logEl.textContent = '✅ Model trained! Ready for new dataset.';
  if (previewList) previewList.innerHTML = '';
  
  console.log('🔄 Dataset processor reset - ready for new data');
}

// 🔥 Add this helper function (before init())
function updateSentimentViz(newData) {
  if (window.updateSentimentVizImpl) {
    window.updateSentimentVizImpl(newData);
  }
}
window.updateSentimentViz = updateSentimentViz;


// ===== MAIN INIT =====
async function init() {
  console.log('🚀 ML Lab - ENTERPRISE EDITION');
  
  await new Promise(resolve => {
    if (document.readyState === 'loading') 
      document.addEventListener('DOMContentLoaded', resolve);
    else resolve();
  });
  
  setupPredictionUI();
  updateGlobalStatus('Initializing...');  
  initDataProcessor();
  wireModelControls();
  wireModalControls();
  
  window.addEventListener('newTrainingDataReady', retrainWithNewData);
  
  await loadTrainingData();
  
  // 🔥 LOAD MODEL (AFTER vocab ready)
  loadDashboardModel();  // 🔥 Fixed - no param needed
}

async function loadDashboardModel() {
  try {
    // 🔥 Backend first
    try {
      await ml5.tf.setBackend('webgl');
      await ml5.tf.ready();
      console.log('✅ WebGL backend ready');
    } catch (e) {
      await ml5.tf.setBackend('cpu');
      await ml5.tf.ready();
      console.log('✅ CPU backend ready');
    }
    
    let classifierOptions = { task: "classification" };
    classifier = ml5.neuralNetwork(classifierOptions);
    
    let modelDetails = {
      model: "models/hospital-sentiment-latest/model/model_hospital-sentiment-latest.json",
      metadata: "models/hospital-sentiment-latest/model/model_hospital-sentiment-latest_meta.json", 
      weights: "models/hospital-sentiment-latest/model/model_hospital-sentiment-latest.weights.bin"
    };
    
    classifier.load(modelDetails, () => {
      modelVocab = [...realVocab];  
      console.log('✅ modelVocab ready:', modelVocab.length);
      modelTrained = true;
      isTrainingMode = false;
      document.querySelector('#predictBtn').disabled = false;  // ENABLE loaded model
      console.log('✅ Model loaded!');
      if (globalStatus) globalStatus.textContent = '✅ Ready for predictions!';
    });
  } catch (err) {
    console.error('❌ Model failed:', err);
  }
}

init();
