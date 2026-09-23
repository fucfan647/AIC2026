/**
 * ==============================================================================
 * TỆP TIN: js/modules/10_submission_dres.js
 * MÔ TẢ:
 *   Động cơ nộp bài DRES và CSV offline: đăng nhập DRES, chọn evaluation, định dạng payload KIS/TRAKE/QA.
 * ==============================================================================
 */

function buildSubmitRequest(target = null, taskType = null) {
  const selectedTask = (taskType || els.taskType?.value || 'kis').toLowerCase();

  if (selectedTask === 'qa') {
    const rawAnswer = els.qaAnswer?.value.trim() || '';
    if (!rawAnswer) {
      els.qaAnswer?.focus();
      throw new Error('Vui lòng nhập câu trả lời Q&A trước khi nộp.');
    }
    const item = getActiveTargetItem(target);
    if (!item) {
      throw new Error('Cần chọn một frame hoặc mở video để lấy video_id và timestamp cho Q&A.');
    }
    const timeMs = answerTimeMs(item);
    const answerText = rawAnswer.startsWith('QA-')
      ? rawAnswer
      : `QA-${rawAnswer}-${item.video_id}-${timeMs}`;
    return {
      task_type: 'qa',
      answer: answerText,
      items: [item]
    };
  }

  if (selectedTask === 'trake') {
    let items = [];
    if (Array.isArray(target) && target.length > 0) items = target;
    else if (target && typeof target === 'object' && target.video_id) items = [target];
    else items = state.trakeFrames.map(f => f.item).filter(Boolean);

    if (items.length === 0) {
      const active = getActiveTargetItem(target);
      if (active) items = [active];
    }
    if (items.length === 0) {
      throw new Error('Khay TRAKE đang trống; hãy thêm frame vào TRAKE trước khi nộp.');
    }
    const videoId = items[0].video_id;
    const frameList = items.map(item => String(item.frame_id ?? frameId(item))).join(',');
    return {
      task_type: 'trake',
      payload: {
        answerSets: [{
          answers: [{
            text: `TR-${videoId}-${frameList}`
          }]
        }]
      },
      items
    };
  }

  // KIS (default)
  const item = getActiveTargetItem(target);
  if (!item) {
    throw new Error('Chọn một frame trước khi nộp KIS.');
  }
  const timeMs = answerTimeMs(item);
  return {
    task_type: 'kis',
    payload: {
      answerSets: [{
        answers: [{
          mediaItemName: item.video_id,
          start: String(timeMs),
          end: String(timeMs)
        }]
      }]
    },
    items: [item]
  };
}

function loadDresCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(DRES_CACHE_KEY) || '{}');

    state.dresSessionId = cached.sessionId || null;
    state.dresEvaluations = Array.isArray(cached.evaluations) ? cached.evaluations : [];
    state.dresSelectedEvaluationId = cached.evaluationId || '';
    state.dresUsername = cached.username || '';
    state.dresServerUrl = cached.serverUrl || state.dresServerUrl;
    els.dresServer.value = state.dresServerUrl;
    els.dresUsername.value = state.dresUsername;
  } catch {
    localStorage.removeItem(DRES_CACHE_KEY);
  }
}

function loadMemberCache() {
  let cached = {};
  try {
    cached = JSON.parse(localStorage.getItem(MEMBER_CACHE_KEY) || '{}');
  } catch {
    localStorage.removeItem(MEMBER_CACHE_KEY);
  }
  state.clientId = cached.clientId || makeClientId();
  state.memberName = cached.name || '';
  els.memberName.value = state.memberName;
  saveMemberCache();
}

function saveMemberCache() {
  if (!state.memberName) {
    localStorage.removeItem(MEMBER_CACHE_KEY);
    return;
  }
  localStorage.setItem(MEMBER_CACHE_KEY, JSON.stringify({
    clientId: state.clientId,
    name: state.memberName
  }));
}

function clearLocalSessionCache() {
  localStorage.removeItem(DRES_CACHE_KEY);
  localStorage.removeItem(MEMBER_CACHE_KEY);
}

function saveDresCache() {
  if (!state.dresSessionId) {
    localStorage.removeItem(DRES_CACHE_KEY);
    return;
  }
  localStorage.setItem(DRES_CACHE_KEY, JSON.stringify({
    serverUrl: state.dresServerUrl,
    username: state.dresUsername,
    sessionId: state.dresSessionId,
    evaluationId: state.dresSelectedEvaluationId,
    evaluations: state.dresEvaluations,
    savedAt: Date.now()
  }));
}

function setTaskType(taskType) {
  if (!['kis', 'trake', 'qa'].includes(taskType)) return;
  els.taskType.value = taskType;
  renderTaskControls();
  if (taskType === 'qa') {
    window.setTimeout(() => els.qaAnswer?.focus(), 60);
  }
}

function cycleTaskType() {
  const types = ['kis', 'trake', 'qa'];
  const currentIndex = types.indexOf(els.taskType.value);
  const nextIndex = (currentIndex + 1) % types.length;
  setTaskType(types[nextIndex]);
}

function renderTaskControls() {
  const task = (els.taskType?.value || 'kis').toLowerCase();
  const isQa = task === 'qa';
  const isTrake = task === 'trake';

  if (els.qaAnswer) els.qaAnswer.hidden = !isQa;
  if (els.videoSubmitCurrentBtn) {
    els.videoSubmitCurrentBtn.hidden = false;
  }

  // Cột TRAKE chỉ hiển thị khi chọn loại bài TRAKE.
  if (els.videoTrakeTray) {
    els.videoTrakeTray.hidden = !isTrake;
  }
  if (els.captureFrameBtn) {
    els.captureFrameBtn.title = 'Thêm frame đang hiển thị vào khay chung và khay riêng của bạn';
  }
  const mainLayout = els.videoMainLayout || document.querySelector('.video-main-layout');
  if (mainLayout) {
    mainLayout.classList.toggle('is-trake-hidden', !isTrake);
  }

  renderResults();
  renderSelection();
  if (isTrake) {
    renderTrakeTray();
  }
}

function renderDresSession() {
  const loggedIn = Boolean(state.dresSessionId);
  const needsName = loggedIn && state.dresSelectedEvaluationId && !state.memberName;
  els.dresLoginView.hidden = loggedIn;
  els.dresSessionView.hidden = !loggedIn || needsName;
  els.memberNameView.hidden = !needsName;
  els.dresTitle.textContent = !loggedIn ? 'DRES Login' : needsName ? 'Tên gọi của bạn' : 'DRES Active Session';
  const sessionNameEl = document.getElementById('sessionMemberNameDisplay');
  if (sessionNameEl) {
    sessionNameEl.textContent = state.memberName || state.dresUsername || 'Chưa đặt';
  }
  els.dresOpenBtn.hidden = true; // Xóa nút đỏ duplicate; danh tính user đã nằm ở memberNameBtn
  renderResults();
}

function openDresModal() {
  els.dresModal.hidden = false;
  renderDresSession();
  const focusTarget = !state.dresSessionId ? els.dresUsername : state.dresSelectedEvaluationId && !state.memberName ? els.memberName : els.evaluationSelect;
  window.setTimeout(() => focusTarget.focus(), 0);
}

function closeDresModal() {
  els.dresModal.hidden = true;
}

function handleDresEnter(event) {
  if (event.key !== 'Enter' || event.isComposing) return;
  event.preventDefault();
  if (!els.dresLoginView.hidden) {
    loginDres();
    return;
  }
  if (!els.dresSessionView.hidden) {
    chooseEvaluation();
    return;
  }
  if (!els.memberNameView.hidden) {
    saveMemberName();
  }
}

function renderEvaluations() {
  els.evaluationSelect.innerHTML = '';
  if (state.dresEvaluations.length === 0) {
    els.evaluationSelect.innerHTML = '<option value="">Chưa có evaluation</option>';
    return;
  }
  state.dresEvaluations.forEach(evaluation => {
    const option = document.createElement('option');
    option.value = evaluation.id;
    option.textContent = `${evaluation.name || evaluation.id} (${evaluation.status || 'UNKNOWN'})`;
    if (evaluation.status && evaluation.status !== 'ACTIVE') option.disabled = true;
    if (evaluation.id === state.dresSelectedEvaluationId) option.selected = true;
    els.evaluationSelect.appendChild(option);
  });
}

function chooseEvaluation() {
  if (!state.dresSessionId) {
    showError('Đăng nhập DRES trước khi chọn evaluation.');
    return;
  }
  const evaluationId = els.evaluationSelect.value;
  if (!evaluationId) {
    showError('Chọn evaluation trước.');
    return;
  }
  state.dresSelectedEvaluationId = evaluationId;
  saveDresCache();
  renderDresSession();
  setDresStatus(`Đã chọn evaluation: ${els.evaluationSelect.options[els.evaluationSelect.selectedIndex].textContent}`);
  if (state.memberName) closeDresModal();
}

async function saveMemberName() {
  const name = els.memberName.value.trim();
  if (!name) {
    showError('Nhập tên gọi của bạn trước.');
    return;
  }
  state.memberName = name;
  saveMemberCache();
  try {
    const resp = await fetch('/team/member', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({client_id: state.clientId, name})
    });
    const teamState = await resp.json();
    if (!resp.ok) throw new Error(teamState.detail || 'Lưu tên gọi thất bại.');
    applyTeamState(teamState);
    renderDresSession();
    setDresStatus(`Đã lưu tên gọi: ${name}`);
    closeDresModal();
  } catch (error) {
    showError(error.message || String(error));
  }
}

function backToEvaluation() {
  state.dresSelectedEvaluationId = '';
  saveMemberCache();
  saveDresCache();
  renderDresSession();
}

async function loginDres() {
  const serverUrl = els.dresServer.value.trim();
  const username = els.dresUsername.value.trim();
  const password = els.dresPassword.value;
  if (!serverUrl || !username || !password) {
    const msg = 'Nhập DRES server, tên đăng nhập và mật khẩu trước khi đăng nhập.';
    showError(msg);
    setDresStatus(msg);
    return;
  }
  els.dresLoginBtn.disabled = true;
  showError('');
  setDresStatus('Đang đăng nhập DRES...');
  try {
    const loginResp = await fetch('/dres/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({server_url: serverUrl, username, password})
    });
    const text = await loginResp.text();
    let loginPayload = {};
    try {
      loginPayload = JSON.parse(text);
    } catch {
      loginPayload = { detail: text };
    }
    if (!loginResp.ok) {
      const errMsg = loginPayload.description || loginPayload.detail || loginPayload.message || text || `HTTP ${loginResp.status}`;
      throw new Error(errMsg);
    }
    state.dresSessionId = loginPayload.sessionId;
    state.dresUsername = loginPayload.username || username;
    state.dresServerUrl = serverUrl;
    state.dresSelectedEvaluationId = '';
    els.dresPassword.value = '';
    setDresStatus(`Đã đăng nhập: ${loginPayload.username || username}`);

    const evalResp = await fetch('/dres/evaluations', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({server_url: serverUrl, session_id: state.dresSessionId})
    });
    const evaluations = await evalResp.json();
    if (!evalResp.ok) throw new Error(evaluations.detail || evaluations.description || JSON.stringify(evaluations));
    state.dresEvaluations = Array.isArray(evaluations) ? evaluations : [];
    renderEvaluations();
    renderDresSession();
    saveDresCache();
    const activeCount = state.dresEvaluations.filter(item => item.status === 'ACTIVE').length;
    setDresStatus(`Đã tải ${state.dresEvaluations.length} evaluation, ${activeCount} đang ACTIVE. Chọn evaluation để tiếp tục.`);
  } catch (error) {
    state.dresSessionId = null;
    state.dresEvaluations = [];
    state.dresSelectedEvaluationId = '';
    saveDresCache();
    renderEvaluations();
    renderDresSession();
    const reason = error.message || String(error);
    showError(reason);
    setDresStatus(`Đăng nhập DRES thất bại: ${reason}`);
  } finally {
    els.dresLoginBtn.disabled = false;
  }
}

async function logoutDres() {
  if (state.clientId) {
    try {
      const resp = await fetch('/team/clear', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({client_id: state.clientId})
      });
      const teamState = await resp.json();
      if (resp.ok) applyTeamState(teamState);
    } catch {
      // Logout should still clear local cache even if vote cleanup fails.
    }
  }
  state.dresSessionId = null;
  state.dresEvaluations = [];
  state.dresSelectedEvaluationId = '';
  state.dresUsername = '';
  state.memberName = '';
  els.dresUsername.value = '';
  els.memberName.value = '';
  renderEvaluations();
  renderDresSession();
  clearLocalSessionCache();
  setDresStatus('Đã đăng xuất DRES.');
}



async function submitCsv(items = [], submission = null) {
  const query = activeQuery();
  if (!query) {
    showError('Chọn một query trước khi ghi CSV.');
    return;
  }
  const taskType = submission?.task_type || query.task_type;
  if (query.task_type !== taskType && query.task_type !== els.taskType.value) {
    showError(`Query ${query.label} là loại ${query.task_type.toUpperCase()}.`);
    return;
  }

  let submittedItems = items;
  if (query.task_type === 'qa' && submittedItems.length === 0) {
    const selectedItems = state.teamVotes.map(vote => vote.item).filter(Boolean);
    if (selectedItems.length !== 1) {
      showError('CSV Q&A cần đúng một frame: bấm nút submit trên frame cần nộp, hoặc chỉ giữ một frame trong khay.');
      return;
    }
    submittedItems = selectedItems;
  }

  const userName = (state.memberName || state.dresUsername || 'Thành viên').trim() || 'Thành viên';
  const payloadData = {
    query_filename: query.filename,
    user_name: userName,
    name: userName,
    items: submittedItems.map(item => ({
      video_id: item.video_id,
      frame_id: csvFrameId(item)
    })),
    answer: query.task_type === 'qa' ? (els.qaAnswer?.value.trim() || '') : ''
  };

  setStatus('Đang ghi CSV', 'searching');
  showError('');
  setLog(`[ĐANG GHI CSV]\n\nPAYLOAD GỬI ĐI (PAYLOAD):\n${JSON.stringify(payloadData, null, 2)}`);
  try {
    const response = await fetch('/submission/csv', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payloadData)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);
    query.answer_count = Number(payload.answer_count) || 0;
    renderQueryStrip();
    setStatus(`Đã ghi CSV (${query.answer_count})`, 'ok');
    setLog(`[GHI CSV THÀNH CÔNG]\n\nFILE: ${payload.output_filename}\n\nPAYLOAD GỬI ĐI (PAYLOAD):\n${JSON.stringify(payloadData, null, 2)}\n\nKẾT QUẢ DÒNG GHI (ROW):\n${JSON.stringify(payload.row, null, 2)}`);
  } catch (error) {
    const reason = error.message || String(error);
    showError(reason);
    setStatus('Ghi CSV lỗi', 'error');
    setLog(`[GHI CSV THẤT BẠI]\n\nLÝ DO (REASON):\n${reason}\n\nPAYLOAD GỬI ĐI (PAYLOAD):\n${JSON.stringify(payloadData, null, 2)}`);
  }
}

async function submit(target = null, taskType = null) {
  let submission;
  try {
    submission = buildSubmitRequest(target, taskType);
  } catch (error) {
    const reason = error.message || String(error);
    showError(reason);
    setLog(`[BUILD SUBMIT LỖI]\n\nLÝ DO (REASON):\n${reason}`);
    return;
  }

  const items = submission.items || (Array.isArray(target) ? target : target ? [target] : []);

  if (state.submissionMode === 'csv') {
    await submitCsv(items, submission);
    return;
  }

  await submitPayloadToDres(submission, items);
}

// Restored dedicated submit functions
async function submitItemToDres(item) {
  if (!item) {
    showError('Chọn một frame trước khi nộp.');
    return;
  }
  const timeMs = answerTimeMs(item);
  const submission = {
    task_type: 'kis',
    payload: {
      answerSets: [{
        answers: [{
          mediaItemName: item.video_id,
          start: String(timeMs),
          end: String(timeMs)
        }]
      }]
    },
    items: [item]
  };
  await submitPayloadToDres(submission, [item]);
}

async function submitSharedTrakeToDres() {
  const trakeFrames = state.trakeFrames || [];
  if (trakeFrames.length === 0) {
    showError('Khay TRAKE đang trống. Hãy bấm "Add TRAKE" để thêm frame trước khi nộp.');
    return;
  }
  const items = trakeFrames.map(f => f.item).filter(Boolean);
  const videoId = items[0]?.video_id;
  if (!videoId) {
    showError('Không tìm thấy Video ID cho bài nộp TRAKE.');
    return;
  }
  if (!items.every(item => item.video_id === videoId)) {
    showError('TRAKE yêu cầu tất cả frame phải thuộc cùng một video.');
    return;
  }
  const frameList = items.map(item => String(item.frame_id ?? frameId(item))).join(',');
  const submission = {
    task_type: 'trake',
    payload: {
      answerSets: [{
        answers: [{
          text: `TR-${videoId}-${frameList}`
        }]
      }]
    },
    items
  };
  await submitPayloadToDres(submission, items);
}

async function submitQaAnswerToDres(targetItem = null) {
  const rawAnswer = els.qaAnswer?.value.trim() || '';
  if (!rawAnswer) {
    els.qaAnswer?.focus();
    showError('Vui lòng nhập câu trả lời Q&A trước khi nộp.');
    return;
  }
  let item = targetItem;
  if (!item) {
    if (state.activeVideoItem) item = getDisplayedVideoFrameItem() || state.activeVideoItem;
    else if (state.teamVotes.length > 0 && state.teamVotes[0].item) item = state.teamVotes[0].item;
    else if (state.trakeFrames.length > 0 && state.trakeFrames[0].item) item = state.trakeFrames[0].item;
    else if (state.selected?.length > 0) item = state.selected[0];
    else if (state.results?.length > 0) {
      const first = state.results[0];
      item = first.video_id ? first : (first.scenes?.[0] || null);
    }
  }
  if (!item) {
    showError('Q&A bắt buộc phải kèm Video ID và Timestamp. Hãy bấm nút Submit trên frame cần nộp hoặc mở video.');
    return;
  }
  const timeMs = answerTimeMs(item);
  const answerText = rawAnswer.startsWith('QA-')
    ? rawAnswer
    : `QA-${rawAnswer}-${item.video_id}-${timeMs}`;

  const submission = {
    task_type: 'qa',
    answer: answerText,
    items: [item]
  };

  if (state.submissionMode === 'csv') {
    await submitCsv([item], submission);
    return;
  }
  await submitPayloadToDres(submission, [item]);
}

function submitDisplayedFrameToDres() {
  const item = getDisplayedVideoFrameItem();
  if (!item) {
    showError('Không lấy được thông tin frame đang hiển thị.');
    return;
  }
  if (state.submissionMode === 'csv') {
    submitCsv([item]);
    return;
  }
  if (els.taskType.value === 'qa') {
    submitQaAnswerToDres(item);
    return;
  }
  submitItemToDres(item);
}

async function submitPayloadToDres(submission, submittedItems = []) {
  const serverUrl = state.dresServerUrl || els.dresServer.value.trim();
  const evaluationId = state.dresSelectedEvaluationId;
  const fullPayload = {
    server_url: serverUrl,
    session_id: state.dresSessionId,
    evaluation_id: evaluationId,
    ...submission
  };

  if (!serverUrl || !state.dresSessionId || !evaluationId) {
    const missing = [];
    if (!serverUrl) missing.push('Chưa nhập URL server DRES');
    if (!state.dresSessionId) missing.push('Chưa đăng nhập DRES (thiếu session_id)');
    if (!evaluationId) missing.push('Chưa chọn Evaluation (thiếu evaluation_id)');
    const reason = `Chưa sẵn sàng submit DRES: ${missing.join(', ')}. Hãy bấm cấu hình DRES để đăng nhập và chọn evaluation.`;
    showError(reason);
    setLog(`[SUBMIT THẤT BẠI]\n\nLÝ DO (REASON):\n${reason}\n\nPAYLOAD GỬI ĐI (PAYLOAD):\n${JSON.stringify(submission, null, 2)}`);
    return;
  }

  showError('');
  unlockCorrectSound();
  setStatus('Đang submit', 'searching');
  setDresStatus('Đang submit DRES...');
  setLog(`[ĐANG GỬI SUBMISSION LÊN DRES]\n\nSERVER: ${serverUrl}\nEVALUATION ID: ${evaluationId}\nSESSION ID: ${state.dresSessionId}\n\nPAYLOAD GỬI ĐI (PAYLOAD):\n${JSON.stringify(submission, null, 2)}`);

  try {
    const resp = await fetch('/dres/submit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(fullPayload)
    });
    const text = await resp.text();
    if (!resp.ok) {
      let detailMsg = text;
      try {
        const parsed = JSON.parse(text);
        detailMsg = parsed.detail || parsed.message || parsed.description || text;
      } catch {}
      const reason = `HTTP ${resp.status}: ${detailMsg || 'Server không phản hồi chi tiết.'}`;
      const logText = `[SUBMIT THẤT BẠI]\n\nLÝ DO (REASON):\n${reason}\n\nPAYLOAD GỬI ĐI (PAYLOAD):\n${JSON.stringify(submission, null, 2)}\n\nPHẢN HỒI GỐC TỪ SERVER (RESPONSE BODY):\n${text || '(Trống)'}`;
      setLog(logText);
      throw new Error(reason);
    }
    const feedback = parseSubmissionFeedback(text);
    if (feedback) {
      publishSubmissionFeedback(feedback, submittedItems);
    }
    setStatus(
      feedback === 'wrong' ? 'WRONG' : feedback === 'correct' ? 'CORRECT' : 'Đã submit',
      feedback === 'wrong' ? 'error' : 'ok'
    );
    setLog(`[SUBMIT THÀNH CÔNG]\n\nKẾT QUẢ: ${feedback ? feedback.toUpperCase() : 'ĐÃ GHI NHẬN'}\n\nPAYLOAD GỬI ĐI (PAYLOAD):\n${JSON.stringify(submission, null, 2)}\n\nPHẢN HỒI TỪ DRES (RESPONSE BODY):\n${text || 'Submit thành công.'}`);
    setDresStatus(feedback === 'wrong'
      ? 'DRES trả về WRONG. Frame đã được đánh dấu đỏ.'
      : feedback === 'correct'
        ? 'DRES trả về CORRECT. Frame đã được đánh dấu xanh.'
        : 'Đã submit thành công. Bấm trạng thái góc phải để xem log.');
  } catch (error) {
    if (!state.lastLog.includes('[SUBMIT THẤT BẠI]')) {
      const reason = error.message || String(error);
      setLog(`[SUBMIT THẤT BẠI]\n\nLÝ DO (REASON):\n${reason}\n\nPAYLOAD GỬI ĐI (PAYLOAD):\n${JSON.stringify(submission, null, 2)}`);
    }
    setStatus('Submit lỗi', 'error');
    setDresStatus('Submit DRES thất bại. Bấm trạng thái góc phải để xem log.');
  }
}



// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.buildSubmitRequest = buildSubmitRequest; } catch (_) {}
  try { window.loadDresCache = loadDresCache; } catch (_) {}
  try { window.loadMemberCache = loadMemberCache; } catch (_) {}
  try { window.saveMemberCache = saveMemberCache; } catch (_) {}
  try { window.clearLocalSessionCache = clearLocalSessionCache; } catch (_) {}
  try { window.saveDresCache = saveDresCache; } catch (_) {}
  try { window.setTaskType = setTaskType; } catch (_) {}
  try { window.cycleTaskType = cycleTaskType; } catch (_) {}
  try { window.renderTaskControls = renderTaskControls; } catch (_) {}
  try { window.renderDresSession = renderDresSession; } catch (_) {}
  try { window.openDresModal = openDresModal; } catch (_) {}
  try { window.closeDresModal = closeDresModal; } catch (_) {}
  try { window.handleDresEnter = handleDresEnter; } catch (_) {}
  try { window.renderEvaluations = renderEvaluations; } catch (_) {}
  try { window.chooseEvaluation = chooseEvaluation; } catch (_) {}
  try { window.saveMemberName = saveMemberName; } catch (_) {}
  try { window.backToEvaluation = backToEvaluation; } catch (_) {}
  try { window.loginDres = loginDres; } catch (_) {}
  try { window.logoutDres = logoutDres; } catch (_) {}
  try { window.submitCsv = submitCsv; } catch (_) {}
  try { window.submit = submit; } catch (_) {}
  try { window.submitItemToDres = submitItemToDres; } catch (_) {}
  try { window.submitSharedTrakeToDres = submitSharedTrakeToDres; } catch (_) {}
  try { window.submitQaAnswerToDres = submitQaAnswerToDres; } catch (_) {}
  try { window.submitDisplayedFrameToDres = submitDisplayedFrameToDres; } catch (_) {}
  try { window.submitPayloadToDres = submitPayloadToDres; } catch (_) {}
}
