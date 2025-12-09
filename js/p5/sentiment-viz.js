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

// ===== MAIN INIT (single entry point) =====
export function initSentimentViz(trainingData) {
  console.log('🎨 Initializing visualizations...');
  
  vizData.trainingData = trainingData;
  updateVizData();
  
  // Single calls update everything
  updateHtmlBars();
  renderDataList();
  updatePagination();
  startP5Canvas();
}

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
    <div class="data-item ${item.label}">
      <strong>${item.label.toUpperCase()}</strong><br>
      <small>"${truncateText(item.text, 120)}"</small>
    </div>
  `).join('');
}

function truncateText(text, maxLen) {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

// ===== PAGINATION CONTROLS =====
function updatePagination() {
  const filtered = vizData.trainingData.filter(item => 
    vizData.filter === 'all' || item.label === vizData.filter
  );
  const totalPages = Math.ceil(filtered.length / vizData.itemsPerPage);
  
  document.getElementById('pageInfo').textContent = `Page ${vizData.currentPage} of ${totalPages}`;
  document.getElementById('prevPage').disabled = vizData.currentPage <= 1;
  document.getElementById('nextPage').disabled = vizData.currentPage >= totalPages;
}

// ===== PUBLIC API (window globals for event handlers) =====
export function setPage(page) {
  vizData.currentPage = Math.max(1, Math.min(page, Math.ceil(
    vizData.trainingData.length / vizData.itemsPerPage
  )));
  renderDataList();
  updatePagination();
}

export function setFilter(filter) {
  vizData.filter = filter;
  vizData.currentPage = 1;
  renderDataList();
  updatePagination();
}

// Expose to window for event handlers
window.setPage = setPage;
window.setFilter = setFilter;

// ===== P5.JS CANVAS =====
function startP5Canvas() {
  vizSketch = new p5((sketch) => {
    sketch.setup = () => {
      sketch.createCanvas(600, 300).parent('ml-viz');
    };
    
    sketch.draw = () => {
      const { counts, total } = vizData;
      sketch.background(245);
      sketch.textAlign(sketch.CENTER);
      
      sketch.fill(40);
      sketch.textSize(20);
      sketch.text('Sentiment Distribution', sketch.width/2, 40);
      
      const barWidth = sketch.width / 3 - 20;
      const barHeight = 150;
      const xOffset = 50;
      
      // Bars (negative/neutral/positive)
      const colors = [[239,68,68], [234,179,8], [16,185,129]];
      const labels = ['Negativo', 'Neutro', 'Positivo'];
      
      for (let i = 0; i < 3; i++) {
        const width = total ? (Object.values(counts)[i] / total) * barWidth : 0;
        sketch.fill(...colors[i]);
        sketch.rect(xOffset + i * 170, 80, width, barHeight);
        
        // 🔥 FIXED: Black text instead of white
        sketch.fill(0);  // Black text
        sketch.textSize(14);
        sketch.text(Object.values(counts)[i], xOffset + i * 170 + barWidth/2, 110);
        
        sketch.fill(40);  // Dark text for labels
        sketch.textSize(16);
        sketch.text(labels[i], xOffset + i * 170 + barWidth/2, 70);
      }
    };
  });
}
