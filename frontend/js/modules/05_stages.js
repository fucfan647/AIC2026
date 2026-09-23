/**
 * ==============================================================================
 * TỆP TIN: js/modules/05_stages.js
 * MÔ TẢ:
 *   GIAO DIỆN VÀ LOGIC CÁC CHẶNG TÌM KIẾM (Stage A, B...): renderStages() nguyên bản 100%, text query, OCR, ASR sliders, fusion weights, tự động dịch sang tiếng Anh.
 * ==============================================================================
 */


function normalizeOcrPercent(value, fallback = 41) {
  const parsed = Number(value);
  const fallbackValue = Number(fallback);
  const resolved = Number.isFinite(parsed) ? parsed : (Number.isFinite(fallbackValue) ? fallbackValue : 41);
  return Math.round(Math.min(100, Math.max(0, resolved)));
}

function normalizeAsrPercent(value, fallback = 20) {
  const parsed = Number(value);
  const fallbackValue = Number(fallback);
  const resolved = Number.isFinite(parsed) ? parsed : (Number.isFinite(fallbackValue) ? fallbackValue : 20);
  return Math.round(Math.min(100, Math.max(0, resolved)));
}

function syncSingleQuerySource(card) {
  card.querySelectorAll('[data-query-source]').forEach(section => {
    section.classList.toggle('is-active', section.dataset.querySource === state.queryMode);
  });
  const fusionControl = card.querySelector('.fusion-control');
  if (fusionControl) fusionControl.hidden = state.queryMode === 'similarity';
}

function renderStages() {
  els.stageList.innerHTML = '';
  state.stages.forEach((stage, index) => {
    const stageNumber = index + 1;
    const isCompletedTemporalStage = Boolean(stage.isCompleted);
    const stageOcrPercent = normalizeOcrPercent(stage.ocrWeight, 41);
    const stageAsrPercent = normalizeAsrPercent(stage.asrWeight, 20);
    const card = document.createElement('section');
    card.className = 'stage-card';
    card.dataset.stageId = stage.id;
    card.innerHTML = `
      <div class="stage-head${isCompletedTemporalStage ? ' is-collapsible' : ''}" ${isCompletedTemporalStage ? `role="button" tabindex="0" aria-expanded="${stage.temporalExpanded === true}" title="Bấm để ${stage.temporalExpanded === true ? 'thu gọn' : 'chỉnh sửa'} Query ${stageLetter(index)}"` : ''}>
        <div>${isCompletedTemporalStage ? '<span class="badge">Đã tìm</span>' : ''}</div>
        ${state.stages.length > 1 ? `<button class="stage-remove" type="button" title="Xóa Query ${stageLetter(index)}" aria-label="Xóa Query ${stageLetter(index)}">${trashIcon()}</button>` : ''}
      </div>
      <div class="stage-fields" ${isCompletedTemporalStage && stage.temporalExpanded !== true ? 'hidden' : ''}>
        <label class="text-query-field">
          <span class="query-field-heading"><b class="query-field-icon" aria-hidden="true">${stageLetter(index)}</b>Text Query</span>
          <textarea class="text-query" placeholder="Mô tả hành động ${stageLetter(index)}..."></textarea>
          <div class="translated-query-row" ${stage.translatedQuery ? '' : 'hidden'}><strong>English:</strong> <span class="translated-query-text"></span></div>
        </label>

        <label class="ocr-query-field">
          <span class="query-field-heading"><b class="query-field-icon" aria-hidden="true">${ocrQueryIcon()}</b>OCR Query</span>
          <input class="stage-ocr-query" type="text" placeholder="Nhập chữ xuất hiện trong frame..." autocomplete="off" />
        </label>
        <output class="stage-ocr-weight-value" hidden>${stageOcrPercent}%</output>
        <input class="stage-ocr-weight" type="range" min="0" max="100" value="${stageOcrPercent}" step="1" aria-label="Độ chú trọng OCR Query ${stageNumber}" />
        
        <label class="asr-query-field">
          <span class="query-field-heading"><b class="query-field-icon" aria-hidden="true"><i data-lucide="mic"></i></b>ASR Query</span>
          <input class="stage-asr-query" type="text" placeholder="Nhập lời nói cần tìm trong transcript..." autocomplete="off" />
        </label>
        <output class="stage-asr-weight-value" hidden>${stageAsrPercent}%</output>
        <input class="stage-asr-weight" type="range" min="0" max="100" value="${stageAsrPercent}" step="1" aria-label="Độ chú trọng ASR Query ${stageNumber}" />

        <small class="fusion-weight-summary"></small>

        ${isCompletedTemporalStage ? `<button class="translate-query-btn" type="button" data-temporal-search-stage="${index}">Tìm lại Query ${stageLetter(index)}</button>` : ''}
      </div>`;

    const textarea = card.querySelector('.text-query');
    if (textarea) {
      textarea.value = stage.query || '';
      textarea.addEventListener('input', () => {
        stage.query = textarea.value;
        stage.translatedQuery = '';
        const translatedRow = card.querySelector('.translated-query-row');
        if (translatedRow) translatedRow.hidden = true;
        updateStageFusionSummary();
      });
      textarea.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          state.queryMode = 'text';
          performSearch(state.searchMode === 'temporal' ? index : null);
        }
      });
    }

    const translatedText = card.querySelector('.translated-query-text');
    if (translatedText) translatedText.textContent = stage.translatedQuery || '';

    if (isCompletedTemporalStage) {
      const stageHead = card.querySelector('.stage-head');
      const toggleCompletedStage = () => {
        stage.temporalExpanded = stage.temporalExpanded !== true;
        renderStages();
      };
      stageHead?.addEventListener('click', toggleCompletedStage);
      stageHead?.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          performSearch(index);
          return;
        }
        if (event.key === ' ') {
          event.preventDefault();
          toggleCompletedStage();
        }
      });
    }

    const stageOcrInput = card.querySelector('.stage-ocr-weight');
    const stageAsrInput = card.querySelector('.stage-asr-weight');
    const stageOcrQuery = card.querySelector('.stage-ocr-query');
    const stageAsrQuery = card.querySelector('.stage-asr-query');

    const updateStageFusionSummary = () => {
      const summary = card.querySelector('.fusion-weight-summary');
      if (!summary) return;
      if (state.asrOnly) {
        summary.innerHTML = '<span>Hình ảnh 0%</span><span>Text OCR 0%</span><span>ASR 100%</span>';
        return;
      }
      const weights = fusionWeightsForStage(stage, {
        hasSemantic: Boolean(String(stage.query || '').trim()),
        hasOcr: Boolean(String(stage.ocrQuery || '').trim()),
        hasAsr: Boolean(String(stage.asrQuery || '').trim())
      });
      summary.innerHTML = `<span>Hình ảnh ${Math.round(weights.metaclip_weight * 100)}%</span><span>Text OCR ${Math.round(weights.ocr_weight * 100)}%</span><span>ASR ${Math.round(weights.asr_weight * 100)}%</span>`;
    };

    if (stageOcrQuery) {
      stageOcrQuery.value = stage.ocrQuery || '';
      stageOcrQuery.addEventListener('input', () => {
        stage.ocrQuery = stageOcrQuery.value;
        updateStageFusionSummary();
      });
      stageOcrQuery.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          performSearch(state.searchMode === 'temporal' ? index : null);
        }
      });
    }

    if (stageAsrQuery) {
      stageAsrQuery.value = stage.asrQuery || '';
      stageAsrQuery.disabled = state.backend?.asr_available !== true;
      stageAsrQuery.title = stageAsrQuery.disabled ? 'Backend ASR chưa sẵn sàng' : '';
      stageAsrQuery.addEventListener('input', () => {
        stage.asrQuery = stageAsrQuery.value;
        updateStageFusionSummary();
      });
      stageAsrQuery.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          performSearch(state.searchMode === 'temporal' ? index : null);
        }
      });
    }

    if (stageOcrInput) {
      stage.ocrWeight = stageOcrPercent;
      stageOcrInput.addEventListener('input', () => {
        let percent = normalizeOcrPercent(stageOcrInput.value, stageOcrPercent);
        let asr = normalizeAsrPercent(stageAsrInput?.value, stageAsrPercent);
        if (percent + asr > 100) {
          asr = 100 - percent;
          if (stageAsrInput) {
            stageAsrInput.value = asr;
            stage.asrWeight = asr;
            stageAsrInput.setAttribute('aria-valuetext', `ASR ${asr}%`);
            const output = card.querySelector('.stage-asr-weight-value');
            if (output) output.textContent = `${asr}%`;
          }
        }
        stage.ocrWeight = percent;
        stageOcrInput.setAttribute('aria-valuetext', `Text OCR ${percent}%`);
        const output = card.querySelector('.stage-ocr-weight-value');
        if (output) output.textContent = `${percent}%`;
        updateStageFusionSummary();
        state.fusionWeightsTouched = true;
      });
    }

    if (stageAsrInput) {
      stage.asrWeight = stageAsrPercent;
      stageAsrInput.disabled = state.backend?.asr_available !== true;
      stageAsrInput.title = state.backend?.asr_available !== true ? 'Backend ASR chưa sẵn sàng' : '';
      stageAsrInput.addEventListener('input', () => {
        let percent = normalizeAsrPercent(stageAsrInput.value, stageAsrPercent);
        let ocr = normalizeOcrPercent(stageOcrInput?.value, stageOcrPercent);
        if (percent + ocr > 100) {
          ocr = 100 - percent;
          if (stageOcrInput) {
            stageOcrInput.value = ocr;
            stage.ocrWeight = ocr;
            stageOcrInput.setAttribute('aria-valuetext', `Text OCR ${ocr}%`);
            const output = card.querySelector('.stage-ocr-weight-value');
            if (output) output.textContent = `${ocr}%`;
          }
        }
        stage.asrWeight = percent;
        stageAsrInput.setAttribute('aria-valuetext', `ASR ${percent}%`);
        const output = card.querySelector('.stage-asr-weight-value');
        if (output) output.textContent = `${percent}%`;
        updateStageFusionSummary();
        state.fusionWeightsTouched = true;
      });
    }

    updateStageFusionSummary();
    card.querySelector('.stage-remove')?.addEventListener('click', () => removeStage(stage.id));
    card.querySelector('[data-temporal-search-stage]')?.addEventListener('click', () => performSearch(index));

    els.stageList.appendChild(card);
  });
}

function setQueryMode(mode) {
  if (!['text', 'similarity'].includes(mode) || state.queryMode === mode) return;
  state.queryMode = mode;
  resetSearchTiming();
  renderStages();
  showError('');
}

function setSimilarityItem(item) {
  if (!item?.keyframe_id || !item?.video_id) {
    showError('Frame nguồn similarity không hợp lệ.');
    return;
  }
  state.queryMode = 'similarity';
  state.similarityItem = item;
  const imageUrl = item.thumbnail_url || `/thumbnail/${encodeURIComponent(item.keyframe_id)}`;
  if (els.globalSimilarityDropzone) {
    els.globalSimilarityDropzone.style.padding = '4px';
    els.globalSimilarityDropzone.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.video_id)}" style="width: 100%; height: auto; display: block; border-radius: 4px;" title="Đã chọn: ${escapeHtml(item.video_id)} - Frame ${escapeHtml(frameId(item))}" />`;
  }
  showError('');
}

function invalidateTemporalResults() {
  state.results = [];
  resetSearchTiming();
  renderResults();
  els.searchMeta.textContent = 'Chưa tìm kiếm';
  showError('');
}

function addTemporalStage() {
  if (state.stages.length >= 5) {
    setStatus('Đã đạt giới hạn tối đa 5 Stage.', 'warning');
    return;
  }
  
  // Nếu stage cuối cùng hiện tại vẫn đang trống và chưa được tìm kiếm, mở rộng và focus vào nó
  const lastStage = state.stages[state.stages.length - 1];
  const lastHasContent = Boolean(
    String(lastStage?.query || '').trim() ||
    String(lastStage?.ocrQuery || '').trim() ||
    String(lastStage?.asrQuery || '').trim()
  );
  if (lastStage && !lastStage.isCompleted && !lastHasContent) {
    lastStage.temporalExpanded = true;
    renderStages();
    els.stageList.querySelector('.stage-card:last-child .text-query')?.focus();
    return;
  }

  const nextIndex = state.stages.length;
  state.searchMode = 'temporal';
  state.queryMode = 'text';
  state.similarityItem = null;
  state.stages.push({
    id: `${Date.now()}-${nextIndex}`,
    name: `Hành động ${stageLetter(nextIndex)}`,
    query: '',
    translatedQuery: '',
    ocrQuery: '',
    asrQuery: '',
    ocrWeight: normalizeOcrPercent(
      state.stages[state.stages.length - 1]?.ocrWeight,
      41
    ),
    asrWeight: normalizeAsrPercent(
      state.stages[state.stages.length - 1]?.asrWeight,
      20
    ),
    isCompleted: false,
    temporalExpanded: true
  });

  // GIỮ NGUYÊN kết quả tìm kiếm hiện tại (KHÔNG gọi invalidateTemporalResults())
  renderStages();
  syncSearchModeControls();
  els.stageList.querySelector('.stage-card:last-child .text-query')?.focus();
  setStatus(`Đã thêm Stage ${stageLetter(nextIndex)} (Alt+A)`, 'ok');
}

function removeStage(stageId) {
  if (state.stages.length <= 1) return;
  const removedIndex = state.stages.findIndex(stage => stage.id === stageId);
  const wasCompleted = Boolean(state.stages[removedIndex]?.isCompleted);
  state.stages = state.stages.filter(stage => stage.id !== stageId);
  
  if (state.stages.length <= 1) {
    state.searchMode = 'single';
  } else {
    state.searchMode = 'temporal';
  }

  state.stages.forEach((stage, idx) => {
    stage.name = `Hành động ${stageLetter(idx)}`;
  });

  const completedCount = state.stages.filter(stage => stage.isCompleted).length;
  state.temporalStage = completedCount;

  // Chỉ xóa kết quả nếu không còn stage nào hoàn thành
  if (completedCount === 0 && wasCompleted) {
    invalidateTemporalResults();
  }

  renderStages();
  syncSearchModeControls();
  setStatus('Đã xóa Stage (Alt+D)', 'ok');
}

function collectQueries() {
  return [...document.querySelectorAll('.stage-card .text-query')]
    .map(textarea => textarea.value.trim());
}

function looksLikeVietnameseQuery(text) {
  const source = String(text || '').trim().toLocaleLowerCase('vi');
  if (!source) return false;
  if (/[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i.test(source)) {
    return true;
  }
  const commonWords = new Set([
    'mot', 'nguoi', 'dang', 'nhung', 'trong', 'tren', 'duoi', 'voi', 'khong',
    'co', 'con', 'cai', 'chiec', 'xe', 'di', 'chay', 'dung', 'ngoi', 'an',
    'uong', 'cam', 'lay', 'dua', 'vao', 'ra', 'phai', 'trai', 'phia', 'truoc',
    'sau', 'gan', 'canh', 'mac', 'ao', 'quan', 'mau', 'den', 'trang', 'do',
    'xanh', 'vang', 'noi', 'chuyen', 'nhin', 'thay', 'hinh', 'anh'
  ]);
  const matches = source.match(/[a-z]+/g) || [];
  return matches.filter(word => commonWords.has(word)).length >= 2;
}

async function requestEnglishTranslation(source) {
  const response = await fetch('/translate-query', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({text: source})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);
  const translation = String(payload.translation || '').trim();
  if (!translation) throw new Error('Model không trả về bản dịch.');
  return {translation, latencyMs: Number(payload.latency_ms || 0)};
}

function showStageTranslation(stage, translation) {
  stage.translatedQuery = translation;
  const card = [...document.querySelectorAll('.stage-card')]
    .find(item => String(item.dataset.stageId) === String(stage.id));
  const translatedRow = card?.querySelector('.translated-query-row');
  const translatedText = card?.querySelector('.translated-query-text');
  if (translatedText) translatedText.textContent = translation;
  if (translatedRow) translatedRow.hidden = false;
}

function collectOcrQueries() {
  return state.stages.map(stage => String(stage.ocrQuery || '').trim());
}

function collectAsrQueries() {
  return state.stages.map(stage => String(stage.asrQuery || '').trim());
}

function collectQuery() {
  return collectQueries().filter(Boolean).join(' | ');
}

function setSearchMode(mode) {
  state.searchMode = 'temporal';
  syncSearchModeControls();
}

function syncSearchModeControls() {
  if (els.searchModeToggle) els.searchModeToggle.hidden = true;

}

function syncEmbeddingModelControls() {
  const isBeit3 = state.embeddingModel === 'beit3';
  if (els.embeddingModelToggle) {
    els.embeddingModelToggle.dataset.model = state.embeddingModel;
    els.embeddingModelToggle.textContent = isBeit3 ? 'BEiT-3' : 'MetaCLIP-2';
    els.embeddingModelToggle.title = isBeit3
      ? 'Đang dùng BEiT-3. Bấm để đổi sang MetaCLIP-2.'
      : 'Đang dùng MetaCLIP-2. Bấm để đổi sang BEiT-3.';
    els.embeddingModelToggle.setAttribute('aria-label', `Mô hình embedding ${isBeit3 ? 'BEiT-3' : 'MetaCLIP-2'}`);
    els.embeddingModelToggle.classList.toggle('is-beit3', isBeit3);
  }
  syncAutoTranslateControls();
}

function syncAutoTranslateControls() {
  const enabled = Boolean(state.autoTranslate);
  if (els.autoTranslateToggle) {
    els.autoTranslateToggle.classList.toggle('is-active', enabled);
    els.autoTranslateToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    els.autoTranslateToggle.title = enabled
      ? 'Auto Dịch tiếng Anh đang BẬT (tự động dịch query trước khi tìm kiếm). Bấm để tắt.'
      : 'Auto Dịch tiếng Anh đang TẮT. Bấm để bật tự động dịch câu query tiếng Việt sang tiếng Anh trước khi tìm kiếm.';
  }
  if (els.autoTranslateLabel) {
    els.autoTranslateLabel.textContent = enabled ? 'Auto EN: BẬT' : 'Auto EN: Tắt';
  }
}


async function refreshHealth() {
  try {
    const resp = await fetch('/health');
    const health = await resp.json();
    state.backend = health;
    if (health.embedding_models?.[state.embeddingModel]?.available === false) {
      state.embeddingModel = 'metaclip';
    }
    const ocrModels = health.ocr_models || {};
    if (state.ocrModel !== 'ppocr' && ocrModels[state.ocrModel]?.available !== true) {
      state.ocrModel = 'ppocr';
    }
    const defaults = health.default_fusion_weights;
    if (!state.fusionWeightsTouched && defaults && Number(defaults.metaclip) + Number(defaults.ocr) > 0) {
      const ocrPercent = Math.round(
        Number(defaults.ocr) / (Number(defaults.metaclip) + Number(defaults.ocr)) * 100
      );
      if (state.stages[0]) state.stages[0].ocrWeight = ocrPercent;
      state.stages.forEach(stage => {
        stage.ocrWeight = ocrPercent;
      });
      if (Number(defaults.asr) > 0) {
        state.asrWeight = normalizeAsrPercent(Number(defaults.asr) * 100);
        if (state.stages[0]) state.stages[0].asrWeight = state.asrWeight;
      }
    }
    renderStages();
    syncEmbeddingModelControls();
    setStatus('Đã kết nối', 'ok');
  } catch {
    setStatus('Mất kết nối', 'error');
  }
}

function sortResults(results) {
  return [...results].sort((a, b) =>
    Number(b.sequence_score ?? b.score ?? 0) - Number(a.sequence_score ?? a.score ?? 0)
  );
}

function groupShotSuggestions(results, limit) {
  const groups = new Map();
  for (const item of sortResults(results)) {
    const key = item.shot_id == null
      ? `frame:${item.keyframe_id}`
      : `shot:${normalizeVideoId(item.video_id)}:${item.shot_id}`;
    if (!groups.has(key)) groups.set(key, []);
    const frames = groups.get(key);
    if (frames.length < 5) frames.push(item);
  }
  return [...groups.values()]
    .sort((left, right) =>
      Math.max(...right.map(item => Number(item.cosine_similarity ?? item.score ?? 0)))
      - Math.max(...left.map(item => Number(item.cosine_similarity ?? item.score ?? 0)))
    )
    .flat()
    .slice(0, limit)
    .map((item, index) => ({...item, rank: index + 1}));
}

function syncFusionWeights() {
  // Fusion weight summary is rendered and synced per stage card in renderStages()
}

function fusionWeightsForStage(stage, {hasSemantic = true, hasOcr = true, hasAsr = true} = {}) {
  const ocrPercent = hasOcr ? normalizeOcrPercent(stage?.ocrWeight, 41) : 0;
  const asrPercent = hasAsr && state.backend?.asr_available === true ? normalizeAsrPercent(stage?.asrWeight, 20) : 0;
  
  let ocrWeight = ocrPercent / 100;
  let asrWeight = asrPercent / 100;
  let metaclipWeight = 1 - ocrWeight - asrWeight;
  
  if (!hasSemantic) {
    metaclipWeight = 0;
  }
  
  const total = metaclipWeight + ocrWeight + asrWeight;
  if (total <= 0) {
    return {
      metaclip_weight: hasSemantic ? 1 : 0,
      ocr_weight: hasOcr && !hasSemantic ? 1 : 0,
      asr_weight: hasAsr && !hasSemantic && !hasOcr ? 1 : 0
    };
  }
  
  return {
    metaclip_weight: metaclipWeight / total,
    ocr_weight: ocrWeight / total,
    asr_weight: asrWeight / total
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function collectVideoFilter() {
  return els.videoFilter.value.trim();
}



function normalizeVideoId(value) {
  return String(value || '').trim().toUpperCase();
}

function applyVideoFilter(results, videoFilter) {
  const normalizedFilter = normalizeVideoId(videoFilter);
  const rankedResults = sortResults(results);
  if (!normalizedFilter) return rankedResults;
  return rankedResults.filter(item => normalizeVideoId(item.video_id) === normalizedFilter);
}

function searchTopK() {
  return 200;
}



// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.normalizeOcrPercent = normalizeOcrPercent; } catch (_) {}
  try { window.normalizeAsrPercent = normalizeAsrPercent; } catch (_) {}
  try { window.syncSingleQuerySource = syncSingleQuerySource; } catch (_) {}
  try { window.renderStages = renderStages; } catch (_) {}
  try { window.setQueryMode = setQueryMode; } catch (_) {}
  try { window.setSimilarityItem = setSimilarityItem; } catch (_) {}
  try { window.invalidateTemporalResults = invalidateTemporalResults; } catch (_) {}
  try { window.addTemporalStage = addTemporalStage; } catch (_) {}
  try { window.removeStage = removeStage; } catch (_) {}
  try { window.collectQueries = collectQueries; } catch (_) {}
  try { window.looksLikeVietnameseQuery = looksLikeVietnameseQuery; } catch (_) {}
  try { window.requestEnglishTranslation = requestEnglishTranslation; } catch (_) {}
  try { window.showStageTranslation = showStageTranslation; } catch (_) {}
  try { window.collectOcrQueries = collectOcrQueries; } catch (_) {}
  try { window.collectAsrQueries = collectAsrQueries; } catch (_) {}
  try { window.collectQuery = collectQuery; } catch (_) {}
  try { window.setSearchMode = setSearchMode; } catch (_) {}
  try { window.syncSearchModeControls = syncSearchModeControls; } catch (_) {}
  try { window.syncEmbeddingModelControls = syncEmbeddingModelControls; } catch (_) {}
  try { window.syncAutoTranslateControls = syncAutoTranslateControls; } catch (_) {}
  try { window.refreshHealth = refreshHealth; } catch (_) {}
  try { window.sortResults = sortResults; } catch (_) {}
  try { window.groupShotSuggestions = groupShotSuggestions; } catch (_) {}
  try { window.syncFusionWeights = syncFusionWeights; } catch (_) {}
  try { window.fusionWeightsForStage = fusionWeightsForStage; } catch (_) {}
  try { window.escapeHtml = escapeHtml; } catch (_) {}
  try { window.collectVideoFilter = collectVideoFilter; } catch (_) {}
  try { window.normalizeVideoId = normalizeVideoId; } catch (_) {}
  try { window.applyVideoFilter = applyVideoFilter; } catch (_) {}
  try { window.searchTopK = searchTopK; } catch (_) {}
}
