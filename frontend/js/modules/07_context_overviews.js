/**
 * ==============================================================================
 * TỆP TIN: js/modules/07_context_overviews.js
 * MÔ TẢ:
 *   Các modal toàn cảnh ngữ cảnh lân cận: 24 shot lân cận, 48 frame lân cận và thư viện duyệt toàn bộ video.
 * ==============================================================================
 */

function openShotOverview() {
  const frames = state.activeShotContextFrames;
  const activeItem = state.activeVideoItem;
  if (!activeItem || frames.length === 0) return;
  els.shotOverviewTitle.textContent = `${activeItem.video_id} · ${frames.length} shot lân cận`;
  els.shotOverviewGrid.innerHTML = frames.map((frame, index) => {
    const feedback = submissionFeedbackFor(frame);
    return `
    <article class="shot-overview-card ${frame.is_candidate ? 'is-current' : ''}" data-shot-index="${index}">
      <img src="/thumbnail/${encodeURIComponent(frame.keyframe_id)}" alt="${escapeHtml(frame.video_id)} shot ${escapeHtml(frame.shot_id)}" loading="lazy" />
      <div class="shot-overview-caption">
        <strong>Shot ${escapeHtml(frame.shot_id)}</strong>
        <span>${formatVideoTime(answerTimeMs(frame) / 1000)}</span>
      </div>
      <div class="shot-overview-actions">
        <button class="frame-hover-action" type="button" data-overview-action="add" title="Thêm vào khay" aria-label="Thêm shot ${escapeHtml(frame.shot_id)} vào khay">${addToTrayIcon()}</button>
        <button class="frame-hover-action" type="button" data-overview-action="zoom" title="Phóng to và xem thông tin" aria-label="Phóng to shot ${escapeHtml(frame.shot_id)}">${zoomIcon()}</button>
        <button class="frame-hover-action result-overlay-submit" type="button" data-overview-action="submit" title="Submit frame này" aria-label="Submit frame này">${submitIcon()}</button>
      </div>
      ${frame.is_candidate ? '<span class="current-frame-label">Frame hiện tại</span>' : ''}
      ${submissionFeedbackMarkup(feedback)}
    </article>`;
  }).join('');
  els.shotOverviewGrid.querySelectorAll('.shot-overview-card').forEach(card => {
    const frame = frames[Number(card.dataset.shotIndex)];
    card.addEventListener('click', () => {
      const seconds = answerTimeMs(frame) / 1000.0;
      seekVideoToSeconds(seconds, false);
      closeShotOverview();
    });
    card.querySelector('[data-overview-action="add"]').addEventListener('click', async event => {
      event.stopPropagation();
      if (await addKeyframeToTray(frame)) event.currentTarget.classList.add('is-added');
    });
    card.querySelector('[data-overview-action="zoom"]').addEventListener('click', event => {
      event.stopPropagation();
      openFrameImage(frame);
    });
    card.querySelector('[data-overview-action="submit"]').addEventListener('click', async event => {
      event.stopPropagation();
      await submit(frame);
    });
  });
  refreshIcons(els.shotOverviewGrid);
  els.shotOverviewModal.hidden = false;
  window.requestAnimationFrame(() => {
    els.shotOverviewGrid.querySelector('.shot-overview-card.is-current')?.scrollIntoView({block: 'center', inline: 'center'});
  });
}

function closeShotOverview() {
  els.shotOverviewModal.hidden = true;
  els.shotOverviewGrid.innerHTML = '';
}

async function openFrameOverview() {
  const activeItem = state.activeVideoItem;
  const fps = activeItem ? fpsForVideo(activeItem.video_id) : 0;
  if (!activeItem || !Number.isFinite(fps) || fps <= 0) {
    showError('Không xác định được FPS của video đang mở.');
    return;
  }
  const timestampMs = Math.max(0, Math.round((Number(els.player.currentTime) || 0) * 1000));
  els.expandFrameContextBtn.disabled = true;
  els.frameOverviewTitle.textContent = `${activeItem.video_id} · đang tải 48 frame lân cận`;
  els.frameOverviewGrid.classList.remove('is-video-gallery');
  els.frameOverviewGrid.innerHTML = '<div class="frame-overview-loading">Đang trích xuất frame…</div>';
  els.frameOverviewModal.hidden = false;
  try {
    const params = new URLSearchParams({timestamp_ms: String(timestampMs), count: '49'});
    const response = await fetch(`/frame-context/${encodeURIComponent(activeItem.video_id)}?${params}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Không tải được frame lân cận.');
    state.frameOverviewFrames = payload.frames || [];
    els.frameOverviewTitle.textContent = `${activeItem.video_id} · ${state.frameOverviewFrames.length} frame lân cận`;
    els.frameOverviewGrid.innerHTML = state.frameOverviewFrames.map((frame, index) => {
      const feedback = submissionFeedbackFor(frame);
      return `
      <article class="shot-overview-card frame-overview-card ${frame.is_current ? 'is-current' : ''}" data-frame-index="${index}">
        <img src="/thumbnail/${encodeURIComponent(frame.keyframe_id)}" alt="${escapeHtml(frame.video_id)} frame ${frame.frame_id}" loading="lazy" />
        <div class="shot-overview-caption">
          <strong>Frame ${frame.frame_id}</strong>
          <span>${formatVideoTime(frame.timestamp_seconds)}</span>
        </div>
        <div class="shot-overview-actions">
          <button class="frame-hover-action" type="button" data-frame-action="add" title="Thêm vào khay" aria-label="Thêm frame ${frame.frame_id} vào khay">${addToTrayIcon()}</button>
          <button class="frame-hover-action" type="button" data-frame-action="zoom" title="Phóng to và xem thông tin" aria-label="Phóng to frame ${frame.frame_id}">${zoomIcon()}</button>
          <button class="frame-hover-action result-overlay-submit" type="button" data-frame-action="submit" title="Submit frame này" aria-label="Submit frame này">${submitIcon()}</button>
        </div>
        ${frame.is_current ? '<span class="current-frame-label">Frame hiện tại</span>' : ''}
        ${submissionFeedbackMarkup(feedback)}
      </article>`;
    }).join('');
    els.frameOverviewGrid.querySelectorAll('.frame-overview-card').forEach(card => {
      const frame = state.frameOverviewFrames[Number(card.dataset.frameIndex)];
      card.addEventListener('click', () => {
        const seconds = Number.isFinite(frame.timestamp_seconds) ? frame.timestamp_seconds : (answerTimeMs(frame) / 1000.0);
        seekVideoToSeconds(seconds, false);
        closeFrameOverview();
      });
      card.querySelector('[data-frame-action="add"]').addEventListener('click', async event => {
        event.stopPropagation();
        if (await addKeyframeToTray(frame)) event.currentTarget.classList.add('is-added');
      });
      card.querySelector('[data-frame-action="zoom"]').addEventListener('click', event => {
        event.stopPropagation();
        openFrameImage(frame);
      });
      card.querySelector('[data-frame-action="submit"]').addEventListener('click', async event => {
        event.stopPropagation();
        await submit(frame);
      });
    });
    refreshIcons(els.frameOverviewGrid);
    window.requestAnimationFrame(() => els.frameOverviewGrid.querySelector('.is-current')?.scrollIntoView({block: 'center', inline: 'center'}));
  } catch (error) {
    els.frameOverviewGrid.innerHTML = `<div class="frame-overview-loading is-error">${escapeHtml(error.message || String(error))}</div>`;
  } finally {
    els.expandFrameContextBtn.disabled = false;
  }
}

async function openVideoFrameGallery(item) {
  if (!item?.video_id) return;
  const timestampMs = Math.max(0, Math.round(answerTimeMs(item) || 0));
  els.frameOverviewTitle.textContent = `${item.video_id} · đang tải danh sách frame`;
  els.frameOverviewGrid.classList.add('is-video-gallery');
  els.frameOverviewGrid.innerHTML = '<div class="frame-overview-loading">Đang tải frame của toàn bộ video…</div>';
  els.frameOverviewModal.hidden = false;
  try {
    const params = new URLSearchParams({timestamp_ms: String(timestampMs), count: '0'});
    const response = await fetch(`/frame-context/${encodeURIComponent(item.video_id)}?${params}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Không tải được frame của video.');
    const allFrames = Array.isArray(payload.frames) ? payload.frames : [];
    state.frameOverviewFrames = allFrames;
    let originIndex = allFrames.findIndex(frame => (
      item.keyframe_id && String(frame.keyframe_id) === String(item.keyframe_id)
    ));
    if (originIndex < 0 && item.frame_id !== undefined && item.frame_id !== null) {
      originIndex = allFrames.findIndex(frame => String(frame.frame_id) === String(item.frame_id));
    }
    if (originIndex < 0 && allFrames.length) {
      originIndex = allFrames.reduce((nearestIndex, frame, index) => {
        const frameTimeMs = Number.isFinite(Number(frame.timestamp_ms))
          ? Number(frame.timestamp_ms)
          : answerTimeMs(frame);
        const nearestTimeMs = Number.isFinite(Number(allFrames[nearestIndex]?.timestamp_ms))
          ? Number(allFrames[nearestIndex].timestamp_ms)
          : answerTimeMs(allFrames[nearestIndex]);
        return Math.abs(frameTimeMs - timestampMs) < Math.abs(nearestTimeMs - timestampMs)
          ? index
          : nearestIndex;
      }, 0);
    }
    els.frameOverviewTitle.textContent = `${item.video_id} · ${state.frameOverviewFrames.length} frame`;
    els.frameOverviewGrid.innerHTML = state.frameOverviewFrames.map((frame, index) => {
      const seconds = Number.isFinite(Number(frame.timestamp_seconds))
        ? Number(frame.timestamp_seconds)
        : answerTimeMs(frame) / 1000;
      const feedback = submissionFeedbackFor(frame);
      return `
        <article class="shot-overview-card frame-overview-card video-frame-gallery-card ${index === originIndex ? 'is-origin' : ''}" data-frame-index="${index}" title="Mở frame tại ${formatVideoTime(seconds)}">
          <img src="/thumbnail/${encodeURIComponent(frame.keyframe_id)}" alt="${escapeHtml(frame.video_id)} tại ${formatVideoTime(seconds)}" loading="lazy" />
          <div class="shot-overview-caption video-frame-gallery-caption">
            <strong>${formatVideoTime(seconds)}</strong>
            <span>Frame ${escapeHtml(frame.frame_id ?? frame.keyframe_id)}</span>
          </div>
          <div class="shot-overview-actions">
            <button class="frame-hover-action" type="button" data-frame-action="add" title="Thêm vào khay" aria-label="Thêm frame ${escapeHtml(frame.frame_id ?? frame.keyframe_id)} vào khay">${addToTrayIcon()}</button>
            <button class="frame-hover-action result-overlay-submit" type="button" data-frame-action="submit" title="Submit frame này" aria-label="Submit frame này">${submitIcon()}</button>
          </div>
          ${index === originIndex ? '<span class="current-frame-label origin-frame-label">Frame gốc</span>' : ''}
          ${submissionFeedbackMarkup(feedback)}
        </article>`;
    }).join('') || '<div class="frame-overview-loading">Video này chưa có frame metadata.</div>';
    els.frameOverviewGrid.querySelectorAll('.video-frame-gallery-card').forEach(card => {
      const frame = state.frameOverviewFrames[Number(card.dataset.frameIndex)];
      card.addEventListener('click', () => openFrameImage(frame));
      card.querySelector('[data-frame-action="add"]')?.addEventListener('click', async event => {
        event.stopPropagation();
        if (await addKeyframeToTray(frame)) event.currentTarget.classList.add('is-added');
      });
      card.querySelector('[data-frame-action="submit"]')?.addEventListener('click', async event => {
        event.stopPropagation();
        await submit(frame);
      });
      card.querySelector('img')?.addEventListener('error', event => {
        event.currentTarget.closest('.video-frame-gallery-card')?.classList.add('thumb-error');
      });
    });
    refreshIcons(els.frameOverviewGrid);
    window.requestAnimationFrame(() => {
      const originCard = els.frameOverviewGrid.querySelector('.video-frame-gallery-card.is-origin');
      if (!originCard) return;
      const gridRect = els.frameOverviewGrid.getBoundingClientRect();
      const cardRect = originCard.getBoundingClientRect();
      const centeredTop = els.frameOverviewGrid.scrollTop
        + (cardRect.top - gridRect.top)
        - ((els.frameOverviewGrid.clientHeight - cardRect.height) / 2);
      els.frameOverviewGrid.scrollTo({top: Math.max(0, centeredTop), behavior: 'auto'});
    });
  } catch (error) {
    els.frameOverviewGrid.innerHTML = `<div class="frame-overview-loading is-error">${escapeHtml(error.message || String(error))}</div>`;
  }
}

function closeFrameOverview() {
  els.frameOverviewModal.hidden = true;
  els.frameOverviewGrid.classList.remove('is-video-gallery');
  els.frameOverviewGrid.innerHTML = '';
  state.frameOverviewFrames = [];
}

function scrollFrameOverview(direction) {
  const firstCard = els.frameOverviewGrid.querySelector('.video-frame-gallery-card');
  const rowGap = Number.parseFloat(getComputedStyle(els.frameOverviewGrid).rowGap) || 0;
  const rowHeight = firstCard
    ? firstCard.getBoundingClientRect().height + rowGap
    : els.frameOverviewGrid.clientHeight * 0.75;
  els.frameOverviewGrid.scrollBy({top: direction * rowHeight, behavior: 'smooth'});
}



// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.openShotOverview = openShotOverview; } catch (_) {}
  try { window.closeShotOverview = closeShotOverview; } catch (_) {}
  try { window.openFrameOverview = openFrameOverview; } catch (_) {}
  try { window.openVideoFrameGallery = openVideoFrameGallery; } catch (_) {}
  try { window.closeFrameOverview = closeFrameOverview; } catch (_) {}
  try { window.scrollFrameOverview = scrollFrameOverview; } catch (_) {}
}
