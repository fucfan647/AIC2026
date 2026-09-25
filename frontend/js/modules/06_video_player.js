/**
 * ==============================================================================
 * TỆP TIN: js/modules/06_video_player.js
 * MÔ TẢ:
 *   Trình phát video HLS/MP4, Filmstrip scrubbing con lăn chuột, tính FPS chuẩn, chụp frame và xem ảnh phóng to.
 * ==============================================================================
 */

function formatVideoTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const rounded = Math.floor(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = String(rounded % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function volumeIcon(volume) {
  if (volume <= 0) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"></path><path d="m17 9 4 4m0-4-4 4"></path></svg>';
  }
  if (volume < 0.5) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"></path><path d="M16 9.5c.6.7.9 1.5.9 2.5s-.3 1.8-.9 2.5"></path></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"></path><path d="M16 8c1.2 1.1 1.8 2.4 1.8 4s-.6 2.9-1.8 4"></path><path d="M19 5c2 1.9 3 4.2 3 7s-1 5.1-3 7"></path></svg>';
}

function playIcon(paused) {
  if (paused) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" class="video-play-svg"><path d="M8 5v14l11-7Z"></path></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14"></path><path d="M17 5v14"></path></svg>';
}

function trashIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14H5V6"></path><path d="M8 6V4h8v2"></path><path d="M10 11v5M14 11v5"></path></svg>';
}

function textQueryIcon() {
  return '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h13M4 18h9"></path></svg>';
}

function ocrQueryIcon() {
  return '<svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 9h10M7 13h10M7 17h6"></path></svg>';
}

function addToTrayIcon() {
  return '<i data-lucide="circle-plus" aria-hidden="true"></i>';
}

function openVideoIcon() {
  return '<i data-lucide="clapperboard" aria-hidden="true"></i>';
}

function framesGalleryIcon() {
  return '<i data-lucide="images" aria-hidden="true"></i>';
}

function zoomIcon() {
  return '<i data-lucide="zoom-in" aria-hidden="true"></i>';
}

function imageQueryIcon() {
  return '<i data-lucide="image" aria-hidden="true"></i>';
}

function submitIcon() {
  return '<i data-lucide="send" aria-hidden="true"></i>';
}

function refreshIcons(root = document) {
  window.lucide?.createIcons({root});
}

function updateVideoControls() {
  const duration = Number.isFinite(els.player.duration) ? els.player.duration : 0;
  const current = Number.isFinite(els.player.currentTime) ? els.player.currentTime : 0;
  const effectiveVolume = els.player.muted ? 0 : els.player.volume;
  els.videoPlayBtn.innerHTML = playIcon(els.player.paused);
  els.videoVolumeBtn.innerHTML = volumeIcon(effectiveVolume);
  els.videoVolumeSlider.value = String(Math.round(effectiveVolume * 100));
  els.videoVolumeValue.textContent = `${Math.round(effectiveVolume * 100)}%`;
  els.videoTime.textContent = `${formatVideoTime(current)} / ${formatVideoTime(duration)}`;
  els.videoProgress.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : '0';

  // Do not allow premature 0.0s timeupdate during initial load to yank filmstrip back to frame 0
  if (state.isInitialVideoLoad) {
    const targetSeconds = (state.activeVideoItem ? answerTimeMs(state.activeVideoItem) / 1000.0 : 0) || 0;
    if (targetSeconds > 0.5 && current < 0.1) {
      return;
    }
  }

  updateVideoFrameStripActive(true);
}

function setVideoRate(rate) {
  els.player.playbackRate = rate;
  els.videoSpeedBtn.textContent = `x${rate}`;
  document.querySelectorAll('.video-speed-option').forEach(btn => {
    const active = Number(btn.dataset.rate) === rate;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', String(active));
  });
}

function closeVideoControlPopovers() {
  els.videoSpeedMenu.hidden = true;
  els.videoVolumePopover.hidden = true;
  els.videoSpeedBtn.setAttribute('aria-expanded', 'false');
  els.videoVolumeBtn.setAttribute('aria-expanded', 'false');
}

function toggleVideoControlPopover(popover, button) {
  const shouldOpen = popover.hidden;
  closeVideoControlPopovers();
  if (shouldOpen) {
    popover.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }
}

function seekVideoToSeconds(seconds, shouldPlay = false) {
  const duration = Number.isFinite(els.player.duration) ? els.player.duration : 0;
  const target = Math.max(0, duration > 0 ? Math.min(seconds, duration - 0.1) : seconds);
  els.player.currentTime = target;
  if (shouldPlay) els.player.play().catch(() => {});
  updateVideoControls();
}

function uniqueVideoFrames(videoId, activeItem) {
  const byKey = new Map();
  const addItem = item => {
    if (!item || item.video_id !== videoId || !item.keyframe_id) return;
    byKey.set(item.keyframe_id, item);
  };
  state.results.forEach(item => {
    if (Array.isArray(item.scenes)) {
      item.scenes.forEach(addItem);
    } else {
      addItem(item);
    }
  });
  state.teamVotes.forEach(vote => addItem(vote.item));
  state.trakeFrames.forEach(frame => addItem(frame.item));
  addItem(activeItem);
  return [...byKey.values()].sort((a, b) => answerTimeMs(a) - answerTimeMs(b));
}

function centerActiveFrameInStrip(smooth = false) {
  if (!els.videoFrameStrip) return;
  const target = els.videoFrameStrip.querySelector('.video-frame-thumb.is-active')
    || els.videoFrameStrip.querySelector('.is-candidate-shot');
  if (!target) return;
  const strip = els.videoFrameStrip;
  const stripWidth = strip.clientWidth;
  if (stripWidth <= 0) {
    window.requestAnimationFrame(() => centerActiveFrameInStrip(smooth));
    return;
  }
  const targetRect = target.getBoundingClientRect();
  const stripRect = strip.getBoundingClientRect();
  const relativeLeft = targetRect.left - stripRect.left + strip.scrollLeft;
  const targetScrollLeft = relativeLeft - (stripWidth / 2) + (target.offsetWidth / 2);
  strip.scrollTo({
    left: Math.max(0, targetScrollLeft),
    behavior: smooth ? 'smooth' : 'auto'
  });
}

function renderVideoFrameItems(items, activeItem) {
  if (!els.videoFrameStrip) return;
  if (items.length === 0) {
    els.videoFrameStrip.innerHTML = '';
    return;
  }

  const frag = document.createDocumentFragment();
  items.forEach(item => {
    const seconds = Number.isFinite(item.timestamp_seconds) ? item.timestamp_seconds : (answerTimeMs(item) / 1000);
    const isCurrentFrame = Boolean(item.is_current)
      || (activeItem && item.keyframe_id === activeItem.keyframe_id)
      || (activeItem && item.frame_id !== undefined && activeItem.frame_id !== undefined && Number(item.frame_id) === Number(activeItem.frame_id));
    const btn = document.createElement('button');
    btn.className = `video-frame-thumb${isCurrentFrame ? ' is-candidate-shot is-active' : ''}`;
    btn.type = 'button';
    btn.dataset.seconds = String(seconds);
    btn.dataset.keyframeId = String(item.keyframe_id || '');
    if (item.shot_id !== undefined) btn.dataset.shotId = String(item.shot_id ?? '');
    if (item.frame_id !== undefined) btn.dataset.frameId = String(item.frame_id ?? '');
    const titleText = item.frame_id !== undefined
      ? `Frame ${item.frame_id} · ${formatVideoTime(seconds)}`
      : `Shot ${item.shot_id} · ${formatVideoTime(seconds)}`;
    const labelText = item.frame_id !== undefined
      ? `F${item.frame_id} · ${formatVideoTime(seconds)}`
      : formatVideoTime(seconds);
    btn.title = titleText;
    const thumbnailUrl = item.thumbnail_url || item.image_url || `/thumbnail/${encodeURIComponent(item.keyframe_id)}`;
    btn.innerHTML = `
      <span class="playhead-needle" aria-hidden="true"></span>
      <img src="${escapeHtml(thumbnailUrl)}" alt="${item.video_id} ${item.frame_id !== undefined ? 'frame ' + item.frame_id : 'shot ' + item.shot_id}" loading="lazy" />
      <span>${labelText}</span>`;
    btn.addEventListener('click', () => {
      if (state.hasDraggedStrip) return;
      seekVideoToSeconds(seconds, true);
      centerActiveFrameInStrip(true);
    });
    frag.appendChild(btn);
  });

  // Temporarily hide visually to pre-position scrollLeft without showing frame 0
  els.videoFrameStrip.style.visibility = 'hidden';
  els.videoFrameStrip.innerHTML = '';
  els.videoFrameStrip.appendChild(frag);

  // Synchronously compute and align scroll position immediately
  const target = els.videoFrameStrip.querySelector('.video-frame-thumb.is-candidate-shot')
    || els.videoFrameStrip.querySelector('.video-frame-thumb.is-active');
  if (target) {
    const stripWidth = els.videoFrameStrip.clientWidth;
    if (stripWidth > 0) {
      const targetRect = target.getBoundingClientRect();
      const stripRect = els.videoFrameStrip.getBoundingClientRect();
      const relativeLeft = targetRect.left - stripRect.left + els.videoFrameStrip.scrollLeft;
      const targetScrollLeft = relativeLeft - (stripWidth / 2) + (target.offsetWidth / 2);
      els.videoFrameStrip.scrollLeft = Math.max(0, targetScrollLeft);
    }
  }
  els.videoFrameStrip.style.visibility = '';

  centerActiveFrameInStrip(false);
  window.requestAnimationFrame(() => centerActiveFrameInStrip(false));
  window.setTimeout(() => centerActiveFrameInStrip(false), 40);
  updateVideoFrameStripActive();
}

function renderVideoFrameStrip(activeItem) {
  if (!els.videoFrameStrip) return;
  renderVideoFrameItems(uniqueVideoFrames(activeItem.video_id, activeItem), activeItem);
  state.activeFrameContextFrames = [];
  state.activeShotContextFrames = [];
  if (els.expandShotContextBtn) els.expandShotContextBtn.disabled = true;
  if (els.expandFrameContextBtn) els.expandFrameContextBtn.disabled = false;

  const timestampMs = Math.max(0, Math.round(answerTimeMs(activeItem) || 0));

  // Prefetch shot-context in background so 24-shot overview button is ready if needed
  if (activeItem.shot_id !== null && activeItem.shot_id !== undefined && Number.isInteger(Number(activeItem.shot_id))) {
    const shotCacheKey = `${activeItem.video_id}:${activeItem.shot_id}:${activeItem.keyframe_id}`;
    let shotReq = state.shotContextCache.get(shotCacheKey);
    if (!shotReq) {
      const params = new URLSearchParams({
        keyframe_id: activeItem.keyframe_id,
        timestamp_ms: String(timestampMs)
      });
      const url = `/shot-context/${encodeURIComponent(activeItem.video_id)}/${encodeURIComponent(activeItem.shot_id)}?${params}`;
      shotReq = fetch(url).then(async response => {
        if (!response.ok) return null;
        return response.json();
      }).catch(() => null);
      state.shotContextCache.set(shotCacheKey, shotReq);
    }
    shotReq?.then(payload => {
      if (payload && Array.isArray(payload.frames) && payload.frames.length > 0) {
        state.activeShotContextFrames = payload.frames;
        if (els.expandShotContextBtn) els.expandShotContextBtn.disabled = false;
      }
    });
  }

  // Load all frames of the video into the bottom filmstrip!
  const frameCacheKey = `${activeItem.video_id}:all_frames`;
  let frameReq = state.shotContextCache.get(frameCacheKey);
  if (!frameReq) {
    const params = new URLSearchParams({
      timestamp_ms: String(timestampMs),
      count: '0'
    });
    const url = `/frame-context/${encodeURIComponent(activeItem.video_id)}?${params}`;
    frameReq = fetch(url).then(async response => {
      if (!response.ok) {
        const error = new Error(`frame context HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    });
    state.shotContextCache.set(frameCacheKey, frameReq);
    frameReq.catch(() => state.shotContextCache.delete(frameCacheKey));
  }

  frameReq.then(payload => {
    const isStillActive = state.activeVideoItem
      && state.activeVideoItem.video_id === activeItem.video_id;
    if (!isStillActive || !Array.isArray(payload.frames) || payload.frames.length === 0) return;
    const mergedFrames = [...payload.frames];
    if (activeItem?.keyframe_id && !mergedFrames.some(frame => frame.keyframe_id === activeItem.keyframe_id)) {
      mergedFrames.push(activeItem);
    }
    state.activeFrameContextFrames = mergedFrames;
    renderVideoFrameItems(mergedFrames, activeItem);

    // Ensure active/candidate frame is centered in view
    centerActiveFrameInStrip(false);
    window.requestAnimationFrame(() => centerActiveFrameInStrip(false));
    window.setTimeout(() => centerActiveFrameInStrip(false), 80);
    window.setTimeout(() => centerActiveFrameInStrip(false), 200);
  }).catch(error => {
    // If frame-context fails or 503, fallback to shot-context or retry
    if (state.activeShotContextFrames && state.activeShotContextFrames.length > 0) {
      renderVideoFrameItems(state.activeShotContextFrames, activeItem);
    } else if (error.status === 503 && state.activeVideoItem?.keyframe_id === activeItem.keyframe_id) {
      window.setTimeout(() => renderVideoFrameStrip(activeItem), 750);
    }
  });
}

let lastAutoScrollTime = 0;

function updateVideoFrameStripActive(autoScroll = false) {
  if (!els.videoFrameStrip) return;
  const current = Number.isFinite(els.player.currentTime) ? els.player.currentTime : 0;
  const thumbs = [...els.videoFrameStrip.querySelectorAll('.video-frame-thumb')];
  let active = thumbs[0] || null;
  thumbs.forEach(btn => {
    const seconds = Number(btn.dataset.seconds);
    // Keep the latest extracted frame that has actually appeared in playback.
    // Choosing the absolute nearest frame can switch OCR to a future frame early.
    if (Number.isFinite(seconds) && seconds <= current + 0.001) active = btn;
    btn.classList.remove('is-active');
  });
  if (active) {
    active.classList.add('is-active');
    updateVideoFrameText(active);
    if (autoScroll && !state.isScrubbingStrip && !els.player.paused) {
      const now = performance.now();
      if (now - lastAutoScrollTime > 380) {
        lastAutoScrollTime = now;
        centerActiveFrameInStrip(true);
      }
    }
  }
}

let scrubHudTimer = null;
function showScrubHud(text, icon = '⏩') {
  if (!els.videoScrubHud) return;
  els.videoScrubHud.innerHTML = `<span class="hud-icon">${icon}</span><span>${text}</span>`;
  els.videoScrubHud.hidden = false;
  els.videoScrubHud.classList.add('is-visible');
  if (scrubHudTimer) clearTimeout(scrubHudTimer);
  scrubHudTimer = setTimeout(() => {
    els.videoScrubHud.classList.remove('is-visible');
    setTimeout(() => {
      if (!els.videoScrubHud.classList.contains('is-visible')) {
        els.videoScrubHud.hidden = true;
      }
    }, 200);
  }, 750);
}

function getStripThumbAtClientX(clientX) {
  if (!els.videoFrameStrip) return null;
  const thumbs = Array.from(els.videoFrameStrip.querySelectorAll('.video-frame-thumb'));
  if (thumbs.length === 0) return null;

  for (const thumb of thumbs) {
    const rect = thumb.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right) {
      return thumb;
    }
  }

  let nearest = thumbs[0];
  let minDist = Infinity;
  for (const thumb of thumbs) {
    const rect = thumb.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const dist = Math.abs(clientX - midX);
    if (dist < minDist) {
      minDist = dist;
      nearest = thumb;
    }
  }
  return nearest;
}

let stripDragStartX = 0;

function setupFilmstripScrubbing() {
  if (!els.videoFrameStrip) return;

  const handlePointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    state.isScrubbingStrip = true;
    state.hasDraggedStrip = false;
    stripDragStartX = e.clientX;
    els.videoFrameStrip.classList.add('is-scrubbing');
    try {
      els.videoFrameStrip.setPointerCapture(e.pointerId);
    } catch (_) {}

    const thumb = getStripThumbAtClientX(e.clientX);
    if (thumb) {
      const seconds = Number(thumb.dataset.seconds);
      if (Number.isFinite(seconds)) {
        seekVideoToSeconds(seconds, false);
        updateVideoControls();
      }
    }
  };

  const handlePointerMove = (e) => {
    if (!state.isScrubbingStrip) return;
    if (Math.abs(e.clientX - stripDragStartX) > 4) {
      state.hasDraggedStrip = true;
    }

    const stripRect = els.videoFrameStrip.getBoundingClientRect();
    const edgeMargin = 45;
    if (e.clientX < stripRect.left + edgeMargin) {
      els.videoFrameStrip.scrollLeft -= 16;
    } else if (e.clientX > stripRect.right - edgeMargin) {
      els.videoFrameStrip.scrollLeft += 16;
    }

    if (state.stripRafId) return;
    state.stripRafId = requestAnimationFrame(() => {
      state.stripRafId = null;
      if (!state.isScrubbingStrip) return;
      const thumb = getStripThumbAtClientX(e.clientX);
      if (thumb) {
        const seconds = Number(thumb.dataset.seconds);
        if (Number.isFinite(seconds)) {
          seekVideoToSeconds(seconds, false);
          updateVideoControls();
        }
      }
    });
  };

  const handlePointerUp = (e) => {
    if (!state.isScrubbingStrip) return;
    state.isScrubbingStrip = false;
    els.videoFrameStrip.classList.remove('is-scrubbing');
    try {
      els.videoFrameStrip.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (state.stripRafId) {
      cancelAnimationFrame(state.stripRafId);
      state.stripRafId = null;
    }

    centerActiveFrameInStrip(true);
    setTimeout(() => {
      state.hasDraggedStrip = false;
    }, 50);
  };

  els.videoFrameStrip.addEventListener('pointerdown', handlePointerDown);
  els.videoFrameStrip.addEventListener('pointermove', handlePointerMove);
  els.videoFrameStrip.addEventListener('pointerup', handlePointerUp);
  els.videoFrameStrip.addEventListener('pointercancel', handlePointerUp);
}

function handleVideoScrubWheel(e) {
  if (!els.player) return;
  e.preventDefault();

  const duration = Number.isFinite(els.player.duration) ? els.player.duration : 0;
  if (duration <= 0 && (!els.videoFrameStrip || els.videoFrameStrip.children.length === 0)) return;

  // Lướt lên (deltaY < 0): Tua tiến về phía trước
  // Lướt xuống (deltaY > 0): Tua lùi về phía sau
  const isForward = e.deltaY < 0;

  const absDelta = Math.abs(e.deltaY);
  let step = 0.08;
  if (absDelta > 150) {
    step = 1.0;
  } else if (absDelta > 60) {
    step = 0.4;
  } else if (absDelta > 25) {
    step = 0.15;
  } else {
    step = 0.05;
  }

  if (e.shiftKey) step *= 4;

  const current = Number.isFinite(els.player.currentTime) ? els.player.currentTime : 0;
  const target = Math.max(0, Math.min(duration > 0 ? duration - 0.05 : current + step, current + (isForward ? step : -step)));

  seekVideoToSeconds(target, false);
  updateVideoControls();
  centerActiveFrameInStrip(false);

  const icon = isForward ? '⏩' : '⏪';
  const sign = isForward ? '+' : '-';
  const activeBtn = els.videoFrameStrip?.querySelector('.video-frame-thumb.is-active');
  const frameInfo = activeBtn?.dataset.frameId ? ` · Frame ${activeBtn.dataset.frameId}` : '';
  showScrubHud(`${sign}${step.toFixed(2)}s (${formatVideoTime(target)})${frameInfo}`, icon);
}

let expandBufferHandler = null;

function destroyActiveHls() {
  if (expandBufferHandler) {
    els.player.removeEventListener('timeupdate', expandBufferHandler);
    els.player.removeEventListener('seeking', expandBufferHandler);
    expandBufferHandler = null;
  }
  if (!activeHls) return;
  activeHls.destroy();
  activeHls = null;
}

function loadVideoSource(videoId, startSeconds = 0) {
  const hlsUrl = `/hls/${encodeURIComponent(videoId)}/playlist.m3u8`;
  destroyActiveHls();
  els.player.removeAttribute('src');
  showError('');
  if (els.player.canPlayType('application/vnd.apple.mpegurl')) {
    els.player.src = hlsUrl;
    els.player.load();
    return;
  }
  if (window.Hls && window.Hls.isSupported()) {
    const targetStart = Math.max(0, startSeconds);
    let isBufferExpanded = false;

    // Ban đầu chỉ tải đúng dải ~3 giây quanh frame mục tiêu (tiết kiệm tối đa băng thông SSH)
    activeHls = new window.Hls({
      startPosition: Math.max(0, targetStart - 1.0),
      maxBufferLength: 3,             // Chỉ buffer 3 giây phía trước
      maxMaxBufferLength: 5,          // Ngưỡng tối đa ban đầu 5 giây
      backBufferLength: 3,            // Chỉ giữ lại 3 giây phía sau
      maxBufferSize: 5 * 1024 * 1024, // Bộ đệm ban đầu tối đa 5MB
      enableWorker: true,
      lowLatencyMode: false,
    });

    const initialWindowStart = Math.max(0, targetStart - 3.0);
    const initialWindowEnd = targetStart + 3.0;

    // Khi người dùng tua ra ngoài vùng 3s hoặc xem tiếp vượt qua 3s, tự động mở rộng buffer để stream bình thường
    expandBufferHandler = () => {
      if (isBufferExpanded || !activeHls) return;
      const cur = Number(els.player.currentTime) || 0;
      if (cur < initialWindowStart || cur > initialWindowEnd) {
        isBufferExpanded = true;
        activeHls.config.maxBufferLength = 10;
        activeHls.config.maxMaxBufferLength = 20;
        activeHls.config.backBufferLength = 10;
        activeHls.config.maxBufferSize = 20 * 1024 * 1024;
      }
    };

    els.player.addEventListener('timeupdate', expandBufferHandler);
    els.player.addEventListener('seeking', expandBufferHandler);

    activeHls.loadSource(hlsUrl);
    activeHls.attachMedia(els.player);
    return;
  }
  showError('Trình duyệt không hỗ trợ HLS và chưa tải được hls.js.');
}

function openResult(item) {
  const startSeconds = answerTimeMs(item) / 1000.0;
  let hasPlayed = false;
  state.activeVideoItem = item;
  state.isInitialVideoLoad = true;
  els.modalTitle.textContent = item.video_id;
  els.videoModal.hidden = false;
  renderActiveQuery();
  els.player.pause();
  els.player.poster = `/thumbnail/${item.keyframe_id}`;
  els.player.preload = 'metadata';
  els.player.autoplay = true;
  setVideoRate(els.player.playbackRate || 1);
  renderTaskControls();
  renderVideoFrameStrip(item);
  renderTrakeTray();
  refreshIcons(els.videoModal);
  updateVideoControls();
  setVideoFrameTextVisible(true);
  const playVideo = () => {
    state.isInitialVideoLoad = false;
    if (hasPlayed) return;
    hasPlayed = true;
    els.player.play().catch(() => {});
  };
  els.player.addEventListener('loadedmetadata', function seekOnce() {
    els.player.removeEventListener('loadedmetadata', seekOnce);
    const target = Math.min(startSeconds, Number.isFinite(els.player.duration) ? Math.max(0, els.player.duration - 0.1) : startSeconds);
    if (target <= 0) {
      playVideo();
      return;
    }
    els.player.currentTime = target;
    window.setTimeout(playVideo, 600);
  });
  els.player.addEventListener('seeked', function playOnce() {
    els.player.removeEventListener('seeked', playOnce);
    state.isInitialVideoLoad = false;
    updateVideoControls();
    centerActiveFrameInStrip(false);
    playVideo();
  });
  loadVideoSource(item.video_id, startSeconds);
}

function closeVideo() {
  state.isInitialVideoLoad = false;
  setVideoFrameTextVisible(false);
  els.player.pause();
  closeVideoControlPopovers();
  destroyActiveHls();
  els.player.removeAttribute('src');
  els.player.removeAttribute('poster');
  els.player.load();
  if (els.videoFrameStrip) els.videoFrameStrip.innerHTML = '';
  closeShotOverview();
  closeFrameOverview();
  state.activeShotContextFrames = [];
  els.expandShotContextBtn.disabled = true;
  state.activeVideoItem = null;
  updateVideoControls();
  els.videoModal.hidden = true;
}

function fpsForVideo(videoId) {
  const override = Number(state.videoFps.overrides?.[videoId]);
  const fallback = Number(state.videoFps.default_fps);
  return Number.isFinite(override) && override > 0 ? override : fallback;
}

function captureDisplayedFrame() {
  const item = state.activeVideoItem;
  if (!state.memberName) {
    showError('Nhập tên gọi trước khi thêm frame vào khay.');
    openDresModal();
    return;
  }
  if (!item || els.player.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !els.player.videoWidth) {
    showError('Video chưa sẵn sàng để lấy frame.');
    return;
  }
  els.player.pause();
  const mediaTime = Math.max(0, Number(els.player.currentTime) || 0);
  const fps = fpsForVideo(item.video_id);
  if (!Number.isFinite(fps) || fps <= 0) {
    showError(`Không tìm thấy FPS của video ${item.video_id}.`);
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = els.player.videoWidth;
  canvas.height = els.player.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    showError('Trình duyệt không tạo được canvas để lấy frame.');
    return;
  }
  context.drawImage(els.player, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(async blob => {
    if (!blob) {
      showError('Không thêm được frame đang hiển thị vào khay.');
      return;
    }
    const frameId = Math.max(0, Math.floor(mediaTime * fps + 1e-6));
    const existsInTeamTray = state.teamVotes.some(vote =>
      vote.client_id === state.clientId
      && vote.item?.video_id === item.video_id
      && Number(vote.item?.frame_id) === frameId
    );
    const existsInMyTrakeTray = (state.trakeUsers?.[state.clientId]?.frames || []).some(frame =>
      frame.item?.video_id === item.video_id
      && Number(frame.item?.frame_id) === frameId
    );
    const targets = [];
    if (!existsInTeamTray) targets.push('team');
    if (!existsInMyTrakeTray) targets.push('trake_user');
    if (targets.length === 0) {
      showError('Frame này đã có trong cả hai khay.');
      return;
    }
    try {
      for (const target of targets) {
        const params = new URLSearchParams({
          client_id: state.clientId,
          name: state.memberName,
          video_id: item.video_id,
          shot_id: item.shot_id ?? '',
          frame_id: String(frameId),
          timestamp_ms: String(Math.round(mediaTime * 1000)),
          fps: String(fps),
          target,
          event: String(state.myTrakeEvent || 1)
        });
        const resp = await fetch(`/team/capture?${params}`, {
          method: 'POST',
          headers: {'Content-Type': blob.type || 'image/jpeg'},
          body: blob
        });
        const teamState = await resp.json();
        if (!resp.ok) throw new Error(teamState.detail || 'Không thêm được frame vào khay.');
        applyTeamState(teamState);
      }
      showError('');
    } catch (error) {
      showError(error.message || String(error));
    }
  }, 'image/jpeg', 0.9);
}

function getDisplayedVideoFrameItem() {
  const item = state.activeVideoItem;
  if (!item) {
    showError('Chưa mở video để lấy frame.');
    return null;
  }
  if (els.player.readyState < HTMLMediaElement.HAVE_METADATA) {
    showError('Video chưa sẵn sàng để lấy frame hiện tại.');
    return null;
  }
  els.player.pause();
  const mediaTime = Math.max(0, Number(els.player.currentTime) || 0);
  const fps = fpsForVideo(item.video_id);
  return {
    ...item,
    timestamp_ms: Math.round(mediaTime * 1000),
    timestamp_seconds: mediaTime,
    frame_id: Number.isFinite(fps) && fps > 0
      ? Math.max(0, Math.floor(mediaTime * fps + 1e-6))
      : item.frame_id
  };
}

function isMyVote(vote) {
  if (!vote) return false;
  const myName = (state.memberName || '').trim().toLowerCase();
  const vName = (vote.name || '').trim().toLowerCase();
  const vKey = (vote.user_key || '').trim().toLowerCase();
  if (myName && (vName === myName || vKey === myName)) return true;
  if (state.clientId && vote.client_id === state.clientId) return true;
  return false;
}

function keyframeTrayId(item) {
  const explicitFrameId = Number(item.frame_id ?? item.frame_idx);
  if (Number.isInteger(explicitFrameId) && explicitFrameId >= 0) return explicitFrameId;
  const fps = fpsForVideo(item.video_id);
  return Math.max(0, Math.floor((answerTimeMs(item) / 1000) * fps + 1e-6));
}

function isKeyframeInBothTrays(item) {
  const targetFrameId = keyframeTrayId(item);
  const existsInTeamTray = state.teamVotes.some(vote =>
    vote.client_id === state.clientId
    && vote.item?.video_id === item.video_id
    && (vote.item?.keyframe_id === item.keyframe_id || Number(vote.item?.frame_id) === targetFrameId)
  );
  const existsInMyTray = (state.trakeUsers?.[state.clientId]?.frames || []).some(frame =>
    frame.item?.video_id === item.video_id
    && (frame.item?.keyframe_id === item.keyframe_id || Number(frame.item?.frame_id) === targetFrameId)
  );
  return existsInTeamTray && existsInMyTray;
}

async function addKeyframeToTray(item) {
  if (!item?.video_id || !item?.keyframe_id) return false;
  const fps = fpsForVideo(item.video_id);
  if (!Number.isFinite(fps) || fps <= 0) {
    showError(`Không tìm thấy FPS của video ${item.video_id}.`);
    return false;
  }
  const targetFrameId = keyframeTrayId(item);
  const timestampMs = answerTimeMs(item);
  const sharedItem = {
    ...item,
    video_id: item.video_id,
    keyframe_id: item.keyframe_id,
    shot_id: item.shot_id,
    frame_id: targetFrameId,
    timestamp_ms: timestampMs,
    timestamp_seconds: timestampMs / 1000,
    fps
  };
  return addFrameToBothTrays(sharedItem);
}



function openFrameImage(item) {
  state.imageItem = item;
  els.imageTitle.textContent = `Frame ${item.video_id} - cảnh ${item.shot_id}`;
  els.imagePreview.src = item.image_url || `/keyframe/${item.keyframe_id}`;
  els.imagePreview.alt = `${item.video_id} cảnh ${item.shot_id}`;
  els.imageMeta.innerHTML = keyframeInfoHtml(item);
  setImageAddTrayState(isKeyframeInBothTrays(item));
  if (els.imageTextDetails) {
    const hasExistingText = item.ocr_text || item.asr_text;
    renderFrameTextDetails(els.imageTextDetails, null, item, !hasExistingText);
    fetchFrameText(item.keyframe_id).then(data => {
      if (state.imageItem?.keyframe_id === item.keyframe_id) {
        renderFrameTextDetails(els.imageTextDetails, data, item, false);
      }
    });
  }
  els.imageModal.hidden = false;
}

function closeFrameImage() {
  els.imagePreview.removeAttribute('src');
  els.imagePreview.removeAttribute('alt');
  els.imageMeta.innerHTML = '';
  if (els.imageTextDetails) els.imageTextDetails.innerHTML = '';
  state.imageItem = null;
  els.imageModal.hidden = true;
}



// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.formatVideoTime = formatVideoTime; } catch (_) {}
  try { window.volumeIcon = volumeIcon; } catch (_) {}
  try { window.playIcon = playIcon; } catch (_) {}
  try { window.trashIcon = trashIcon; } catch (_) {}
  try { window.textQueryIcon = textQueryIcon; } catch (_) {}
  try { window.ocrQueryIcon = ocrQueryIcon; } catch (_) {}
  try { window.addToTrayIcon = addToTrayIcon; } catch (_) {}
  try { window.openVideoIcon = openVideoIcon; } catch (_) {}
  try { window.framesGalleryIcon = framesGalleryIcon; } catch (_) {}
  try { window.zoomIcon = zoomIcon; } catch (_) {}
  try { window.submitIcon = submitIcon; } catch (_) {}
  try { window.refreshIcons = refreshIcons; } catch (_) {}
  try { window.updateVideoControls = updateVideoControls; } catch (_) {}
  try { window.imageQueryIcon = imageQueryIcon; } catch (_) {}
  try { window.setVideoRate = setVideoRate; } catch (_) {}
  try { window.closeVideoControlPopovers = closeVideoControlPopovers; } catch (_) {}
  try { window.toggleVideoControlPopover = toggleVideoControlPopover; } catch (_) {}
  try { window.seekVideoToSeconds = seekVideoToSeconds; } catch (_) {}
  try { window.uniqueVideoFrames = uniqueVideoFrames; } catch (_) {}
  try { window.centerActiveFrameInStrip = centerActiveFrameInStrip; } catch (_) {}
  try { window.renderVideoFrameItems = renderVideoFrameItems; } catch (_) {}
  try { window.renderVideoFrameStrip = renderVideoFrameStrip; } catch (_) {}
  try { window.updateVideoFrameStripActive = updateVideoFrameStripActive; } catch (_) {}
  try { window.showScrubHud = showScrubHud; } catch (_) {}
  try { window.getStripThumbAtClientX = getStripThumbAtClientX; } catch (_) {}
  try { window.setupFilmstripScrubbing = setupFilmstripScrubbing; } catch (_) {}
  try { window.handleVideoScrubWheel = handleVideoScrubWheel; } catch (_) {}
  try { window.destroyActiveHls = destroyActiveHls; } catch (_) {}
  try { window.loadVideoSource = loadVideoSource; } catch (_) {}
  try { window.openResult = openResult; } catch (_) {}
  try { window.closeVideo = closeVideo; } catch (_) {}
  try { window.fpsForVideo = fpsForVideo; } catch (_) {}
  try { window.captureDisplayedFrame = captureDisplayedFrame; } catch (_) {}
  try { window.getDisplayedVideoFrameItem = getDisplayedVideoFrameItem; } catch (_) {}
  try { window.isMyVote = isMyVote; } catch (_) {}
  try { window.keyframeTrayId = keyframeTrayId; } catch (_) {}
  try { window.isKeyframeInBothTrays = isKeyframeInBothTrays; } catch (_) {}
  try { window.addKeyframeToTray = addKeyframeToTray; } catch (_) {}
  try { window.openFrameImage = openFrameImage; } catch (_) {}
  try { window.closeFrameImage = closeFrameImage; } catch (_) {}
  try { window.lastAutoScrollTime = lastAutoScrollTime; } catch (_) {}
  try { window.scrubHudTimer = scrubHudTimer; } catch (_) {}
  try { window.stripDragStartX = stripDragStartX; } catch (_) {}
  try { window.expandBufferHandler = expandBufferHandler; } catch (_) {}
}
