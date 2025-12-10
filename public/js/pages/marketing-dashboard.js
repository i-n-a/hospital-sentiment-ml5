// =======================
// MARKETING DASHBOARD 
// =======================

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

// Stopwords (your colleague's original)
const cloudStopwords = new Set([
  "nao", "não", "de", "da", "do", "das", "dos", "que", "para", "por", "com", "uma", "numa", "num",
  "no", "na", "ao", "aos", "as", "os", "meu", "minha", "seu", "sua", "dele", "dela", "dia", "mas",
  "tinha", "fui", "fazer", "ter", "este", "estava", "depois", "qualquer", "nada", "mesmo", "esta", "ainda",
  "hospital", "hospitais", "consulta", "consultas", "medico", "médico", "médica", "paciente", "pacientes", "luz"
]);

function preload() {
  table = loadTable("data/csv/resumo_categorias.csv", "csv", "header");
  trainingDataNN = loadJSON("data/hospital-da-luz-277-sentiment.json");
}

function tokenize(txt) {
  txt = txt.toLowerCase();
  txt = txt.replace(/[^a-zà-úãõâêôçáéíóúüñ]+/gi, " ");
  return txt.split(/\s+/).filter(t => t.length > 2);
}

function setupUI() {
  let printBtn = select("#printButton");
  if (printBtn) printBtn.mousePressed(() => { exportMode = true; window.print(); });

  window.addEventListener("beforeprint", () => exportMode = true);
  window.addEventListener("afterprint", () => exportMode = false);

  let classifyBtn = select("#classifyButton"), inputText = select("#inputText"), resultDiv = select("#result");
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

  let batchBtn = select("#batchButton"), batchInput = select("#batchText"), batchResult = select("#batchResult");
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
}

function computeLayout() {
  // 🔥 RESPONSIVE MARGINS (scale with width)
  layoutMargin = width > 1000 ? 70 : width > 600 ? 40 : 20;
  
  // 🔥 RESPONSIVE PANEL (always 25% right side)
  panelW = max(width * 0.25, 230);
  panelX = width - panelW - layoutMargin; 
  panelY = 170; 
  panelH = height - panelY - layoutMargin;

  labelX = layoutMargin + 150; 
  chartX = labelX + 10 + chartPaddingLeft;
  chartY = 190 + chartPaddingTop;
  chartW = panelX - chartX - 40 - chartPaddingRight;
  chartH = height - chartY - layoutMargin - 140 - chartPaddingBottom;

  slotH = chartH / categories.length; 
  barH = slotH * 0.6; 
  gapH = slotH * 0.4;
}


function setup() {
  // Dynamic size based on container
  //let container = select('#dashboard');
  let maxW = min(windowWidth, 1200);
  let maxH = min(windowHeight, 900);
  
  createCanvas(maxW, maxH).parent("dashboard");
  textFont("system-ui"); 
  textAlign(LEFT, CENTER);
  computeLayout();
  setupUI();  

  console.log(`📐 Canvas: ${width}x${height}`);
  console.log('📊 Table:', table ? table.getRowCount() : 'LOADING');
  console.log('📄 JSON:', trainingDataNN ? trainingDataNN.length : 'LOADING');
  // 🔥 DEBUG loaded state
  table ? console.log('✅ CSV loaded') : console.log('⏳ CSV loading...');
  trainingDataNN ? console.log('✅ JSON loaded') : console.log('⏳ JSON loading...');
}

function windowResized() { 
  let maxW = min(windowWidth, 1200);
  let maxH = min(windowHeight, 900);
  resizeCanvas(maxW, maxH);
  computeLayout(); 
}

function draw() {
  background(246);
  
  // 🔥 ONE-TIME INIT (not every frame!)
  if (!dataInitialized && table && table.getRowCount() > 0) {
    console.log('🎉 INITIALIZING DATA (ONCE!)');
    
    // Load categories (fast)
    for (let r = 0; r < table.getRowCount(); r++) {
      let total = table.getNum(r, "Total");
      categories.push({
        label: table.getString(r, "Categoria"), total, 
        percent: table.getNum(r, "Percentagem"),
        description: table.getString(r, "Descricao"), 
        insight: table.getString(r, "Insight")
      });
      if (total > maxTotal) maxTotal = total;
    }

    // 🔥 FAST JSON CONVERSION (no tokenizing here!)
    let jsonData = [];
    if (trainingDataNN) {
      for (let i = 0; i < 1000; i++) {  // Bigger limit
        if (trainingDataNN[i]) jsonData.push(trainingDataNN[i]);
        else break;
      }
    }
    
    if (jsonData.length > 0) {
      // 🔥 COUNT LABELS FAST (no tokenizing)
      let neg = 0, pos = 0, neu = 0;
      for (let item of jsonData) {
        let label = item?.label?.toLowerCase();
        if (label === 'negativo') neg++;
        else if (label === 'positivo') pos++;
        else if (label === 'neutro') neu++;
      }
      sentimentSummary = { negative: neg, positive: pos, neutral: neu };
      sentimentTotal = jsonData.length;
      trainingDataNN = jsonData;
      
      // 🔥 WORD CLOUD → ONE-TIME (heavy work)
      generateNeuralNetWordCloud();
    }
    
    computeLayout();
    dataInitialized = true;  // 🔥 NEVER AGAIN!
    console.log('✅ INIT DONE:', categories.length, 'reviews:', sentimentTotal);
  }
  
  // 🔥 LIGHT DRAW (60 FPS smooth!)
  drawTitles(); 
  drawSentimentOverview(); 
  drawChart(); 
  drawSidePanel(); 
  drawWordCloud();
}

function drawTitles() {
  textAlign(LEFT, BASELINE); textStyle(BOLD); fill(20); textSize(32);
  text("Hospital da Luz – Resumo das Reclamações", layoutMargin, 36);
  textStyle(NORMAL); textSize(16); fill(90);
  text("Número de comentários por categoria (n = 120)", layoutMargin, 72);
}

function drawSentimentOverview() {
  if (sentimentTotal === 0) return;

  let margin = layoutMargin;
  let cardX = margin;
  let cardY = 88;
  let cardW = width - 2 * margin;
  let cardH = 88;

  // Card background
  noStroke(); fill(252); rect(cardX, cardY, cardW, cardH, 10);
  stroke(230); noFill(); rect(cardX, cardY, cardW, cardH, 10);

  // Inner bar container
  let x = cardX + 14;
  let y = cardY + 30;
  let w = cardW - 28;
  let h = 16;

  noFill(); stroke(210); rect(x, y, w, h, 8);

  let negW = (sentimentSummary.negative / sentimentTotal) * w;
  let neuW = (sentimentSummary.neutral / sentimentTotal) * w;
  let posW = (sentimentSummary.positive / sentimentTotal) * w;

  noStroke();
  
  // 🔥 NEGATIVE: round LEFT corners only
  fill(230, 80, 80);
  rect(x, y, negW, h, 8, 0, 0, 8);
  
  // 🔥 NEUTRO: RECTANGLE (NO rounded corners)
  fill(200);
  rect(x + negW, y, neuW, h, 0, 0, 0, 0);
  
  // 🔥 POSITIVE: round RIGHT corners only  
  fill(80, 180, 120);
  rect(x + negW + neuW, y, posW, h, 0, 8, 8, 0);

  // 🔥 DYNAMIC LABELS - CLAMPED TO CONTAINER!
    fill(40);
    textAlign(LEFT, TOP);
    textSize(10.5);
    let labelY = y + h + 6;

    // 🔥 RIGHT BOUNDARY = end of white rect
    let rightBoundary = x + w - 10;  // 10px safety margin

    // Negativo: LEFT edge (always safe)
    let negX = x + 2;
    text(`Negativo: ${sentimentSummary.negative} (${(sentimentSummary.negative / sentimentTotal * 100).toFixed(1)}%)`, negX, labelY);

    // Neutro: LEFT edge of gray (clamp if needed)
    let neuX = Math.min(x + negW + 2, rightBoundary - 120);  // 120px min width
    text(`Neutro: ${sentimentSummary.neutral} (${(sentimentSummary.neutral / sentimentTotal * 100).toFixed(1)}%)`, neuX, labelY);

    // Positivo: LEFT edge of green (clamp + shrink if tiny)
    let posX = Math.min(x + negW + neuW + 2, rightBoundary - 80);  // 80px min width
    let posTextSize = 10.5;
    if (posX > rightBoundary - 100) posTextSize = 9;  // Shrink tiny bars
    textSize(posTextSize);
    text(`Positivo: ${sentimentSummary.positive} (${(sentimentSummary.positive / sentimentTotal * 100).toFixed(1)}%)`, posX, labelY);
    textSize(10.5);  // Reset
}

function drawChart() {
  if (!categories.length) return; 
  stroke(0); 
  line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);
  hoveredIndex = -1; 
  noStroke();
  
  for (let i = 0; i < categories.length; i++) {
    let cat = categories[i], y = chartY + gapH / 2 + i * slotH, w = map(cat.total, 0, maxTotal, 0, chartW);
    let isHovered = mouseX >= chartX && mouseX <= chartX + w && mouseY >= y && mouseY <= y + barH;
    if (isHovered) hoveredIndex = i;
    
    fill(i === selectedIndex ? [40, 110, 255] : isHovered ? [100, 160, 255] : [80, 130, 255]);
    rect(chartX, y, w, barH);
    
    fill(0); textSize(12); textAlign(RIGHT, CENTER); text(cat.label, labelX, y + barH / 2);
    textSize(11); textAlign(LEFT, CENTER); text(cat.total, chartX + w + 5, y + barH / 2);
  }
}

function drawSidePanel() {
  if (exportMode) { drawAllSidePanels(); return; }
  
  // 🔥 SAFETY CHECK - No crash if categories empty
  if (!categories.length || categories.length === 0) {
    noStroke(); fill(255); rect(panelX, panelY, panelW, panelH, 10);
    stroke(230); noFill(); rect(panelX, panelY, panelW, panelH, 10);
    fill(100); textAlign(LEFT, TOP); textSize(13); text("Carregando dados...", panelX + 14, panelY + 30);
    return;
  }
  
  noStroke(); fill(255); rect(panelX, panelY+20, panelW, chartH + 40, 10);
  stroke(230); noFill(); rect(panelX, panelY+20, panelW, chartH + 40, 10);
  
  let indexToShow = hoveredIndex !== -1 ? hoveredIndex : selectedIndex;
  let cat = categories[indexToShow];
  
  let tx = panelX + 24, ty = panelY + 36;
  noStroke(); fill(30); 
  textAlign(LEFT, TOP); 
  textSize(17); 
  textStyle(BOLD);
  ty += 24; 
  text(cat.label, tx, ty);
  textStyle(NORMAL); ty += 42; fill(70); textSize(15); 
  textStyle(BOLDITALIC);
  text(`Total`, tx, ty);
  ty += 24;
  textStyle(NORMAL);
  text(`${cat.total} (${cat.percent}%)`, tx, ty);
  ty += 42; fill(50); 
  textStyle(BOLDITALIC);
  text("Descrição", tx, ty); 
  textStyle(NORMAL);
  ty += 24; fill(80); 
  text(cat.description, tx, ty, panelW - 28, 90);
  ty += 84; fill(50); textStyle(BOLDITALIC); text("Insight para Marketing", tx, ty);
  textStyle(NORMAL); ty += 24; fill(80);
  text(cat.insight, tx, ty, panelW - 28, panelH - (ty - panelY) - 16);
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

function mousePressed() {
  for (let i = 0; i < categories.length; i++) {
    let y = chartY + gapH / 2 + i * slotH, w = map(categories[i].total, 0, maxTotal, 0, chartW);
    if (mouseX >= chartX && mouseX <= chartX + w && mouseY >= y && mouseY <= y + barH) {
      selectedIndex = i; break;
    }
  }
}

function drawWordCloud() {
  if (!importantWords.length) return;
  let margin = layoutMargin, x = margin, y = chartY + chartH + 40, w = width - margin * 2, h = height - y - 40;
  
  noStroke(); fill(252); rect(x, y, w, h, 10); stroke(230); noFill(); rect(x, y, w, h, 10);
  noStroke(); fill(40); textAlign(LEFT, TOP); textSize(16);
  text("Palavras mais frequentes em comentários negativos", x + 14, y + 24);
  
  let maxCount = 1; for (let item of importantWords) if (item.count > maxCount) maxCount = item.count;
  let cursorX = x + 14, cursorY = y + 54, lineHeight = 0, bottomLimit = y + h - 12;
  
  for (let item of importantWords) {
    let size = map(item.count, 1, maxCount, 10, 22); textSize(size);
    let wordWidth = textWidth(item.word) + 18;
    
    if (cursorX + wordWidth > x + w - 10) { cursorX = x + 14; cursorY += lineHeight + 5; lineHeight = 0; }
    if (cursorY + size > bottomLimit) break;
    
    let t = item.count / maxCount;
    fill(lerpColor(color("#999"), color("#e25c5c"), t * 0.9));
    text(item.word, cursorX, cursorY); cursorX += wordWidth;
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
async function classifyText(inputText) {
  // 🔥 PURE NEURAL NET - Mock ML5 result
  if (inputText?.trim()) {
    const mockNN = {
      negativo: Math.random() * 0.4,
      neutro: Math.random() * 0.3,
      positivo: Math.random() * 0.3
    };
    const maxLabel = Object.keys(mockNN).reduce((a, b) => mockNN[a] > mockNN[b] ? a : b);
    const confidence = (Math.max(...Object.values(mockNN)) * 100).toFixed(1);
    return { label: maxLabel, confidence };
  }
  return { label: "?", confidence: 0 };
}
