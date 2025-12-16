/**
 * P5.js Sentiment Visualization - COMPLETE visual layer
 * Handles: HTML bars + Data list (paginated) + p5.js charts
 * English UI labels, Portuguese sentiment data preserved
 */

let vizSketch;
const vizData = {
  trainingData: [],
  counts: { negativo: 0, neutro: 0, positivo: 0 },
  total: 0,
  currentPage: 1,
  itemsPerPage: 12,
  filter: 'all'
};

// ===== FIXED: EXPOSE TO WINDOW IMMEDIATELY =====
window.setPage = setPage;
window.setFilter = setFilter;
window.currentPage = 1;
window.totalPages = 1;

// ===== CORE DATA PROCESSING =====
function updateVizData() {
  vizData.counts = { negativo: 0, neutro: 0, positivo: 0 };
  vizData.trainingData.forEach(item => vizData.counts[item.label]++);  
  vizData.total = vizData.trainingData.length;
}

// ===== HTML SENTIMENT BARS =====
function updateHtmlBars() {
  const { counts, total } = vizData;
  
  // Update counts
  ['neg', 'neu', 'pos'].forEach(type => {
    const el = document.getElementById(`count-${type}`);
    if (el) el.textContent = counts[type === 'neg' ? 'negativo' : type === 'neu' ? 'neutro' : 'positivo'];
  });
  
  // Animate widths
  const pct = { neg: 0, neu: 0, pos: 0 };
  if (total) {
    pct.neg = (counts.negativo / total * 100).toFixed(1);
    pct.neu = (counts.neutro / total * 100).toFixed(1);
    pct.pos = (counts.positivo / total * 100).toFixed(1);
  }
  
  ['neg', 'neu', 'pos'].forEach(type => {
    const bar = document.querySelector(`.sentiment-bar.${type}`);
    if (bar) bar.style.width = `${pct[type]}%`;
  });
}

// ===== PAGINATED DATA LIST =====

function renderDataList() {
  const filtered = vizData.trainingData.filter(item =>
    vizData.filter === 'all' || item.label === vizData.filter
  );

  const start = (vizData.currentPage - 1) * vizData.itemsPerPage;
  const pageData = filtered.slice(start, start + vizData.itemsPerPage);

  document.getElementById('data-list').innerHTML = pageData.map(item => `
    <div class="data-item ${item.label}" title="${item.text}">
      <strong>${item.label.toUpperCase()}</strong><br>
      <div class="data-text">${item.text}</div>
    </div>
  `).join('');
}

// ===== PAGINATION CONTROLS =====
function updatePagination() {
  const filtered = vizData.trainingData.filter(item => 
    vizData.filter === 'all' || item.label === vizData.filter
  );
  const totalPages = Math.ceil(filtered.length / vizData.itemsPerPage);
  
  // 🔥 FIXED: Safe numbers only
  const pageNum = Number.isFinite(vizData.currentPage) ? vizData.currentPage : 1;
  const totalNum = Number.isFinite(totalPages) ? totalPages : 1;
  
  if (document.getElementById('pageInfo')) {
    document.getElementById('pageInfo').textContent = `Page ${pageNum} of ${totalNum}`;
  }
  
  if (document.getElementById('prevPage')) {
    document.getElementById('prevPage').disabled = pageNum <= 1;
  }
  if (document.getElementById('nextPage')) {
    document.getElementById('nextPage').disabled = pageNum >= totalNum;
  }
}

// ===== FIXED PAGINATION (handles FILTERING!) =====
export function setPage(page) {
  // 🔥 FIXED: Use FILTERED length for total pages
  const filtered = vizData.trainingData.filter(item => 
    vizData.filter === 'all' || item.label === vizData.filter
  );
  const totalPages = Math.ceil(filtered.length / vizData.itemsPerPage);
  
  // 🔥 FIXED: Clamp to real page range
  vizData.currentPage = Math.max(1, Math.min(page, totalPages));
  
  // Expose to window IMMEDIATELY
  window.currentPage = vizData.currentPage;
  window.totalPages = totalPages;
  
  renderDataList();
  updatePagination();
  console.log(`📄 Page ${vizData.currentPage} of ${totalPages} (${filtered.length} filtered)`);
}

export function setFilter(filter) {
  vizData.filter = filter;
  vizData.currentPage = 1;  // Reset to page 1
  window.currentPage = 1;
  renderDataList();
  updatePagination();
}

// ===== P5.JS CANVAS =====
function startP5Canvas() {
  vizSketch = new p5((sketch) => {
    sketch.setup = () => {
      sketch.createCanvas(1000, 300).parent('ml-viz');
    };
    
    sketch.draw = () => {
      const { counts, total } = vizData;
      sketch.background(245);
      sketch.textAlign(sketch.CENTER);
      
      sketch.fill(40);
      sketch.textSize(20);
      sketch.text('Sentiment Distribution', sketch.width/2, 40);
  
      const xOffset = 50;
      const barWidth = 200;
      const barGap = 40;
      const barHeight = 150;

      const chartWidth = (barWidth * 3) + (barGap * 2);
      const startX = (sketch.width - chartWidth) / 2;

      
      // Bars (negative/neutral/positive)
      const colors = [[239,68,68], [234,179,8], [16,185,129]];
      const labels = ['Negativo', 'Neutro', 'Positivo'];
      
      for (let i = 0; i < 3; i++) {
        const value = Object.values(counts)[i];
        const w = total ? (value / total) * barWidth : 0;

        const x = startX + i * (barWidth + barGap);
        const y = 80;

        sketch.fill(...colors[i]);
        sketch.rect(x, y, w, barHeight);

        sketch.fill(0);
        sketch.textSize(14);
        sketch.text(value, x + barWidth / 2, y + 30);

        sketch.fill(40);
        sketch.textSize(16);
        sketch.text(labels[i], x + barWidth / 2, y - 10);
      }
    };
  });
}

export function updateSentimentViz(newData) {
  vizData.trainingData = newData;
  updateVizData();
  updateHtmlBars();
  renderDataList();
  updatePagination();
  
  // 🔥 Update p5 canvas data (no recreate)
  if (vizSketch) {
    vizSketch.redraw();  // Trigger p5 redraw
  }
  
  console.log('📊 Viz updated with new data:', newData.length, 'examples');
}

window.updateSentimentVizImpl = updateSentimentViz;

// ===== MAIN INIT (single entry point) =====
export function initSentimentViz(trainingData) {
  console.log('🎨 Initializing visualizations...');
  
  vizData.trainingData = trainingData;
  updateVizData();

  // 🔥 Set globals BEFORE any UI wiring
  window.currentPage = 1;
  window.totalPages = Math.ceil(trainingData.length / vizData.itemsPerPage);
  
  // Expose functions FIRST
  window.setPage = setPage;
  window.setFilter = setFilter;
  
  updateHtmlBars();
  renderDataList();
  updatePagination();
  startP5Canvas();
}
