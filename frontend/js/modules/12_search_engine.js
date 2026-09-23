/**
 * ==============================================================================
 * TỆP TIN: js/modules/12_search_engine.js
 * MÔ TẢ:
 *   Động cơ tìm kiếm chính: performSearch() nguyên bản 100% (xử lý chuẩn cả single search, multi-query, và temporal search với action start/continue/replace), loadVideoFps, resetWorkspace.
 * ==============================================================================
 */

async function loadVideoFps() {
  try {
    const resp = await fetch('/video_fps.json', {cache: 'no-store'});
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const config = await resp.json();
    if (!Number.isFinite(Number(config.default_fps)) || typeof config.overrides !== 'object') {
      throw new Error('metadata FPS không hợp lệ');
    }
    state.videoFps = config;
  } catch (error) {
    setLog(`Không tải được video_fps.json: ${error.message || error}`);
  }
}

function fuseMultiQueryResults(payloads, queries, topK) {
  const bestByQuery = payloads.map((payload, queryIndex) => {
    const bestByVideo = new Map();
    (payload.results || []).forEach(item => {
      const videoId = String(item.video_id || '');
      const current = bestByVideo.get(videoId);
      if (!current || Number(item.score || 0) > Number(current.score || 0)) {
        bestByVideo.set(videoId, {...item, query: queries[queryIndex], query_index: queryIndex});
      }
    });
    return bestByVideo;
  });
  if (!bestByQuery.length) return [];
  return [...bestByQuery[0].keys()]
    .filter(videoId => bestByQuery.every(group => group.has(videoId)))
    .map(videoId => {
      const queryFrames = bestByQuery.map(group => group.get(videoId));
      const score = queryFrames.reduce((sum, frame) => sum + Number(frame.score || 0), 0);
      const center = queryFrames[Math.floor(queryFrames.length / 2)];
      return {...center, video_id: videoId, score, query_frames: queryFrames, stage: 1};
    })
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, topK)
    .map((item, index) => ({...item, rank: index + 1}));
}

async function performSearch(requestedTemporalStageIndex = null, translatedQueryOverride = '') {
  const originalQueries = collectQueries();
  const ocrQueries = collectOcrQueries();
  const asrQueries = collectAsrQueries();
  const temporal = state.stages.length > 1;
  const multi = !temporal && state.searchMode === 'multi';
  const temporalStageIndex = temporal && Number.isInteger(requestedTemporalStageIndex)
    ? requestedTemporalStageIndex
    : state.temporalStage;
  if (temporal && !Number.isInteger(requestedTemporalStageIndex) && temporalStageIndex >= 3) {
    showError('Hãy sửa Query A, B hoặc C rồi bấm nút tìm lại của stage đó.');
    return;
  }
  const shouldAutoTranslate = Boolean(state.autoTranslate) && !translatedQueryOverride;
  if (shouldAutoTranslate) {
    const indexesToTranslate = temporal
      ? [temporalStageIndex]
      : originalQueries.map((_, index) => index);
    try {
      for (const index of indexesToTranslate) {
        const source = originalQueries[index] || '';
        const stage = state.stages[index];
        if (!stage || !looksLikeVietnameseQuery(source) || stage.translatedQuery) continue;
        showError('');
        setStatus(`Đang dịch Query ${stageLetter(index)} sang tiếng Anh…`, 'searching');
        const {translation} = await requestEnglishTranslation(source);
        showStageTranslation(stage, translation);
      }
    } catch (error) {
      console.warn('Auto translate warning, continuing with original query:', error);
      setStatus('Không dịch được query, đang tiếp tục tìm kiếm…', 'searching');
    }
  }
  const queries = originalQueries.map((query, index) => state.stages[index]?.translatedQuery || query);
  const temporalOriginalQuery = temporal ? (originalQueries[temporalStageIndex] || '') : '';
  const temporalQuery = temporal ? (translatedQueryOverride || state.stages[temporalStageIndex]?.translatedQuery || temporalOriginalQuery) : '';
  const temporalOcrQuery = temporal ? (ocrQueries[temporalStageIndex] || '') : '';
  const temporalAsrQuery = temporal ? (asrQueries[temporalStageIndex] || '') : '';
  const enteredQuery = translatedQueryOverride || queries[0] || '';
  const query = !temporal && !multi && !/[\p{L}\p{N}]/u.test(enteredQuery) ? '' : enteredQuery;
  const ocrQuery = !temporal && !multi ? ocrQueries[0] : '';
  const asrQuery = !temporal && !multi ? asrQueries[0] : '';
  const asrOnly = !temporal && state.asrOnly && state.backend?.asr_available === true;
  const isSimilarityOpen = Boolean(els.globalSimilarityPopover && !els.globalSimilarityPopover.hidden);
  const similarity = isSimilarityOpen && !asrOnly
    && Boolean(state.similarityItem)
    && ((!query && !ocrQuery && !asrQuery) || state.queryMode === 'similarity');
  if (!similarity && !temporal && !multi) {
    state.queryMode = 'text';
  }
  const videoFilter = collectVideoFilter();
  const top_k = searchTopK();
  const requestTopK = !temporal && !multi ? top_k * 3 : top_k;
  const invalidMultiQuery = multi && (
    queries.length < 2
    || queries.length > 5
    || (asrOnly ? asrQueries.some(item => !item) : queries.some((item, index) => !item && !ocrQueries[index] && !asrQueries[index]))
  );
  if (temporal && temporalStageIndex > state.temporalStage) {
    showError(`Cần tìm Query ${stageLetter(state.temporalStage)} trước.`);
    return;
  }
  if ((similarity && !state.similarityItem) || (!temporal && !multi && !similarity && (asrOnly ? !asrQuery : !query && !ocrQuery && !asrQuery)) || (temporal && !temporalQuery && !temporalOcrQuery && !temporalAsrQuery) || invalidMultiQuery) {
    showError(temporal
      ? `Nhập Query ${stageLetter(temporalStageIndex)} trước khi tìm kiếm.`
      : multi ? 'Mỗi Query cần nhập Text Query, OCR Query hoặc ASR Query.'
      : asrOnly ? 'Nhập ASR Query trước khi tìm kiếm.'
      : similarity ? 'Kéo hoặc chọn một frame nguồn trước khi tìm similarity.' : 'Nhập ít nhất một Text Query, OCR Query hoặc ASR Query.');
    return;
  }
  showError('');
  setStatus('Đang tìm', 'searching');
  try {
    await clearCorrectSubmissionFeedback();
    const clientStarted = performance.now();
    const clientSendEpoch = Date.now();
    const temporalWeights = temporal ? fusionWeightsForStage(state.stages[temporalStageIndex], {
      hasSemantic: Boolean(temporalQuery),
      hasOcr: Boolean(temporalOcrQuery),
      hasAsr: Boolean(temporalAsrQuery)
    }) : null;
    const requestBody = temporal
      ? {
          action: temporalStageIndex === 0
            ? 'start'
            : temporalStageIndex < state.temporalStage ? 'replace' : 'continue',
          session_id: state.temporalSessionId || undefined,
          query: temporalQuery,
          original_query: temporalOriginalQuery,
          ocr_query: temporalOcrQuery,
          asr_query: temporalAsrQuery,
          embedding_model: state.embeddingModel,
          search_mode: temporalOcrQuery || temporalAsrQuery ? 'hybrid' : 'visual',
          ...temporalWeights,
          stage: temporalStageIndex + 1,
          video_id: temporalStageIndex === 0 ? (videoFilter || undefined) : undefined
        }
      : similarity ? {
          keyframe_id: state.similarityItem.keyframe_id,
          query: state.similarityQuery.trim(),
          image_weight: (100 - state.similarityTextWeight) / 100,
          text_weight: state.similarityTextWeight / 100,
          top_k: requestTopK,
          video_id: videoFilter || undefined,
          search_mode: 'similarity',
          embedding_model: state.embeddingModel
        } : asrOnly && !multi ? {
          query: '',
          asr_query: asrQuery,
          top_k: requestTopK,
          video_id: videoFilter || undefined,
          search_mode: 'hybrid',
          embedding_model: state.embeddingModel,
          ocr_model: state.ocrModel,
          metaclip_weight: 0,
          ocr_weight: 0,
          asr_weight: 1
        } : {
          query: multi ? queries.join(' ; ') : query,
          ocr_query: multi ? undefined : ocrQuery,
          asr_query: multi ? undefined : asrQuery,
          queries: multi ? queries : undefined,
          top_k: requestTopK,
          video_id: videoFilter || undefined,
          search_mode: 'hybrid',
          embedding_model: state.embeddingModel,
          ocr_model: state.ocrModel,
          ...fusionWeightsForStage(state.stages[0], {
            hasSemantic: Boolean(query),
            hasOcr: Boolean(ocrQuery),
            hasAsr: Boolean(asrQuery)
          })
        };
    let payload;
    if (multi) {
      const responses = await Promise.all(queries.map((item, index) => {
        const stageOcrQuery = ocrQueries[index];
        const stageAsrQuery = asrQueries[index];
        const fusionWeights = fusionWeightsForStage(state.stages[index], {
          hasSemantic: Boolean(item),
          hasOcr: Boolean(stageOcrQuery),
          hasAsr: Boolean(stageAsrQuery)
        });
        return fetch('/search', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            query: item,
            ocr_query: stageOcrQuery,
            asr_query: stageAsrQuery,
            top_k,
            video_id: videoFilter || undefined,
            search_mode: 'hybrid',
            embedding_model: state.embeddingModel,
            ocr_model: state.ocrModel,
            ...fusionWeights,
            ...(asrOnly ? {query: '', asr_query: stageAsrQuery, ocr_query: undefined} : {})
          })
        });
      }));
      const payloads = await Promise.all(responses.map(response => response.json()));
      const failedIndex = responses.findIndex(response => !response.ok);
      if (failedIndex >= 0) throw new Error(payloads[failedIndex].detail || 'Tìm kiếm thất bại.');
      const fusedResults = fuseMultiQueryResults(
        payloads,
        queries.map((item, index) => item || (ocrQueries[index] ? `OCR: ${ocrQueries[index]}` : `ASR: ${asrQueries[index]}`)),
        top_k
      );
      payload = {
        results: fusedResults,
        returned: fusedResults.length,
        search_backend: payloads[0]?.search_backend,
        embedding_model: state.embeddingModel,
        total_candidates: payloads[0]?.total_candidates,
        filtered_candidates: payloads[0]?.filtered_candidates,
        query_count: queries.length,
        timings_ms: {total_ms: payloads.reduce((sum, item) => sum + Number(item.timings_ms?.total_ms || 0), 0)}
      };
    } else {
      const resp = await fetch(temporal ? '/temporal-search' : '/search', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(requestBody)
      });
      payload = await resp.json();
      if (!resp.ok) throw new Error(payload.detail || 'Tìm kiếm thất bại.');
    }
    const responseReceivedMs = performance.now() - clientStarted;
    if (temporal) {
      state.temporalSessionId = payload.session_id;
      state.temporalStage = Number(payload.stage || 0);
      if (state.stages[temporalStageIndex]) {
        state.stages[temporalStageIndex].temporalExpanded = false;
      }
      if (state.temporalStage < 3 && state.stages.length === state.temporalStage) {
        const nextIndex = state.temporalStage;
        state.stages.push({
          id: `${Date.now()}-${nextIndex}`,
          name: `Hành động ${stageLetter(nextIndex)}`,
          query: '',
          translatedQuery: '',
          ocrQuery: '',
          asrQuery: '',
          ocrWeight: 0,
          asrWeight: 0
        });
      }
    }
    const backendResults = temporal
      ? (payload.results || []).map(item => {
          const scenes = Array.isArray(item.scenes) ? item.scenes : [];
          if (!scenes.length) return item;
          const frame = scenes[scenes.length - 1];
          const temporalScore = Number(item.temporal_score ?? item.sequence_score ?? frame.normalized_score ?? frame.score ?? 0);
          return {
            ...frame,
            rank: item.rank ?? frame.rank,
            score: temporalScore,
            normalized_score: temporalScore,
            temporal_score: temporalScore,
            sequence_score: temporalScore,
            temporal_scenes: scenes
          };
        })
      : (payload.results || []).map(item => ({...item, stage: 1}));
    const filteredResults = applyVideoFilter(backendResults, videoFilter);
    state.results = temporal
      ? filteredResults.slice(0, 200)
      : multi ? filteredResults.slice(0, top_k)
      : groupShotSuggestions(filteredResults, top_k);
    const renderStarted = performance.now();
    renderStages();
    syncSearchModeControls();
    renderResults();
    const frontendRenderMs = performance.now() - renderStarted;
    const clientTotalMs = performance.now() - clientStarted;
    const backendTotalMs = Number(payload.timings_ms?.total_ms || 0);
    const networkRttMs = Math.max(0, responseReceivedMs - backendTotalMs);
    const transitUpMs = networkRttMs / 2;
    const transitDownMs = networkRttMs / 2;
    state.lastSearchTiming = {
      clientTotalMs,
      timings: {
        ...(payload.timings_ms || {}),
        transit_up_ms: transitUpMs,
        transit_down_ms: transitDownMs,
        frontend_response_ms: responseReceivedMs,
        frontend_render_ms: frontendRenderMs
      },
      searchBackend: payload.search_backend,
      totalCandidates: payload.total_candidates
    };
    console.log(
      `%c[SEARCH LATENCY]%c ` +
      `🛫 Đi (Client->Backend): ${transitUpMs.toFixed(1)}ms | ` +
      `⚙️ Backend: ${backendTotalMs.toFixed(1)}ms | ` +
      `🛬 Về (Backend->Client): ${transitDownMs.toFixed(1)}ms | ` +
      `🔄 Tổng RTT: ${responseReceivedMs.toFixed(1)}ms`,
      'color: #06b6d4; font-weight: bold;',
      'color: inherit;'
    );
    fetch('/api/log-latency', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        user: state.memberName || state.dresUsername || 'Ẩn danh',
        path: temporal ? '/temporal-search' : '/search',
        transit_up_ms: transitUpMs,
        server_ms: backendTotalMs,
        transit_down_ms: transitDownMs,
        rtt_ms: responseReceivedMs,
        client_epoch: clientSendEpoch
      })
    }).catch(() => {});
    trackThumbnailTimings(renderStarted);
    const filterMeta = videoFilter ? ` - lọc ${normalizeVideoId(videoFilter)} trong ${payload.filtered_candidates ?? backendResults.length} frame` : '';
    els.searchTimingBtn.textContent = `Tổng thời gian: ${formatMilliseconds(clientTotalMs)}`;
    els.searchTimingBtn.disabled = false;
    els.searchTimingBtn.hidden = false;
    const modelLabel = (payload.embedding_model || state.embeddingModel) === 'beit3' ? 'BEiT-3' : 'MetaCLIP';
    const weightMeta = similarity
      ? `Ảnh tương tự · nguồn ${state.similarityItem.keyframe_id}${state.similarityQuery.trim() ? ` · Ảnh ${100 - state.similarityTextWeight}% / mô tả ${state.similarityTextWeight}%` : ''}`
      : temporal
      ? `Query ${stageLetter(Math.max(0, Number(payload.stage || 1) - 1))} · cửa sổ ${Number(payload.parameters?.temporal_window_ms || 300000) / 1000} giây · model cố định ${modelLabel}`
      : multi
      ? `${queries.length} Query${asrOnly ? ' · Chỉ ASR' : ''}`
      : `Hình ảnh ${Math.round(Number(requestBody.metaclip_weight) * 100)}% · Text OCR ${Math.round(Number(requestBody.ocr_weight) * 100)}% · ASR ${Math.round(Number(requestBody.asr_weight || 0) * 100)}%${ocrQuery ? ` · OCR “${ocrQuery}”` : ''}${asrQuery ? ` · ASR “${asrQuery}”` : ''}`;
    const temporalMeta = temporal ? `Temporal ${payload.stage_count || queries.length} hành động · ` : '';
    const anchorMeta = temporal && payload.anchor_stage ? `anchor H${payload.anchor_stage} · ` : '';
    const ocrModelLabel = state.ocrModel === 'monkey' ? 'MonkeyOCRv2' : 'PP-OCRv6';
    els.searchMeta.textContent = `${modelLabel} · ${ocrModelLabel} · ${temporalMeta}${anchorMeta}${backendMethodLabel(payload.search_backend)} · ${weightMeta}${filterMeta}`;
    els.results.scrollTo({top: 0, left: 0, behavior: 'smooth'});
    setStatus('Đã kết nối', 'ok');
  } catch (error) {
    showError(error.message || String(error));
    setStatus('Mất kết nối', 'error');
  }
}

function resetWorkspace() {
  const hasData = state.results.length || state.selected.length || collectQuery() || collectVideoFilter();
  if (hasData && !window.confirm('Đặt lại truy vấn, kết quả và các frame đã chọn?')) return;
  state.searchMode = 'temporal';
  state.embeddingModel = 'metaclip';
  state.queryMode = 'text';
  state.similarityItem = null;
  state.similarityQuery = '';
  state.similarityTextWeight = 30;
  state.asrWeight = 20;
  state.asrOnly = false;
  if (els.globalSimilarityDropzone) {
    els.globalSimilarityDropzone.style.padding = '12px';
    els.globalSimilarityDropzone.innerHTML = `<strong id="globalSimilarityDropzoneText" style="color: var(--text-primary); font-size: 13px;">Thả ảnh vào đây</strong>`;
  }
  state.temporalSessionId = null;
  state.temporalStage = 0;
  state.stages = [{id: Date.now(), name: 'Hành động A', query: '', translatedQuery: '', ocrQuery: '', asrQuery: '', ocrWeight: 41, asrWeight: 20}];
  state.results = [];
  hideCorrectCelebration();
  clearSubmissionFeedback();
  state.selected.forEach(item => {
    if (item.trayUrl?.startsWith('blob:')) URL.revokeObjectURL(item.trayUrl);
  });
  state.selected = [];
  resetSearchTiming();
  state.fusionWeightsTouched = false;
  renderStages();
  syncSearchModeControls();
  syncEmbeddingModelControls();
  if (els.videoFilter) els.videoFilter.value = '';
  syncFusionWeights();
  renderResults();
  renderSelection();
  showError('');
  els.searchMeta.textContent = 'Chưa tìm kiếm';
  setStatus(state.backend ? 'Đã kết nối' : 'Sẵn sàng.', state.backend ? 'ok' : 'neutral');
}

async function resetTemporalSearch() {
  if (state.searchMode !== 'temporal') return;
  const sessionId = state.temporalSessionId;
  els.resetTemporalBtn.disabled = true;
  try {
    if (sessionId) {
      const response = await fetch('/temporal-search', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'reset', session_id: sessionId})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);
    }
    state.temporalSessionId = null;
    state.temporalStage = 0;
    state.stages = state.stages.slice(0, 1);
    state.stages[0].temporalExpanded = false;
    invalidateTemporalResults();
    renderStages();
    syncSearchModeControls();
    setLog('Đã reset temporal; sẵn sàng tìm lại từ Query A.');
    setStatus(state.backend ? 'Đã kết nối' : 'Sẵn sàng.', state.backend ? 'ok' : 'neutral');
    els.stageList.querySelector('.stage-card:first-child .text-query')?.focus();
  } catch (error) {
    showError(`Reset temporal thất bại: ${error.message}`);
    setStatus('Mất kết nối', 'error');
    syncSearchModeControls();
  }
}



// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.loadVideoFps = loadVideoFps; } catch (_) {}
  try { window.fuseMultiQueryResults = fuseMultiQueryResults; } catch (_) {}
  try { window.performSearch = performSearch; } catch (_) {}
  try { window.resetWorkspace = resetWorkspace; } catch (_) {}
  try { window.resetTemporalSearch = resetTemporalSearch; } catch (_) {}
}
