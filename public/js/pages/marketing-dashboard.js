// =======================
// MARKETING DASHBOARD 
// =======================

import { cleanText, textToVector } from './../ml5/text-utils.js';


const sketch = (p) => {
  let table, categories = [];
  let sentimentSummary = { negative: 0, positive: 0, neutral: 0 };
  let sentimentTotal = 0;
  let maxTotal = 0, hoveredIndex = -1, selectedIndex = -1, exportMode = false;
  let chartX, chartY, chartW, chartH, slotH, barH, gapH;
  let panelX, panelY, panelW, panelH, layoutMargin = 70, labelX;
  let chartPaddingTop = 10;
  let chartPaddingBottom = 10;
  let chartPaddingLeft = 10;   // extra space before first bar
  let chartPaddingRight = 10;  // extra space after longest bar
  let csvMode = false;  // 🔥 Track if CSV is active
  let classifiedRows = [];  // 🔥 Make global for word cloud
  let classSentiment = {};  
  let trainingDataNN, realVocab = [];
  let importantWords = [];
  let dataInitialized = false;  
  let tableInitialized = false;  
  let sentimentModel = null;
  let modelReady = false;
  let classifier;
  let totalProcessedComments = 120;  // 🔥 GLOBAL

  // Stopwords (your colleague's original)
  const cloudStopwords = new Set([
    "nao", "não", "de", "da", "do", "das", "dos", "que", "para", "por", "com", "uma", "numa", "num",
    "no", "na", "ao", "aos", "as", "os", "meu", "minha", "seu", "sua", "dele", "dela", "dia", "mas",
    "tinha", "fui", "fazer", "ter", "este", "estava", "depois", "qualquer", "nada", "mesmo", "esta", "ainda",
    "hospital", "hospitais", "consulta", "consultas", "medico", "médico", "médica", "paciente", "pacientes", "luz"
  ]);

  let defaultMarketingData = [];  // 🔥 DEFAULT dataset (parsed)
  let loading = true;   // start in loading mode


  // 🔥 AUTO-ANALYZE default CSV on load (same as upload!)
  async function autoAnalyzeDefaultData() {
    if (!defaultMarketingData.length || !modelReady) return;
    
    console.log('🚀 AUTO-ANALYZING DEFAULT DATASET...');
    csvMode = true;
    totalProcessedComments = defaultMarketingData.length;
    
    // 🔥 RESET
    classifiedRows = [];
    classSentiment = {};
    let neg = 0, neu = 0, pos = 0;
    let secondaryCounts = {};
    
    // 🔥 1. CLASSIFY ALL COMMENTS
    for (const row of defaultMarketingData) {
      const res = await classifyText(row.rawComment);
      if (!res) continue;
      
      let categories = row.originalClass?.trim().toLowerCase().split('/').map(s => s.trim()) || ['sem_categoria'];
      let primaryCategory = categories[0];
      let secondaryCategories = categories.slice(1);
      
      if (!classSentiment[primaryCategory]) classSentiment[primaryCategory] = {negativo:0, neutro:0, positivo:0};
      
      if (res.label === 'negativo') { classSentiment[primaryCategory].negativo++; neg++; }
      else if (res.label === 'neutro') { classSentiment[primaryCategory].neutro++; neu++; }
      else { classSentiment[primaryCategory].positivo++; pos++; }
      
      secondaryCategories.forEach(cat => secondaryCounts[cat] = (secondaryCounts[cat] || 0) + 1);
      //classifiedRows.push({comment: row.rawComment, predicted: res.label});
      classifiedRows.push({ 
        comment: row.rawComment, 
        predicted: res.label,
        originalClass: row.originalClass  // 🔥 FROM parseMarketingCsv()
      });
    }
    
    // 🔥 2. CREATE TOP 10 + OUTROS
    let allCategories = Object.entries(classSentiment)
      .filter(([label]) => label && label.trim() !== '')
      .map(([label, sent]) => ({
        label: label.trim(),
        total: sent.negativo + sent.neutro + sent.positivo,
        sentiment: sent,
        secondaryMentions: secondaryCounts[label] || 0
      }));
    
    allCategories.sort((a, b) => b.total - a.total);
    let top10 = allCategories.slice(0, 10);
    
    // Calculate "Outros"
    let outrosSentiment = {negativo: 0, neutro: 0, positivo: 0};
    let outrosTotal = 0;
    allCategories.slice(10).forEach(cat => {
      outrosSentiment.negativo += cat.sentiment.negativo || 0;
      outrosSentiment.neutro += cat.sentiment.neutro || 0;
      outrosSentiment.positivo += cat.sentiment.positivo || 0;
      outrosTotal += cat.total;
    });
    
    if (outrosTotal > 0) {
      top10.push({label: 'outros', total: outrosTotal, sentiment: outrosSentiment, secondaryMentions: 0});
    }
    
    categories = top10.map(cat => ({
      label: cat.label.charAt(0).toUpperCase() + cat.label.slice(1),
      total: cat.total,
      percent: (cat.total/defaultMarketingData.length*100).toFixed(1),
      sentiment: cat.sentiment,
      secondaryMentions: cat.secondaryMentions,
      description: cat.label.toLowerCase() === 'outros' ? 
        'Categorias com poucos comentários' : `Comentários sobre ${cat.label}.`,
      insight: `${cat.sentiment.negativo || 0}N/${cat.sentiment.neutro || 0}U/${cat.sentiment.positivo || 0}P`
    }));
    
    // 🔥 3. LOOKUP DESCRIPTIONS FROM resumo_categorias (COMPLEX MATCHING)
    if (table && table.getRowCount() > 0) {
      categories.forEach(cat => {
        let bestMatch = null;
        let bestScore = 0;
        
        for (let r = 0; r < table.getRowCount(); r++) {
          let tableLabel = table.getString(r, "Categoria").toLowerCase();
          let catLabel = cat.label.toLowerCase();
          
          // 🔥 KEYWORD MATCHING
          let keywords1 = tableLabel.split(/[\s\/]+/).filter(k => k.length > 3);
          let keywords2 = catLabel.split(/[\s\/]+/).filter(k => k.length > 3);
          
          let matches = keywords2.filter(k2 => keywords1.some(k1 => 
            k1.includes(k2) || k2.includes(k1)
          ));
          
          let score = matches.length / Math.max(keywords2.length, 1) * 0.8 + 
                      (tableLabel.includes(catLabel) || catLabel.includes(tableLabel) ? 0.2 : 0);
          
          if (score > bestScore) {
            bestScore = score;
            bestMatch = r;
          }
        }
        
        if (bestMatch !== null && bestScore > 0.4) {
          cat.description = table.getString(bestMatch, "Descricao");
          cat.insight = table.getString(bestMatch, "Insight");
          console.log(`✅ MATCHED (${bestScore.toFixed(2)}): "${cat.label}" → "${table.getString(bestMatch, "Categoria")}"`);
        } else {
          // SMART FALLBACK
          let fallbackInsight = `${cat.sentiment.negativo || 0}N/${cat.sentiment.neutro || 0}U/${cat.sentiment.positivo || 0}P`;
          if (cat.label.toLowerCase().includes('triagem')) {
            cat.description = "Comentários sobre triagem e primeiro atendimento.";
            cat.insight = "Foco em tempos de espera e empatia inicial. " + fallbackInsight;
          } else if (cat.label.toLowerCase().includes('cobrança')) {
            cat.description = "Faturação, pagamentos e transparência de custos.";
            cat.insight = "Confusão sobre preços e comunicação de custos. " + fallbackInsight;
          } else if (cat.label.toLowerCase().includes('atendimento')) {
            cat.description = "Atendimento médico e de enfermagem.";
            cat.insight = "Questões de humanização e postura profissional. " + fallbackInsight;
          } else {
            cat.description = `Comentários sobre ${cat.label}.`;
            cat.insight = `Priorizar análise qualitativa. ${fallbackInsight}`;
          }
          console.log(`🔄 FALLBACK: "${cat.label}"`);
        }
      });
    }
    
    // 🔥 4. FINALIZE
    categories.sort((a, b) => {
      if (a.label.toLowerCase() === 'outros') return 1;
      if (b.label.toLowerCase() === 'outros') return -1;
      return b.total - a.total;
    });
    
    dataInitialized = true;
    maxTotal = categories.map(c => c.total).reduce((a, b) => Math.max(a, b), 0);
    sentimentSummary = { negative: neg, neutral: neu, positive: pos };
    sentimentTotal = neg + neu + pos;
    generateCsvWordCloud();
    
    console.log('✅ DEFAULT DASHBOARD READY!', categories.length, 'categories');
    loading = false;
    computeLayout();
    renderCommentsList();
  }

  // 🔥 Helper: Parse table like upload CSV
  function parseMarketingCsvFromTable(table) {
    const rows = [];
    for (let i = 0; i < table.getRowCount(); i++) {
      const comment = table.getString(i, 0).trim();  // Column 0 = comment
      const category = table.getString(i, 1).trim().toLowerCase();  // Column 1 = category
      if (comment.length > 2) {
        rows.push({ rawComment: comment, originalClass: category });
      }
    }
    return rows;
  }

  p.preload = function() {
    console.log('🚀 Loading dashboard resources...');
    
    // 1. CATEGORIES DESCRIPTIONS (resumo_categorias_updated.csv) ✅ KEEP
    table = p.loadTable("data/csv/resumo_categorias_updated.csv", "csv", "header");
    
    // 2. DEFAULT DATASET (hospital-da-luz-marketing-data-to-be-analised.csv)
    p.loadTable("data/csv/hospital-da-luz-marketing-data-to-be-analised.csv", "csv", "header", 
      (defaultTable) => {
        defaultMarketingData = parseMarketingCsvFromTable(defaultTable);  // Parse like upload!
        console.log('✅ DEFAULT DATA LOADED:', defaultMarketingData.length, 'comments');
        autoAnalyzeDefaultData();  // 🔥 AUTO-RUN analysis on startup!
      }
    );
    
    // 3. Sentiment model + vocab
    loadSentimentResources();
  }

  function tokenize(txt) {
    txt = txt.toLowerCase();
    txt = txt.replace(/[^a-zà-úãõâêôçáéíóúüñ]+/gi, " ");
    return txt.split(/\s+/).filter(t => t.length > 2);
  }

  function renderCommentsList() {
    if (!classifiedRows?.length) {
      // 🔥 SAFE fallback - show loading
      const dataList = p.select('#data-list');
      if (dataList) {
        dataList.html('<div style="padding:20px;color:#6b7280;text-align:center">Carregando comentários...</div>');
      }
      return;
    }
    
    const searchInput = p.select('#searchComments');
    const sentimentFilter = p.select('#sentimentFilter');
    const commentsCount = p.select('#commentsCount');  // May be null
    const pageInfo = p.select('#pageInfo');
    const dataList = p.select('#data-list');  // 🔥 ADD THIS
    
    // 🔥 SAFE null checks
    if (!dataList) {
      console.error('❌ #data-list not found!');
      return;
    }
    
    const searchVal = searchInput ? searchInput.value() : '';
    const filterVal = sentimentFilter ? sentimentFilter.value() : 'all';
    
    const filtered = classifiedRows.filter(row => {
      const matchesSearch = !searchVal || row.comment.toLowerCase().includes(searchVal.toLowerCase());
      const matchesFilter = filterVal === 'all' || row.predicted === filterVal;
      return matchesSearch && matchesFilter;
    });
    
    // 🔥 SAFE html() calls
    if (commentsCount) commentsCount.html(`(${filtered.length})`);
    
    const COMMENTS_PER_PAGE = 8;
    const start = (window.currentPage - 1) * COMMENTS_PER_PAGE;
    const pageData = filtered.slice(start, start + COMMENTS_PER_PAGE);
    
    let html = pageData.map(row => `
      <div class="data-item ${row.predicted}">
        <div style="font-weight:600; color:#374151; margin-bottom:8px; font-size:14px">
          ${row.predicted.toUpperCase()}
        </div>
        <div style="font-size:14px; color:#6b7280; margin-bottom:12px; font-weight:500">
          ${row.originalClass || row.category || row.classificacao || 'sem categoria'}
        </div>
        <div style="font-size:15px; line-height:1.5; color:#1f2937; min-height:80px">
          "${row.comment}"
        </div>
      </div>
    `).join('');
    
    dataList.html(html);  // ✅ SAFE
    if (pageInfo) pageInfo.html(`Página ${window.currentPage} de ${Math.ceil(filtered.length / 8)}`);
  }

  function setPage(page) {
    const searchInput = p.select('#searchComments');
    const sentimentFilter = p.select('#sentimentFilter');
    const searchVal = searchInput ? searchInput.value() : '';
    const filterVal = sentimentFilter ? sentimentFilter.value() : 'all';
    
    const filtered = classifiedRows.filter(row => {
      const matchesSearch = !searchVal || row.comment.toLowerCase().includes(searchVal.toLowerCase());
      const matchesFilter = filterVal === 'all' || row.predicted === filterVal;
      return matchesSearch && matchesFilter;
    });
    
    const totalPages = Math.ceil(filtered.length / 12);
    window.currentPage = Math.max(1, Math.min(page, totalPages));
    renderCommentsList();
  }

  function setFilter(filter) {
    window.currentPage = 1;
    if (p.select('#sentimentFilter')) p.select('#sentimentFilter').value(filter);
    renderCommentsList();
  }

  function setupUI() {
    exportMode = false;  // Reset on UI init
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

    if (csvInput && csvButton ) {
      csvButton.mousePressed(async () => {
      console.log('🚀 CSV BUTTON CLICKED');
      csvMode = true;
      
      const file = csvInput.elt.files?.[0];
      if (!file) {
        csvSummaryDiv.html('Selecione primeiro um ficheiro CSV.');
        return;
      }

      if (!modelReady) {
        csvSummaryDiv.html('Modelo a carregar...');
        return;
      }

      try {
          const text = await file.text();
          const rows = parseMarketingCsv(text);
          totalProcessedComments = rows.length;  // 🔥 Store globally
          console.log('✅ ROWS PARSED:', rows.length);
          // 🔥 DEBUG: Count categories BEFORE processing
          let categoryCounts = {};
          rows.forEach(row => {
            let label = row.originalClass?.trim().toLowerCase() || 'MISSING';
            categoryCounts[label] = (categoryCounts[label] || 0) + 1;
          });
          console.log('📊 RAW CATEGORY BREAKDOWN:', categoryCounts);
          console.log('📊 MISSING categories:', categoryCounts.MISSING || 0);


          if (!rows.length) {
            csvSummaryDiv.html('Nenhum comentário válido encontrado.');
            return;
          }

          // 🔥 RESET GLOBALS (no local declaration!)
          classifiedRows = [];
          classSentiment = {};  // ✅ This works because GLOBAL exists
          let neg = 0, neu = 0, pos = 0;
          let secondaryCounts = {};

          // 1. Classify + count sentiment
          for (const row of rows) {
            const res = await classifyText(row.rawComment);
            console.log('CSV classify:', row.rawComment.slice(0, 40), '→', res); 
            if (!res) continue;
            
            // WITH smart primary category:
            let categories = row.originalClass?.trim().toLowerCase().split('/').map(s => s.trim()) || ['sem_categoria'];
            let primaryCategory = categories[0];  // FIRST = PRIMARY
            let secondaryCategories = categories.slice(1);  // REST = secondary

            // Count for PRIMARY chart
            if (!classSentiment[primaryCategory]) classSentiment[primaryCategory] = {negativo:0, neutro:0, positivo:0};

            if (res.label === 'negativo') { 
              classSentiment[primaryCategory].negativo++; neg++; 
            } else if (res.label === 'neutro') { 
              classSentiment[primaryCategory].neutro++; neu++; 
            } else { 
              classSentiment[primaryCategory].positivo++; pos++; 
            }

            // SECONDARY for details
            secondaryCategories.forEach(cat => {  // 🔥 Use secondaryCategories
              secondaryCounts[cat] = (secondaryCounts[cat] || 0) + 1;
            });
                    
            //classifiedRows.push({comment: row.rawComment, predicted: res.label});
            classifiedRows.push({ 
              comment: row.rawComment, 
              predicted: res.label,
              originalClass: row.originalClass  // 🔥 FROM parseMarketingCsv()
            });
          }

          // 2. Create categories 
          categories = Object.entries(classSentiment).map(([label, sent]) => {
            let total = sent.negativo + sent.neutro + sent.positivo;
            return {
              label: label.charAt(0).toUpperCase() + label.slice(1),
              total,
              percent: (total/rows.length*100).toFixed(1),
              sentiment: sent,
              secondaryMentions: secondaryCounts[label.toLowerCase()] || 0,
              description: `Comentários sobre ${label}.`,
              insight: `${sent.negativo || 0}N/${sent.neutro || 0}U/${sent.positivo || 0}P`
            };
          });

          // 🔥 SINGLE CLEAN CREATION - TOP 10 + Outros with PROPER sentiment!
          let allCategories = Object.entries(classSentiment)
            .filter(([label]) => label && label.trim() !== '')  // 🔥 REMOVE empty names!
            .map(([label, sent]) => ({
              label: label.trim(),
              total: sent.negativo + sent.neutro + sent.positivo,
              sentiment: sent,
              secondaryMentions: secondaryCounts[label] || 0
            }));

          // 🔥 SORT + GROUP with PROPER "Outros" sentiment
          allCategories.sort((a, b) => b.total - a.total);
          let top10 = allCategories.slice(0, 10);

          // 🔥 CALCULATE "Outros" sentiment from remaining categories
          let outrosSentiment = {negativo: 0, neutro: 0, positivo: 0};
          let outrosTotal = 0;
          allCategories.slice(10).forEach(cat => {
            outrosSentiment.negativo += cat.sentiment.negativo || 0;
            outrosSentiment.neutro += cat.sentiment.neutro || 0;
            outrosSentiment.positivo += cat.sentiment.positivo || 0;
            outrosTotal += cat.total;
          });

          if (outrosTotal > 0) {
            top10.push({
              label: 'outros',
              total: outrosTotal,
              sentiment: outrosSentiment,  // 🔥 PROPER sentiment totals!
              secondaryMentions: 0
            });
          }

          // 🔥 After creating top10 + outros...
          categories = top10.map(cat => ({
            label: cat.label.charAt(0).toUpperCase() + cat.label.slice(1),
            total: cat.total,
            percent: (cat.total/rows.length*100).toFixed(1),
            sentiment: cat.sentiment,
            secondaryMentions: cat.secondaryMentions,
            description: cat.label.toLowerCase() === 'outros' ? 
              'Categorias com poucos comentários' : `Comentários sobre ${cat.label}.`,
            insight: cat.label.toLowerCase() === 'outros' ? 
              `${outrosSentiment.negativo}N/${outrosSentiment.neutro}U/${outrosSentiment.positivo}P` :
              `${cat.sentiment.negativo || 0}N/${cat.sentiment.neutro || 0}U/${cat.sentiment.positivo || 0}P`
          }));

          // 🔥 Marketing PERFECT: Sort but Outros ALWAYS LAST!
          categories.sort((a, b) => {
            if (a.label.toLowerCase() === 'outros') return 1;  // Outros → bottom
            if (b.label.toLowerCase() === 'outros') return -1; // Others → top
            return b.total - a.total;  // Normal descending
          });

          // In CSV button handler, AFTER creating categories:
          dataInitialized = true;  // Prevent table data override
          maxTotal = categories.map(c => c.total).reduce((a, b) => Math.max(a, b), 0);
          // Add to CSV handler after categories created:
          console.log('📊 CSV CATEGORIES:', categories.map(c => ({label: c.label, total: c.total})));
          console.log('📊 TOTAL COMMENTS:', categories.reduce((sum, c) => sum + c.total, 0));

          // 🔥 3. ENRICH descriptions (ROBUST MATCH + FALLBACK)
          if (table && table.getRowCount() > 0) {
            categories.forEach(cat => {
              let bestMatch = null;
              let bestScore = 0;
              
              for (let r = 0; r < table.getRowCount(); r++) {
                let tableLabel = table.getString(r, "Categoria").toLowerCase();
                let catLabel = cat.label.toLowerCase();
                
                // 🔥 KEYWORD MATCHING (handles variations)
                let keywords1 = tableLabel.split(/[\s\/]+/).filter(k => k.length > 3);
                let keywords2 = catLabel.split(/[\s\/]+/).filter(k => k.length > 3);
                
                let matches = keywords2.filter(k2 => keywords1.some(k1 => 
                  k1.includes(k2) || k2.includes(k1)
                ));
                
                let score = matches.length / Math.max(keywords2.length, 1) * 0.8 + 
                            (tableLabel.includes(catLabel) || catLabel.includes(tableLabel) ? 0.2 : 0);
                
                if (score > bestScore) {
                  bestScore = score;
                  bestMatch = r;
                }
              }
              
              if (bestMatch !== null && bestScore > 0.4) {  // Lower threshold
                cat.description = table.getString(bestMatch, "Descricao");
                cat.insight = table.getString(bestMatch, "Insight");
                console.log(`✅ MATCHED (${bestScore.toFixed(2)}): "${cat.label}" → "${table.getString(bestMatch, "Categoria")}"`);
              } else {
                // 🔥 SMART FALLBACK based on keywords
                let fallbackInsight = `${cat.sentiment.negativo || 0}N/${cat.sentiment.neutro || 0}U/${cat.sentiment.positivo || 0}P`;
                
                if (cat.label.toLowerCase().includes('triagem')) {
                  cat.description = "Comentários sobre triagem e primeiro atendimento.";
                  cat.insight = "Foco em tempos de espera e empatia inicial. " + fallbackInsight;
                } else if (cat.label.toLowerCase().includes('atendimento') || cat.label.toLowerCase().includes('hospitalar')) {
                  cat.description = "Atendimento médico e de enfermagem durante a estadia.";
                  cat.insight = "Questões de humanização e postura profissional. " + fallbackInsight;
                } else if (cat.label.toLowerCase().includes('cobrança') || cat.label.toLowerCase().includes('faturação') || cat.label.toLowerCase().includes('pagamento')) {
                  cat.description = "Faturação, pagamentos e transparência de custos.";
                  cat.insight = "Confusão sobre preços e comunicação de custos. " + fallbackInsight;
                } else if (cat.label.toLowerCase().includes('tempo') || cat.label.toLowerCase().includes('espera')) {
                  cat.description = "Tempo de espera para atendimento, exames ou resultados.";
                  cat.insight = "Gestão de filas e comunicação de atrasos. " + fallbackInsight;
                } else if (cat.label.toLowerCase().includes('call') || cat.label.toLowerCase().includes('contacto')) {
                  cat.description = "Linha telefónica e contacto remoto.";
                  cat.insight = "Dificuldade de contacto e tempos de resposta. " + fallbackInsight;
                } else {
                  cat.description = `Comentários sobre ${cat.label}.`;
                  cat.insight = `Priorizar análise qualitativa desta categoria. ${fallbackInsight}`;
                }
                console.log(`🔄 FALLBACK: "${cat.label}"`);
              }
            });
          }

          // 4. FIXED maxTotal
          let totals = categories.map(cat => cat.total);
          maxTotal = totals.length > 0 ? Math.max(...totals) : 1;
          
          dataInitialized = true;
          computeLayout();
          p.redraw();
          // 🔥 UPDATE sentimentSummary for overview bar
          sentimentSummary = { negative: neg, neutral: neu, positive: pos };
          sentimentTotal = neg + neu + pos;
          generateCsvWordCloud();
          loading = false;  
          p.redraw();  
        } catch (err) {
          console.error('❌ CSV processing error:', err);
        }
      });
    }
    
    // 🔥 3. COMMENTS LIST CONTROLS (ML Lab style)
    window.currentPage = 1;
    window.setPage = setPage;
    window.setFilter = setFilter;

    // Wire up controls
    const searchInput = p.select('#searchComments');
    const sentimentFilter = p.select('#sentimentFilter');
    const prevBtn = p.select('#prevPage');
    const nextBtn = p.select('#nextPage');

    if (searchInput) searchInput.input(renderCommentsList);
    if (sentimentFilter) sentimentFilter.changed(() => {
      window.currentPage = 1;  
      renderCommentsList();
    });

    
    if (prevBtn) prevBtn.mousePressed(() => {
      if (window.currentPage > 1) {
        window.currentPage--;
        renderCommentsList();
      }
    });
    
    if (nextBtn) nextBtn.mousePressed(() => {
      const searchInput = p.select('#searchComments');
      const sentimentFilter = p.select('#sentimentFilter');
      
      const searchVal = searchInput ? searchInput.value() : '';
      const filterVal = sentimentFilter ? sentimentFilter.value() : 'all';
      
      // 🔥 RECALCULATE filtered for CURRENT state
      const filtered = classifiedRows.filter(row => {
        const matchesSearch = !searchVal || row.comment.toLowerCase().includes(searchVal.toLowerCase());
        const matchesFilter = filterVal === 'all' || row.predicted === filterVal;
        return matchesSearch && matchesFilter;
      });
      
      const totalPages = Math.ceil(filtered.length / 8);
      
      // 🔥 CHECK CURRENT PAGE vs totalPages
      if (window.currentPage < totalPages) {
        window.currentPage++;
        renderCommentsList();
      }
    });
  }

  function computeLayout() {
    p.strokeWeight(1);
    console.log('🔧 computeLayout() CALLED');
    layoutMargin = p.width > 1000 ? 70 : p.width > 600 ? 40 : 20;
    
    panelW = p.max(p.width * 0.25, 230);
    panelX = p.width - panelW - layoutMargin; 
    
    // 🔥 1. FIRST calculate panelH (SAFE)
    panelH = Math.max(p.height * 0.5, 300);  // 50% height, min 300px
    
    // 🔥 2. THEN center panelY
    let titleSpace = 120;  // Titles + sentiment bar
    let bottomSpace = 100; // Wordcloud + margin
    let availableH = p.height - titleSpace - bottomSpace;
    panelY = titleSpace + (availableH - panelH) / 2;  // Perfect center!
    panelY = Math.max(panelY, 150);  // Don't go too high
    
    // 🔥 3. Chart inside panel bounds
    labelX = layoutMargin + 150; 
    chartX = labelX + 10 + chartPaddingLeft;
    chartY = panelY + chartPaddingTop;  // 30px panel padding
    chartW = panelX - chartX - chartPaddingRight - 40;
    chartH = panelH - chartPaddingTop - chartPaddingBottom;  // Leave top/bottom padding
    
    slotH = chartH / Math.max(categories.length, 1);
    barH = slotH * 0.4; 
    gapH = slotH * 0.6;
    
    console.log(`📐 FIXED: panelY=${Math.round(panelY)} panelH=${panelH} chartY=${Math.round(chartY)}`);
  }

  function modelLoaded() {
    sentimentModel = classifier;
    modelReady = true;
    autoAnalyzeDefaultData();
  }

  async function loadSentimentResources() {
    try {
        try {
        await ml5.tf.setBackend('webgl');
        await ml5.tf.ready();
        console.log('✅ WebGL backend initialized');
      } catch (e) {
        await ml5.tf.setBackend('cpu');
        await ml5.tf.ready();
        console.log('✅ CPU backend fallback');
      }
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
    p.strokeWeight(1);
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
    p.redraw();  // 🔥 FORCE REDRAW
  }

  p.draw = function() {

    p.background(246);
    // 🔥 1. While loading: show animation and exit
    if (loading || !dataInitialized || categories.length === 0) {
      p.push();
      p.translate(p.width / 2, p.height / 2);

      const r = 30;
      const angle = (p.frameCount * 0.08) % (p.TWO_PI);
      p.noFill();
      p.stroke(148, 163, 184);
      p.strokeWeight(6);
      p.ellipse(0, 0, r * 2, r * 2);

      p.stroke(59, 130, 246);
      p.arc(0, 0, r * 2, r * 2, angle, angle + p.PI * 0.8);

      p.noStroke();
      p.fill(75, 85, 99);
      p.textAlign(p.CENTER, p.TOP);
      p.textSize(14);
      p.text('A carregar análise de sentimentos...', 0, r + 16);
      p.pop();

      return;   // ⬅️ do NOT draw chart yet
    }
    // ONE-TIME INIT
    if (!dataInitialized && table && table.getRowCount() > 0 && !csvMode) {
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

      // 🔥 TITLES + OVERVIEW always
      drawTitles();
      drawSentimentOverview();
      
      // 🔥 FULL DASHBOARD only when model ready
      if (modelReady) {
        drawChart();
        drawSidePanel();
        drawWordCloud();
      }
  }

  function drawTitles() {
    p.textAlign(p.LEFT, p.BASELINE); p.textStyle(p.BOLD); p.fill(20); p.textSize(32);
    p.text("Hospital da Luz – Resumo das Reclamações", layoutMargin, 36);
    p.textStyle(p.NORMAL); p.textSize(16); p.fill(90);
    if (!dataInitialized || !modelReady) {
      p.text("Carregando análise automática... (200 comentários)", layoutMargin, 72);
    } else {
      p.text(`Número de comentários por categoria`, layoutMargin, 72);
    }
  }

  function drawSentimentOverview() {
    if (sentimentTotal === 0) return;

    let margin = layoutMargin;
    let cardX = margin;
    let cardY = 88;
    let cardW = p.width - 2 * margin;
    let cardH = 88;

    // Card
    p.noStroke(); p.fill(252); p.rect(cardX, cardY, cardW, cardH, 10);
    p.stroke(230); p.noFill(); p.rect(cardX, cardY, cardW, cardH, 10);

    // Bar
    let x = cardX + 14;
    let y = cardY + 30;
    let w = cardW - 28;
    let h = 16;

    p.noFill(); p.stroke(210); p.rect(x, y, w, h, 8);

    let negW = (sentimentSummary.negative / sentimentTotal) * w;
    let neuW = (sentimentSummary.neutral / sentimentTotal) * w;
    let posW = (sentimentSummary.positive / sentimentTotal) * w;

    p.noStroke();
    p.fill(230, 80, 80);
    p.rect(x, y, negW, h, 8, 0, 0, 8);
    p.fill(200);
    p.rect(x + negW, y, neuW, h, 0, 0, 0, 0);
    p.fill(80, 180, 120);
    p.rect(x + negW + neuW, y, posW, h, 0, 8, 8, 0);

    // LABELS
    p.fill(40);
    p.textAlign(p.LEFT, p.TOP);
    p.textSize(10);

    // 1) Neutro ABOVE, centered on gray segment (if any)
    if (neuW > 0) {
      let neuCenter = x + negW + neuW / 2;
      let neuText = `Neutro: ${sentimentSummary.neutral} (${(sentimentSummary.neutral / sentimentTotal * 100).toFixed(1)}%)`;
      let neuX = neuCenter - p.textWidth(neuText) / 2;

      // clamp inside white card
      let minX = x + 4;
      let maxX = x + w - p.textWidth(neuText) - 4;
      neuX = p.constrain(neuX, minX, maxX);

      let neuY = y - 12;
      p.text(neuText, neuX, neuY);
    }

    // 2) Negativo BELOW left
    let labelY = y + h + 4;
    let negText = `Negativo: ${sentimentSummary.negative} (${(sentimentSummary.negative / sentimentTotal * 100).toFixed(1)}%)`;
    p.text(negText, x + 4, labelY);

    // 3) Positivo BELOW right
    let posText = `Positivo: ${sentimentSummary.positive} (${(sentimentSummary.positive / sentimentTotal * 100).toFixed(1)}%)`;
    let posX = x + w - p.textWidth(posText) - 4;
    p.text(posText, posX, labelY);
  }
  
  function drawChart() {
    if (!categories.length) return; 
    
    // 🔥 USE GLOBAL COORDS FROM computeLayout() - NO local calc!
    p.stroke(0); 
    p.line(chartX, chartY + chartH + 20, chartX + chartW, chartY + chartH + 20);
    hoveredIndex = -1; 
    p.noStroke();
    
    let tempSlotH = chartH / Math.max(categories.length, 1);
    let tempBarH = tempSlotH * 0.6;
    let tempGapH = tempSlotH * 0.4;
    
    for (let i = 0; i < categories.length; i++) {
      let cat = categories[i];
      let y = chartY + tempGapH / 2 + i * tempSlotH;
      let baseW = Math.max(p.map(cat.total, 0, maxTotal, 0, chartW), 30);
      
      // 1. Background bar (ALWAYS visible)
      p.fill(240);
      p.rect(chartX, y, baseW, tempBarH);
      
      // 2. Sentiment segments ON TOP
      let xOffset = chartX;
      const sentiments = ['negativo', 'neutro', 'positivo'];
      const colors = [[230,80,80], [200], [80,180,120]];
      
      for (let s = 0; s < 3; s++) {
        let count = cat.sentiment ? cat.sentiment[sentiments[s]] || 0 : 0;
        let proportion = cat.total > 0 ? count / cat.total : 0;
        let w = proportion * baseW;
        if (w > 1) {
          p.fill(colors[s]);
          p.rect(xOffset, y, w, tempBarH);
          xOffset += w;
        }
      }
      
      // 3. FIXED HOVER - bigger hitbox
      let hitLeft = chartX - 10;
      let hitRight = chartX + baseW + 10;
      let hitTop = y - 5;
      let hitBottom = y + tempBarH + 5;
      
      let isHovered = p.mouseX >= hitLeft && 
                      p.mouseX <= hitRight && 
                      p.mouseY >= hitTop && 
                      p.mouseY <= hitBottom;
      
      if (isHovered) {
        hoveredIndex = i;
        p.stroke(0, 150, 255); p.strokeWeight(3);
        p.noFill(); p.rect(hitLeft, hitTop, hitRight-hitLeft, hitBottom-hitTop);
        p.noStroke();
        console.log(`🖱️ HOVERED ${i}: "${cat.label}"`);
      }
      
      // 4. Labels
      p.fill(0); 
      p.textSize(12); p.textAlign(p.RIGHT, p.CENTER); 
      p.text(cat.label, labelX, y + tempBarH / 2);
      p.textSize(11); p.textAlign(p.LEFT, p.CENTER); 
      p.text(cat.total, chartX + baseW + 8, y + tempBarH / 2);
    }
  }

  function drawSidePanel() {
    // 🔥 1. ALWAYS DRAW BOX (clean structure)
    p.noStroke(); 
    p.fill(255); 
    p.rect(panelX, panelY, panelW, panelH, 10);
    p.stroke(230); p.strokeWeight(1); p.noFill(); 
    p.rect(panelX, panelY, panelW, panelH, 10);
    
    // 🔥 2. NO DATA → Loading
    if (!dataInitialized || !categories.length) {
      let tx = panelX + 20, ty = panelY + 40;
      p.fill(150); p.textAlign(p.LEFT, p.TOP); p.textSize(14);
      p.text("Carregando dados...", tx, ty);
      return;
    }
    
    // 🔥 3. NO HOVER → PRINT-FRIENDLY OVERVIEW
if (hoveredIndex < 0 || !categories[hoveredIndex]) {
  let tx = panelX + 20, ty = panelY + 40;
  
  // 📊 OVERVIEW TITLE
  p.textSize(16); p.fill(30); p.textAlign(p.LEFT, p.TOP); p.textStyle(p.BOLD);
  p.text("Resumo Geral", tx, ty); ty += 28;
  
  // TOTAL COMMENTS
  p.textStyle(p.NORMAL); p.textSize(13); p.fill(70);
  p.text(`${totalProcessedComments || categories.reduce((sum, c) => sum + c.total, 0)} comentários analisados`, tx, ty); ty += 24;
  
  // 🔥 SENTIMENT BREAKDOWN (print-friendly)
  let neg = sentimentSummary?.negative || 0, neu = sentimentSummary?.neutral || 0, pos = sentimentSummary?.positive || 0;
  p.textSize(12); p.fill(90);
  p.text(`${neg} Negativo • ${neu} Neutro • ${pos} Positivo`, tx, ty); ty += 32;

  
  // 🔥 TOP 3 PROBLEMS
  p.textStyle(p.BOLD); p.textSize(13); p.fill(50);
  p.text("🔴 Top Problemas", tx, ty); ty += 22;
  p.textStyle(p.NORMAL); p.textSize(12); p.fill(230, 80, 80);
  
  // Get top 3 negative categories
  let topNeg = categories
    .filter(cat => cat.sentiment?.negativo > 0)
    .sort((a, b) => (b.sentiment?.negativo || 0) - (a.sentiment?.negativo || 0))
    .slice(0, 3);
  
  topNeg.forEach((cat, i) => {
    let negPct = cat.total > 0 ? ((cat.sentiment?.negativo || 0) / cat.total * 100).toFixed(0) : 0;
    p.text(`${i+1}. ${cat.label} (${negPct}%)`, tx + 8, ty); 
    ty += 20;
  });
  
  return;
}

    // 🔥 4. HOVERED CATEGORY → BEST OF BOTH!
    p.noStroke(); 
    let cat = categories[hoveredIndex];
    let tx = panelX + 20, ty = panelY + 40;
    
    // 🏷️ TITLE (16px bold - old style)
    p.textSize(16); p.fill(30); p.textAlign(p.LEFT, p.TOP); p.textStyle(p.BOLD);
    p.text(cat.label, tx, ty);
    
    // 📊 SENTIMENT (immediate - old flow)
    p.textStyle(p.NORMAL); ty += 24; p.textSize(12); p.fill(70);
    let neg = (cat.sentiment?.negativo || 0);
    let neu = (cat.sentiment?.neutro || 0); 
    let pos = (cat.sentiment?.positivo || 0);
    let totalSent = neg + neu + pos;
    p.textSize(11); p.fill(90);
    p.text(`${neg} Negativo • ${neu} Neutro • ${pos} Positivo`, tx, ty); ty += 12;
    p.textSize(10); p.fill(110);
    ty += 0;
    
    // 🔥 PRIORITY BADGE (NEW!)
    let negPct = cat.total > 0 ? (neg/cat.total*100) : 0;
    ty += 18; p.textSize(12); p.textStyle(p.BOLD);
    p.fill(negPct > 50 ? [230,80,80] : [80,180,120]);
    p.text(negPct > 50 ? "🔴 PRIORIDADE ALTA" : "🟢 OK", tx, ty);
    
    // 🔥 SECONDARY MENTIONS (NEW!)
    ty += 18; p.textSize(11); p.fill(90);
    let secText = cat.secondaryMentions > 0 ? 
      `+${cat.secondaryMentions} menções secundárias` : 
      "Sem menções secundárias";
    p.text(secText, tx, ty); ty += 36;  // Extra space

    // 🔥 DESCRIPTION - CLEAR HEADER + BOXED
    p.textStyle(p.BOLDITALIC); p.textSize(12); p.fill(50);
    p.text("DESCRIÇÃO", tx, ty); ty += 22;
    p.textStyle(p.NORMAL); p.fill(90); p.textSize(11);
    p.text(cat.description || 'Sem descrição', tx, ty, panelW - 40); ty += 40;

    // 🔥 INSIGHT - CLEAR HEADER + BOXED  
    p.textStyle(p.BOLDITALIC); p.textSize(12); p.fill(50);
    p.text("INSIGHT", tx, ty); ty += 22;
    p.textStyle(p.NORMAL); p.fill(90); p.textSize(11);
    p.text(cat.insight || 'Analisar categoria', tx, ty, panelW - 40);

  }

  p.mousePressed = function() {
     // 🔥 Guard against missing data
  if (!categories.length || hoveredIndex < 0) return;
  
  selectedIndex = hoveredIndex;  // Select hovered bar
  console.log(`📊 SELECTED: ${categories[selectedIndex].label}`);
    for (let i = 0; i < categories.length; i++) {
      let y = chartY + gapH / 2 + i * slotH, w = p.map(categories[i].total, 0, maxTotal, 0, chartW);
      if (p.mouseX >= chartX && p.mouseX <= chartX + w && p.mouseY >= y && p.mouseY <= y + barH) {
        selectedIndex = i; break;
      }
    }
  }

  function drawWordCloud() {
    if (!importantWords.length) return;
    let margin = layoutMargin, x = margin, 
      y = panelY + panelH + 40,  // 🔥 Below panel (dynamic)
      w = p.width - margin * 2, 
      h = p.height - y - 40;
    
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

  function generateCsvWordCloud() {
    // 🔥 Use classifiedRows from CSV (global)
    if (!classifiedRows || !classifiedRows.length) return;
    
    console.log('☁️ CSV Word cloud from:', classifiedRows.length, 'comments');
    
    // Only negative comments from CSV
    const negativeComments = classifiedRows.filter(r => r.predicted === 'negativo');
    console.log('✅ CSV Negative:', negativeComments.length);
    
    let wordCounts = {};
    negativeComments.forEach(r => {
      let tokens = tokenize(r.comment);
      tokens.forEach(token => {
        if (!cloudStopwords.has(token) && token.length > 2) {
          wordCounts[token] = (wordCounts[token] || 0) + 1;
        }
      });
    });
    
    importantWords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([word, count]) => ({ word, count }));
      
    console.log('☁️ CSV Words:', importantWords.length);
  }

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
    const records = splitCsvIntoRecords(raw);
    console.log('Records:', records.length);

    if (records.length < 2) return [];

    // 1) Read header and detect columns
    const headerCols = parseCsvLine(records[0]).map(h => h.trim().toLowerCase());
    console.log('Header cols:', headerCols);

    // Adjust these to your real header names
    const commentIdx = headerCols.findIndex(h =>
      h.includes('coment') || h.includes('texto') || h.includes('reclama')
    );
    const catIdx = headerCols.findIndex(h =>
      h.includes('categ') || h.includes('class') || h.includes('label')
    );
    console.log('commentIdx:', commentIdx, 'catIdx:', catIdx);

    const rows = [];

    for (let i = 1; i < records.length; i++) {
      const cols = parseCsvLine(records[i]);

      // Pick comment column
      const commentRaw =
        commentIdx >= 0 ? (cols[commentIdx] || '') : (cols[0] || '');
      const comment = commentRaw.replace(/^"|"$/g, '').trim();
      if (comment.length <= 2) continue;

      // Pick category column if present
      let classificacao = '';
      if (catIdx >= 0 && cols[catIdx] != null) {
        classificacao = cols[catIdx].replace(/^"|"$/g, '').trim().toLowerCase();
      }

      // If there is no category column or it's nonsense, fallback
      if (!classificacao || classificacao.length > 40) {
        classificacao = 'sem_categoria';
      }

      rows.push({ rawComment: comment, originalClass: classificacao });
    }

    console.log('Parsed comments:', rows.length);
    return rows;
  }

  function parseCsvLine(line) {
    const columns = [];
    let col = '';
    let inQuotes = false;
    
    // 🔥 CHANGE THIS: ',' → ';'
    const SEP = ';';  // ← WAS ','

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === SEP && !inQuotes) {  // Now splits on ';'
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