/**
 * ==============================================================================
 * TỆP TIN: js/modules/09_results_selection.js
 * MÔ TẢ:
 *   Hiển thị lưới kết quả tìm kiếm, nhóm cảnh gợi ý (group shots), khay frame đã chọn dưới đáy màn hình.
 * ==============================================================================
 */

function selectResult(item) {
  void addFrameToBothTrays(item);
}

function renderShotContext(item) {
  const context = item.shot_context || {};
  const groups = [
    {label: '4 shot trước', frames: Array.isArray(context.previous) ? context.previous : []},
    {label: '4 shot sau', frames: Array.isArray(context.next) ? context.next : []}
  ].filter(group => group.frames.length > 0);
  if (groups.length === 0) return '';
  return `
    <section class="shot-context" aria-label="Shot liền kề của ${escapeHtml(item.video_id)}">
      ${groups.map(group => `
        <div class="shot-context-group">
          <span class="shot-context-label">${group.label}</span>
          <div class="shot-context-frames">
            ${group.frames.map(frame => `
              <button class="shot-context-frame" type="button" data-keyframe-id="${escapeHtml(frame.keyframe_id)}" title="Mở cảnh ${escapeHtml(frame.shot_id)} tại ${Number(frame.timestamp_seconds || 0).toFixed(3)} giây">
                <img src="/thumbnail/${encodeURIComponent(frame.keyframe_id)}" alt="Cảnh ${escapeHtml(frame.shot_id)}" loading="lazy" />
              </button>`).join('')}
          </div>
        </div>`).join('')}
    </section>`;
}

function renderTemporalResults() {
  const canSubmit = Boolean(
    (state.submissionMode === 'csv' && activeQuery())
    || (state.submissionMode === 'dres' && state.dresSessionId && state.dresSelectedEvaluationId)
  );
  sortResults(state.results).forEach((sequence, index) => {
    const scenes = Array.isArray(sequence.scenes) ? sequence.scenes : [];
    if (scenes.length < 2) return;
    const spanShots = Number(sequence.span_shots || 0);
    const spanSeconds = Number(sequence.span_seconds || 0);
    const sequenceSummary = `${scenes.length} hành động · ${spanShots} shot · ${spanSeconds.toFixed(3)}s`;
    const card = document.createElement('article');
    card.className = 'card temporal-card';
    card.innerHTML = `
      <header class="temporal-card-head">
        <div><span class="badge">Chuỗi</span> Hạng ${index + 1}</div>
        <strong>${escapeHtml(sequence.video_id)}</strong>
        <span class="small">điểm ${Number(sequence.sequence_score || 0).toFixed(3)} · ${escapeHtml(sequenceSummary)}</span>
      </header>
      <div class="temporal-scenes">
        ${scenes.map((scene, sceneIndex) => `
          <section class="temporal-scene">
            <div class="temporal-stage-label">${sceneIndex + 1}</div>
            <button class="temporal-thumb" type="button" data-action="open" data-scene-index="${sceneIndex}" title="Mở video tại cảnh ${escapeHtml(scene.shot_id)}">
              <img src="/thumbnail/${encodeURIComponent(scene.keyframe_id)}" alt="${escapeHtml(scene.video_id)} cảnh ${escapeHtml(scene.shot_id)}" loading="lazy" />
            </button>
            <div class="temporal-query">${escapeHtml(scene.query)}</div>
            <div class="small">shot ${escapeHtml(scene.shot_id)} · ${Number(scene.timestamp_seconds || 0).toFixed(3)}s · hạng ${escapeHtml(scene.rank)}</div>
            ${scene.ocr_text ? `<div class="ocr-snippet"><span>OCR</span> ${escapeHtml(scene.ocr_text)}</div>` : ''}
            <div class="temporal-scene-actions">
              <button class="ghost" type="button" data-action="select" data-scene-index="${sceneIndex}">Chọn</button>
              ${canSubmit ? `<button class="primary" type="button" data-action="submit" data-scene-index="${sceneIndex}">Submit</button>` : ''}
            </div>
          </section>`).join('')}
      </div>`;
    card.querySelectorAll('[data-scene-index]').forEach(button => {
      const scene = scenes[Number(button.dataset.sceneIndex)];
      if (!scene) return;
      button.addEventListener('click', event => {
        event.stopPropagation();
        if (button.dataset.action === 'open') openResult(scene);
        if (button.dataset.action === 'select') selectResult(scene);
        if (button.dataset.action === 'submit') submit(scene);
      });
    });
    card.querySelectorAll('.temporal-thumb img').forEach(image => {
      image.addEventListener('error', () => image.closest('.temporal-thumb').classList.add('thumb-error'));
    });
    els.results.appendChild(card);
  });
  els.resultCount.textContent = `${state.results.length} chuỗi`;
}

function renderResults() {
  els.results.innerHTML = '';
  els.results.classList.remove('temporal-results');
  els.results.classList.toggle('multi-results', state.searchMode === 'multi');
  (state.searchMode === 'multi' ? sortResults(state.results) : state.results).forEach((item, index) => {
    const canSubmit = Boolean(
      (state.submissionMode === 'csv' && activeQuery())
      || (state.submissionMode === 'dres' && state.dresSessionId && state.dresSelectedEvaluationId)
    );
    const submissionFeedback = submissionFeedbackFor(item);
    const card = document.createElement('article');
    card.className = `card${submissionFeedback ? ` submission-${submissionFeedback}` : ''}`;
    card.draggable = true;
    const resultFrames = state.searchMode === 'multi' && Array.isArray(item.query_frames)
      ? item.query_frames
      : [item];
    const centerFrameIndex = Math.floor(resultFrames.length / 2);
    const centerFrame = resultFrames[centerFrameIndex];
    const secondaryFrames = resultFrames
      .map((frame, frameIndex) => ({frame, frameIndex}))
      .filter(({frameIndex}) => frameIndex !== centerFrameIndex);
    card.innerHTML = `
      <div class="thumb-frame ${state.searchMode === 'multi' ? 'multi-frame-preview' : ''}">
        ${state.searchMode === 'multi' ? `
          <button class="result-frame multi-frame-main" type="button" data-result-frame="${centerFrameIndex}" title="${escapeHtml(centerFrame.query || '')} · Mở frame ${escapeHtml(centerFrame.shot_id)}">
            <img src="/thumbnail/${encodeURIComponent(centerFrame.keyframe_id)}" alt="${escapeHtml(centerFrame.video_id)} cảnh ${escapeHtml(centerFrame.shot_id)}" loading="lazy" />
          </button>
          <div class="multi-frame-secondary" style="--secondary-count: ${secondaryFrames.length}">
            ${secondaryFrames.map(({frame, frameIndex}) => `
              <button class="result-frame multi-frame-small" type="button" data-result-frame="${frameIndex}" title="${escapeHtml(frame.query || '')} · Mở frame ${escapeHtml(frame.shot_id)}">
                <img src="/thumbnail/${encodeURIComponent(frame.keyframe_id)}" alt="${escapeHtml(frame.video_id)} cảnh ${escapeHtml(frame.shot_id)}" loading="lazy" />
              </button>`).join('')}
          </div>` : `
          <button class="result-frame" type="button" data-result-frame="0" title="Mở frame ${escapeHtml(item.shot_id)}">
            <img src="/thumbnail/${encodeURIComponent(item.keyframe_id)}" alt="${escapeHtml(item.video_id)} cảnh ${escapeHtml(item.shot_id)}" loading="lazy" />
          </button>`}
        <div class="result-overlay-actions">
          <button data-card-action="open" type="button" title="Mở video tại thời điểm này" aria-label="Mở video tại thời điểm này">${openVideoIcon()}</button>
          <button data-card-action="select" type="button" title="Thêm frame vào khay chọn" aria-label="Thêm frame vào khay chọn">${addToTrayIcon()}</button>
          ${canSubmit ? `<button class="result-overlay-submit" data-card-action="submit" type="button" title="Submit frame này" aria-label="Submit frame này">${submitIcon()}</button>` : ''}
        </div>
      </div>
      <div class="meta">
        <div class="compact-result-meta"><strong>${escapeHtml(item.video_id)}</strong><span>·</span><span>${formatVideoTime(answerTimeMs(item) / 1000)}</span></div>
        ${item.asr_text ? `<div class="ocr-snippet"><span>ASR</span> ${escapeHtml(item.asr_text)}</div>` : ''}
      </div>
      ${submissionFeedbackMarkup(submissionFeedback)}`;
    const img = card.querySelector('.multi-frame-main img, .result-frame img');
    img?.addEventListener('error', () => {
      card.querySelector('.thumb-frame').classList.add('thumb-error');
    });
    const thumb = card.querySelector('.thumb-frame');
    const openBtn = card.querySelector('[data-card-action="open"]');
    const framesBtn = card.querySelector('[data-card-action="frames"]');
    const selectBtn = card.querySelector('[data-card-action="select"]');
    const submitBtn = card.querySelector('[data-card-action="submit"]');
    card.addEventListener('dragstart', event => {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/x-aic-keyframe', JSON.stringify(item));
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
    card.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openVideoFrameGallery(item);
    });
    thumb.addEventListener('click', event => {
      event.stopPropagation();
      const fallbackIndex = state.searchMode === 'multi' ? centerFrameIndex : 0;
      const frameIndex = Number(event.target.closest('[data-result-frame]')?.dataset.resultFrame ?? fallbackIndex);
      openFrameImage(resultFrames[frameIndex] || item);
    });
    openBtn.addEventListener('click', event => {
      event.stopPropagation();
      openResult(item);
    });
    if (framesBtn) {
      framesBtn.addEventListener('click', event => {
        event.stopPropagation();
        openVideoFrameGallery(item);
      });
    }
    selectBtn.addEventListener('click', event => {
      event.stopPropagation();
      selectResult(item);
    });
    if (submitBtn) {
      submitBtn.addEventListener('click', event => {
        event.stopPropagation();
        submit(item);
      });
    }
    const contextFrames = new Map([
      ...((item.shot_context && item.shot_context.previous) || []),
      ...((item.shot_context && item.shot_context.next) || [])
    ].map(frame => [String(frame.keyframe_id), frame]));
    card.querySelectorAll('.shot-context-frame').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const frame = contextFrames.get(button.dataset.keyframeId);
        if (frame) openResult(frame);
      });
    });
    refreshIcons(card);
    els.results.appendChild(card);
  });
  els.resultCount.textContent = `${state.results.length} kết quả`;
}

function renderSelection() {
  const sharedFrames = state.teamVotes;
  const isEmpty = sharedFrames.length === 0;
  els.selectionTray.hidden = false;
  els.appShell.classList.remove('tray-empty');
  els.selectedFrames.innerHTML = '';
  if (els.trayTabChung) els.trayTabChung.classList.add('is-active');
  if (els.trayTabTrake) els.trayTabTrake.classList.remove('is-active');
  els.selectionCount.textContent = '';
  els.selectionCount.hidden = true;
  if (els.trakeSubmitBtn) els.trakeSubmitBtn.hidden = true;
  els.clearBtn.textContent = 'Xóa lựa chọn';
  els.clearBtn.title = 'Xóa các frame đã chọn';

  if (isEmpty) {
    const emptyNotice = document.createElement('div');
    emptyNotice.className = 'tray-empty-notice';
    emptyNotice.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 13px; font-style: italic; width: 100%; user-select: none;';
    emptyNotice.textContent = 'Khung chung trống. Bấm "Thêm vào khay" hoặc kéo thả frame vào đây để chia sẻ với đội.';
    els.selectedFrames.appendChild(emptyNotice);
    return;
  }

  sharedFrames.forEach((vote, index) => {
    const item = vote.item;
    const submissionFeedback = submissionFeedbackFor(item);
    const imageUrl = item.thumbnail_url || `/thumbnail/${encodeURIComponent(item.keyframe_id)}`;
    const frame = document.createElement('div');
    frame.className = `selected-frame${submissionFeedback ? ` submission-${submissionFeedback}` : ''}`;
    frame.draggable = true;
    frame.addEventListener('dragstart', event => {
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData('application/x-aic-keyframe', JSON.stringify(item));
      event.dataTransfer.setData('application/x-aic-tray-index', index.toString());
      frame.style.opacity = '0.5';
    });
    frame.addEventListener('dragend', () => {
      frame.style.opacity = '1';
    });
    frame.addEventListener('dragover', event => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      frame.style.transform = 'scale(1.02)';
      frame.style.zIndex = '10';
    });
    frame.addEventListener('dragleave', event => {
      event.stopPropagation();
      frame.style.transform = '';
      frame.style.zIndex = '';
    });
    frame.addEventListener('drop', event => {
      event.preventDefault();
      event.stopPropagation();
      frame.style.transform = '';
      frame.style.zIndex = '';
      const fromIndex = parseInt(event.dataTransfer.getData('application/x-aic-tray-index'), 10);
      if (!isNaN(fromIndex) && fromIndex !== index) {
        const itemToMove = sharedFrames.splice(fromIndex, 1)[0];
        sharedFrames.splice(index, 0, itemToMove);
        renderSelection();
      }
    });
    frame.innerHTML = `
      <button class="selected-frame-view" type="button" title="Mở video tại frame đã chọn">
        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.video_id)} frame ${escapeHtml(frameId(item))}" />
        <em>${escapeHtml(vote.name)}</em>
      </button>
      <button class="selected-frame-remove" type="button" title="Xóa frame khỏi khay chung" aria-label="Xóa frame khỏi khay chung">&times;</button>
      <div class="selected-frame-actions">
        <button class="selected-frame-open-video" type="button" title="Xem video" aria-label="Xem video">${openVideoIcon()}</button>
        <button class="selected-frame-open-gallery" type="button" title="Xem toàn bộ frame của video" aria-label="Xem toàn bộ frame của video">${framesGalleryIcon()}</button>
        <button class="selected-frame-zoom" type="button" title="Phóng to và xem thông tin" aria-label="Phóng to frame">${zoomIcon()}</button>
        <button class="selected-frame-submit" type="button" title="Submit frame này" aria-label="Submit frame này">${submitIcon()}</button>
      </div>
      ${submissionFeedbackMarkup(submissionFeedback)}`;
    frame.querySelector('.selected-frame-view').addEventListener('click', () => openResult(item));
    frame.querySelector('.selected-frame-open-video').addEventListener('click', event => {
      event.stopPropagation();
      openResult(item);
    });
    frame.querySelector('.selected-frame-open-gallery').addEventListener('click', event => {
      event.stopPropagation();
      openVideoFrameGallery(item);
    });
    frame.querySelector('.selected-frame-zoom').addEventListener('click', event => {
      event.stopPropagation();
      openFrameImage(item);
    });

    frame.querySelector('.selected-frame-submit')?.addEventListener('click', event => {
      event.stopPropagation();
      submit(item);
    });
    frame.querySelector('.selected-frame-remove').addEventListener('click', event => {
      event.stopPropagation();
      removeTeamSelection(vote);
    });
    els.selectedFrames.appendChild(frame);
  });
  refreshIcons(els.selectedFrames);
}

function orderedTrakeUsers() {
  const users = {...(state.trakeUsers || {})};
  if (state.clientId && !users[state.clientId]) {
    users[state.clientId] = {
      name: state.memberName || state.dresUsername || 'Bạn',
      event: state.myTrakeEvent || 1,
      frames: []
    };
  }
  return Object.entries(users).sort(([leftId, left], [rightId, right]) => {
    if (leftId === state.clientId) return -1;
    if (rightId === state.clientId) return 1;
    return String(left.name || '').localeCompare(String(right.name || ''), 'vi');
  });
}

function renderTrakeTray() {
  renderTrakeMasterTray();
  if (!els.videoTrakeFrames) return;

  const currentVideoId = state.activeVideoItem?.video_id;
  const userEntries = orderedTrakeUsers();
  const totalFrames = userEntries.reduce(
    (total, [, user]) => total + (Array.isArray(user.frames) ? user.frames.length : 0),
    0
  );
  if (els.videoTrakeCount) els.videoTrakeCount.textContent = String(totalFrames);
  els.videoTrakeFrames.innerHTML = '';

  userEntries.forEach(([clientId, user]) => {
    const isMe = clientId === state.clientId;
    const allFrames = Array.isArray(user.frames) ? user.frames : [];
    const frames = currentVideoId
      ? allFrames.filter(frame => frame.item?.video_id === currentVideoId)
      : allFrames;
    const name = isMe
      ? (state.memberName || state.dresUsername || user.name || 'Bạn')
      : (user.name || 'Thành viên');
    const card = document.createElement('section');
    card.className = `video-trake-user-card${isMe ? ' is-me' : ''}`;
    card.innerHTML = `
      <header class="video-trake-user-head">
        <div class="video-trake-user-identity">
          <span class="video-trake-user-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</span>
          <span class="video-trake-user-name">${escapeHtml(name)}</span>
          ${isMe ? '<span class="trake-me-badge">Bạn</span>' : ''}
        </div>
        <div class="video-trake-user-meta">
          <span>E${Number(user.event) || 1}</span>
          <span>${frames.length}/${allFrames.length} frame</span>
          ${isMe && allFrames.length > 0 ? '<button class="video-trake-user-clear" type="button" title="Xóa khay TRAKE của bạn">Xóa</button>' : ''}
        </div>
      </header>
      <div class="video-trake-user-frames"></div>`;

    card.querySelector('.video-trake-user-clear')?.addEventListener('click', clearMyTrakeFrames);
    const frameList = card.querySelector('.video-trake-user-frames');
    if (frames.length === 0) {
      frameList.innerHTML = currentVideoId
        ? `<span class="video-trake-user-empty">Chưa có frame của ${escapeHtml(currentVideoId)}.</span>`
        : '<span class="video-trake-user-empty">Khay đang trống.</span>';
    } else {
      frames.forEach(frame => {
        const item = frame.item;
        if (!item) return;
        const imageUrl = item.thumbnail_url || item.image_url || `/thumbnail/${encodeURIComponent(item.keyframe_id)}`;
        const chip = document.createElement('div');
        chip.className = 'video-trake-user-frame';
        chip.draggable = true;
        chip.title = 'Kéo vào khay nộp chung hoặc bấm để mở frame';
        chip.innerHTML = `
          <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.video_id)} frame ${escapeHtml(frameId(item))}" />
          <span class="video-trake-frame-event">E${Number(frame.event) || Number(user.event) || 1}</span>
          <span class="video-trake-frame-label">${escapeHtml(item.video_id)} · ${formatVideoTime(answerTimeMs(item) / 1000)}</span>
          ${isMe ? '<button class="video-trake-frame-remove" type="button" title="Xóa khỏi khay của bạn">&times;</button>' : ''}`;
        chip.addEventListener('dragstart', event => {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData('application/x-aic-trake-user-frame', JSON.stringify({
            item,
            name,
            event: frame.event || user.event || 1
          }));
          chip.classList.add('is-dragging');
        });
        chip.addEventListener('dragend', () => chip.classList.remove('is-dragging'));
        chip.addEventListener('click', () => {
          if (state.activeVideoItem?.video_id === item.video_id) {
            seekVideoToSeconds(answerTimeMs(item) / 1000, true);
          } else {
            openResult(item);
          }
        });
        chip.querySelector('.video-trake-frame-remove')?.addEventListener('click', event => {
          event.stopPropagation();
          removeFrameFromMyEvent(frame.selection_id);
        });
        frameList.appendChild(chip);
      });
    }
    els.videoTrakeFrames.appendChild(card);
  });
}

function answerTimeMs(item) {
  return Math.max(0, Math.round(item.asr_start_ms ?? item.timestamp_ms ?? (item.timestamp_seconds || 0) * 1000));
}

function frameId(item) {
  return String(item.frame_id ?? item.frame_idx ?? item.shot_id ?? answerTimeMs(item));
}

function csvFrameId(item) {
  const fps = fpsForVideo(item.video_id);
  const timestampMs = answerTimeMs(item);
  if (Number.isFinite(fps) && fps > 0 && Number.isFinite(timestampMs)) {
    return Math.max(0, Math.floor((timestampMs / 1000) * fps + 1e-6));
  }
  const explicitFrameId = Number(item.frame_id ?? item.frame_idx);
  if (Number.isInteger(explicitFrameId) && explicitFrameId >= 0) return explicitFrameId;
  throw new Error(`Không xác định được Frame ID cho ${item.video_id || 'video'}.`);
}

function getActiveTargetItem(target = null) {
  if (target) {
    if (Array.isArray(target) && target.length > 0) return target[0];
    if (typeof target === 'object' && target.video_id) return target;
  }
  if (state.activeVideoItem) return state.activeVideoItem;
  if (state.teamVotes.length > 0 && state.teamVotes[0].item) return state.teamVotes[0].item;
  if (state.trakeFrames.length > 0 && state.trakeFrames[0].item) return state.trakeFrames[0].item;
  if (state.selected?.length > 0) return state.selected[0];
  if (state.results?.length > 0) {
    const first = state.results[0];
    if (first.video_id) return first;
    if (Array.isArray(first.scenes) && first.scenes[0]) return first.scenes[0];
  }
  return null;
}



// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.selectResult = selectResult; } catch (_) {}
  try { window.renderShotContext = renderShotContext; } catch (_) {}
  try { window.renderTemporalResults = renderTemporalResults; } catch (_) {}
  try { window.renderResults = renderResults; } catch (_) {}
  try { window.renderSelection = renderSelection; } catch (_) {}
  try { window.orderedTrakeUsers = orderedTrakeUsers; } catch (_) {}
  try { window.renderTrakeTray = renderTrakeTray; } catch (_) {}
  try { window.answerTimeMs = answerTimeMs; } catch (_) {}
  try { window.frameId = frameId; } catch (_) {}
  try { window.csvFrameId = csvFrameId; } catch (_) {}
  try { window.getActiveTargetItem = getActiveTargetItem; } catch (_) {}
}
