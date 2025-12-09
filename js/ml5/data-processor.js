// js/ml5/data-processor.js - 2-COLUMN CSV + FUTURE-PROOF FOR 3 COLUMNS
export function initDataProcessor() {
  const fileInput = document.getElementById("fileInput");
  const processBtn = document.getElementById("processBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const logEl = document.getElementById("log");
  const previewList = document.getElementById("previewList");
  const removeShortChk = document.getElementById("removeShort");
  const trainNewDatasetBtn = document.getElementById("trainNewDatasetBtn");

  let rawLines = [];
  let cleanedData = [];
  let language = null;
  let inputFileName = null;

  const stopwordsPT = new Set([
    "a","o","e","as","os","um","uma","uns","umas","de","do","da","dos","das","em","no","na","nos","nas",
    "por","para","com","sem","sob","sobre","entre","até","ao","aos","à","às","que","quem","onde",
    "como","quando","se","mais","menos","também","já","muito","muita","muitos","muitas","me","te",
    "nos","vos","lhe","lhes","sou","é","era","foi","foram","ser","estar","está","estavam","tem","têm",
    "isso","isto","aquele","aquela","aquilo","há","porquê"
  ]);

  const stopwordsEN = new Set([
    "a","an","the","and","or","but","if","in","on","to","with","is","are","was","were","be","been",
    "of","for","as","at","by","from","that","this","these","those","it","its","he","she","they","we",
    "you","i","me","my","mine","your","yours","our","ours","their","theirs","have","has","had","do",
    "does","did","so","such","too","very","no","not","than","then","there","here","when","where","why","how"
  ]);

  const labelMapPT = {
    "positivo": "positivo", "positivo.": "positivo",
    "negativo": "negativo", "negativo.": "negativo",
    "neutro": "neutro", "neutro.": "neutro",
    "positive": "positivo", "negative": "negativo", "neutral": "neutro"
  };

  function log(msg) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clearLog() { logEl.textContent = ""; }

  function removeQuotes(str) {
    return str.replace(/^[\s"“”'‘’\u201C\u201D\u2018\u2019]+|[\s"“”'‘’\u201C\u201D\u2018\u2019]+$/g, "");
  }

  function normalizeUnicode(str) {
    try { return str.normalize("NFC").trim(); } catch (e) { return str.trim(); }
  }

  function cleanPunctuationKeepAccents(text) {
    try { return text.replace(/[^\p{L}\p{N}\s]+/gu, " "); }
    catch (e) { return text.replace(/[^\w\sÀ-ÿ]+/gi, " "); }
  }

  function tokenize(text) { return text.split(/\s+/).filter(Boolean); }

  function generateBigrams(tokens) {
    const bigrams = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.push(tokens[i] + "_" + tokens[i + 1]);
    }
    return bigrams;
  }

  function preprocessText(raw, lang, removeShortTokens = true) {
    if (!raw) return "";
    let t = normalizeUnicode(raw).toLowerCase();
    t = removeQuotes(t);
    t = cleanPunctuationKeepAccents(t);
    
    let tokens = tokenize(t);
    const stopSet = lang === 'pt' ? stopwordsPT : stopwordsEN;
    
    tokens = tokens.filter(tok => {
      if (stopSet.has(tok) && !(lang === 'pt' && tok === 'não') && !(lang === 'en' && tok === 'not')) return false;
      if (removeShortTokens && tok.length <= 1) return false;
      return true;
    });
    
    const bigrams = generateBigrams(tokens);
    return tokens.concat(bigrams).join(" ");
  }

  function joinMultilineComments(rawText) {
    const lines = rawText.split(/\r?\n/);
    const joinedLines = [];
    let buffer = "";
    const labelPattern = /^(positivo|negativo|neutro|positive|negative|neutral)\s*[;,]/i;
    
    for (const line of lines) {
      if (labelPattern.test(line)) {
        if (buffer) joinedLines.push(buffer);
        buffer = line.trim();
      } else {
        buffer += ' ' + line.trim();
      }
    }
    if (buffer) joinedLines.push(buffer);
    return joinedLines;
  }

  function resetState() {
    rawLines = []; cleanedData = []; language = null; inputFileName = null;
    clearLog(); previewList.innerHTML = "";
    downloadBtn.disabled = true; processBtn.disabled = true;
    trainNewDatasetBtn.disabled = true; trainNewDatasetBtn.textContent = "🚀 Train New Model";
  }

  // File input - handles CSV headers
  fileInput.addEventListener("change", (evt) => {
    resetState();
    const file = evt.target.files[0];
    if (!file) return;

    inputFileName = file.name;
    const reader = new FileReader();

    reader.onload = function(e) {
      let raw = e.target.result;
      rawLines = joinMultilineComments(raw)
        .map(line => line.trim())
        .filter(line => line);

      if (rawLines.length === 0) {
        log("Empty file.");
        return;
      }

      // Check header for language (first line)
      const firstLine = rawLines[0].toLowerCase();
      if (firstLine.includes("pt") || firstLine.includes("português")) {
        language = "pt"; log("Detected language: Portuguese (pt)");
      } else if (firstLine.includes("en") || firstLine.includes("english")) {
        language = "en"; log("Detected language: English (en)");
      } else {
        // Auto-detect from sentiment labels
        const hasPT = rawLines.some(line => /negativo|positivo|neutro/.test(line));
        const hasEN = rawLines.some(line => /negative|positive|neutral/.test(line));
        if (hasPT) { language = "pt"; log("Auto-detected Portuguese (pt)"); }
        else if (hasEN) { language = "en"; log("Auto-detected English (en)"); }
        else { log('Could not detect language. Add "pt" or "en" to first line.'); return; }
      }

      log(`File loaded. ${rawLines.length} data lines.`);
      processBtn.disabled = false;
    };

    reader.readAsText(file, 'UTF-8');
  });

  // 🔥 MAIN PROCESSOR: 2-COLUMN CSV (sentimento,comentário) + FUTURE-PROOF
  processBtn.addEventListener("click", () => {
    if (!rawLines || !language) {
      alert("Please load a valid file first.");
      return;
    }

    cleanedData = []; clearLog(); log(`Starting processing (${language}).`);
    processBtn.disabled = true;
    const removeShortTokens = removeShortChk.checked;
    let labelCounts = {};

    rawLines.forEach((line, i) => {
      if (!line || line.trim() === "") return;
      
      // 🔥 2-COLUMN CSV: sentimento,comentário
      const commaParts = line.split(',');
      if (commaParts.length >= 2) {
        const sentimentRaw = commaParts[0].trim().toLowerCase();
        const textRaw = commaParts.slice(1).join(',').trim(); // Join rest for comments with commas
        
        const mappedLabel = labelMapPT[sentimentRaw] || sentimentRaw;
        if (!["positivo", "negativo", "neutro"].includes(mappedLabel)) {
          log(`Line ${i+1} skipped: unknown label "${sentimentRaw}"`);
          return;
        }

        const cleanedText = preprocessText(removeQuotes(textRaw), language, removeShortTokens);
        if (!cleanedText?.trim()) {
          log(`Line ${i+1} skipped: empty after cleaning`);
          return;
        }

        cleanedData.push({ label: mappedLabel, text: cleanedText });
        labelCounts[mappedLabel] = (labelCounts[mappedLabel] || 0) + 1;
        return; // ✅ CSV success
      }
      
      // Fallback: semicolon format
      const idx = line.indexOf(';');
      if (idx === -1) {
        log(`Line ${i+1} skipped: needs "sentiment,comment" or "sentiment;comment" format`);
        return;
      }
      
      const labelRaw = line.slice(0, idx).trim().toLowerCase();
      const textRaw = removeQuotes(line.slice(idx + 1).trim());
      const mappedLabel = labelMapPT[labelRaw] || labelRaw;
      
      if (!["positivo", "negativo", "neutro"].includes(mappedLabel)) {
        log(`Line ${i+1} skipped: unknown label "${labelRaw}"`);
        return;
      }
      
      const cleanedText = preprocessText(textRaw, language, removeShortTokens);
      if (!cleanedText?.trim()) return;
      
      cleanedData.push({ label: mappedLabel, text: cleanedText });
      labelCounts[mappedLabel] = (labelCounts[mappedLabel] || 0) + 1;
    });

    log(`✅ Processing finished. ${cleanedData.length} valid examples.`);
    log("Label counts:");
    Object.entries(labelCounts).forEach(([k, v]) => log(`  ${k}: ${v}`));

    previewList.innerHTML = "";
    cleanedData.slice(0, 20).forEach(d => {
      const li = document.createElement("li");
      li.textContent = `${d.label} — ${d.text.substring(0, 80)}...`;
      previewList.appendChild(li);
    });

    downloadBtn.disabled = cleanedData.length === 0;
    processBtn.disabled = false;
    trainNewDatasetBtn.disabled = cleanedData.length === 0;
  });

  // Download processed data
  downloadBtn.addEventListener("click", () => {
    if (!cleanedData?.length) return;
    const baseName = inputFileName?.replace(/\.[^/.]+$/, "") || `reviews_cleaned_${language}`;
    const name = `${baseName}.json`;
    const blob = new Blob([JSON.stringify(cleanedData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
    log(`✅ Downloaded ${name} (${cleanedData.length} examples)`);
  });

  // Export for ML training
  trainNewDatasetBtn.addEventListener("click", () => {
  if (!cleanedData?.length) {
    log("❌ No processed data! Process file first.");
    return;
  }
  
  // 🔥 CLOSE MODAL BEFORE TRAINING
  //document.getElementById('dataModal').classList.remove('active');
  
  window.cleanedTrainingData = cleanedData.map(item => ({
    label: item.label,
    text: item.text
  }));
  
  log(`✅ ${cleanedData.length} examples queued for training!`);
  trainNewDatasetBtn.textContent = "📤 Data Sent → Training...";
  trainNewDatasetBtn.disabled = true;
  
  window.dispatchEvent(new CustomEvent('newTrainingDataReady'));
});

  resetState();
  console.log("🔄 Data processor ready (2-column CSV + future-proof)");
}
