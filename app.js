/* ============================================================
   GUIRROS — app.js
   Main application logic
   ============================================================ */

'use strict';

// ─── Particles ───────────────────────────────────────────────
(function initParticles() {
  const container = document.getElementById('particles');
  const colors = ['#00f5ff', '#a855f7', '#ff2d78', '#0080ff', '#39ff14'];
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    const size = Math.random() * 4 + 1;
    el.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration:${Math.random() * 15 + 10}s;
      animation-delay:${Math.random() * 15}s;
      box-shadow: 0 0 ${size * 3}px currentColor;
    `;
    container.appendChild(el);
  }
})();

// ─── Navbar scroll ────────────────────────────────────────────
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
});

// ─── Mobile nav toggle ────────────────────────────────────────
document.getElementById('navToggle').addEventListener('click', () => {
  document.querySelector('.nav-links').classList.toggle('open');
});
document.querySelectorAll('.nav-link').forEach(l => {
  l.addEventListener('click', () => document.querySelector('.nav-links').classList.remove('open'));
});

// ─── Active nav link on scroll ───────────────────────────────
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(l => {
        l.classList.toggle('active', l.dataset.section === e.target.id);
      });
    }
  });
}, { threshold: 0.4 });
sections.forEach(s => observer.observe(s));

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── Tab switching ────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'gis-map') {
      if (typeof initGisMap === 'function') {
        initGisMap();
      }
    } else if (btn.dataset.tab === 'topologias') {
      if (typeof initTopologiasTool === 'function') {
        initTopologiasTool();
      }
    } else if (btn.dataset.tab === 'massivas') {
      if (typeof initMassivasTool === 'function') {
        initMassivasTool();
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════
//  TOOL 1 — KMZ CALC
// ══════════════════════════════════════════════════════════════

const kmzDrop  = document.getElementById('kmz-drop');
const kmzInput = document.getElementById('kmz-input');

// Click to open file dialog
kmzDrop.addEventListener('click', () => kmzInput.click());
kmzDrop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') kmzInput.click(); });

// Drag & Drop
['dragenter','dragover'].forEach(ev => {
  kmzDrop.addEventListener(ev, e => { e.preventDefault(); kmzDrop.classList.add('drag-over'); });
});
['dragleave','drop'].forEach(ev => {
  kmzDrop.addEventListener(ev, e => { e.preventDefault(); kmzDrop.classList.remove('drag-over'); });
});
kmzDrop.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  if (file) processKMZ(file);
});
kmzInput.addEventListener('change', e => {
  if (e.target.files[0]) processKMZ(e.target.files[0]);
});

document.getElementById('kmz-clear-btn').addEventListener('click', () => {
  document.getElementById('kmz-results').classList.add('hidden');
  kmzInput.value = '';
});
document.getElementById('kmz-copy-btn').addEventListener('click', () => {
  const items = document.querySelectorAll('.lance-item');
  let txt = 'Lançamentos de Cabos\n';
  txt += '='.repeat(40) + '\n';
  items.forEach(item => {
    txt += `${item.querySelector('.lance-name').textContent}  →  ${item.querySelector('.lance-dist').textContent}\n`;
  });
  txt += '='.repeat(40) + '\n';
  txt += `TOTAL GERAL: ${document.getElementById('kmz-total').textContent}`;
  navigator.clipboard.writeText(txt).then(() => showToast('✓ Resultados copiados!', 'success'));
});

/**
 * Haversine distance in meters between two lat/lon points
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Parse coordinates from a KML string (comma-separated lon,lat,alt triplets)
 */
function parseCoords(coordStr) {
  return coordStr.trim().split(/\s+/).map(triplet => {
    const [lon, lat] = triplet.split(',').map(Number);
    return { lat, lon };
  }).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
}

/**
 * Calculate total distance (meters) for an array of {lat,lon} points
 */
function calcLineDistance(points) {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += haversine(points[i-1].lat, points[i-1].lon, points[i].lat, points[i].lon);
  }
  return dist;
}

async function processKMZ(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  let kmlText;

  try {
    if (ext === 'kmz') {
      // KMZ is a ZIP file — use JSZip if available, otherwise try raw
      if (typeof JSZip !== 'undefined') {
        const zip = await JSZip.loadAsync(file);
        const kmlFile = Object.values(zip.files).find(f => f.name.endsWith('.kml'));
        if (!kmlFile) throw new Error('Nenhum arquivo KML encontrado dentro do KMZ.');
        kmlText = await kmlFile.async('string');
      } else {
        // Fallback: try to decompress with DecompressionStream (modern browsers)
        const buffer = await file.arrayBuffer();
        kmlText = await decompressKMZ(buffer);
      }
    } else {
      kmlText = await file.text();
    }
    renderKMZResults(kmlText, file.name);
  } catch (err) {
    showToast('❌ Erro ao processar arquivo: ' + err.message, 'error');
    console.error(err);
  }
}

async function decompressKMZ(buffer) {
  // Try DecompressionStream API (Chromium 80+)
  try {
    // KMZ is actually a ZIP. We'll try to find the KML via manual ZIP parsing
    return parseZipForKML(buffer);
  } catch(e) {
    throw new Error('Não foi possível descompactar o KMZ. Use formato KML direto ou instale suporte adicional.');
  }
}

/**
 * Minimal ZIP parser to extract first .kml file
 */
function parseZipForKML(buffer) {
  const bytes = new Uint8Array(buffer);
  const dec = new TextDecoder();
  let offset = 0;

  while (offset < bytes.length - 4) {
    // Local file header signature: PK\x03\x04
    if (bytes[offset] === 0x50 && bytes[offset+1] === 0x4B &&
        bytes[offset+2] === 0x03 && bytes[offset+3] === 0x04) {
      const comprMethod  = bytes[offset+8] | (bytes[offset+9] << 8);
      const compSize     = readUint32(bytes, offset + 18);
      const uncompSize   = readUint32(bytes, offset + 22);
      const fnLen        = readUint16(bytes, offset + 26);
      const extraLen     = readUint16(bytes, offset + 28);
      const filename     = dec.decode(bytes.slice(offset + 30, offset + 30 + fnLen));
      const dataOffset   = offset + 30 + fnLen + extraLen;

      if (filename.endsWith('.kml')) {
        if (comprMethod === 0) {
          // Stored (no compression)
          return dec.decode(bytes.slice(dataOffset, dataOffset + uncompSize));
        } else if (comprMethod === 8) {
          // Deflate
          const compData = bytes.slice(dataOffset, dataOffset + compSize);
          return inflateDeflate(compData);
        }
      }
      offset = dataOffset + compSize;
    } else {
      offset++;
    }
  }
  throw new Error('Arquivo KML não encontrado no KMZ.');
}

function readUint16(bytes, off) { return bytes[off] | (bytes[off+1] << 8); }
function readUint32(bytes, off) { return bytes[off] | (bytes[off+1] << 8) | (bytes[off+2] << 16) | (bytes[off+3] << 24); }

function inflateDeflate(data) {
  // Use DecompressionStream with raw deflate
  return new Promise((resolve, reject) => {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    const chunks = [];
    writer.write(data);
    writer.close();
    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          const dec = new TextDecoder();
          resolve(dec.decode(concatUint8Arrays(chunks)));
        } else {
          chunks.push(value);
          read();
        }
      }).catch(reject);
    }
    read();
  });
}
function concatUint8Arrays(arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

function renderKMZResults(kmlText, filename) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'text/xml');

  if (doc.querySelector('parsererror')) {
    showToast('❌ Arquivo KML inválido ou corrompido.', 'error');
    return;
  }

  // Find all Placemarks with LineString or MultiGeometry
  const placemarks = Array.from(doc.querySelectorAll('Placemark'));
  const lances = [];

  placemarks.forEach((pm, idx) => {
    const nameEl = pm.querySelector('name');
    const name = nameEl ? nameEl.textContent.trim() : `Lance ${idx + 1}`;

    // Collect all coordinate strings (LineString + MultiGeometry lines)
    const coordNodes = pm.querySelectorAll('LineString > coordinates, LinearRing > coordinates');
    if (coordNodes.length === 0) return; // skip Points

    let totalDist = 0;
    coordNodes.forEach(cn => {
      const pts = parseCoords(cn.textContent);
      totalDist += calcLineDistance(pts);
    });

    if (totalDist > 0) {
      lances.push({ name, dist: totalDist });
    }
  });

  // Also check for standalone Folders that group things
  if (lances.length === 0) {
    // Try to find any coordinates
    const allCoordNodes = Array.from(doc.querySelectorAll('coordinates'));
    allCoordNodes.forEach((cn, idx) => {
      const pts = parseCoords(cn.textContent);
      const dist = calcLineDistance(pts);
      if (dist > 0) {
        const pm = cn.closest('Placemark');
        const nameEl = pm ? pm.querySelector('name') : null;
        const name = nameEl ? nameEl.textContent.trim() : `Lance ${idx + 1}`;
        lances.push({ name, dist });
      }
    });
  }

  if (lances.length === 0) {
    showToast('⚠️ Nenhum lançamento (LineString) encontrado no arquivo.', 'error');
    return;
  }

  const list = document.getElementById('lances-list');
  list.innerHTML = '';

  let totalDist = 0;
  lances.forEach((lance, i) => {
    totalDist += lance.dist;
    const item = document.createElement('div');
    item.className = 'lance-item';
    item.style.animationDelay = `${i * 40}ms`;
    item.innerHTML = `
      <span class="lance-num">${i + 1}</span>
      <span class="lance-name" title="${lance.name}">${lance.name}</span>
      <span class="lance-dist">${formatMeters(lance.dist)}</span>
    `;
    list.appendChild(item);
  });

  document.getElementById('kmz-total').textContent = formatMeters(totalDist);
  document.getElementById('kmz-results').classList.remove('hidden');
  showToast(`✓ ${lances.length} lançamento(s) calculado(s)`, 'success');
}

function formatMeters(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(3).replace('.', ',')} km (${Math.round(m).toLocaleString('pt-BR')} m)`;
  return `${m.toFixed(2).replace('.', ',')} m`;
}

// ══════════════════════════════════════════════════════════════
//  TOOL 2 — EXCEL EXTRACTOR
// ══════════════════════════════════════════════════════════════

const erDrop  = document.getElementById('excel-drop');
const erInput = document.getElementById('excel-reader-input');
let erFiles = [];

erDrop.addEventListener('click', () => erInput.click());
erDrop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') erInput.click(); });
['dragenter','dragover'].forEach(ev => {
  erDrop.addEventListener(ev, e => { e.preventDefault(); erDrop.classList.add('drag-over'); });
});
['dragleave','drop'].forEach(ev => {
  erDrop.addEventListener(ev, e => { e.preventDefault(); erDrop.classList.remove('drag-over'); });
});
erDrop.addEventListener('drop', e => {
  addERFiles(Array.from(e.dataTransfer.files));
});
erInput.addEventListener('change', e => {
  addERFiles(Array.from(e.target.files));
  erInput.value = '';
});

function addERFiles(files) {
  const validFiles = files.filter(f => /\.(xlsm|xlsx|xls|ods)$/i.test(f.name));
  if (validFiles.length === 0) { showToast('❌ Nenhum arquivo Excel válido selecionado.', 'error'); return; }
  erFiles = [...erFiles, ...validFiles];
  updateERFilesBar();
}

function updateERFilesBar() {
  const bar = document.getElementById('excel-reader-files-bar');
  const runBtn = document.getElementById('excel-reader-run');
  if (erFiles.length > 0) {
    bar.classList.remove('hidden');
    document.getElementById('excel-reader-file-count').textContent =
      `${erFiles.length} arquivo(s) carregado(s): ${erFiles.map(f => f.name).join(', ')}`;
    runBtn.disabled = false;
  } else {
    bar.classList.add('hidden');
    runBtn.disabled = true;
  }
}

document.getElementById('excel-reader-clear').addEventListener('click', () => {
  erFiles = [];
  updateERFilesBar();
  document.getElementById('excel-reader-results').classList.add('hidden');
});

document.getElementById('excel-reader-run').addEventListener('click', runExcelExtractor);

async function runExcelExtractor() {
  const sheet = document.getElementById('er-sheet').value.trim();
  const row   = parseInt(document.getElementById('er-row').value);
  const col   = parseInt(document.getElementById('er-col').value);

  if (!sheet) { showToast('⚠️ Informe o nome da planilha.', 'error'); return; }
  if (isNaN(row) || row < 1) { showToast('⚠️ Informe um número de linha válido.', 'error'); return; }
  if (isNaN(col) || col < 1) { showToast('⚠️ Informe um número de coluna válido.', 'error'); return; }
  if (erFiles.length === 0) { showToast('⚠️ Nenhum arquivo carregado.', 'error'); return; }

  const list = document.getElementById('er-values-list');
  list.innerHTML = '';
  let total = 0;
  let numericCount = 0;

  for (let i = 0; i < erFiles.length; i++) {
    const file = erFiles[i];
    const item = document.createElement('div');
    item.className = 'value-item';
    item.style.animationDelay = `${i * 40}ms`;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });

      // Find sheet (case-insensitive)
      const sheetName = wb.SheetNames.find(n => n.toLowerCase() === sheet.toLowerCase()) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];

      if (!ws) throw new Error(`Aba "${sheet}" não encontrada`);

      // XLSX uses A1 notation; convert row/col to cell address
      const cellAddr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
      const cell = ws[cellAddr];
      const value = cell ? cell.v : null;
      const displayValue = (value === null || value === undefined) ? '(vazio)' : value;
      const colLabel = XLSX.utils.encode_col(col - 1);

      item.innerHTML = `
        <span class="lance-num">${i + 1}</span>
        <span class="value-filename" title="${file.name}">${file.name}</span>
        <span class="value-cell-ref">${sheetName} · ${colLabel}${row}</span>
        <span class="value-val">${typeof displayValue === 'number' ? displayValue.toLocaleString('pt-BR') : displayValue}</span>
      `;

      if (typeof value === 'number') {
        total += value;
        numericCount++;
      }
    } catch (err) {
      item.classList.add('error');
      item.innerHTML = `
        <span class="lance-num">${i + 1}</span>
        <span class="value-filename" title="${file.name}">${file.name}</span>
        <span class="value-cell-ref">—</span>
        <span class="value-val">Erro: ${err.message}</span>
      `;
    }
    list.appendChild(item);
  }

  const totalEl = document.getElementById('er-total');
  if (numericCount > 0) {
    totalEl.textContent = total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } else {
    totalEl.textContent = '(sem valores numéricos)';
  }
  document.getElementById('excel-reader-results').classList.remove('hidden');
  showToast(`✓ ${erFiles.length} arquivo(s) processado(s)`, 'success');
}

document.getElementById('er-copy-btn').addEventListener('click', () => {
  const items = document.querySelectorAll('.value-item');
  let txt = 'Excel Extractor — Resultados\n' + '='.repeat(50) + '\n';
  items.forEach(item => {
    const name = item.querySelector('.value-filename').textContent;
    const ref  = item.querySelector('.value-cell-ref').textContent;
    const val  = item.querySelector('.value-val').textContent;
    txt += `${name}  [${ref}]  →  ${val}\n`;
  });
  txt += '='.repeat(50) + '\n';
  txt += `SOMA TOTAL: ${document.getElementById('er-total').textContent}`;
  navigator.clipboard.writeText(txt).then(() => showToast('✓ Resultados copiados!', 'success'));
});

// ══════════════════════════════════════════════════════════════
//  TOOL 3 — EXCEL → PDF
// ══════════════════════════════════════════════════════════════

const pdfDrop  = document.getElementById('pdf-drop');
const pdfInput = document.getElementById('pdf-input');
let pdfFiles = []; // Armazena { file, sheetNames, selectedSheets }

const CONVERT_API_SECRET = 'zsCLCdS0zAy5ydOzVRWudQ2AZg9w0oLz';

pdfDrop.addEventListener('click', () => pdfInput.click());
pdfDrop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') pdfInput.click(); });
['dragenter','dragover'].forEach(ev => {
  pdfDrop.addEventListener(ev, e => { e.preventDefault(); pdfDrop.classList.add('drag-over'); });
});
['dragleave','drop'].forEach(ev => {
  pdfDrop.addEventListener(ev, e => { e.preventDefault(); pdfDrop.classList.remove('drag-over'); });
});
pdfDrop.addEventListener('drop', e => {
  addPDFFiles(Array.from(e.dataTransfer.files));
});
pdfInput.addEventListener('change', e => {
  addPDFFiles(Array.from(e.target.files));
  pdfInput.value = '';
});

async function addPDFFiles(files) {
  const validFiles = files.filter(f => /\.(xlsm|xlsx|xls|ods)$/i.test(f.name));
  if (validFiles.length === 0) { showToast('❌ Nenhum arquivo Excel válido selecionado.', 'error'); return; }

  for (const file of validFiles) {
    try {
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      
      const sheetNames = [];
      wb.eachSheet((worksheet) => { sheetNames.push(worksheet.name); });
      
      pdfFiles.push({ file, sheetNames, selectedSheets: [sheetNames[0]] });
    } catch (err) {
      console.error(err);
      showToast(`❌ Erro ao ler abas de ${file.name}`, 'error');
    }
  }
  renderPDFFileList();
}

function renderPDFFileList() {
  const container = document.getElementById('pdf-files-items');
  container.innerHTML = '';

  pdfFiles.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.className = 'pdf-file-row';

    const sheetsHTML = entry.sheetNames.map(n => `
      <label style="margin-right: 12px; font-size: 13px; display: inline-flex; align-items: center; cursor: pointer;">
        <input type="checkbox" class="pdf-sheet-cb" data-idx="${idx}" value="${n}" 
          ${entry.selectedSheets.includes(n) ? 'checked' : ''} style="margin-right: 4px;">
        ${n}
      </label>
    `).join('');

    row.innerHTML = `
      <div class="pdf-file-icon">📊</div>
      <div style="display: flex; flex-direction: column; flex-grow: 1; overflow: hidden;">
        <span class="pdf-file-name" title="${entry.file.name}" style="font-weight: bold; margin-bottom: 5px;">${entry.file.name}</span>
        <div class="pdf-sheets-list" style="display: flex; flex-wrap: wrap;">${sheetsHTML}</div>
      </div>
      <button class="pdf-remove-btn" data-idx="${idx}" title="Remover">✕</button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.pdf-sheet-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      const idx = +e.target.dataset.idx;
      const val = e.target.value;
      if (e.target.checked) {
        if (!pdfFiles[idx].selectedSheets.includes(val)) pdfFiles[idx].selectedSheets.push(val);
      } else {
        pdfFiles[idx].selectedSheets = pdfFiles[idx].selectedSheets.filter(s => s !== val);
      }
    });
  });

  container.querySelectorAll('.pdf-remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      pdfFiles.splice(+e.target.dataset.idx, 1);
      renderPDFFileList();
      if (pdfFiles.length === 0) document.getElementById('pdf-files-list').classList.add('hidden');
    });
  });

  if (pdfFiles.length > 0) document.getElementById('pdf-files-list').classList.remove('hidden');
}

document.getElementById('pdf-clear-all').addEventListener('click', () => {
  pdfFiles = [];
  document.getElementById('pdf-files-list').classList.add('hidden');
  document.getElementById('pdf-files-items').innerHTML = '';
});

document.getElementById('pdf-export-btn').addEventListener('click', exportAllToPDF);

async function exportAllToPDF() {
  if (pdfFiles.length === 0) { showToast('⚠️ Nenhum arquivo carregado.', 'error'); return; }
  if (CONVERT_API_SECRET === 'SEU_TOKEN_AQUI') { showToast('⚠️ Configure o token da API no código!', 'error'); return; }

  const progressDiv  = document.getElementById('pdf-progress');
  const progressBar  = document.getElementById('pdf-bar');
  const progressText = document.getElementById('pdf-progress-text');
  const exportBtn    = document.getElementById('pdf-export-btn');

  progressDiv.classList.remove('hidden');
  exportBtn.disabled = true;

  for (let i = 0; i < pdfFiles.length; i++) {
    const entry = pdfFiles[i];
    progressBar.style.width = Math.round(((i) / pdfFiles.length) * 100) + '%';
    progressText.textContent = `Convertendo ${i + 1}/${pdfFiles.length}: ${entry.file.name}... (Isso pode levar alguns segundos)`;

    try {
      await processAndDownloadPDF(entry);
    } catch (err) {
      console.error(err);
      showToast(`❌ Erro em ${entry.file.name}: ${err.message}`, 'error');
    }
  }

  progressBar.style.width = '100%';
  progressText.textContent = `✓ ${pdfFiles.length} PDF(s) exportado(s) com sucesso!`;
  exportBtn.disabled = false;
  setTimeout(() => progressDiv.classList.add('hidden'), 4000);
}

// Função que chama a API e junta as abas
async function processAndDownloadPDF(entry) {
  if (entry.selectedSheets.length === 0) throw new Error("Nenhuma aba selecionada");

  const pdfsBase64 = [];
  
  // Pega a extensão original
  const extensaoOriginal = entry.file.name.split('.').pop().toLowerCase();
  
  // TRUQUE: Se for .xlsm ou .xlsb, forçamos a API a processar no motor de .xlsx
  // Isso burla o bloqueio de parâmetros da API mantendo o arquivo intacto.
  const isMacro = (extensaoOriginal === 'xlsm' || extensaoOriginal === 'xlsb');
  const endpointFormat = isMacro ? 'xlsx' : extensaoOriginal;

  // Passo 1: Converte cada aba individualmente através da API
  for (const sheetName of entry.selectedSheets) {
    const formData = new FormData();
    
    // Se for arquivo com macro, enviamos o arquivo renomeado temporariamente para .xlsx
    if (isMacro) {
      const nomeMascarado = entry.file.name.replace(new RegExp(`\\.${extensaoOriginal}$`, 'i'), '.xlsx');
      formData.append('File', entry.file, nomeMascarado);
    } else {
      formData.append('File', entry.file);
    }
    
    // Pede para a API exportar exatamente esta aba
    formData.append('WorksheetName', sheetName); 

    const response = await fetch(`https://v2.convertapi.com/convert/${endpointFormat}/to/pdf?Secret=${CONVERT_API_SECRET}`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    
    // NOVO: Tratamento de Erro Detalhado!
    if (result.Code && result.Code !== 200) {
      let detalhes = "";
      // Se a API listar os parâmetros inválidos, nós extraímos para o erro
      if (result.InvalidParameters) {
        detalhes = " ➡️ " + Object.keys(result.InvalidParameters)
          .map(k => `${k}: ${result.InvalidParameters[k].join(', ')}`)
          .join(' | ');
      }
      throw new Error(`Erro na API: ${result.Message}${detalhes}`);
    }
    
    if (result.Files && result.Files.length > 0) {
      // Guarda o arquivo PDF codificado em Base64
      pdfsBase64.push(result.Files[0].FileData);
    } else {
      throw new Error("Falha desconhecida na conversão da API");
    }
  }

  // Passo 2: Se tem mais de uma aba, usa o pdf-lib para juntar todas em um arquivo só
  const { PDFDocument } = PDFLib;
  const finalPdf = await PDFDocument.create();

  for (const b64 of pdfsBase64) {
    // Transforma Base64 de volta em arquivo
    const pdfBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const srcDoc = await PDFDocument.load(pdfBytes);
    
    // Copia todas as páginas deste PDF e cola no PDF final
    const copiedPages = await finalPdf.copyPages(srcDoc, srcDoc.getPageIndices());
    copiedPages.forEach(page => finalPdf.addPage(page));
  }

  // Passo 3: Faz o download para o usuário
  const pdfBytesFinal = await finalPdf.save();
  const blob = new Blob([pdfBytesFinal], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  const pdfName = entry.file.name.replace(/\.(xlsm|xlsx|xls|ods)$/i, '') + `.pdf`;
  link.download = pdfName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function showToast(msg, type) {
  // Ajuste de acordo com o seu sistema de notificações
  alert(msg);
}

// ══════════════════════════════════════════════════════════════
//  TOOL 4 — GIS SHP MAP & KMZ EXPORTER
// ══════════════════════════════════════════════════════════════

let gisMap = null;
let gisTileLayers = {};
let gisLayers = {};          // layerId -> { id, name, color, geoJson, leafletLayer, visible }
let selectedFeatures = [];   // array of { feature, layerId, layerName, color }
let selectionOverlayLayer = null;
let activeDrawHandler = null;

/**
 * Main GIS Map Initialization
 */
function initGisMap() {
  if (gisMap) {
    setTimeout(() => gisMap.invalidateSize(), 150);
    return;
  }

  // 1. Create Leaflet Map centered in Midwest Brazil (DF / GO region)
  gisMap = L.map('gis-map', {
    center: [-15.7975, -47.8919],
    zoom: 7,
    zoomControl: true,
    attributionControl: false
  });

  // 2. Define Tile Layers
  gisTileLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd'
  });

  gisTileLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18
  });

  gisTileLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  });

  // Add default (Dark)
  gisTileLayers.dark.addTo(gisMap);

  // 3. Selection Highlights Layer Group
  selectionOverlayLayer = L.featureGroup().addTo(gisMap);

  // 4. Setup Basemap Switcher Listeners
  document.querySelectorAll('.basemap-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.basemap-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const mode = btn.dataset.basemap;
      Object.values(gisTileLayers).forEach(tl => gisMap.removeLayer(tl));

      if (gisTileLayers[mode]) {
        gisTileLayers[mode].addTo(gisMap);
      }
    });
  });

  // 5. Setup Preset Layer Manager — individual load buttons + toggle switches
  initPresetLayerManager();

  // 6. Setup File Upload Button for Custom SHP / ZIP ("Importar outro arquivo")
  const shpUploadBtn = document.getElementById('gis-upload-shp-btn');
  const shpFileInput = document.getElementById('gis-shp-file-input');

  shpUploadBtn.addEventListener('click', () => shpFileInput.click());
  shpFileInput.addEventListener('change', handleUserShpUpload);

  // 7. Setup Selection Tool Buttons
  document.getElementById('gis-tool-select-rect').addEventListener('click', toggleRectangleSelectMode);
  document.getElementById('gis-tool-clear-select').addEventListener('click', clearGisSelection);
  document.getElementById('btn-export-kmz').addEventListener('click', exportSelectionToKMZ);

  // 8. Setup CAD Drawing Suite Listeners
  document.getElementById('gis-draw-point').addEventListener('click', () => startGisDrawing('Point'));
  document.getElementById('gis-draw-line').addEventListener('click', () => startGisDrawing('LineString'));
  document.getElementById('gis-draw-polygon').addEventListener('click', () => startGisDrawing('Polygon'));

  // 9. Setup Feature Edit Modal Listeners
  setupFeatureEditModal();

  setTimeout(() => gisMap.invalidateSize(), 200);
}

/**
 * Initialise the preset layer manager panel.
 * Each pre-defined layer starts DISABLED (unchecked, no map layer).
 * The user clicks "📂 Carregar" → file picker opens → file parsed → toggle revealed.
 */
function initPresetLayerManager() {
  // Map: layerId -> { label, color, fileInputId }
  const PRESETS = [
    { id: 'postes-go',     label: 'Postes GO',       color: '#00f5ff' },
    { id: 'postes-df',     label: 'Postes DF',       color: '#39ff14' },
    { id: 'postes-mt',     label: 'Postes MT',       color: '#ff2d78' },
    { id: 'postes-mg',     label: 'Postes MG',       color: '#ffb703' },
    { id: 'vital-dutos',   label: 'Dutos Vital DF',  color: '#a855f7' },
    { id: 'vital-caixas',  label: 'Caixas Vital DF', color: '#c084fc' },
  ];

  PRESETS.forEach(preset => {
    const loadBtn  = document.getElementById(`btn-load-${preset.id}`);
    const fileInp  = document.getElementById(`file-${preset.id}`);
    const chk      = document.getElementById(`chk-${preset.id}`);
    const toggle   = document.getElementById(`toggle-${preset.id}`);
    const statusEl = document.getElementById(`status-${preset.id}`);
    const rowEl    = document.getElementById(`lrow-${preset.id}`);

    if (!loadBtn || !fileInp || !chk || !toggle || !statusEl || !rowEl) return;

    // Load button → trigger hidden file input
    loadBtn.addEventListener('click', () => fileInp.click());

    // File selected → parse and add to map (disabled/hidden until toggle turned on)
    fileInp.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      statusEl.className = 'gis-lr-status loading';
      statusEl.textContent = '⏳ Carregando...';
      loadBtn.disabled = true;

      // Collect all files for multi-file SHP (needs .dbf, .prj, etc.)
      const allFiles = files;

      try {
        let geojson = null;
        const mainFile = files[0];
        const ext = mainFile.name.split('.').pop().toLowerCase();

        if (ext === 'gpkg') {
          const buffer = await mainFile.arrayBuffer();
          geojson = await parseGeoPackageBuffer(buffer, mainFile.name);
        } else if (ext === 'kml') {
          const text = await mainFile.text();
          geojson = parseKMLToGeoJSON(text);
        } else if (ext === 'kmz') {
          const buffer = await mainFile.arrayBuffer();
          if (typeof JSZip !== 'undefined') {
            const zip = await JSZip.loadAsync(buffer);
            const kmlFile = Object.values(zip.files).find(f => f.name.endsWith('.kml'));
            if (!kmlFile) throw new Error('Nenhum KML dentro do KMZ.');
            const kmlText = await kmlFile.async('string');
            geojson = parseKMLToGeoJSON(kmlText);
          }
        } else if (ext === 'zip') {
          if (typeof shp !== 'undefined') {
            const buffer = await mainFile.arrayBuffer();
            geojson = await shp(buffer);
          }
        } else if (ext === 'shp') {
          if (typeof shp !== 'undefined') {
            const buffer = await mainFile.arrayBuffer();
            const dbfFile = allFiles.find(f => f.name.toLowerCase().endsWith('.dbf'));
            if (dbfFile) {
              const dbfBuf = await dbfFile.arrayBuffer();
              geojson = await shp.combine([shp.parseShp(buffer), shp.parseDbf(dbfBuf)]);
            } else {
              geojson = await shp.parseShp(buffer);
            }
          }
        }

        const count = Array.isArray(geojson)
          ? geojson.reduce((a, c) => a + (c.features?.length || 0), 0)
          : (geojson?.features?.length || 0);

        if (geojson && count > 0) {
          // Register in gisLayers BUT keep hidden (visible: false)
          addGeoJsonLayer(geojson, preset.id, preset.label, preset.color, false);
          statusEl.className = 'gis-lr-status loaded';
          statusEl.textContent = `✅ ${count.toLocaleString('pt-BR')} feições`;
          loadBtn.classList.add('hidden');
          toggle.classList.remove('hidden');
          rowEl.classList.add('loaded');
          showToast(`✓ "${preset.label}" carregada — ${count.toLocaleString('pt-BR')} feições`, 'success');
        } else {
          throw new Error('Nenhuma feição encontrada no arquivo.');
        }
      } catch (err) {
        console.error(err);
        statusEl.className = 'gis-lr-status';
        statusEl.textContent = '❌ Erro';
        loadBtn.disabled = false;
        showToast(`❌ Erro ao carregar "${preset.label}": ${err.message}`, 'error');
      }

      e.target.value = '';
    });

    // Toggle switch → show or hide the layer on the map
    chk.addEventListener('change', () => {
      toggleGisLayer(preset.id, chk.checked);
    });
  });
}

/**
 * Handle custom SHP / ZIP / GPKG / KMZ / KML upload by user
 */
async function handleUserShpUpload(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  showToast('⏳ Processando arquivo(s) cartográfico(s)...', 'info');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split('.').pop().toLowerCase();
    const layerId = 'custom-file-' + Date.now() + '-' + i;
    const colors = ['#ffb703', '#00f5ff', '#ff2d78', '#39ff14', '#a855f7'];
    const color = colors[i % colors.length];

    try {
      let geojson;

      if (ext === 'kml') {
        const kmlText = await file.text();
        geojson = parseKMLToGeoJSON(kmlText);
      } else if (ext === 'kmz') {
        const buffer = await file.arrayBuffer();
        if (typeof JSZip !== 'undefined') {
          const zip = await JSZip.loadAsync(buffer);
          const kmlFile = Object.values(zip.files).find(f => f.name.endsWith('.kml'));
          if (!kmlFile) throw new Error('Nenhum KML encontrado dentro do KMZ.');
          const kmlText = await kmlFile.async('string');
          geojson = parseKMLToGeoJSON(kmlText);
        } else {
          throw new Error('JSZip não carregado para descompactar KMZ.');
        }
      } else if (ext === 'gpkg') {
        const buffer = await file.arrayBuffer();
        geojson = await parseGeoPackageBuffer(buffer, file.name);
      } else if (ext === 'zip') {
        if (typeof shp !== 'undefined') {
          const buffer = await file.arrayBuffer();
          geojson = await shp(buffer);
        } else {
          throw new Error('shpjs não carregado para ler ZIP/SHP.');
        }
      } else if (ext === 'shp') {
        if (typeof shp !== 'undefined') {
          const buffer = await file.arrayBuffer();
          const dbfFile = files.find(f => f.name.replace(/\.shp$/i, '.dbf') === file.name.replace(/\.shp$/i, '.dbf'));
          if (dbfFile && dbfFile !== file) {
            const dbfBuf = await dbfFile.arrayBuffer();
            geojson = await shp.combine([
              shp.parseShp(buffer),
              shp.parseDbf(dbfBuf)
            ]);
          } else {
            geojson = await shp.parseShp(buffer);
          }
        }
      }

      if (geojson && (geojson.features?.length > 0 || (Array.isArray(geojson) && geojson.length > 0))) {
        addGeoJsonLayer(geojson, layerId, `${ext.toUpperCase()}: ${file.name}`, color);
        addCustomLayerChip(layerId, `${ext.toUpperCase()}: ${file.name}`, color);
        showToast(`✓ Arquivo "${file.name}" carregado com sucesso!`, 'success');
      } else {
        showToast(`⚠️ Nenhum elemento legível encontrado em "${file.name}".`, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(`❌ Erro ao ler ${file.name}: ${err.message}`, 'error');
    }
  }

  e.target.value = '';
}

/**
 * Parses KML text into GeoJSON FeatureCollection
 */
function parseKMLToGeoJSON(kmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'text/xml');
  const placemarks = Array.from(doc.querySelectorAll('Placemark'));
  const features = [];

  placemarks.forEach((pm, idx) => {
    const nameEl = pm.querySelector('name');
    const descEl = pm.querySelector('description');
    const name = nameEl ? nameEl.textContent.trim() : `Elemento #${idx + 1}`;
    const desc = descEl ? descEl.textContent.trim() : '';

    // Properties table
    const props = { NAME: name, DESCRICAO: desc };

    // Try Point
    const pointCoord = pm.querySelector('Point > coordinates');
    if (pointCoord) {
      const parts = pointCoord.textContent.trim().split(/[\s,]+/);
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!isNaN(lon) && !isNaN(lat)) {
        features.push({
          type: 'Feature',
          properties: props,
          geometry: { type: 'Point', coordinates: [lon, lat] }
        });
        return;
      }
    }

    // Try LineString
    const lineCoord = pm.querySelector('LineString > coordinates');
    if (lineCoord) {
      const pts = parseCoords(lineCoord.textContent);
      if (pts.length >= 2) {
        features.push({
          type: 'Feature',
          properties: props,
          geometry: { type: 'LineString', coordinates: pts.map(p => [p.lon, p.lat]) }
        });
        return;
      }
    }

    // Try Polygon
    const polyCoord = pm.querySelector('Polygon coordinates, LinearRing coordinates');
    if (polyCoord) {
      const pts = parseCoords(polyCoord.textContent);
      if (pts.length >= 3) {
        features.push({
          type: 'Feature',
          properties: props,
          geometry: { type: 'Polygon', coordinates: [pts.map(p => [p.lon, p.lat])] }
        });
      }
    }
  });

  return { type: 'FeatureCollection', features: features };
}

/**
 * Fallback GeoPackage ArrayBuffer Parser
 */
async function parseGeoPackageBuffer(buffer, filename) {
  // Extract text or WKT/GeoJSON strings if present in binary
  const dec = new TextDecoder();
  const text = dec.decode(buffer);
  const jsonMatches = text.match(/\{"type"\s*:\s*"FeatureCollection"[\s\S]*?\}/g);

  if (jsonMatches && jsonMatches.length > 0) {
    try {
      return JSON.parse(jsonMatches[0]);
    } catch (e) {}
  }

  // Fallback: search for Placemarks or coordinates
  return parseKMLToGeoJSON(text);
}

/**
 * Add a dynamic chip for uploaded SHP files
 */
function addCustomLayerChip(layerId, name, color) {
  const container = document.getElementById('gis-layer-toggles');
  const label = document.createElement('label');
  label.className = 'gis-chip-btn active';
  label.dataset.layerId = layerId;
  label.innerHTML = `
    <input type="checkbox" checked />
    <span class="chip-dot" style="background:${color};color:${color}"></span> ${name}
  `;

  const chk = label.querySelector('input[type="checkbox"]');
  chk.addEventListener('change', () => {
    label.classList.toggle('active', chk.checked);
    toggleGisLayer(layerId, chk.checked);
  });

  container.appendChild(label);
}

/**
 * Add GeoJSON dataset to Leaflet map and layer registry
 */
function addGeoJsonLayer(geojson, layerId, layerName, color) {
  // If array of GeoJSONs (from multi-layer shapefile)
  if (Array.isArray(geojson)) {
    geojson.forEach((g, idx) => addGeoJsonLayer(g, `${layerId}-${idx}`, `${layerName} (${idx + 1})`, color));
    return;
  }

  // Create Leaflet layer with custom styling
  const leafletLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      return L.circleMarker(latlng, {
        radius: 6,
        fillColor: color,
        color: '#ffffff',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.85
      });
    },
    style: (feature) => {
      return {
        color: color,
        weight: 3,
        opacity: 0.8,
        fillColor: color,
        fillOpacity: 0.25
      };
    },
    onEachFeature: (feature, layer) => {
      // Build Popup with properties
      let propsHTML = `<div style="max-height:200px;overflow-y:auto;">
        <strong style="color:${color};font-size:0.95rem;">${feature.properties?.NAME || feature.properties?.TIPO || layerName}</strong>
        <hr style="border:0;border-top:1px solid rgba(255,255,255,0.1);margin:6px 0;" />
        <table style="width:100%;font-size:0.8rem;color:#ccc;">`;

      if (feature.properties && Object.keys(feature.properties).length > 0) {
        for (const [k, v] of Object.entries(feature.properties)) {
          propsHTML += `<tr><td style="font-weight:bold;padding-right:8px;">${k}:</td><td>${v}</td></tr>`;
        }
      } else {
        propsHTML += `<tr><td colspan="2">Sem propriedades de atributo</td></tr>`;
      }
      propsHTML += `</table></div>`;
      layer.bindPopup(propsHTML);
    }
  }).addTo(gisMap);

  gisLayers[layerId] = {
    id: layerId,
    name: layerName,
    color: color,
    geoJson: geojson,
    leafletLayer: leafletLayer,
    visible: true
  };

  // Zoom map to layer bounds if features exist
  try {
    const bounds = leafletLayer.getBounds();
    if (bounds.isValid()) {
      gisMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  } catch (e) {}
}

/**
 * Toggle Layer visibility
 */
function toggleGisLayer(layerId, isVisible) {
  const item = gisLayers[layerId];
  if (!item) return;

  item.visible = isVisible;
  if (isVisible) {
    gisMap.addLayer(item.leafletLayer);
  } else {
    gisMap.removeLayer(item.leafletLayer);
  }
}

/**
 * Selection Tool: Rectangle Selection
 */
function toggleRectangleSelectMode() {
  const btn = document.getElementById('gis-tool-select-rect');

  if (activeDrawHandler) {
    activeDrawHandler.disable();
    activeDrawHandler = null;
    btn.classList.remove('active');
    updateGisStatus('💡 Seleção por retângulo cancelada.');
    return;
  }

  if (typeof L.Draw === 'undefined' || typeof L.Draw.Rectangle === 'undefined') {
    // Custom simple drag box fallback
    enableSimpleBoxSelect(btn);
    return;
  }

  btn.classList.add('active');
  updateGisStatus('🔍 Clique e arraste no mapa para desenhar o retângulo de seleção...');

  activeDrawHandler = new L.Draw.Rectangle(gisMap, {
    shapeOptions: {
      color: '#00f5ff',
      weight: 2,
      fillColor: '#00f5ff',
      fillOpacity: 0.15,
      dashArray: '4, 4'
    }
  });

  activeDrawHandler.enable();

  gisMap.once(L.Draw.Event.CREATED, (e) => {
    const layer = e.layer;
    const bounds = layer.getBounds();

    performSelectionInBounds(bounds);

    btn.classList.remove('active');
    activeDrawHandler = null;
  });
}

function enableSimpleBoxSelect(btn) {
  btn.classList.add('active');
  updateGisStatus('🔍 Clique no ponto superior esquerdo e depois no ponto inferior direito...');

  let firstCorner = null;

  function onMapClick(e) {
    if (!firstCorner) {
      firstCorner = e.latlng;
      updateGisStatus('📍 Primeiro canto selecionado. Clique no canto oposto para fechar o retângulo.');
    } else {
      const bounds = L.latLngBounds(firstCorner, e.latlng);
      performSelectionInBounds(bounds);
      gisMap.off('click', onMapClick);
      btn.classList.remove('active');
    }
  }

  gisMap.on('click', onMapClick);
}

/**
 * Select all features from active layers within the given LatLngBounds
 */
function performSelectionInBounds(bounds) {
  selectionOverlayLayer.clearLayers();
  selectedFeatures = [];

  let pointCount = 0;
  let lineCount = 0;

  // Add visual bounding box on map
  const rectPoly = L.rectangle(bounds, {
    color: '#00f5ff',
    weight: 2,
    fillColor: '#00f5ff',
    fillOpacity: 0.12,
    dashArray: '6, 6'
  });
  selectionOverlayLayer.addLayer(rectPoly);

  // Filter features
  Object.values(gisLayers).forEach(layerObj => {
    if (!layerObj.visible || !layerObj.geoJson) return;

    const features = layerObj.geoJson.features || (layerObj.geoJson.type === 'Feature' ? [layerObj.geoJson] : []);

    features.forEach(feat => {
      if (!feat.geometry) return;
      const geomType = feat.geometry.type;

      if (geomType === 'Point') {
        const [lon, lat] = feat.geometry.coordinates;
        if (bounds.contains([lat, lon])) {
          selectedFeatures.push({ feature: feat, layerId: layerObj.id, layerName: layerObj.name, color: layerObj.color });
          pointCount++;

          // Highlight marker
          const marker = L.circleMarker([lat, lon], {
            radius: 9,
            fillColor: '#00f5ff',
            color: '#ffffff',
            weight: 3,
            fillOpacity: 0.95
          });
          selectionOverlayLayer.addLayer(marker);
        }
      } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
        const coords = geomType === 'LineString' ? feat.geometry.coordinates : feat.geometry.coordinates.flat();
        const intersects = coords.some(([lon, lat]) => bounds.contains([lat, lon]));

        if (intersects) {
          selectedFeatures.push({ feature: feat, layerId: layerObj.id, layerName: layerObj.name, color: layerObj.color });
          lineCount++;

          // Highlight line
          const polyline = L.geoJSON(feat, {
            style: { color: '#00f5ff', weight: 6, opacity: 0.95 }
          });
          selectionOverlayLayer.addLayer(polyline);
        }
      }
    });
  });

  // Update UI Stats
  const totalCount = selectedFeatures.length;
  document.getElementById('stat-selected-count').textContent = totalCount.toLocaleString('pt-BR');
  document.getElementById('stat-selected-breakdown').textContent = `(${pointCount} ponto(s), ${lineCount} linha(s))`;
  document.getElementById('btn-export-kmz').disabled = totalCount === 0;

  if (totalCount > 0) {
    updateGisStatus(`✅ ${totalCount} elemento(s) selecionado(s) na área! Clique em "Exportar Seleção para KMZ".`);
    showToast(`✓ ${totalCount} elemento(s) selecionado(s)!`, 'success');
  } else {
    updateGisStatus('⚠️ Nenhum elemento encontrado dentro da área selecionada.');
    showToast('⚠️ Nenhum elemento encontrado na área.', 'error');
  }
}

/**
 * Clear current selection
 */
function clearGisSelection() {
  selectionOverlayLayer.clearLayers();
  selectedFeatures = [];
  document.getElementById('stat-selected-count').textContent = '0';
  document.getElementById('stat-selected-breakdown').textContent = '(0 pontos, 0 linhas)';
  document.getElementById('btn-export-kmz').disabled = true;
  updateGisStatus('💡 Seleção limpa. Desenhe um retângulo para escolher novos elementos.');
  showToast('Seleção limpa.', 'info');
}

function updateGisStatus(msg) {
  document.getElementById('gis-info-status').textContent = msg;
}

/**
 * Export Selected Features to KMZ (Zipped KML)
 */
async function exportSelectionToKMZ() {
  if (selectedFeatures.length === 0) {
    showToast('⚠️ Nenhum elemento selecionado para exportar.', 'error');
    return;
  }

  if (typeof JSZip === 'undefined') {
    showToast('❌ Biblioteca JSZip não encontrada para compilar o KMZ.', 'error');
    return;
  }

  showToast('⏳ Gerando arquivo KMZ...', 'info');

  try {
    // 1. Build KML XML document string
    let kmlStr = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Seleção Guirros GIS — ${new Date().toLocaleDateString('pt-BR')}</name>
    <description>Elementos de rede selecionados por Thiago Guirros Bueno</description>

    <!-- Styles -->
    <Style id="style-point">
      <IconStyle>
        <scale>1.1</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/cyan-circle.png</href></Icon>
      </IconStyle>
    </Style>
    <Style id="style-line">
      <LineStyle>
        <color>ff00f5ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
`;

    selectedFeatures.forEach((item, idx) => {
      const feat = item.feature;
      const props = feat.properties || {};
      const name = props.NAME || props.TIPO || props.CODIGO || `${item.layerName} #${idx + 1}`;
      const geomType = feat.geometry.type;

      kmlStr += `    <Placemark>\n`;
      kmlStr += `      <name>${escapeXml(name)}</name>\n`;
      kmlStr += `      <styleUrl>${geomType === 'Point' ? '#style-point' : '#style-line'}</styleUrl>\n`;

      // Description table
      let descTable = `<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:12px;">`;
      descTable += `<tr style="background:#00f5ff;color:#000;"><th colspan="2">${escapeXml(item.layerName)}</th></tr>`;
      for (const [k, v] of Object.entries(props)) {
        descTable += `<tr><td><b>${escapeXml(k)}</b></td><td>${escapeXml(String(v))}</td></tr>`;
      }
      descTable += `</table>`;

      kmlStr += `      <description><![CDATA[${descTable}]]></description>\n`;

      if (geomType === 'Point') {
        const [lon, lat, alt] = feat.geometry.coordinates;
        kmlStr += `      <Point><coordinates>${lon},${lat},${alt || 0}</coordinates></Point>\n`;
      } else if (geomType === 'LineString') {
        const coordPairs = feat.geometry.coordinates.map(([lon, lat]) => `${lon},${lat},0`).join(' ');
        kmlStr += `      <LineString><tessellate>1</tessellate><coordinates>${coordPairs}</coordinates></LineString>\n`;
      } else if (geomType === 'MultiLineString') {
        kmlStr += `      <MultiGeometry>\n`;
        feat.geometry.coordinates.forEach(lineCoords => {
          const coordPairs = lineCoords.map(([lon, lat]) => `${lon},${lat},0`).join(' ');
          kmlStr += `        <LineString><tessellate>1</tessellate><coordinates>${coordPairs}</coordinates></LineString>\n`;
        });
        kmlStr += `      </MultiGeometry>\n`;
      }

      kmlStr += `    </Placemark>\n`;
    });

    kmlStr += `  </Document>\n</kml>`;

    // 2. Compress into ZIP (.kmz)
    const zip = new JSZip();
    zip.file('doc.kml', kmlStr);

    const blob = await zip.generateAsync({ type: 'blob' });

    // 3. Trigger Download
    const filename = `guirros_selecao_${new Date().toISOString().slice(0, 10)}.kmz`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`🎉 Arquivo ${filename} baixado com sucesso!`, 'success');
  } catch (err) {
    console.error(err);
    showToast(`❌ Erro ao gerar KMZ: ${err.message}`, 'error');
  }
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// ─── Generators for regional network infrastructure (GO, DF, MT, Vital DF) ────

function generatePostesGeoJSON(uf, centerLat, centerLon, count, color, prefix) {
  const features = [];
  const cities = uf === 'GO' ? ['Goiânia', 'Anápolis', 'Aparecida'] :
                 uf === 'DF' ? ['Brasília', 'Taguatinga', 'Ceilândia', 'Samambaia'] :
                 ['Cuiabá', 'Várzea Grande', 'Rondonópolis'];

  for (let i = 1; i <= count; i++) {
    // Generate realistic geographic distribution around urban hubs
    const latOffset = (Math.sin(i * 1.7) * 0.08) + ((i % 5) * 0.005);
    const lonOffset = (Math.cos(i * 1.3) * 0.08) + ((i % 3) * 0.006);
    const city = cities[i % cities.length];

    features.push({
      type: 'Feature',
      properties: {
        NAME: `${prefix} #${100 + i}`,
        UF: uf,
        CIDADE: city,
        ALTURA_M: '11m',
        ESFORCO_DA: '600daN',
        TIPO: 'Poste Concreto Duplo T',
        CONSECIONARIA: uf === 'GO' ? 'EQUATORIAL GO' : uf === 'DF' ? 'NEOENERGIA DF' : 'ENERGISA MT',
        STATUS: i % 4 === 0 ? 'OCUPADO' : 'DISPONÍVEL'
      },
      geometry: {
        type: 'Point',
        coordinates: [centerLon + lonOffset, centerLat + latOffset]
      }
    });
  }

  return { type: 'FeatureCollection', features: features };
}

function generateVitalDfGeoJSON() {
  const features = [];

  // Dutos Vital DF (Lines along Eixo Monumental & W3 Brasília)
  const mainDutoCoords = [
    [-47.8920, -15.7980],
    [-47.8870, -15.7950],
    [-47.8820, -15.7920],
    [-47.8760, -15.7890],
    [-47.8710, -15.7860]
  ];

  features.push({
    type: 'Feature',
    properties: {
      NAME: 'Tronco Duto Vital DF - Eixo Monumental',
      TIPO: 'Duto PEAD 110mm 4 Vias',
      OPERADORA: 'VITAL FIBRA DF',
      CAPACIDADE: '288 FO',
      STATUS: 'EM OPERAÇÃO'
    },
    geometry: {
      type: 'LineString',
      coordinates: mainDutoCoords
    }
  });

  // Branch Duto W3 Sul
  const w3DutoCoords = [
    [-47.8920, -15.7980],
    [-47.8960, -15.8050],
    [-47.9000, -15.8120],
    [-47.9050, -15.8200]
  ];

  features.push({
    type: 'Feature',
    properties: {
      NAME: 'Ramal Duto Vital DF - W3 Sul',
      TIPO: 'Subterrâneo PEAD 110mm',
      OPERADORA: 'VITAL FIBRA DF',
      CAPACIDADE: '144 FO',
      STATUS: 'EM OPERAÇÃO'
    },
    geometry: {
      type: 'LineString',
      coordinates: w3DutoCoords
    }
  });

  // Caixas de Passagem Vital DF (Points along the routes)
  [...mainDutoCoords, ...w3DutoCoords].forEach((pt, i) => {
    features.push({
      type: 'Feature',
      properties: {
        NAME: `Caixa Vital DF CP-${100 + i}`,
        TIPO: 'Caixa Subterrânea de Passagem R2',
        TAMANHO: '120x80cm Concreto',
        OPERADORA: 'VITAL FIBRA DF',
        FUSOES: `${(i + 1) * 24} Fusões`
      },
      geometry: {
        type: 'Point',
        coordinates: pt
      }
    });
  });

  return { type: 'FeatureCollection', features: features };
}

// ══════════════════════════════════════════════════════════════
//  CAD DRAWING SUITE & FEATURE PROPERTY EDITOR (Google Earth Pro style)
// ══════════════════════════════════════════════════════════════

let userProjectGeoJSON = { type: 'FeatureCollection', features: [] };
let activeEditingFeature = null;
let activeEditingLayer = null;

function startGisDrawing(type) {
  if (!gisMap) return;

  if (activeDrawHandler) {
    activeDrawHandler.disable();
    activeDrawHandler = null;
  }

  // Ensure "Projeto do Usuário" layer exists
  if (!gisLayers['user-project']) {
    addGeoJsonLayer(userProjectGeoJSON, 'user-project', 'Projeto do Usuário', '#00f5ff');
    addCustomLayerChip('user-project', 'Projeto do Usuário', '#00f5ff');
  }

  if (type === 'Point') {
    updateGisStatus('📍 Clique no mapa para adicionar um Ponto / Poste / Caixa...');
    gisMap.once('click', (e) => {
      const feat = {
        type: 'Feature',
        properties: {
          NAME: `Ponto Projetado #${userProjectGeoJSON.features.length + 1}`,
          DESCRICAO: 'Elemento criado no mapa',
          TIPO: 'Poste / Caixa / Ponto',
          COLOR: '#00f5ff',
          SIZE: 7
        },
        geometry: {
          type: 'Point',
          coordinates: [e.latlng.lng, e.latlng.lat]
        }
      };

      userProjectGeoJSON.features.push(feat);
      addFeatureToUserProject(feat);
      updateGisStatus('✓ Ponto adicionado! Clique nele para editar propriedades.');
      showToast('📍 Ponto adicionado ao projeto!', 'success');
    });
  } else if (type === 'LineString') {
    updateGisStatus('📏 Clique no mapa para iniciar a linha. Clique para adicionar pontos, duplo clique para finalizar.');

    let linePts = [];
    let tempLine = L.polyline([], { color: '#00f5ff', weight: 4, dashArray: '4,4' }).addTo(gisMap);

    function onLineClick(e) {
      linePts.push([e.latlng.lng, e.latlng.lat]);
      tempLine.setLatLngs(linePts.map(p => [p[1], p[0]]));
    }

    function onLineDblClick() {
      gisMap.off('click', onLineClick);
      gisMap.off('dblclick', onLineDblClick);
      gisMap.removeLayer(tempLine);

      if (linePts.length >= 2) {
        const feat = {
          type: 'Feature',
          properties: {
            NAME: `Linha Projetada #${userProjectGeoJSON.features.length + 1}`,
            DESCRICAO: 'Cabo / Duto traçado',
            TIPO: 'Linha / Fibra',
            COLOR: '#00f5ff',
            SIZE: 4
          },
          geometry: {
            type: 'LineString',
            coordinates: linePts
          }
        };

        userProjectGeoJSON.features.push(feat);
        addFeatureToUserProject(feat);
        updateGisStatus('✓ Linha traçada! Clique nela para editar propriedades.');
        showToast('📏 Linha traçada no projeto!', 'success');
      } else {
        updateGisStatus('⚠️ Linha precisa de pelo menos 2 pontos.');
      }
    }

    gisMap.on('click', onLineClick);
    gisMap.once('dblclick', onLineDblClick);
  } else if (type === 'Polygon') {
    updateGisStatus('⬡ Clique no mapa para desenhar os vértices da área. Duplo clique para fechar.');

    let polyPts = [];
    let tempPoly = L.polygon([], { color: '#39ff14', weight: 2, fillColor: '#39ff14', fillOpacity: 0.25 }).addTo(gisMap);

    function onPolyClick(e) {
      polyPts.push([e.latlng.lng, e.latlng.lat]);
      tempPoly.setLatLngs(polyPts.map(p => [p[1], p[0]]));
    }

    function onPolyDblClick() {
      gisMap.off('click', onPolyClick);
      gisMap.off('dblclick', onPolyDblClick);
      gisMap.removeLayer(tempPoly);

      if (polyPts.length >= 3) {
        const feat = {
          type: 'Feature',
          properties: {
            NAME: `Área Projetada #${userProjectGeoJSON.features.length + 1}`,
            DESCRICAO: 'Polígono de cobertura',
            TIPO: 'Área',
            COLOR: '#39ff14',
            SIZE: 2
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[...polyPts, polyPts[0]]]
          }
        };

        userProjectGeoJSON.features.push(feat);
        addFeatureToUserProject(feat);
        updateGisStatus('✓ Área desenhada! Clique nela para editar propriedades.');
        showToast('⬡ Área desenhada no projeto!', 'success');
      } else {
        updateGisStatus('⚠️ Polígono precisa de pelo menos 3 vértices.');
      }
    }

    gisMap.on('click', onPolyClick);
    gisMap.once('dblclick', onPolyDblClick);
  }
}

function addFeatureToUserProject(feat) {
  const layerObj = gisLayers['user-project'];
  if (!layerObj) return;

  const color = feat.properties.COLOR || '#00f5ff';
  const size = feat.properties.SIZE || 6;

  const layer = L.geoJSON(feat, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, {
      radius: size,
      fillColor: color,
      color: '#ffffff',
      weight: 2,
      fillOpacity: 0.9
    }),
    style: () => ({ color: color, weight: size, fillColor: color, fillOpacity: 0.3 })
  }).addTo(gisMap);

  layer.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    openFeatureEditModal(feat, layer);
  });

  layerObj.leafletLayer.addLayer(layer);
}

/**
 * Setup Property Editor Modal
 */
function setupFeatureEditModal() {
  const modal = document.getElementById('gis-edit-modal');
  const closeBtn = document.getElementById('gis-modal-close');
  const saveBtn = document.getElementById('gis-save-feat-btn');
  const deleteBtn = document.getElementById('gis-delete-feat-btn');
  const colorInput = document.getElementById('edit-feat-color');

  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

  document.querySelectorAll('.color-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      colorInput.value = btn.dataset.color;
    });
  });

  saveBtn.addEventListener('click', () => {
    if (!activeEditingFeature || !activeEditingLayer) return;

    const newName = document.getElementById('edit-feat-name').value.trim();
    const newDesc = document.getElementById('edit-feat-desc').value.trim();
    const newColor = document.getElementById('edit-feat-color').value;
    const newSize = parseInt(document.getElementById('edit-feat-size').value) || 6;

    activeEditingFeature.properties.NAME = newName || activeEditingFeature.properties.NAME;
    activeEditingFeature.properties.DESCRICAO = newDesc;
    activeEditingFeature.properties.COLOR = newColor;
    activeEditingFeature.properties.SIZE = newSize;

    // Refresh rendering on Leaflet layer
    if (activeEditingLayer.setStyle) {
      activeEditingLayer.setStyle({ color: newColor, fillColor: newColor, weight: newSize, radius: newSize });
    }
    if (activeEditingLayer.eachLayer) {
      activeEditingLayer.eachLayer(l => {
        if (l.setStyle) l.setStyle({ color: newColor, fillColor: newColor, weight: newSize, radius: newSize });
        if (l.setRadius) l.setRadius(newSize);
      });
    }

    modal.classList.add('hidden');
    showToast('✓ Elemento atualizado!', 'success');
  });

  deleteBtn.addEventListener('click', () => {
    if (!activeEditingFeature || !activeEditingLayer) return;

    if (gisLayers['user-project']) {
      gisLayers['user-project'].leafletLayer.removeLayer(activeEditingLayer);
    }
    gisMap.removeLayer(activeEditingLayer);

    const idx = userProjectGeoJSON.features.indexOf(activeEditingFeature);
    if (idx !== -1) userProjectGeoJSON.features.splice(idx, 1);

    modal.classList.add('hidden');
    showToast('🗑️ Elemento removido do projeto.', 'info');
  });
}

function openFeatureEditModal(feat, layer) {
  activeEditingFeature = feat;
  activeEditingLayer = layer;

  document.getElementById('edit-feat-name').value = feat.properties.NAME || feat.properties.TIPO || '';
  document.getElementById('edit-feat-desc').value = feat.properties.DESCRICAO || feat.properties.STATUS || '';
  document.getElementById('edit-feat-color').value = feat.properties.COLOR || '#00f5ff';
  document.getElementById('edit-feat-size').value = feat.properties.SIZE || 6;

  document.getElementById('gis-edit-modal').classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════════
//  TOOL 5 — SISTEMA DE TOPOLOGIAS (Redirecionamento Externo)
// ══════════════════════════════════════════════════════════════

function initTopologiasTool() {
  const urlInput = document.getElementById('topologia-url-input');
  const openBtn = document.getElementById('btn-topologia-open');

  if (!urlInput || !openBtn) return;

  // Load saved URL from LocalStorage if present
  const savedUrl = localStorage.getItem('topologia_url');
  if (savedUrl) {
    urlInput.value = savedUrl;
  }

  urlInput.addEventListener('input', () => {
    localStorage.setItem('topologia_url', urlInput.value.trim());
  });

  openBtn.addEventListener('click', () => {
    let url = urlInput.value.trim();
    if (!url) {
      showToast('⚠️ Informe a URL do Sistema de Topologias.', 'error');
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    showToast(`⚡ Redirecionando para ${url}...`, 'info');
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}

// ══════════════════════════════════════════════════════════════
//  TOOL 6 — MASSIVAS (Gerador Automático de KMZ de Pontos)
// ══════════════════════════════════════════════════════════════

let massivasParsedPoints = [];

function initMassivasTool() {
  const dropZone = document.getElementById('massivas-drop');
  const fileInput = document.getElementById('massivas-input');
  const filenameDisplay = document.getElementById('massivas-filename-display');
  const textarea = document.getElementById('massivas-textarea');
  const prefixInput = document.getElementById('massivas-prefix');
  const repeatInput = document.getElementById('massivas-repeat');
  const filenameInput = document.getElementById('massivas-filename');
  const summaryDiv = document.getElementById('massivas-summary');
  const generateBtn = document.getElementById('massivas-generate');
  const resultDiv = document.getElementById('massivas-result');
  const resultInfo = document.getElementById('massivas-result-info');
  const downloadBtn = document.getElementById('massivas-download');

  const kmlCodeArea = document.getElementById('massivas-kml-code');
  const updateKmlBtn = document.getElementById('massivas-update-kml');

  if (!dropZone || !generateBtn) return;
  if (dropZone.dataset.initialized === 'true') return;
  dropZone.dataset.initialized = 'true';

  // Drag & drop handlers
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleMassivasFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleMassivasFile(e.target.files[0]);
    }
  });

  textarea.addEventListener('input', () => {
    if (textarea.value.trim().length > 0) {
      parseMassivasTextarea();
    } else {
      updateMassivasSummary();
    }
  });

  generateBtn.addEventListener('click', generateMassivasKmz);

  if (updateKmlBtn && kmlCodeArea) {
    updateKmlBtn.addEventListener('click', () => {
      const code = kmlCodeArea.value.trim();
      if (!code) {
        showToast('⚠️ O código KML está vazio.', 'warning');
        return;
      }
      let outFilename = (filenameInput.value.trim() || 'massivas.kmz');
      if (!outFilename.toLowerCase().endsWith('.kmz')) {
        outFilename += '.kmz';
      }
      zipAndSetKmzDownload(code, outFilename, 'KMZ recriado a partir do código KML editado.');
    });
  }

  function handleMassivasFile(file) {
    if (filenameDisplay) {
      filenameDisplay.textContent = `📁 ${file.name}`;
    }
    showToast(`📄 Lendo arquivo ${file.name}...`, 'info');

    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          extractPointsFromRows(rows);
        } catch (err) {
          console.error(err);
          showToast('❌ Erro ao ler planilha Excel: ' + err.message, 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === 'csv' || ext === 'txt') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        textarea.value = text;
        parseMassivasTextarea();
      };
      reader.readAsText(file);
    } else {
      showToast('⚠️ Formato não suportado. Use .xlsx, .xls ou .csv', 'warning');
    }
  }

  function extractPointsFromRows(rows) {
    massivasParsedPoints = [];
    if (!rows || rows.length === 0) {
      updateMassivasSummary();
      return;
    }

    let latIdx = -1;
    let lngIdx = -1;
    let nameIdx = -1;

    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').toLowerCase().trim();
        if (val.includes('lat')) latIdx = c;
        else if (val.includes('lon') || val.includes('lng') || val.includes('long')) lngIdx = c;
        else if (val.includes('nome') || val.includes('name') || val.includes('ponto')) nameIdx = c;
      }
      if (latIdx !== -1 && lngIdx !== -1) break;
    }

    const startRow = (latIdx !== -1 && lngIdx !== -1) ? 1 : 0;

    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row) || row.length < 2) continue;

      let lat = NaN, lng = NaN;
      if (latIdx !== -1 && lngIdx !== -1) {
        lat = parseCoordNumber(row[latIdx]);
        lng = parseCoordNumber(row[lngIdx]);
      } else {
        const nums = [];
        for (let c = 0; c < row.length; c++) {
          const num = parseCoordNumber(row[c]);
          if (!isNaN(num)) nums.push(num);
        }
        if (nums.length >= 2) {
          if (Math.abs(nums[0]) <= 90 && Math.abs(nums[1]) <= 180) {
            lat = nums[0];
            lng = nums[1];
          } else if (Math.abs(nums[1]) <= 90 && Math.abs(nums[0]) <= 180) {
            lat = nums[1];
            lng = nums[0];
          }
        }
      }

      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        const customName = (nameIdx !== -1 && row[nameIdx]) ? String(row[nameIdx]).trim() : null;
        massivasParsedPoints.push({ lat, lng, customName });
      }
    }

    updateMassivasSummary();
  }

  function parseMassivasTextarea() {
    massivasParsedPoints = [];
    const lines = textarea.value.split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const matches = trimmed.match(/-?\d+(?:[.,]\d+)?/g);
      if (matches && matches.length >= 2) {
        const num1 = parseFloat(matches[0].replace(',', '.'));
        const num2 = parseFloat(matches[1].replace(',', '.'));
        if (!isNaN(num1) && !isNaN(num2)) {
          let lat = num1, lng = num2;
          if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
            lat = num2;
            lng = num1;
          }
          if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            massivasParsedPoints.push({ lat, lng });
          }
        }
      }
    });
    updateMassivasSummary();
  }

  function parseCoordNumber(val) {
    if (val === null || val === undefined) return NaN;
    if (typeof val === 'number') return val;
    const str = String(val).trim().replace(',', '.');
    return parseFloat(str);
  }

  function updateMassivasSummary() {
    const count = massivasParsedPoints.length;
    if (count > 0) {
      summaryDiv.textContent = `📍 ${count} coordenada(s) reconhecida(s) com sucesso.`;
      generateBtn.disabled = false;
    } else {
      summaryDiv.textContent = '⚠️ Nenhuma coordenada válida identificada ainda. Envie uma planilha ou cole as coordenadas.';
    }
  }

  async function generateMassivasKmz() {
    if (massivasParsedPoints.length === 0) {
      parseMassivasTextarea();
    }

    if (massivasParsedPoints.length === 0) {
      showToast('⚠️ Nenhuma coordenada válida para gerar o KMZ.', 'warning');
      return;
    }

    const basePrefix = (prefixInput.value.trim() || 'PONTO').toUpperCase();
    const repeatCount = Math.max(1, parseInt(repeatInput.value, 10) || 1);
    let outFilename = (filenameInput.value.trim() || 'massivas.kmz');
    if (!outFilename.toLowerCase().endsWith('.kmz')) {
      outFilename += '.kmz';
    }

    showToast(`⏳ Gerando KMZ com ${massivasParsedPoints.length} ponto(s) e ${repeatCount} pasta(s)...`, 'info');

    // Build project tree structure
    let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    kmlContent += `<kml xmlns="http://www.opengis.net/kml/2.2">\n`;
    kmlContent += `  <Document>\n`;
    kmlContent += `    <name>${escapeXml(outFilename.replace('.kmz', ''))}</name>\n`;

    for (let f = 1; f <= repeatCount; f++) {
      let indent = '    ';
      if (repeatCount > 1) {
        kmlContent += `    <Folder>\n`;
        kmlContent += `      <name>REPETIÇÃO ${String(f).padStart(2, '0')}</name>\n`;
        indent = '      ';
      }

      massivasParsedPoints.forEach((pt, idx) => {
        const pointNumStr = String(idx + 1).padStart(2, '0');
        const pointFolderName = `${basePrefix} - ${pointNumStr}`;
        const latStr = pt.lat.toFixed(6);
        const lngStr = pt.lng.toFixed(6);
        const coordNameStr = `${latStr}, ${lngStr}`;

        kmlContent += `${indent}<Folder>\n`;
        kmlContent += `${indent}  <name>${escapeXml(pointFolderName)}</name>\n`;

        // 1. LOCALIZAÇÃO Folder with single Placemark named as the exact coordinate
        kmlContent += `${indent}  <Folder>\n`;
        kmlContent += `${indent}    <name>LOCALIZAÇÃO</name>\n`;
        kmlContent += `${indent}    <Placemark>\n`;
        kmlContent += `${indent}      <name>${coordNameStr}</name>\n`;
        kmlContent += `${indent}      <Point>\n`;
        kmlContent += `${indent}        <coordinates>${lngStr},${latStr},0</coordinates>\n`;
        kmlContent += `${indent}      </Point>\n`;
        kmlContent += `${indent}    </Placemark>\n`;
        kmlContent += `${indent}  </Folder>\n`;

        // 2. REDE NOVA Folder with Subfolders
        kmlContent += `${indent}  <Folder>\n`;
        kmlContent += `${indent}    <name>REDE NOVA</name>\n`;
        kmlContent += `${indent}    <Folder><name>CABOS</name></Folder>\n`;
        kmlContent += `${indent}    <Folder><name>RESERVA</name></Folder>\n`;
        kmlContent += `${indent}    <Folder><name>CORDOALHA</name></Folder>\n`;
        kmlContent += `${indent}  </Folder>\n`;

        // 3. REDE LEGADA Folder with Subfolders
        kmlContent += `${indent}  <Folder>\n`;
        kmlContent += `${indent}    <name>REDE LEGADA</name>\n`;
        kmlContent += `${indent}    <Folder><name>CEO</name></Folder>\n`;
        kmlContent += `${indent}    <Folder><name>CABOS</name></Folder>\n`;
        kmlContent += `${indent}    <Folder><name>POP</name></Folder>\n`;
        kmlContent += `${indent}  </Folder>\n`;

        kmlContent += `${indent}</Folder>\n`;
      });

      if (repeatCount > 1) {
        kmlContent += `    </Folder>\n`;
      }
    }

    kmlContent += `  </Document>\n`;
    kmlContent += `</kml>`;

    if (kmlCodeArea) {
      kmlCodeArea.value = kmlContent;
    }

    await zipAndSetKmzDownload(kmlContent, outFilename, `Arquivo "${outFilename}" contendo ${massivasParsedPoints.length * repeatCount} ponto(s) total em ${repeatCount} pasta(s).`);
  }

  async function zipAndSetKmzDownload(kmlText, outFilename, infoMsg) {
    try {
      const zip = new JSZip();
      zip.file('doc.kml', kmlText);

      const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' });
      const url = URL.createObjectURL(blob);

      downloadBtn.href = url;
      downloadBtn.download = outFilename;
      if (infoMsg) {
        resultInfo.textContent = infoMsg;
      }
      resultDiv.classList.remove('hidden');

      showToast(`🎉 KMZ "${outFilename}" atualizado com sucesso!`, 'success');
    } catch (err) {
      console.error(err);
      showToast('❌ Erro ao criar KMZ zipado: ' + err.message, 'error');
    }
  }

  function escapeXml(unsafe) {
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initMassivasTool();
});

