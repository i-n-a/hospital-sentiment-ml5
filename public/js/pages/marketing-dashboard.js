// =======================
// MARKETING DASHBOARD 
// =======================

import { cleanText, textToVector } from './../ml5/text-utils.js';
const sketch = (p) => {
// p5.js globals (your colleague's original)
let table, categories = [];
let sentimentSummary = { negative: 0, positive: 0, neutral: 0 };
let sentimentTotal = 0;
let maxTotal = 0, hoveredIndex = -1, selectedIndex = 0;
let exportMode = false;
let chartX, chartY, chartW, chartH, slotH, barH, gapH;
let panelX, panelY, panelW, panelH, layoutMargin = 70, labelX;
let chartPaddingTop = 10;
let chartPaddingBottom = 10;
let chartPaddingLeft = 10;   // extra space before first bar
let chartPaddingRight = 10;  // extra space after longest bar


// 🔥 NEURAL NET ONLY
let trainingDataNN, realVocab = [], modelReadyNN = false;
let importantWords = [];
let dataInitialized = false;  // 🔥 NEW FLAG
let sentimentModel = null;
let modelReady = false;
//let realVocab = [];
let classifier;
let dataReady = false;
let sentimentComputed = false;  // new flag

// Stopwords (your colleague's original)
const cloudStopwords = new Set([
  "nao", "não", "de", "da", "do", "das", "dos", "que", "para", "por", "com", "uma", "numa", "num",
  "no", "na", "ao", "aos", "as", "os", "meu", "minha", "seu", "sua", "dele", "dela", "dia", "mas",
  "tinha", "fui", "fazer", "ter", "este", "estava", "depois", "qualquer", "nada", "mesmo", "esta", "ainda",
  "hospital", "hospitais", "consulta", "consultas", "medico", "médico", "médica", "paciente", "pacientes", "luz"
]);

p.preload= function() {
  console.log('🚀 Loading sentiment model and vocab...');
  loadSentimentResources(); // start loading model + vocab
  table = p.loadTable("data/csv/resumo_categorias.csv", "csv", "header");
  trainingDataNN = []; // initialize
  p.loadJSON("data/sample-sentiment.json", (loadedData) => {
    trainingDataNN = loadedData;  // assign it manually
    dataReady = true;
    console.log('✅ trainingDataNN loaded, length:', trainingDataNN.length);
  });
}

function tokenize(txt) {
  txt = txt.toLowerCase();
  txt = txt.replace(/[^a-zà-úãõâêôçáéíóúüñ]+/gi, " ");
  return txt.split(/\s+/).filter(t => t.length > 2);
}

function setupUI() {
  let printBtn = p.select("#printButton");
  if (printBtn) printBtn.mousePressed(() => { exportMode = true; window.print(); });

  window.addEventListener("beforeprint", () => exportMode = true);
  window.addEventListener("afterprint", () => exportMode = false);

  let classifyBtn = p.select("#classifyButton"), inputText = p.select("#inputText"), resultDiv = p.select("#result");
  if (classifyBtn && inputText && resultDiv) {
    // Single comment - Neural Net
    classifyBtn.mousePressed(async () => {
      let txt = inputText.value();
      let result = await classifyText(txt);
      resultDiv.html(result ? 
        `<strong>Predição:</strong> ${result.label}<br><strong>Confiança:</strong> ${result.confidence}%` :
        "Por favor escreva um comentário para classificar.");
    });
  }

  let batchBtn = p.select("#batchButton"), batchInput = p.select("#batchText"), batchResult = p.select("#batchResult");
  if (batchBtn && batchInput && batchResult) {
    // Batch - Neural Net  
    batchBtn.mousePressed(async () => {
      let lines = batchInput.value().split(/\n/).map(l => l.trim()).filter(l => l);
      if (!lines.length) { batchResult.html("Cole uma lista de comentários."); return; }

      let counts = {}, classified = 0;
      for (let line of lines) {
        let res = await classifyText(line);
        if (!res) continue;
        counts[res.label] = (counts[res.label] || 0) + 1;
        classified++;
      }

      if (!classified) { batchResult.html("Nenhum comentário válido."); return; }
      
      let html = `<strong>Total:</strong> ${classified}<br>`;
      Object.keys(counts).forEach(label => {
        let c = counts[label], pct = ((c / classified) * 100).toFixed(1);
        html += `${label}: ${c} (${pct}%)<br>`;
      });
      batchResult.html(html);
    });
  }
    // CSV upload + classification (marketing dashboard)
  const csvInput = p.select('#csvUpload');
  const csvButton = p.select('#processCsvButton');
  const csvSummaryDiv = p.select('#csvSummary');
  const csvTableDiv = p.select('#csvTable');

  // Keep last results if you later want export
  let lastCsvRows = [];

  if (csvInput && csvButton && csvSummaryDiv && csvTableDiv) {
    csvButton.mousePressed(async () => {
      console.log('🚀 CSV BUTTON CLICKED');
      
      const file = csvInput.elt.files?.[0];
      if (!file) {
        csvSummaryDiv.html('Selecione primeiro um ficheiro CSV.');
        return;
      }
      console.log('📁 File selected:', file.name, file.size, 'bytes');

      if (!modelReady) {
        csvSummaryDiv.html('Modelo a carregar...');
        return;
      }

      try {
      const text = await file.text();
      console.log('📄 File text length:', text.length);
      
      const rows = parseMarketingCsv(text);
      console.log('✅ ROWS PARSED:', rows.length);
      
      if (!rows.length) {
        csvSummaryDiv.html('Nenhum comentário válido encontrado.');
        return;
      }

      let neg = 0, neu = 0, pos = 0;
      const classifiedRows = [];

      // 🔥 Batch classify (reuse your classifyText - it does cleanText)
      for (const row of rows) {
        const res = await classifyText(row.rawComment);
        if (!res) continue;

        if (res.label === 'negativo') neg++;
        else if (res.label === 'neutro') neu++;
        else pos++;

        classifiedRows.push({
          comment: row.rawComment,
          predicted: res.label,
          confidence: res.confidence
        });
      }

      const total = neg + neu + pos;
      sentimentSummary = { negative: neg, neutral: neu, positive: pos };
      sentimentTotal = total;

      // Summary + table (same as before)
      csvSummaryDiv.html(`
        <strong>Total:</strong> ${total}<br>
        Negativo: ${neg} (${(neg/total*100).toFixed(1)}%)<br>
        Neutro: ${neu} (${(neu/total*100).toFixed(1)}%)<br>
        Positivo: ${pos} (${(pos/total*100).toFixed(1)}%)
      `);

      // Color-coded table
      let html = '<table><thead><tr><th>Comentário</th><th>Predição</th><th>Confiança</th></tr></thead><tbody>';
      classifiedRows.slice(0, 50).forEach(r => {  // Limit to 50 for UI
        const cls = r.predicted === 'negativo' ? 'sent-neg' : 
                    r.predicted === 'positivo' ? 'sent-pos' : 'sent-neu';
        html += `<tr class="${cls}"><td>${r.comment.substring(0,100)}...</td><td>${r.predicted}</td><td>${r.confidence}%</td></tr>`;
      });
      html += '</tbody></table>';
      csvTableDiv.html(html);
    } catch (err) {
      console.error('❌ CSV processing error:', err);
      csvSummaryDiv.html('Erro ao processar o ficheiro CSV.');
    }
    });
  
  }

}

function computeLayout() {
  // 🔥 RESPONSIVE MARGINS (scale with width)
  layoutMargin = p.width > 1000 ? 70 : p.width > 600 ? 40 : 20;
  
  // 🔥 RESPONSIVE PANEL (always 25% right side)
  panelW = p.max(p.width * 0.25, 230);
  panelX = p.width - panelW - layoutMargin; 
  panelY = 170; 
  panelH = p.height - panelY - layoutMargin;

  labelX = layoutMargin + 150; 
  chartX = labelX + 10 + chartPaddingLeft;
  chartY = 190 + chartPaddingTop;
  chartW = panelX - chartX - 40 - chartPaddingRight;
  chartH = p.height - chartY - layoutMargin - 140 - chartPaddingBottom;

  slotH = chartH / categories.length; 
  barH = slotH * 0.6; 
  gapH = slotH * 0.4;
}

function modelLoaded() {
  console.log('✅ Sentiment model loaded');
  sentimentModel = classifier;
  modelReady = true;
}

async function loadSentimentResources() {
  try {
    //   try {
    //   await ml5.tf.setBackend('webgl');
    //   await ml5.tf.ready();
    //   console.log('✅ WebGL backend initialized');
    // } catch (e) {
    //   await ml5.tf.setBackend('cpu');
    //   await ml5.tf.ready();
    //   console.log('✅ CPU backend fallback');
    // }
    ml5.setBackend('cpu' || 'webgl');
    // 1) Load vocab
    const vocabRes = await fetch('models/hospital-sentiment-latest/vocab/model_hospital-sentiment-vocab.json');
    if (vocabRes.ok) {
      const vocabJson = await vocabRes.json();
      realVocab = vocabJson.map(d => d.token || d);
      console.log('✅ Vocab loaded:', realVocab.length);
    } else {
      console.warn('⚠️ Vocab file not found');
    }

    let classifierOptions = {
      task: "classification",
    };
    classifier = ml5.neuralNetwork(classifierOptions);

    let modelDetails = {
      model: "models/hospital-sentiment-latest/model/model_hospital-sentiment-latest.json",
      metadata: "models/hospital-sentiment-latest/model/model_hospital-sentiment-latest_meta.json",
      weights: "models/hospital-sentiment-latest/model/model_hospital-sentiment-latest.weights.bin",
    };

    classifier.load(modelDetails, modelLoaded);

  } catch (err) {
    console.error('❌ Failed to load model/vocab:', err);
    modelReady = false;
  }
}

p.setup = function() {
  // Dynamic size based on container
  //let container = select('#dashboard');
  let maxW = p.min(p.windowWidth, 1200);
  let maxH = p.min(p.windowHeight, 900);
  
  p.createCanvas(maxW, maxH).parent("dashboard");
  p.textFont("system-ui"); 
  p.textAlign(p.LEFT, p.CENTER);
  computeLayout();
  setupUI();  


  console.log(`📐 Canvas: ${p.width}x${p.height}`);
  console.log('📊 Table:', table ? table.getRowCount() : 'LOADING');
  console.log('📄 JSON:', trainingDataNN ? trainingDataNN.length : 'LOADING');
  // 🔥 DEBUG loaded state
  table ? console.log('✅ CSV loaded') : console.log('⏳ CSV loading...');
  trainingDataNN ? console.log('✅ JSON loaded') : console.log('⏳ JSON loading...');
}

p.windowResized = function() { 
  let maxW = p.min(p.windowWidth, 1200);
  let maxH = p.min(p.windowHeight, 900);
  p.resizeCanvas(maxW, maxH);
  computeLayout(); 
}

async function recomputeSentimentFromModel() {
  console.log('🔎 recompute check:', {
    modelReady, hasModel: !!sentimentModel, vocabSize: realVocab.length,
    dataReady, isArray: Array.isArray(trainingDataNN), len: trainingDataNN?.length
  });

  if (!modelReady || !sentimentModel || !realVocab.length || !dataReady || !Array.isArray(trainingDataNN)) {
    console.warn('Model or data not ready');
    return;
  }

  const allData = trainingDataNN.filter(item => item?.text?.trim());
  console.log(`🤖 Classifying ALL ${allData.length} texts (batched)`);

  let neg = 0, pos = 0, neu = 0, total = 0;
  
  // 🔥 BATCH PROCESSING: 32 texts at a time (optimal for CPU)
  const BATCH_SIZE = 32;
  const batches = [];
  
  for (let i = 0; i < allData.length; i += BATCH_SIZE) {
    batches.push(allData.slice(i, i + BATCH_SIZE));
  }

  console.log(`📦 ${batches.length} batches of ${BATCH_SIZE}`);

  // 🔥 PROCESS BATCHES SEQUENTIALLY (non-blocking draw)
  for (let batchNum = 0; batchNum < batches.length; batchNum++) {
    const batch = batches[batchNum];
    console.log(`🔄 Batch ${batchNum + 1}/${batches.length} (${batch.length} texts)`);
    
    // Process batch in parallel within batch
    const batchPromises = batch.map(async (item) => {
      const text = item.text.trim();
      const res = await classifyText(text);
      if (!res || res.label === '?') return null;
      
      return res.label.toLowerCase();
    });

    const batchResults = await Promise.all(batchPromises);
    const validResults = batchResults.filter(r => r);
    
    // Count this batch
    validResults.forEach(label => {
      if (label === 'negativo') neg++;
      else if (label === 'positivo') pos++;
      else if (label === 'neutro') neu++;
    });
    
    total += validResults.length;
    
    // 🔥 PROGRESS UPDATE every batch (keeps UI responsive)
    if (total > 0) {
      sentimentSummary = { negative: neg, positive: pos, neutral: neu };
      sentimentTotal = total;
      console.log(`📊 Progress: ${total}/${allData.length} (${Math.round(total/allData.length*100)}%)`, sentimentSummary);
    }
  }

  console.log('🎉 FINAL:', sentimentSummary, `n = ${total}/${allData.length}`);
  generateNeuralNetWordCloud();
}

p.draw = function() {
  p.background(246);

  // ONE-TIME INIT
  if (!dataInitialized && table && table.getRowCount() > 0) {
    console.log('🎉 INITIALIZING DATA (ONCE!)');

    for (let r = 0; r < table.getRowCount(); r++) {
      let total = table.getNum(r, "Total");
      categories.push({
        label: table.getString(r, "Categoria"),
        total,
        percent: table.getNum(r, "Percentagem"),
        description: table.getString(r, "Descricao"),
        insight: table.getString(r, "Insight")
      });
      if (total > maxTotal) maxTotal = total;
    }

    computeLayout();
    dataInitialized = true;
    console.log('✅ INIT DONE:', categories.length);
  }

  // When both model + data are ready, compute sentiment ONCE
  if (!sentimentComputed && modelReady && dataReady && Array.isArray(trainingDataNN)) {
    sentimentComputed = true;
    recomputeSentimentFromModel();
  }

  drawTitles();
  drawSentimentOverview();
  drawChart();
  drawSidePanel();
  drawWordCloud();
}

function drawTitles() {
  p.textAlign(p.LEFT, p.BASELINE); p.textStyle(p.BOLD); p.fill(20); p.textSize(32);
  p.text("Hospital da Luz – Resumo das Reclamações", layoutMargin, 36);
  p.textStyle(p.NORMAL); p.textSize(16); p.fill(90);
  p.text("Número de comentários por categoria (n = 120)", layoutMargin, 72);
}

function drawSentimentOverview() {
  if (sentimentTotal === 0) return;

  let margin = layoutMargin;
  let cardX = margin;
  let cardY = 88;
  let cardW = p.width - 2 * margin;
  let cardH = 88;

  // Card background
  p.noStroke(); p.fill(252); p.rect(cardX, cardY, cardW, cardH, 10);
  p.stroke(230); p.noFill(); p.rect(cardX, cardY, cardW, cardH, 10);

  // Inner bar container
  let x = cardX + 14;
  let y = cardY + 30;
  let w = cardW - 28;
  let h = 16;

  p.noFill(); p.stroke(210); p.rect(x, y, w, h, 8);

  let negW = (sentimentSummary.negative / sentimentTotal) * w;
  let neuW = (sentimentSummary.neutral / sentimentTotal) * w;
  let posW = (sentimentSummary.positive / sentimentTotal) * w;

  p.noStroke();
  
  // 🔥 NEGATIVE: round LEFT corners only
  p.fill(230, 80, 80);
  p.rect(x, y, negW, h, 8, 0, 0, 8);
  
  // 🔥 NEUTRO: RECTANGLE (NO rounded corners)
  p.fill(200);
  p.rect(x + negW, y, neuW, h, 0, 0, 0, 0);
  
  // 🔥 POSITIVE: round RIGHT corners only  
  p.fill(80, 180, 120);
  p.rect(x + negW + neuW, y, posW, h, 0, 8, 8, 0);

  // 🔥 DYNAMIC LABELS - CLAMPED TO CONTAINER!
    p.fill(40);
    p.textAlign(p.LEFT, p.TOP);
    p.textSize(10.5);
    let labelY = y + h + 6;

    // 🔥 RIGHT BOUNDARY = end of white rect
    let rightBoundary = x + w - 10;  // 10px safety margin

    // Negativo: LEFT edge (always safe)
    let negX = x + 2;
    p.text(`Negativo: ${sentimentSummary.negative} (${(sentimentSummary.negative / sentimentTotal * 100).toFixed(1)}%)`, negX, labelY);

    // Neutro: LEFT edge of gray (clamp if needed)
    let neuX = Math.min(x + negW + 2, rightBoundary - 120);  // 120px min width
    p.text(`Neutro: ${sentimentSummary.neutral} (${(sentimentSummary.neutral / sentimentTotal * 100).toFixed(1)}%)`, neuX, labelY);
    // Positivo: LEFT edge of green (clamp + shrink if tiny)
    let posX = Math.min(x + negW + neuW + 2, rightBoundary - 80);  // 80px min width
    let posTextSize = 10.5;
    if (posX > rightBoundary - 100) posTextSize = 9;  // Shrink tiny bars
    p.textSize(posTextSize);
    p.text(`Positivo: ${sentimentSummary.positive} (${(sentimentSummary.positive / sentimentTotal * 100).toFixed(1)}%)`, posX, labelY);
    p.textSize(10.5);  // Reset
}

function drawChart() {
  if (!categories.length) return; 
  p.stroke(0); 
  p.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);
  hoveredIndex = -1; 
  p.noStroke();
  
  for (let i = 0; i < categories.length; i++) {
    let cat = categories[i], y = chartY + gapH / 2 + i * slotH, w = p.map(cat.total, 0, maxTotal, 0, chartW);
    let isHovered = p.mouseX >= chartX && p.mouseX <= chartX + w && p.mouseY >= y && p.mouseY <= y + barH;
    if (isHovered) hoveredIndex = i;
    
    p.fill(i === selectedIndex ? [40, 110, 255] : isHovered ? [100, 160, 255] : [80, 130, 255]);
    p.rect(chartX, y, w, barH);
    
    p.fill(0); p.textSize(12); p.textAlign(p.RIGHT, p.CENTER); p.text(cat.label, labelX, y + barH / 2);
    p.textSize(11); p.textAlign(p.LEFT, p.CENTER); p.text(cat.total, chartX + w + 5, y + barH / 2);
  }
}

function drawSidePanel() {
  if (exportMode) { drawAllSidePanels(); return; }
  
  // 🔥 SAFETY CHECK - No crash if categories empty
  if (!categories.length || categories.length === 0) {
    p.noStroke(); p.fill(255); p.rect(panelX, panelY, panelW, panelH, 10);
    p.stroke(230); p.noFill(); p.rect(panelX, panelY, panelW, panelH, 10);
    p.fill(100); p.textAlign(p.LEFT, p.TOP); p.textSize(13); p.text("Carregando dados...", panelX + 14, panelY + 30);
    return;
  }
  
  p.noStroke(); p.fill(255); p.rect(panelX, panelY+20, panelW, chartH + 40, 10);
  p.stroke(230); p.noFill(); p.rect(panelX, panelY+20, panelW, chartH + 40, 10);
  
  let indexToShow = hoveredIndex !== -1 ? hoveredIndex : selectedIndex;
  let cat = categories[indexToShow];
  
  let tx = panelX + 24, ty = panelY + 36;
  p.noStroke(); p.fill(30); 
  p.textAlign(p.LEFT, p.TOP); 
  p.textSize(17); 
  p.textStyle(p.BOLD);
  ty += 24; 
  p.text(cat.label, tx, ty);
  p.textStyle(p.NORMAL); ty += 42; p.fill(70); p.textSize(15); 
  p.textStyle(p.BOLDITALIC);
  p.text(`Total`, tx, ty);
  ty += 24;
  p.textStyle(p.NORMAL);
  p.text(`${cat.total} (${cat.percent}%)`, tx, ty);
  ty += 42; p.fill(50); 
  p.textStyle(p.BOLDITALIC);
  p.text("Descrição", tx, ty); 
  p.textStyle(p.NORMAL);
  ty += 24; p.fill(80); 
  p.text(cat.description, tx, ty, panelW - 28, 90);
  ty += 84; p.fill(50); p.textStyle(p.BOLDITALIC); p.text("Insight para Marketing", tx, ty);
  p.textStyle(p.NORMAL); ty += 24; p.fill(80);
  p.text(cat.insight, tx, ty, panelW - 28, panelH - (ty - panelY) - 16);
}

function drawAllSidePanels() {
  noStroke(); fill(255); rect(panelX, panelY, panelW, panelH, 10);
  stroke(230); noFill(); rect(panelX, panelY, panelW, panelH, 10);
  
  let tx = panelX + 14, ty = panelY + 16;
  textAlign(LEFT, TOP); textStyle(BOLD); textSize(13); fill(30); text("Insights por categoria", tx, ty);
  ty += 24; textStyle(NORMAL); textSize(11);
  
  for (let i = 0; i < categories.length; i++) {
    if (ty > panelY + panelH - 40) break;
    let cat = categories[i];
    fill(40); text(cat.label, tx, ty); ty += 14;
    fill(70); text(`Total: ${cat.total} (${cat.percent}%)`, tx, ty); ty += 14;
    let shortInsight = (cat.insight || "").length > 140 ? cat.insight.substring(0, 137) + "…" : cat.insight;
    fill(90); text(shortInsight, tx, ty, panelW - 28, 40); ty += 40;
  }
}

p.mousePressed = function() {
  for (let i = 0; i < categories.length; i++) {
    let y = chartY + gapH / 2 + i * slotH, w = p.map(categories[i].total, 0, maxTotal, 0, chartW);
    if (p.mouseX >= chartX && p.mouseX <= chartX + w && p.mouseY >= y && p.mouseY <= y + barH) {
      selectedIndex = i; break;
    }
  }
}

function drawWordCloud() {
  if (!importantWords.length) return;
  let margin = layoutMargin, x = margin, y = chartY + chartH + 40, w = p.width - margin * 2, h = p.height - y - 40;
  
  p.noStroke(); p.fill(252); p.rect(x, y, w, h, 10); p.stroke(230); p.noFill(); p.rect(x, y, w, h, 10);
  p.noStroke(); p.fill(40); p.textAlign(p.LEFT, p.TOP); p.textSize(16);
  p.text("Palavras mais frequentes em comentários negativos", x + 14, y + 24);
  
  let maxCount = 1; for (let item of importantWords) if (item.count > maxCount) maxCount = item.count;
  let cursorX = x + 14, cursorY = y + 54, lineHeight = 0, bottomLimit = y + h - 12;
  
  for (let item of importantWords) {
    let size = p.map(item.count, 1, maxCount, 10, 22); p.textSize(size);
    let wordWidth = p.textWidth(item.word) + 18;
    
    if (cursorX + wordWidth > x + w - 10) { cursorX = x + 14; cursorY += lineHeight + 5; lineHeight = 0; }
    if (cursorY + size > bottomLimit) break;
    
    let t = item.count / maxCount;
    p.fill(p.lerpColor(p.color("#999"), p.color("#e25c5c"), t * 0.9));
    p.text(item.word, cursorX, cursorY); cursorX += wordWidth;
    if (size > lineHeight) lineHeight = size;
  }
}

function generateNeuralNetWordCloud() {
 let data = Array.isArray(trainingDataNN) ? trainingDataNN : [];
  console.log('🧠 NN Words from:', data.length, 'reviews');
  
  const negativeReviews = data.filter(item => item.label === 'negativo');
  console.log('✅ Negative:', negativeReviews.length);
  
  let wordCounts = {};
  negativeReviews.forEach(item => {
    let tokens = tokenize(item.text);
    tokens.forEach(token => {
      if (!cloudStopwords.has(token) && token.length > 2) {
        wordCounts[token] = (wordCounts[token] || 0) + 1;
      }
    });
  });
  
  // 🔥 RELAX FILTER for small dataset
  importantWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([word, count]) => ({ word, count }));
    
  console.log('☁️ NN Words:', importantWords.length);
  console.log('Top:', importantWords.slice(0, 3));
}

// async function classifyText(inputText) {
//   // 🔥 PURE NEURAL NET - Mock ML5 result
//   if (inputText?.trim()) {
//     const mockNN = {
//       negativo: Math.random() * 0.4,
//       neutro: Math.random() * 0.3,
//       positivo: Math.random() * 0.3
//     };
//     const maxLabel = Object.keys(mockNN).reduce((a, b) => mockNN[a] > mockNN[b] ? a : b);
//     const confidence = (Math.max(...Object.values(mockNN)) * 100).toFixed(1);
//     return { label: maxLabel, confidence };
//   }
//   return { label: "?", confidence: 0 };
// }

// async function classifyText(inputText) {
//   const text = inputText?.trim();
//   if (!text) return null;

//   if (!modelReady || !sentimentModel || !realVocab.length) {
//     return { label: "?", confidence: 0 };
//   }

//   // Use same preprocessing as ML Lab
//   const cleaned = cleanText(text);
//   const inputVector = textToVector(cleaned, realVocab);

//   return new Promise(resolve => {
//     sentimentModel.classify(inputVector, (err, results) => {
//       if (err || !results || !results[0]) {
//         console.error(err || 'No results');
//         resolve({ label: "?", confidence: 0 });
//         return;
//       }
//       const top = results[0];
//       resolve({
//         label: top.label,
//         confidence: (top.confidence * 100).toFixed(1)
//       });
//     });
//   });
// }
// }

async function classifyText(inputText) {
  const text = inputText?.trim();
  if (!text) return null;

  if (!modelReady || !sentimentModel || !realVocab.length) {
    return { label: "?", confidence: 0 };
  }

  const cleaned = cleanText(text);
  const inputVector = textToVector(cleaned, realVocab);

  try {
    // 🔥 EXACT SAME as your WORKING model.js predictSentiment()
    const results = await sentimentModel.classify(inputVector);
    const top = results[0];
    
    console.log('📈 classify results:', results);
    
    return { 
      label: top.label, 
      confidence: (top.confidence * 100).toFixed(1) 
    };
  } catch (err) {
    console.error('Classification error:', err);
    return null;
  }
}

// csv upload handler
function splitCsvIntoRecords(raw) {
  const records = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim() !== '') records.push(current);
      current = '';
      // Optional: swallow \r\n pairs
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') records.push(current);
  return records;
}

function parseMarketingCsv(raw) {
  const records = splitCsvIntoRecords(raw);   // true CSV rows
  console.log('Records:', records.length);    // should be 201

  const rows = [];
  for (let i = 1; i < records.length; i++) {  // skip header
    const cols = parseCsvLine(records[i]);
    if (!cols.length) continue;

    const comment = cols[0].replace(/^"|"$/g, '').trim();
    if (comment.length > 2) {
      rows.push({ rawComment: comment });
    }
  }
  console.log('Parsed comments:', rows.length);
  return rows;
}


function parseCsvLine(line) {
  const columns = [];
  let col = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      columns.push(col);
      col = '';
    } else {
      col += char;
    }
  }
  columns.push(col);
  return columns;
}


}

new p5(sketch);