/**
 * ==============================================================================
 * TỆP TIN: js/modules/02_query_catalog.js
 * MÔ TẢ:
 *   Quản lý danh mục câu hỏi (Query Strip), hiển thị nội dung câu hỏi, đồng bộ ai đang xem câu nào (viewing status) và lưu nháp draft Q&A.
 * ==============================================================================
 */

function activeQuery() {
  return state.queryCatalog.find(query => query.filename === state.activeQueryFilename) || null;
}

function renderQueryStrip() {
  const isCsv = state.submissionMode === 'csv';
  els.queryStrip.hidden = !isCsv;
  if (!isCsv) {
    els.queryStrip.innerHTML = '';
    return;
  }
  els.queryStrip.innerHTML = '';
  state.queryCatalog.forEach(query => {
    const button = document.createElement('button');
    const count = Number(query.answer_count) || 0;
    const viewers = (state.queryViewers && state.queryViewers[query.filename]) || [];
    const viewerTags = viewers.length > 0
      ? `<span class="query-chip-viewers">${viewers.map(name => `<span class="query-chip-viewer">${escapeHtml(name)}</span>`).join('')}</span>`
      : '';
    const viewerTooltip = viewers.length > 0 ? ` • Đang xem: ${viewers.join(', ')}` : '';
    button.type = 'button';
    button.className = `query-chip${count > 0 ? ' has-answers' : ''}${query.filename === state.activeQueryFilename ? ' is-active' : ''}${viewers.length > 0 ? ' has-viewers' : ''}`;
    button.title = `${query.filename}${viewerTooltip}`;
    button.dataset.filename = query.filename;
    button.innerHTML = `<span>${escapeHtml(query.label)}</span><span class="query-chip-count">${count}</span>${viewerTags}`;
    button.addEventListener('click', () => selectLocalQuery(query.filename));
    els.queryStrip.appendChild(button);
  });
}

function renderActiveQuery() {
  const query = activeQuery();
  const isCsv = state.submissionMode === 'csv';
  els.activeQueryContent.hidden = !(query && isCsv);
  els.activeQueryContent.innerHTML = '';
  els.videoActiveQueryContent.hidden = !(query && isCsv);
  els.videoActiveQueryContent.innerHTML = '';
  if (!query || !isCsv) return;
  [els.activeQueryContent, els.videoActiveQueryContent].forEach(container => {
    const label = document.createElement('strong');
    label.textContent = query.label;
    const content = document.createElement('span');
    content.textContent = query.content;
    container.append(label, content);
  });
  if (els.taskType.value !== query.task_type) {
    els.taskType.value = query.task_type;
    renderTaskControls();
  }
}

function renderSubmissionMode() {
  const isCsv = state.submissionMode === 'csv';
  els.submissionModeToggle.dataset.mode = state.submissionMode;
  els.submissionModeToggle.setAttribute('aria-label', `Chế độ nộp bài hiện tại ${isCsv ? 'CSV' : 'DRES'}`);
  els.dresOpenBtn.hidden = true;
  els.queryStrip.hidden = !isCsv;
  els.taskType.disabled = isCsv && Boolean(activeQuery());
  updateMemberNameDisplay();
  if (els.trakeSubmitBtn) els.trakeSubmitBtn.title = isCsv ? 'Ghi TRAKE vào CSV' : 'Nộp TRAKE lên DRES';
  renderQueryStrip();
  renderActiveQuery();
  renderTaskControls();
}

function toggleSubmissionMode() {
  state.submissionMode = state.submissionMode === 'dres' ? 'csv' : 'dres';
  localStorage.setItem(SUBMISSION_MODE_CACHE_KEY, state.submissionMode);
  renderSubmissionMode();
}

function currentDisplayName() {
  return (state.memberName || state.dresUsername || '').trim() || 'Thành viên';
}

function sendViewingStatus() {
  if (!state.activeQueryFilename) return;
  const displayName = currentDisplayName();
  const payload = {
    type: 'viewing',
    client_id: state.clientId,
    name: displayName,
    filename: state.activeQueryFilename
  };
  if (state.teamSocket && state.teamSocket.readyState === WebSocket.OPEN) {
    try {
      state.teamSocket.send(JSON.stringify(payload));
    } catch {}
  } else {
    fetch('/team/viewing', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    }).catch(() => {});
  }
}

function updateMemberNameDisplay() {
  const label = document.getElementById('memberNameDisplay');
  if (label) {
    label.textContent = state.memberName || state.dresUsername || 'Đặt tên';
  }
}

function promptChangeMemberName() {
  const current = state.memberName || state.dresUsername || '';
  const entered = prompt('Nhập tên của bạn để hiển thị cho đồng đội:', current);
  if (entered === null) return;
  const clean = entered.trim();
  if (!clean) return;
  state.memberName = clean;
  if (els.memberName) els.memberName.value = clean;
  saveMemberCache();
  updateMemberNameDisplay();
  sendViewingStatus();
  syncUserProfile({ restore_active_query: true });
  fetch('/team/member', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({client_id: state.clientId, name: clean})
  }).catch(() => {});
}

async function syncUserProfile(updates = {}) {
  const name = (state.memberName || state.dresUsername || '').trim();
  if (!name) return;
  try {
    const payload = { name, ...updates };
    const resp = await fetch('/team/user/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.drafts && typeof data.drafts === 'object') {
      state.userDrafts = { ...state.userDrafts, ...data.drafts };
      if (state.activeQueryFilename && state.userDrafts[state.activeQueryFilename] !== undefined) {
        if (!els.qaAnswer.matches(':focus')) {
          els.qaAnswer.value = state.userDrafts[state.activeQueryFilename];
        }
      }
    }
    if (data.active_query && updates.restore_active_query) {
      if (state.queryCatalog.some(q => q.filename === data.active_query)) {
        if (state.activeQueryFilename !== data.active_query) {
          selectLocalQuery(data.active_query);
        }
      }
    }
  } catch {}
}

async function loadSubmissionQueries() {
  try {
    const response = await fetch('/submission/queries', {cache: 'no-store'});
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);
    state.queryCatalog = Array.isArray(payload.queries) ? payload.queries : [];
    const savedQuery = typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem(ACTIVE_QUERY_CACHE_KEY) || '') : '';
    if (savedQuery && state.queryCatalog.some(q => q.filename === savedQuery)) {
      state.activeQueryFilename = savedQuery;
    } else if (!state.activeQueryFilename && state.queryCatalog.length > 0) {
      state.activeQueryFilename = state.queryCatalog[0].filename;
      try { sessionStorage.setItem(ACTIVE_QUERY_CACHE_KEY, state.activeQueryFilename); } catch {}
    } else if (state.activeQueryFilename && !state.queryCatalog.some(q => q.filename === state.activeQueryFilename) && state.queryCatalog.length > 0) {
      state.activeQueryFilename = state.queryCatalog[0].filename;
      try { sessionStorage.setItem(ACTIVE_QUERY_CACHE_KEY, state.activeQueryFilename); } catch {}
    }
    sendViewingStatus();
    renderQueryStrip();
    renderActiveQuery();
    if (state.memberName) syncUserProfile({ restore_active_query: !savedQuery });
  } catch (error) {
    showError(`Không tải được danh sách query: ${error.message || error}`);
  }
}

function selectLocalQuery(filename) {
  state.activeQueryFilename = filename;
  try {
    sessionStorage.setItem(ACTIVE_QUERY_CACHE_KEY, filename);
  } catch {}
  if (state.userDrafts && state.userDrafts[filename] !== undefined) {
    els.qaAnswer.value = state.userDrafts[filename];
  } else {
    els.qaAnswer.value = '';
  }
  sendViewingStatus();
  syncUserProfile({ active_query: filename });
  renderQueryStrip();
  renderActiveQuery();
  renderSubmissionMode();
}

async function selectSharedQuery(filename) {
  selectLocalQuery(filename);
}

function setLog(message) {
  state.lastLog = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
  els.logContent.textContent = state.lastLog || 'Chưa có log.';
}



// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.activeQuery = activeQuery; } catch (_) {}
  try { window.renderQueryStrip = renderQueryStrip; } catch (_) {}
  try { window.renderActiveQuery = renderActiveQuery; } catch (_) {}
  try { window.renderSubmissionMode = renderSubmissionMode; } catch (_) {}
  try { window.toggleSubmissionMode = toggleSubmissionMode; } catch (_) {}
  try { window.currentDisplayName = currentDisplayName; } catch (_) {}
  try { window.sendViewingStatus = sendViewingStatus; } catch (_) {}
  try { window.updateMemberNameDisplay = updateMemberNameDisplay; } catch (_) {}
  try { window.promptChangeMemberName = promptChangeMemberName; } catch (_) {}
  try { window.syncUserProfile = syncUserProfile; } catch (_) {}
  try { window.loadSubmissionQueries = loadSubmissionQueries; } catch (_) {}
  try { window.selectLocalQuery = selectLocalQuery; } catch (_) {}
  try { window.selectSharedQuery = selectSharedQuery; } catch (_) {}
  try { window.setLog = setLog; } catch (_) {}
}
