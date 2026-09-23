/**
 * ==============================================================================
 * TỆP TIN: js/modules/08_video_asr.js
 * MÔ TẢ:
 *   Phụ đề lời thoại ASR toàn bộ video theo thời gian thực: transcript, bôi đậm theo currentTime, cuộn mượt và chi tiết OCR/Caption.
 * ==============================================================================
 */

function setImageAddTrayState(isAdded) {
  els.imageAddTrayBtn.disabled = isAdded;
  els.imageAddTrayBtn.innerHTML = `${addToTrayIcon()}${isAdded ? 'Đã có trong khay' : 'Thêm vào khay'}`;
  refreshIcons(els.imageAddTrayBtn);
}

function keyframeInfoHtml(item, options = {}) {
  const stage = options.stage ?? item.stage;
  const rank = options.rank ?? item.rank;
  const score = Number(item.score);
  const details = [];
  if (stage !== null && stage !== undefined) details.push(`<span><strong>Giai đoạn</strong> ${escapeHtml(stage)}</span>`);
  if (rank !== null && rank !== undefined) details.push(`<span><strong>Hạng</strong> ${escapeHtml(rank)}</span>`);
  details.push(
    `<span><strong>Video</strong> ${escapeHtml(item.video_id)}</span>`,
    `<span><strong>Shot</strong> ${escapeHtml(item.shot_id)}</span>`,
    `<span><strong>Thời điểm</strong> ${formatVideoTime(answerTimeMs(item) / 1000)}</span>`,
    `<span class="keyframe-info-id"><strong>Keyframe</strong> ${escapeHtml(item.keyframe_id)}</span>`
  );
  if (item.score !== null && item.score !== undefined && Number.isFinite(score)) {
    details.push(`<span><strong>Điểm</strong> ${score.toFixed(4)}</span>`);
  }
  if (Array.isArray(item.match_source) && item.match_source.length > 0) {
    details.push(`<span class="keyframe-info-wide"><strong>Nguồn</strong> ${escapeHtml(item.match_source.join(' + '))}</span>`);
  }
  return details.join('');
}

const frameTextCache = new Map();
let videoTextRequestVersion = 0;
let videoAsrReturnTimer = 0;

async function fetchFrameText(keyframeId) {
  if (!keyframeId) return null;
  const cached = frameTextCache.get(keyframeId);
  if (cached) return cached;
  try {
    const res = await fetch(`/frame-text/${encodeURIComponent(keyframeId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    frameTextCache.set(keyframeId, data);
    return data;
  } catch (err) {
    console.warn('Không lấy được frame-text:', err);
    return null;
  }
}

function renderFrameTextDetails(container, data, item, isLoading = false, options = {}) {
  if (!container) return;
  const showOcr = options.showOcr !== false;
  const showAsr = options.showAsr !== false;
  const ocrText = (data?.ocr_text ?? item?.ocr_text ?? '').trim();
  const asrText = (data?.asr_text ?? item?.asr_text ?? '').trim();
  const asrStart = data && Object.hasOwn(data, 'asr_start_ms') ? data.asr_start_ms : item?.asr_start_ms;
  const asrEnd = data && Object.hasOwn(data, 'asr_end_ms') ? data.asr_end_ms : item?.asr_end_ms;
  const hasAsrTime = asrStart !== null && asrStart !== undefined && asrEnd !== null && asrEnd !== undefined;
  const asrTimeStr = hasAsrTime ? `[${formatVideoTime(Number(asrStart) / 1000)} – ${formatVideoTime(Number(asrEnd) / 1000)}]` : '';

  const ocrEmptyText = isLoading ? 'Đang tải dữ liệu OCR...' : 'Không phát hiện chữ trong frame này';
  const asrEmptyText = isLoading ? 'Đang tải dữ liệu ASR...' : 'Không có lời thoại tại đoạn này';

  const ocrHtml = `
    <div class="frame-text-card ocr-card">
      <div class="frame-text-card-head">
        <div class="frame-text-badge-wrap">
          <span class="frame-text-badge ocr-badge"><i data-lucide="scan-text"></i> OCR TEXT</span>
        </div>
        ${ocrText ? `<button class="text-copy-btn" type="button" data-copy-text="${escapeHtml(ocrText)}"><i data-lucide="copy"></i> Copy</button>` : ''}
      </div>
      <div class="frame-text-content ${ocrText ? '' : 'frame-text-empty'}">
        ${ocrText ? escapeHtml(ocrText) : ocrEmptyText}
      </div>
    </div>
  `;

  const asrHtml = `
    <div class="frame-text-card asr-card">
      <div class="frame-text-card-head">
        <div class="frame-text-badge-wrap">
          <span class="frame-text-badge asr-badge"><i data-lucide="mic"></i> ASR LỜI THOẠI</span>
          ${asrTimeStr ? `<span class="frame-text-time">${escapeHtml(asrTimeStr)}</span>` : ''}
        </div>
        ${asrText ? `<button class="text-copy-btn" type="button" data-copy-text="${escapeHtml(asrText)}"><i data-lucide="copy"></i> Copy</button>` : ''}
      </div>
      <div class="frame-text-content ${asrText ? '' : 'frame-text-empty'}">
        ${asrText ? escapeHtml(asrText) : asrEmptyText}
      </div>
    </div>
  `;

  container.innerHTML = `${showOcr ? ocrHtml : ''}${showAsr ? asrHtml : ''}`;
  container.querySelectorAll('.text-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.getAttribute('data-copy-text');
      if (text) {
        navigator.clipboard.writeText(text).then(() => {
          const originalHtml = btn.innerHTML;
          btn.classList.add('copied');
          btn.innerHTML = '<i data-lucide="check"></i> Đã chép!';
          refreshIcons(btn);
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = originalHtml;
            refreshIcons(btn);
          }, 1500);
        }).catch(() => {});
      }
    });
  });
  refreshIcons(container);
}

function videoFrameItemFromThumb(thumb) {
  if (!thumb || !state.activeVideoItem) return null;
  const keyframeId = thumb.dataset.keyframeId || '';
  const candidates = [
    ...state.activeFrameContextFrames,
    ...state.activeShotContextFrames,
    ...uniqueVideoFrames(state.activeVideoItem.video_id, state.activeVideoItem)
  ];
  const match = candidates.find(frame => frame?.keyframe_id === keyframeId);
  if (match) return match;
  const seconds = Number(thumb.dataset.seconds) || 0;
  return {
    ...state.activeVideoItem,
    keyframe_id: keyframeId || state.activeVideoItem.keyframe_id,
    frame_id: thumb.dataset.frameId || state.activeVideoItem.frame_id,
    timestamp_seconds: seconds,
    timestamp_ms: Math.round(seconds * 1000)
  };
}

function updateVideoAsrFrameLabel(item) {
  if (!item || !els.videoFrameTextLabel) return;
  const currentSeconds = Math.max(0, Number(els.player.currentTime) || 0);
  const fps = fpsForVideo(state.activeVideoItem?.video_id || item.video_id);
  const displayedFrameId = Number.isFinite(fps) && fps > 0
    ? Math.max(0, Math.floor(currentSeconds * fps + 1e-6))
    : item.frame_id;
  els.videoFrameTextLabel.textContent = `Frame ${displayedFrameId} · ${formatVideoTime(currentSeconds)}`;
}

function centerCurrentVideoAsr(behavior = 'smooth') {
  if (!els.videoFrameTextDetails) return;
  const activeSegment = els.videoFrameTextDetails.querySelector('.video-asr-segment.is-current');
  activeSegment?.scrollIntoView({block: 'center', inline: 'nearest', behavior});
}

function scheduleVideoAsrReturn() {
  window.clearTimeout(videoAsrReturnTimer);
  videoAsrReturnTimer = window.setTimeout(() => {
    if (state.showVideoFrameText) centerCurrentVideoAsr('smooth');
  }, 1200);
}

function updateVideoAsrHighlight(item) {
  if (!state.showVideoFrameText || !els.videoFrameTextDetails) return;
  updateVideoAsrFrameLabel(item);
  const currentMs = Math.round(Math.max(0, Number(els.player.currentTime) || 0) * 1000);
  let activeEntry = null;
  state.activeVideoAsrEntries.forEach(entry => {
    if (currentMs >= entry.startMs && currentMs <= entry.endMs) {
      if (!activeEntry || (entry.endMs - entry.startMs) < (activeEntry.endMs - activeEntry.startMs)) {
        activeEntry = entry;
      }
    }
  });
  const highlightKey = activeEntry?.key || '';
  els.videoFrameTextDetails.querySelectorAll('.video-asr-segment').forEach(segment => {
    segment.classList.toggle('is-current', segment.dataset.asrKey === highlightKey);
  });
  if (highlightKey && highlightKey !== state.activeVideoAsrHighlightKey) {
    centerCurrentVideoAsr(els.player.paused ? 'auto' : 'smooth');
  }
  state.activeVideoAsrHighlightKey = highlightKey;
}

function renderVideoAsrTranscript(item, isLoading = false) {
  if (!item || !els.videoFrameTextDetails) return;
  updateVideoAsrFrameLabel(item);

  if (isLoading && state.activeVideoAsrEntries.length === 0) {
    els.videoFrameTextDetails.innerHTML = '<div class="video-asr-empty">Đang tải toàn bộ lời thoại của video...</div>';
    return;
  }

  if (state.activeVideoAsrEntries.length === 0) {
    els.videoFrameTextDetails.innerHTML = '<div class="video-asr-empty">Video này không có lời thoại ASR.</div>';
    return;
  }

  els.videoFrameTextDetails.innerHTML = `
    <div class="video-asr-transcript" aria-label="Toàn bộ lời thoại ASR của video">
      ${state.activeVideoAsrEntries.map(entry => `
        <button class="video-asr-segment" type="button" data-asr-key="${escapeHtml(entry.key)}" data-asr-start="${entry.startMs}" title="Phát từ ${formatVideoTime(entry.startMs / 1000)}">
          <span>${escapeHtml(entry.text)}</span>
        </button>`).join(' ')}
    </div>`;
  els.videoFrameTextDetails.querySelectorAll('.video-asr-segment').forEach(segment => {
    segment.addEventListener('click', event => {
      event.stopPropagation();
      seekVideoToSeconds(Number(segment.dataset.asrStart) / 1000, true);
    });
  });
  const transcript = els.videoFrameTextDetails.querySelector('.video-asr-transcript');
  transcript?.addEventListener('scroll', scheduleVideoAsrReturn, {passive: true});
  transcript?.addEventListener('wheel', scheduleVideoAsrReturn, {passive: true});
  transcript?.addEventListener('pointerup', scheduleVideoAsrReturn);
  transcript?.addEventListener('touchend', scheduleVideoAsrReturn, {passive: true});
  updateVideoAsrHighlight(item);
}

async function loadVideoAsrContext(item, force = false) {
  const currentContext = state.activeVideoAsrContext;
  if (!force && currentContext?.videoId === item.video_id) {
    updateVideoAsrHighlight(item);
    return;
  }

  const requestVersion = ++videoTextRequestVersion;
  renderVideoAsrTranscript(item, true);
  const response = await fetch(`/video-asr/${encodeURIComponent(item.video_id)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);
  if (requestVersion !== videoTextRequestVersion || !state.showVideoFrameText) return;

  state.activeVideoAsrEntries = (Array.isArray(payload.segments) ? payload.segments : [])
    .map(segment => {
      const text = String(segment.text_raw || '').trim();
      const startMs = Number(segment.start_ms);
      const endMs = Number(segment.end_ms);
      return {
        key: `${segment.segment_id}:${startMs}:${endMs}`,
        text,
        startMs,
        endMs
      };
    })
    .filter(entry => entry.text && Number.isFinite(entry.startMs) && Number.isFinite(entry.endMs))
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  state.activeVideoAsrContext = {
    videoId: item.video_id,
    segmentCount: state.activeVideoAsrEntries.length
  };
  state.activeVideoAsrHighlightKey = '';
  renderVideoAsrTranscript(item, false);
}

async function updateVideoFrameText(activeThumb = null, force = false) {
  if (!state.showVideoFrameText || !els.videoFrameTextPanel || els.videoModal.hidden) return;
  const thumb = activeThumb || els.videoFrameStrip?.querySelector('.video-frame-thumb.is-active');
  const item = videoFrameItemFromThumb(thumb);
  if (!item?.keyframe_id) {
    els.videoFrameTextLabel.textContent = 'Chưa xác định frame';
    els.videoFrameTextDetails.innerHTML = '';
    return;
  }
  const keyframeChanged = state.activeVideoTextKeyframeId !== item.keyframe_id;
  state.activeVideoTextKeyframeId = item.keyframe_id;
  state.activeVideoTextItem = item;
  updateVideoAsrHighlight(item);
  if (force || keyframeChanged || !state.activeVideoAsrContext) {
    loadVideoAsrContext(item, force).catch(error => {
      if (state.showVideoFrameText) {
        els.videoFrameTextDetails.innerHTML = `<div class="video-asr-empty">Không tải được ASR: ${escapeHtml(error.message || String(error))}</div>`;
      }
    });
  }
}

function syncVideoAsrPanelHeight() {
  if (!els.videoShell || !els.videoFrameTextPanel || els.videoFrameTextPanel.hidden) return;
  const videoHeight = Math.round(els.videoShell.getBoundingClientRect().height);
  if (videoHeight > 0) els.videoFrameTextPanel.style.height = `${videoHeight}px`;
}

function setVideoFrameTextVisible(visible) {
  window.clearTimeout(videoAsrReturnTimer);
  state.showVideoFrameText = Boolean(visible);
  state.activeVideoTextKeyframeId = '';
  state.activeVideoTextItem = null;
  state.activeVideoAsrEntries = [];
  state.activeVideoAsrContext = null;
  state.activeVideoAsrHighlightKey = '';
  videoTextRequestVersion += 1;
  els.videoTextToggleBtn.setAttribute('aria-pressed', String(state.showVideoFrameText));
  els.videoTextToggleBtn.classList.toggle('is-active', state.showVideoFrameText);
  els.videoFrameTextPanel.hidden = !state.showVideoFrameText;
  if (state.showVideoFrameText) {
    window.requestAnimationFrame(() => {
      syncVideoAsrPanelHeight();
      window.requestAnimationFrame(syncVideoAsrPanelHeight);
    });
    updateVideoFrameText(null, true);
  } else {
    els.videoFrameTextPanel.style.removeProperty('height');
    els.videoFrameTextDetails.innerHTML = '';
  }
}



// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.setImageAddTrayState = setImageAddTrayState; } catch (_) {}
  try { window.keyframeInfoHtml = keyframeInfoHtml; } catch (_) {}
  try { window.fetchFrameText = fetchFrameText; } catch (_) {}
  try { window.renderFrameTextDetails = renderFrameTextDetails; } catch (_) {}
  try { window.videoFrameItemFromThumb = videoFrameItemFromThumb; } catch (_) {}
  try { window.updateVideoAsrFrameLabel = updateVideoAsrFrameLabel; } catch (_) {}
  try { window.centerCurrentVideoAsr = centerCurrentVideoAsr; } catch (_) {}
  try { window.scheduleVideoAsrReturn = scheduleVideoAsrReturn; } catch (_) {}
  try { window.updateVideoAsrHighlight = updateVideoAsrHighlight; } catch (_) {}
  try { window.renderVideoAsrTranscript = renderVideoAsrTranscript; } catch (_) {}
  try { window.loadVideoAsrContext = loadVideoAsrContext; } catch (_) {}
  try { window.updateVideoFrameText = updateVideoFrameText; } catch (_) {}
  try { window.syncVideoAsrPanelHeight = syncVideoAsrPanelHeight; } catch (_) {}
  try { window.setVideoFrameTextVisible = setVideoFrameTextVisible; } catch (_) {}
  try { window.frameTextCache = frameTextCache; } catch (_) {}
  try { window.videoTextRequestVersion = videoTextRequestVersion; } catch (_) {}
  try { window.videoAsrReturnTimer = videoAsrReturnTimer; } catch (_) {}
}
