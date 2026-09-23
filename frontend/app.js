const state = {
  searchMode: 'temporal',
  embeddingModel: 'metaclip',
  ocrModel: 'monkey',
  queryMode: 'text',
  similarityItem: null,
  similarityQuery: '',
  similarityTextWeight: 30,
  asrWeight: 20,
  asrOnly: false,
  autoTranslate: typeof localStorage !== 'undefined' ? localStorage.getItem('aic_auto_translate') === 'true' : false,
  stages: [{id: 1, name: 'Hành động A', query: '', translatedQuery: '', ocrQuery: '', asrQuery: '', ocrWeight: 41, asrWeight: 20}],
  temporalSessionId: null,
  temporalStage: 0,
  results: [],
  selected: [],
  backend: null,
  dresSessionId: null,
  dresEvaluations: [],
  dresSelectedEvaluationId: '',
  dresUsername: '',
  dresServerUrl: 'http://192.168.28.151:5000',
  submissionMode: 'dres',
  queryCatalog: [],
  activeQueryFilename: typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('aic_active_query_v1') || '') : '',
  lastLog: 'Chưa có log.',
  clientId: '',
  memberName: '',
  teamVotes: [],
  trakeFrames: [],
  trakeUsers: {},
  myTrakeEvent: 1,
  trakeDrawerOpen: false,
  queryViewers: {},
  userDrafts: {},
  draftDebounceTimer: null,
  viewingHeartbeatTimer: null,
  activeTrayTab: 'chung',
  teamSocket: null,
  teamSocketRetryTimer: null,
  lastSearchTiming: null,
  fusionWeightsTouched: false,
  activeVideoItem: null,
  activeShotContextFrames: [],
  activeFrameContextFrames: [],
  frameOverviewFrames: [],
  imageItem: null,
  shotContextCache: new Map(),
  submissionFeedback: new Map(),
  handledSubmissionEvents: new Set(),
  videoFps: {default_fps: 25, overrides: {}},
  isScrubbingStrip: false,
  hasDraggedStrip: false,
  stripRafId: null,
  isInitialVideoLoad: false,
  showVideoFrameText: false,
  activeVideoTextKeyframeId: '',
  activeVideoTextItem: null,
  activeVideoAsrEntries: [],
  activeVideoAsrContext: null,
  activeVideoAsrHighlightKey: ''
};

const DRES_CACHE_KEY = 'aic_dres_session_v1';
const ACTIVE_QUERY_CACHE_KEY = 'aic_active_query_v1';
const MEMBER_CACHE_KEY = 'aic_team_member_v1';
const SUBMISSION_MODE_CACHE_KEY = 'aic_submission_mode_v1';
let activeHls = null;
let correctCelebrationTimer = null;
let correctSoundUnlocked = false;

function makeClientId() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const els = {
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  memberNameBtn: document.getElementById('memberNameBtn'),
  memberNameDisplay: document.getElementById('memberNameDisplay'),
  statsOpenBtn: document.getElementById('statsOpenBtn'),
  statsModal: document.getElementById('statsModal'),
  closeStatsBtn: document.getElementById('closeStatsBtn'),
  statsTabPersonal: document.getElementById('statsTabPersonal'),
  statsTabTeamHistory: document.getElementById('statsTabTeamHistory'),
  teamHistorySubCount: document.getElementById('teamHistorySubCount'),
  statsTeamHistoryView: document.getElementById('statsTeamHistoryView'),
  teamHistoryList: document.getElementById('teamHistoryList'),
  statsTabLeaderboard: document.getElementById('statsTabLeaderboard'),
  statsPersonalView: document.getElementById('statsPersonalView'),
  statsLeaderboardView: document.getElementById('statsLeaderboardView'),
  personalStatsList: document.getElementById('personalStatsList'),
  leaderboardList: document.getElementById('leaderboardList'),
  personalSubCount: document.getElementById('personalSubCount'),
  teamSubCount: document.getElementById('teamSubCount'),
  appShell: document.getElementById('appShell'),
  queryStrip: document.getElementById('queryStrip'),
  activeQueryContent: document.getElementById('activeQueryContent'),
  videoActiveQueryContent: document.getElementById('videoActiveQueryContent'),
  globalSimilarityBtn: document.getElementById('globalSimilarityBtn'),
  globalSimilarityPopover: document.getElementById('globalSimilarityPopover'),
  globalSimilarityDropzone: document.getElementById('globalSimilarityDropzone'),
  globalSimilarityQuery: document.getElementById('globalSimilarityQuery'),
  globalSimilarityWeight: document.getElementById('globalSimilarityWeight'),
  globalSimilarityWeightValue: document.getElementById('globalSimilarityWeightValue'),
  globalSimilarityImageWeightValue: document.getElementById('globalSimilarityImageWeightValue'),
  submissionModeToggle: document.getElementById('submissionModeToggle'),
  stageList: document.getElementById('stageList'),
  videoFilter: document.getElementById('videoFilter'),
  clearBtn: document.getElementById('clearBtn'),
  resetBtn: document.getElementById('resetBtn'),
  status: document.getElementById('status'),
  connectionStatus: document.getElementById('logOpenBtn'),
  results: document.getElementById('results'),
  resultCount: document.getElementById('resultCount'),
  searchMeta: document.getElementById('searchMeta'),
  embeddingModelToggle: document.getElementById('embeddingModelToggle'),
  autoTranslateToggle: document.getElementById('autoTranslateToggle'),
  autoTranslateLabel: document.getElementById('autoTranslateLabel'),

  searchTimingBtn: document.getElementById('searchTimingBtn'),
  selectedFrames: document.getElementById('selectedFrames'),
  selectionTray: document.getElementById('selectionTray'),
  trayTabChung: document.getElementById('trayTabChung'),
  trayTabTrake: document.getElementById('trayTabTrake'),
  selectionCount: document.getElementById('selectionCount'),
  traySubmitBtn: document.getElementById('traySubmitBtn'),
  trakeSubmitBtn: document.getElementById('trakeSubmitBtn'),
  trakePanelToggleBtn: document.getElementById('trakePanelToggleBtn'),
  trakeToggleCount: document.getElementById('trakeToggleCount'),
  trakeDrawer: document.getElementById('trakeDrawer'),
  closeTrakeDrawerBtn: document.getElementById('closeTrakeDrawerBtn'),
  trakeMasterCount: document.getElementById('trakeMasterCount'),
  trakeMasterVideo: document.getElementById('trakeMasterVideo'),
  trakeMasterClearBtn: document.getElementById('trakeMasterClearBtn'),
  trakeMasterSubmitBtn: document.getElementById('trakeMasterSubmitBtn'),
  trakeMasterDropzone: document.getElementById('trakeMasterDropzone'),
  trakeMasterFrames: document.getElementById('trakeMasterFrames'),
  trakeAddMyEventBtn: document.getElementById('trakeAddMyEventBtn'),
  trakeUserCards: document.getElementById('trakeUserCards'),
  videoTrakeTray: document.getElementById('videoTrakeTray'),
  videoMainLayout: document.querySelector('.video-main-layout'),
  videoTrakeCount: document.getElementById('videoTrakeCount'),
  videoOpenTrakeDrawerBtn: document.getElementById('videoOpenTrakeDrawerBtn'),
  videoTrakeFrames: document.getElementById('videoTrakeFrames'),
  videoShell: document.getElementById('videoShell'),
  videoScrubHud: document.getElementById('videoScrubHud'),
  player: document.getElementById('player'),
  videoBackBtn: document.getElementById('videoBackBtn'),
  videoPlayBtn: document.getElementById('videoPlayBtn'),
  videoForwardBtn: document.getElementById('videoForwardBtn'),
  videoVolumeControl: document.getElementById('videoVolumeControl'),
  videoVolumeBtn: document.getElementById('videoVolumeBtn'),
  videoVolumePopover: document.getElementById('videoVolumePopover'),
  videoVolumeSlider: document.getElementById('videoVolumeSlider'),
  videoVolumeValue: document.getElementById('videoVolumeValue'),
  videoTime: document.getElementById('videoTime'),
  videoProgress: document.getElementById('videoProgress'),
  videoSpeedControl: document.getElementById('videoSpeedControl'),
  videoSpeedBtn: document.getElementById('videoSpeedBtn'),
  videoSpeedMenu: document.getElementById('videoSpeedMenu'),
  videoFullscreenBtn: document.getElementById('videoFullscreenBtn'),
  captureFrameBtn: document.getElementById('captureFrameBtn'),
  videoSubmitCurrentBtn: document.getElementById('videoSubmitCurrentBtn'),
  videoTextToggleBtn: document.getElementById('videoTextToggleBtn'),
  videoFrameTextPanel: document.getElementById('videoFrameTextPanel'),
  videoFrameTextLabel: document.getElementById('videoFrameTextLabel'),
  videoFrameTextDetails: document.getElementById('videoFrameTextDetails'),
  expandShotContextBtn: document.getElementById('expandShotContextBtn'),
  expandFrameContextBtn: document.getElementById('expandFrameContextBtn'),
  videoFrameStrip: document.getElementById('videoFrameStrip'),
  videoModal: document.getElementById('videoModal'),
  modalTitle: document.getElementById('modalTitle'),
  closeVideoBtn: document.getElementById('closeVideoBtn'),
  shotOverviewModal: document.getElementById('shotOverviewModal'),
  shotOverviewTitle: document.getElementById('shotOverviewTitle'),
  shotOverviewGrid: document.getElementById('shotOverviewGrid'),
  closeShotOverviewBtn: document.getElementById('closeShotOverviewBtn'),
  frameOverviewModal: document.getElementById('frameOverviewModal'),
  frameOverviewTitle: document.getElementById('frameOverviewTitle'),
  frameOverviewGrid: document.getElementById('frameOverviewGrid'),
  closeFrameOverviewBtn: document.getElementById('closeFrameOverviewBtn'),
  imageModal: document.getElementById('imageModal'),
  imageTitle: document.getElementById('imageTitle'),
  imagePreview: document.getElementById('imagePreview'),
  imageMeta: document.getElementById('imageMeta'),
  imageTextDetails: document.getElementById('imageTextDetails'),
  imageAddTrayBtn: document.getElementById('imageAddTrayBtn'),
  closeImageBtn: document.getElementById('closeImageBtn'),
  errorBanner: document.getElementById('errorBanner'),
  dresOpenBtn: document.getElementById('dresOpenBtn'),
  dresModal: document.getElementById('dresModal'),
  closeDresBtn: document.getElementById('closeDresBtn'),
  dresTitle: document.getElementById('dresTitle'),
  dresLoginView: document.getElementById('dresLoginView'),
  dresSessionView: document.getElementById('dresSessionView'),
  memberNameView: document.getElementById('memberNameView'),
  memberName: document.getElementById('memberName'),
  saveMemberNameBtn: document.getElementById('saveMemberNameBtn'),
  memberBackBtn: document.getElementById('memberBackBtn'),
  taskType: document.getElementById('taskType'),
  qaAnswer: document.getElementById('qaAnswer'),
  qaSubmitBtn: document.getElementById('qaSubmitBtn'),
  dresServer: document.getElementById('dresServer'),
  dresUsername: document.getElementById('dresUsername'),
  dresPassword: document.getElementById('dresPassword'),
  dresLoginBtn: document.getElementById('dresLoginBtn'),
  dresLogoutBtn: document.getElementById('dresLogoutBtn'),
  evaluationSelect: document.getElementById('evaluationSelect'),
  chooseEvaluationBtn: document.getElementById('chooseEvaluationBtn'),
  dresStatus: document.getElementById('dresStatus'),
  logModal: document.getElementById('logModal'),
  correctCelebration: document.getElementById('correctCelebration'),
  correctSubmissionSound: document.getElementById('correctSubmissionSound'),
  closeLogBtn: document.getElementById('closeLogBtn'),
  logContent: document.getElementById('logContent'),
  timingModal: document.getElementById('timingModal'),
  closeTimingBtn: document.getElementById('closeTimingBtn'),
  timingClientTotal: document.getElementById('timingClientTotal'),
  timingBackendTotal: document.getElementById('timingBackendTotal'),
  timingOutsideBackend: document.getElementById('timingOutsideBackend'),
  timingBackendNote: document.getElementById('timingBackendNote'),
  timingTableBody: document.getElementById('timingTableBody'),
  shortcutsBtn: document.getElementById('shortcutsBtn'),
  shortcutsModal: document.getElementById('shortcutsModal'),
  closeShortcutsBtn: document.getElementById('closeShortcutsBtn')
};

function stageLetter(index) {
  return String.fromCharCode(65 + index);
}

function setStatus(text, mode = 'neutral') {
  els.status.textContent = text;
  els.connectionStatus.textContent = mode === 'searching' ? 'Đang tìm' : text;
  els.connectionStatus.className = `status-pill ${mode === 'ok' ? 'ok' : mode === 'error' ? 'error' : 'warning'}`;
}

function showError(message) {
  els.errorBanner.hidden = !message;
  els.errorBanner.textContent = message || '';
}

function setDresStatus(text) {
  if (els.dresStatus) {
    els.dresStatus.textContent = text || '';
  }
}

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

function parseSubmissionFeedback(text) {
  try {
    const submission = String(JSON.parse(text)?.submission || '').toUpperCase();
    if (submission === 'CORRECT') return 'correct';
    if (submission === 'WRONG') return 'wrong';
  } catch {
    return null;
  }
  return null;
}

function submissionFeedbackFor(item) {
  return state.submissionFeedback.get(String(item?.keyframe_id || '')) || '';
}

function submissionFeedbackMarkup(feedback) {
  return '';
}

function hideCorrectCelebration() {
  window.clearTimeout(correctCelebrationTimer);
  correctCelebrationTimer = null;
  els.correctSubmissionSound.pause();
  els.correctSubmissionSound.currentTime = 0;
  els.correctCelebration.hidden = true;
}

function unlockCorrectSound() {
  if (correctSoundUnlocked) return;
  const audio = els.correctSubmissionSound;
  audio.muted = true;
  const playPromise = audio.play();
  if (!playPromise) return;
  playPromise.then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    correctSoundUnlocked = true;
  }).catch(() => {
    audio.muted = false;
  });
}

function showCorrectCelebration() {
  const audio = els.correctSubmissionSound;
  window.clearTimeout(correctCelebrationTimer);
  audio.pause();
  audio.src = `/correct-submission-sound.mp3?event=${encodeURIComponent(makeClientId())}`;
  audio.load();
  audio.currentTime = 0;
  audio.muted = false;
  els.correctCelebration.hidden = false;
  audio.onended = hideCorrectCelebration;
  audio.ontimeupdate = () => {
    if (audio.currentTime >= 20) hideCorrectCelebration();
  };
  audio.play().catch(() => {
    // Keep the visual effect for the audio duration if browser autoplay is blocked.
  });
  correctCelebrationTimer = window.setTimeout(hideCorrectCelebration, 22000);
}

function handleSubmissionFeedbackEvent(event) {
  if (event?.type !== 'submission_feedback' || !event.event_id) return;
  if (state.handledSubmissionEvents.has(event.event_id)) return;
  state.handledSubmissionEvents.add(event.event_id);
  if (event.verdict === 'correct') {
    for (const [keyframeId, verdict] of state.submissionFeedback) {
      if (verdict === 'wrong') state.submissionFeedback.delete(keyframeId);
    }
  }
  const hasCorrect = [...state.submissionFeedback.values()].includes('correct');
  (event.keyframe_ids || []).forEach(keyframeId => {
    if (event.verdict === 'clear') state.submissionFeedback.delete(String(keyframeId));
    else if (event.verdict !== 'wrong' || !hasCorrect) state.submissionFeedback.set(String(keyframeId), event.verdict);
  });
  renderResults();
  renderSelection();
  if (event.verdict === 'correct') showCorrectCelebration();
  if (event.verdict === 'clear' && ![...state.submissionFeedback.values()].includes('correct')) hideCorrectCelebration();
}

function publishSubmissionFeedback(verdict, submittedItems) {
  const keyframeIds = submittedItems.map(item => String(item?.keyframe_id || '')).filter(Boolean);
  if (!keyframeIds.length) return;
  const event = {
    type: 'submission_feedback',
    event_id: makeClientId(),
    verdict,
    name: state.memberName || state.dresUsername || 'Thành viên',
    keyframe_ids: keyframeIds
  };
  handleSubmissionFeedbackEvent(event);
  fetch('/team/submission-feedback', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(event)
  }).catch(() => {
    // DRES submission has already completed; realtime feedback is best-effort.
  });
}

function clearSubmissionFeedback() {
  const keyframeIds = [...state.submissionFeedback.keys()];
  state.submissionFeedback.clear();
  state.handledSubmissionEvents.clear();
  for (let offset = 0; offset < keyframeIds.length; offset += 100) {
    const event = {
      type: 'submission_feedback',
      event_id: makeClientId(),
      verdict: 'clear',
      name: state.memberName || state.dresUsername || 'Thành viên',
      keyframe_ids: keyframeIds.slice(offset, offset + 100)
    };
    fetch('/team/submission-feedback', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(event)
    }).catch(() => {
      // The local reset should still complete if realtime cleanup is unavailable.
    });
  }
}

async function clearCorrectSubmissionFeedback() {
  const keyframeIds = [...state.submissionFeedback]
    .filter(([, verdict]) => verdict === 'correct')
    .map(([keyframeId]) => keyframeId);
  for (let offset = 0; offset < keyframeIds.length; offset += 100) {
    const event = {
      type: 'submission_feedback',
      event_id: makeClientId(),
      verdict: 'clear',
      name: state.memberName || state.dresUsername || 'Thành viên',
      keyframe_ids: keyframeIds.slice(offset, offset + 100)
    };
    const resp = await fetch('/team/submission-feedback', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(event)
    });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.detail || 'Không đồng bộ được trạng thái CORRECT.');
    handleSubmissionFeedbackEvent(payload);
  }
}

function openLogModal() {
  els.logContent.textContent = state.lastLog || 'Chưa có log.';
  els.logModal.hidden = false;
}

function closeLogModal() {
  els.logModal.hidden = true;
}

const TIMING_ROWS = [
  ['tokenize_ms', 'Tách và chuẩn bị câu chữ', 'Chia câu truy vấn thành các đơn vị mà mô hình MetaCLIP2 hiểu được.'],
  ['input_to_gpu_ms', 'Chuyển dữ liệu sang GPU', 'Đưa dữ liệu truy vấn từ bộ nhớ CPU sang GPU.'],
  ['model_forward_ms', 'Chạy mô hình MetaCLIP2', 'Thời gian mô hình tạo đặc trưng văn bản từ câu truy vấn.'],
  ['embedding_postprocess_ms', 'Hoàn thiện vector truy vấn', 'Lấy kết quả từ mô hình và chuẩn bị vector đầu ra.'],
  ['encode_ms', 'Tổng mã hóa truy vấn', 'Tổng phụ của các bước chuẩn bị câu chữ, chuyển dữ liệu và chạy MetaCLIP2.'],
  ['query_validate_ms', 'Kiểm tra vector truy vấn', 'Xác nhận vector truy vấn đúng kích thước và không chứa giá trị lỗi.'],
  ['normalize_ms', 'Chuẩn hóa vector', 'Đưa vector về cùng thang đo trước khi tính độ tương đồng.'],
  ['similarity_ms', 'So sánh với kho frame', 'Tính điểm giống nhau giữa truy vấn và toàn bộ vector frame trong database.'],
  ['topk_ms', 'Chọn kết quả tốt nhất', 'Lấy các frame có điểm cao nhất và sắp xếp theo thứ hạng.'],
  ['index_validate_ms', 'Kiểm tra kết quả truy hồi', 'Xác nhận chỉ số frame và điểm số trả về hợp lệ.'],
  ['retrieval_ms', 'Tổng thời gian truy hồi', 'Tổng phụ của chuẩn hóa, so sánh vector và chọn kết quả tốt nhất.'],
  ['gpu_to_cpu_conversion_ms', 'Đưa kết quả về CPU', 'Chuyển chỉ số và điểm số từ GPU về bộ nhớ CPU nếu cần.'],
  ['metadata_lookup_ms', 'Tra thông tin frame', 'Tìm metadata tương ứng với từng chỉ số vector kết quả.'],
  ['path_resolution_ms', 'Chuẩn bị đường dẫn', 'Tạo đường dẫn dùng để mở keyframe và video.'],
  ['response_building_ms', 'Tạo danh sách kết quả', 'Bổ sung thứ hạng, điểm số và thời điểm vào từng kết quả.'],
  ['metadata_ms', 'Tổng ghép thông tin kết quả', 'Tổng phụ của việc tra metadata và tạo danh sách frame/video trả về.'],
  ['ocr_search_ms', 'Tìm kiếm văn bản OCR', 'Tìm các frame có nội dung chữ khớp với truy vấn trong chỉ mục OCR.'],
  ['asr_search_ms', 'Tìm kiếm lời nói ASR', 'Tìm các đoạn transcript khớp với truy vấn và ánh xạ về shot đại diện.'],
  ['fusion_ms', 'Ghép điểm các nguồn', 'Kết hợp thứ hạng hình ảnh, OCR và ASR theo các trọng số đã chọn.'],
  ['anchor_search_ms', 'Tìm hành động anchor', 'Truy hồi toàn cục cho hành động nằm giữa chuỗi.'],
  ['local_stage_search_ms', 'Chấm các vùng lân cận', 'Chấm những shot trước và sau anchor có thể tạo thành chuỗi hợp lệ.'],
  ['stage_search_ms', 'Tổng tìm kiếm temporal', 'Tổng thời gian tìm anchor và chấm các vùng shot lân cận.'],
  ['temporal_join_ms', 'Ghép chuỗi thời gian', 'Dùng temporal DP để ghép các shot cùng video, đúng thứ tự và giới hạn khoảng cách.'],
  ['serialization_ms', 'Đóng gói phản hồi', 'Chuyển kết quả thành JSON để gửi về trình duyệt.']
  ,['candidate_filter_ms', 'Lọc cửa sổ temporal', 'Lấy frame cùng video, phía sau anchor và trong cửa sổ temporal đã cấu hình.']
  ,['global_search_ms', 'Tìm anchor toàn cục', 'Tìm Query A trên toàn bộ vector hợp lệ bằng PyTorch GPU.']
  ,['local_search_ms', 'Tìm kiếm cục bộ', 'Tổng thời gian tìm trên các cửa sổ temporal của tất cả anchor.']
  ,['sequence_build_ms', 'Ghép chuỗi temporal', 'Ghép frame theo A đến B đến C và tính Harmonic Mean.']
  ,['ranking_ms', 'Xếp hạng chuỗi', 'Loại chuỗi trùng, sắp xếp và lấy Top-K.']
  ,['session_update_ms', 'Cập nhật phiên', 'Cập nhật trạng thái phiên temporal trong RAM.']
  ,['frontend_response_ms', 'Frontend nhận phản hồi', 'Thời gian từ lúc gửi request đến khi trình duyệt đọc xong JSON.']
  ,['transit_up_ms', '🛫 Chặng đi (Client → Backend)', 'Thời gian request truyền qua mạng từ trình duyệt đến backend.']
  ,['transit_down_ms', '🛬 Chặng về (Backend → Client)', 'Thời gian kết quả truyền qua mạng từ backend về lại trình duyệt.']
  ,['frontend_render_ms', 'Frontend dựng kết quả', 'Thời gian dựng DOM kết quả sau khi nhận phản hồi.']
  ,['first_thumbnail_ms', 'Thumbnail đầu tiên', 'Thời gian từ lúc dựng kết quả đến khi thumbnail đầu tiên sẵn sàng.']
  ,['all_visible_thumbnails_ms', 'Toàn bộ thumbnail', 'Thời gian từ lúc dựng kết quả đến khi toàn bộ thumbnail hiện tại tải xong.']
];

function formatMilliseconds(value) {
  if (value === null || value === undefined || value === '') return '—';
  const ms = Number(value);
  if (!Number.isFinite(ms)) return '—';
  return `${new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 4
  }).format(ms / 1000)} giây`;
}

function resetSearchTiming() {
  state.lastSearchTiming = null;
  els.searchTimingBtn.textContent = 'Tổng thời gian: chưa có';
  els.searchTimingBtn.disabled = true;
  els.searchTimingBtn.hidden = false;
}

function trackThumbnailTimings(startedAt) {
  const images = [...els.results.querySelectorAll('img')];
  if (!state.lastSearchTiming || images.length === 0) return;
  let completed = 0;
  let firstRecorded = false;
  const record = () => {
    if (!state.lastSearchTiming) return;
    const elapsed = performance.now() - startedAt;
    if (!firstRecorded) {
      state.lastSearchTiming.timings.first_thumbnail_ms = elapsed;
      firstRecorded = true;
    }
    completed += 1;
    if (completed === images.length) {
      state.lastSearchTiming.timings.all_visible_thumbnails_ms = elapsed;
    }
  };
  images.forEach(image => {
    if (image.complete) record();
    else {
      image.addEventListener('load', record, {once: true});
      image.addEventListener('error', record, {once: true});
    }
  });
}

function backendMethodLabel(method) {
  if (method === 'asr_fts5') return 'tìm kiếm lời nói bằng ASR';
  if (method && method.endsWith('+asr_fts5')) {
    return `${backendMethodLabel(method.slice(0, -9))} + ASR`;
  }
  if (method === 'ocr_fts5') return 'tìm kiếm văn bản bằng OCR';
  if (method && method.endsWith('+ocr_filter_fts5')) {
    return `${backendMethodLabel(method.slice(0, -16))} + lọc OCR`;
  }
  if (method && method.endsWith('+ocr_fts5')) {
    return `${backendMethodLabel(method.slice(0, -9))} + OCR`;
  }
  if (method === 'linear') return 'tìm tuần tự trên toàn bộ kho vector';
  if (method === 'milvus') return 'tìm kiếm gần đúng bằng Milvus';
  if (method === 'faiss') return 'tìm kiếm gần đúng bằng FAISS';
  return method || 'backend';
}

function renderSearchTiming() {
  const report = state.lastSearchTiming;
  if (!report) return;
  const timings = report.timings || {};
  const backendTotal = Number(timings.total_ms);
  const outsideBackend = Number.isFinite(backendTotal)
    ? Math.max(0, report.clientTotalMs - backendTotal)
    : null;

  els.timingClientTotal.textContent = formatMilliseconds(report.clientTotalMs);
  els.timingBackendTotal.textContent = formatMilliseconds(backendTotal);
  els.timingOutsideBackend.textContent = formatMilliseconds(outsideBackend);
  els.timingBackendNote.textContent =
    `Backend đang dùng ${backendMethodLabel(report.searchBackend)} trên ${new Intl.NumberFormat('vi-VN').format(report.totalCandidates || 0)} vector.`;
  els.timingTableBody.innerHTML = '';

  TIMING_ROWS.forEach(([key, label, description]) => {
    const value = Number(timings[key]);
    if (!Number.isFinite(value)) return;
    const row = document.createElement('tr');
    row.innerHTML = `
      <th scope="row">${label}</th>
      <td>${formatMilliseconds(value)}</td>
      <td>${description}</td>`;
    els.timingTableBody.appendChild(row);
  });
}

function openTimingModal() {
  if (!state.lastSearchTiming) return;
  renderSearchTiming();
  els.timingModal.hidden = false;
}

function closeTimingModal() {
  els.timingModal.hidden = true;
}

async function openStatsModal() {
  els.statsModal.hidden = false;
  const name = (state.memberName || state.dresUsername || '').trim();
  els.personalStatsList.innerHTML = '<div class="stats-empty">Đang tải dữ liệu...</div>';
  if (els.teamHistoryList) els.teamHistoryList.innerHTML = '<div class="stats-empty">Đang tải dữ liệu...</div>';
  els.leaderboardList.innerHTML = '<div class="stats-empty">Đang tải dữ liệu...</div>';
  try {
    const resp = await fetch(`/team/user/stats?name=${encodeURIComponent(name)}`);
    if (!resp.ok) throw new Error('Không thể tải thống kê');
    const data = await resp.json();

    els.personalSubCount.textContent = String(data.user_submissions_count || 0);
    if (els.teamHistorySubCount) els.teamHistorySubCount.textContent = String(data.total_team_submissions || 0);
    els.teamSubCount.textContent = String(data.total_team_submissions || 0);

    // Render Personal History
    const personal = data.personal_history || [];
    if (personal.length === 0) {
      els.personalStatsList.innerHTML = `<div class="stats-empty">${name ? `User <strong>${escapeHtml(name)}</strong> chưa nộp câu nào.` : 'Chưa có tên user. Hãy đặt tên để theo dõi.'}</div>`;
    } else {
      els.personalStatsList.innerHTML = personal.map(item => {
        const timeStr = item.timestamp ? new Date(item.timestamp * 1000).toLocaleTimeString() : '';
        const summary = item.content_summary || (Array.isArray(item.row) ? item.row.join(', ') : '');
        return `
          <div class="stats-card">
            <div class="stats-card-main">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="stats-card-query">${escapeHtml(item.query_filename)}</span>
                <span class="query-chip-viewer" style="background: #ecfdf5; color: #047857; border-color: #a7f3d0;">${escapeHtml((item.task_type || '').toUpperCase())}</span>
              </div>
              <span class="stats-card-answer"><strong>Nội dung nộp:</strong> ${escapeHtml(summary)}</span>
            </div>
            <span class="stats-card-time">${escapeHtml(timeStr)}</span>
          </div>
        `;
      }).join('');
    }

    // Render Team History (Who modified what, which question)
    const teamHistory = data.team_history || [];
    if (els.teamHistoryList) {
      if (teamHistory.length === 0) {
        els.teamHistoryList.innerHTML = '<div class="stats-empty">Chưa có hoạt động nộp bài nào từ đội.</div>';
      } else {
        els.teamHistoryList.innerHTML = teamHistory.map(item => {
          const timeStr = item.timestamp ? new Date(item.timestamp * 1000).toLocaleTimeString() : '';
          const summary = item.content_summary || (Array.isArray(item.row) ? item.row.join(', ') : '');
          const isMe = name && (item.user_name || '').trim().toLowerCase() === name.toLowerCase();
          return `
            <div class="stats-card" style="border-left: 3px solid ${isMe ? 'var(--accent)' : '#9ca3af'};">
              <div class="stats-card-main">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="query-chip-viewer" style="${isMe ? 'background: #fdf2f2; color: var(--accent); border-color: #fca5a5;' : ''}">👤 ${escapeHtml(item.user_name || 'Ẩn danh')}</span>
                  <span class="stats-card-query">${escapeHtml(item.query_filename)}</span>
                  <span style="font-size: 11px; font-weight: 700; color: #6b7280;">[${escapeHtml((item.task_type || '').toUpperCase())}]</span>
                </div>
                <span class="stats-card-answer"><strong>Đã nộp/sửa:</strong> ${escapeHtml(summary)}</span>
              </div>
              <span class="stats-card-time">${escapeHtml(timeStr)}</span>
            </div>
          `;
        }).join('');
      }
    }

    // Render Leaderboard
    const leaderboard = data.leaderboard || [];
    if (leaderboard.length === 0) {
      els.leaderboardList.innerHTML = '<div class="stats-empty">Toàn đội chưa nộp câu nào.</div>';
    } else {
      els.leaderboardList.innerHTML = leaderboard.map((item, idx) => `
        <div class="leaderboard-item">
          <div>
            <span class="leaderboard-rank ${idx === 0 ? 'top-1' : ''}">${idx + 1}</span>
            <span class="leaderboard-name">${escapeHtml(item.name)}</span>
          </div>
          <span class="leaderboard-count">${item.count} câu</span>
        </div>
      `).join('');
    }
  } catch (err) {
    els.personalStatsList.innerHTML = `<div class="stats-empty is-error">${escapeHtml(err.message || String(err))}</div>`;
  }
}

function closeStatsModal() {
  els.statsModal.hidden = true;
}

function openShortcutsModal() {
  if (els.shortcutsModal) els.shortcutsModal.hidden = false;
}

function closeShortcutsModal() {
  if (els.shortcutsModal) els.shortcutsModal.hidden = true;
}

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
    const isCompletedTemporalStage = index < state.temporalStage;
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
          <button class="translate-query-btn" type="button" data-translate-query title="Dịch Text Query sang tiếng Anh bằng HPLT">Dịch sang English</button>
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
    card.querySelector('[data-translate-query]')?.addEventListener('click', event => {
      event.preventDefault();
      translateQueryInput(event.currentTarget, stage);
    });

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
  if (state.stages.length >= 5) return;
  
  const textFields = document.querySelectorAll('.text-query');
  const ocrFields = document.querySelectorAll('.stage-ocr-query');
  const asrFields = document.querySelectorAll('.stage-asr-query');
  const currentStageIndex = state.stages.length - 1;
  
  const hasContent = textFields[currentStageIndex]?.value?.trim() 
    || ocrFields[currentStageIndex]?.value?.trim() 
    || asrFields[currentStageIndex]?.value?.trim();

  // Luôn tạo trước stage mới để hệ thống biết đang ở chế độ temporal (cần > 1 stage)
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
    )
  });

  // Render UI ngay lập tức để người dùng thấy Tab B được thêm vào
  invalidateTemporalResults();
  renderStages();
  syncSearchModeControls();
  els.stageList.querySelector('.stage-card:last-child .text-query')?.focus();

  // Nếu người dùng đang ở một stage chưa search và có nhập liệu, tự động search stage vừa điền
  if (currentStageIndex === state.temporalStage && hasContent) {
    // Gọi search cho stage trước đó. 
    performSearch(state.temporalStage);
  }
}

function removeStage(stageId) {
  if (state.stages.length <= 1) return;
  state.stages = state.stages.filter(stage => stage.id !== stageId);
  state.searchMode = 'temporal';
  invalidateTemporalResults();
  renderStages();
  syncSearchModeControls();
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

async function translateQueryInput(button, stage) {
  const field = button.closest('.text-query-field');
  const textarea = field?.querySelector('.text-query');
  const source = textarea?.value.trim() || '';
  if (!textarea || !source) {
    showError('Nhập Text Query trước khi dịch.');
    textarea?.focus();
    return;
  }

  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = 'Đang dịch…';
  showError('');
  try {
    const {translation, latencyMs} = await requestEnglishTranslation(source);
    showStageTranslation(stage, translation);
    setStatus(`Đã dịch bằng HPLT (${latencyMs.toFixed(0)} ms)`, 'ok');
  } catch (error) {
    showError(`Dịch query thất bại: ${error.message || error}`);
    setStatus('Dịch thất bại', 'error');
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
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
      ? 'Auto Dịch tiếng Anh đang BẬT (Phím tắt: Alt+E). Bấm để tắt.'
      : 'Auto Dịch tiếng Anh đang TẮT (Phím tắt: Alt+E). Bấm để bật tự động dịch câu query tiếng Việt sang tiếng Anh trước khi tìm kiếm.';
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

function applyTeamState(teamState) {
  if (Array.isArray(teamState.votes)) {
    state.teamVotes = teamState.votes;
  }
  if (Array.isArray(teamState.trake_frames)) {
    state.trakeFrames = teamState.trake_frames;
  }
  if (teamState.trake_users && typeof teamState.trake_users === 'object') {
    state.trakeUsers = teamState.trake_users;
    if (state.clientId && state.trakeUsers[state.clientId]?.event) {
      state.myTrakeEvent = state.trakeUsers[state.clientId].event;
    }
  }
  renderTrakeDrawer();
  // Active query is isolated locally per user
  const submissionCounts = teamState.submission_counts && typeof teamState.submission_counts === 'object'
    ? teamState.submission_counts
    : {};
  state.queryCatalog.forEach(query => {
    if (Object.prototype.hasOwnProperty.call(submissionCounts, query.filename)) {
      query.answer_count = Number(submissionCounts[query.filename]) || 0;
    }
  });
  const sharedFeedback = teamState.submission_feedback && typeof teamState.submission_feedback === 'object'
    ? teamState.submission_feedback
    : {};
  const nextFeedback = new Map(
    Object.entries(sharedFeedback)
      .map(([keyframeId, value]) => [String(keyframeId), String(value?.verdict || '')])
      .filter(([, verdict]) => ['correct', 'wrong'].includes(verdict))
  );
  const feedbackChanged = nextFeedback.size !== state.submissionFeedback.size
    || [...nextFeedback].some(([keyframeId, verdict]) => state.submissionFeedback.get(keyframeId) !== verdict);
  state.submissionFeedback = nextFeedback;
  if (feedbackChanged) renderResults();
  renderQueryStrip();
  renderActiveQuery();
  renderSubmissionMode();
  renderSelection();
  renderTrakeTray();
}

async function refreshTeamState() {
  try {
    const resp = await fetch('/team/state');
    const teamState = await resp.json();
    if (resp.ok) {
      if (teamState.query_viewers && typeof teamState.query_viewers === 'object') {
        state.queryViewers = teamState.query_viewers;
      }
      applyTeamState(teamState);
    }
  } catch {
    // Voting is a convenience layer; search should keep working if it is temporarily unavailable.
  }
}

function teamWebSocketUrl() {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/ws/team`;
}

function scheduleTeamSocketReconnect() {
  if (state.teamSocketRetryTimer) return;
  state.teamSocketRetryTimer = window.setTimeout(() => {
    state.teamSocketRetryTimer = null;
    connectTeamSocket();
  }, 1500);
}

function connectTeamSocket() {
  if (!('WebSocket' in window)) {
    refreshTeamState();
    state.teamSocketRetryTimer = window.setInterval(refreshTeamState, 2000);
    return;
  }
  if (state.teamSocket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(state.teamSocket.readyState)) return;

  const socket = new WebSocket(teamWebSocketUrl());
  state.teamSocket = socket;

  socket.addEventListener('open', () => {
    refreshTeamState();
  });
  socket.addEventListener('message', event => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'submission_feedback') {
        handleSubmissionFeedbackEvent(payload);
      } else if (payload.type === 'viewers_update') {
        state.queryViewers = payload.viewers || {};
        renderQueryStrip();
      } else if (
        payload.votes !== undefined
        || payload.members !== undefined
        || payload.trake_frames !== undefined
        || payload.trake_users !== undefined
      ) {
        applyTeamState(payload);
      }
    } catch {
      // Ignore malformed realtime updates; the next server event will refresh state.
    }
  });
  socket.addEventListener('close', () => {
    if (state.teamSocket === socket) state.teamSocket = null;
    scheduleTeamSocketReconnect();
  });
  socket.addEventListener('error', () => {
    socket.close();
  });
}

async function voteForItem(item) {
  if (!state.memberName) {
    showError('Đăng nhập DRES, chọn evaluation và nhập tên gọi trước khi chọn frame.');
    openDresModal();
    return false;
  }
  const previousVotes = state.teamVotes;
  const optimisticVote = {
    selection_id: `pending:${state.clientId}:${item.keyframe_id}`,
    client_id: state.clientId,
    name: state.memberName,
    item,
    created_at: Date.now() / 1000
  };
  state.teamVotes = [
    ...state.teamVotes.filter(vote => !(vote.client_id === state.clientId && vote.item?.keyframe_id === item.keyframe_id)),
    optimisticVote
  ];
  renderSelection();
  try {
    const resp = await fetch('/team/vote', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({client_id: state.clientId, name: state.memberName, item})
    });
    const teamState = await resp.json();
    if (!resp.ok) throw new Error(teamState.detail || 'Lưu vote thất bại.');
    applyTeamState(teamState);
    showError('');
    return true;
  } catch (error) {
    state.teamVotes = previousVotes;
    renderSelection();
    showError(error.message || String(error));
    return false;
  }
}

async function addTrakeFrame(item) {
  const existingVideo = state.trakeFrames[0]?.item?.video_id;
  if (existingVideo && existingVideo !== item.video_id) {
    showError(`TRAKE đang chứa frame của ${existingVideo}; không thể thêm frame từ ${item.video_id}.`);
    return false;
  }
  const trakeFrame = {
    selection_id: `local:trake:${Date.now()}:${item.keyframe_id || item.frame_id || Date.now()}`,
    client_id: state.clientId,
    name: state.memberName || 'Bạn',
    item,
    created_at: Date.now() / 1000
  };
  const previousFrames = state.trakeFrames;
  state.trakeFrames = [...state.trakeFrames, trakeFrame];
  renderTrakeTray();
  renderTrakeMasterTray();
  try {
    const resp = await fetch('/team/trake/add', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        client_id: state.clientId,
        name: state.memberName || state.dresUsername || 'Thành viên',
        item
      })
    });
    const teamState = await resp.json();
    if (!resp.ok) throw new Error(teamState.detail || 'Không thêm được frame vào khay nộp chung.');
    applyTeamState(teamState);
    showError('');
    return true;
  } catch (error) {
    state.trakeFrames = previousFrames;
    renderTrakeDrawer();
    renderTrakeTray();
    showError(error.message || String(error));
    return false;
  }
}

async function removeTeamSelection(vote) {
  const previousVotes = state.teamVotes;
  state.teamVotes = state.teamVotes.filter(item => item !== vote);
  renderSelection();
  try {
    const resp = await fetch('/team/remove', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({selection_id: vote.selection_id})
    });
    const teamState = await resp.json();
    if (!resp.ok) throw new Error(teamState.detail || 'Xóa frame dùng chung thất bại.');
    applyTeamState(teamState);
    showError('');
  } catch (error) {
    state.teamVotes = previousVotes;
    renderSelection();
    showError(error.message || String(error));
  }
}

async function removeTrakeFrame(frame) {
  state.trakeFrames = state.trakeFrames.filter(item => item !== frame);
  renderTrakeTray();
  renderTrakeMasterTray();
  try {
    const resp = await fetch('/team/trake/remove', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({selection_id: frame.selection_id})
    });
    if (resp.ok) {
      const teamState = await resp.json();
      applyTeamState(teamState);
    }
  } catch (err) {
    console.error('Lỗi khi xóa frame TRAKE trên server:', err);
  }
}

async function clearTrakeFrames() {
  state.trakeFrames = [];
  renderTrakeTray();
  renderTrakeMasterTray();
  try {
    const resp = await fetch('/team/trake/clear', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({})
    });
    if (resp.ok) {
      const teamState = await resp.json();
      applyTeamState(teamState);
    }
  } catch (err) {
    console.error('Lỗi khi xóa toàn bộ TRAKE trên server:', err);
  }
}

async function clearMyVotes() {
  if (!state.memberName) {
    showError('Nhập tên gọi trước khi xóa lựa chọn của bạn.');
    openDresModal();
    return;
  }
  const previousVotes = state.teamVotes;
  state.teamVotes = state.teamVotes.filter(vote => !isMyVote(vote));
  renderSelection();
  try {
    const resp = await fetch('/team/clear', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        client_id: state.clientId,
        name: state.memberName
      })
    });
    const teamState = await resp.json();
    if (!resp.ok) throw new Error(teamState.detail || 'Xóa lựa chọn thất bại.');
    applyTeamState(teamState);
    showError('');
  } catch (error) {
    state.teamVotes = previousVotes;
    renderSelection();
    showError(error.message || String(error));
  }
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
      ? `Query ${stageLetter(Math.max(0, Number(payload.stage || 1) - 1))} · cửa sổ ${Number(payload.parameters?.temporal_window_ms || 45000) / 1000} giây · model cố định ${modelLabel}`
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


document.addEventListener('pointerdown', unlockCorrectSound, {once: true});
document.addEventListener('keydown', unlockCorrectSound, {once: true});

const savedTheme = localStorage.getItem('theme') || 'light';
if (savedTheme === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark');
}
if (els.themeToggleBtn) {
  els.themeToggleBtn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  });
}
els.embeddingModelToggle.addEventListener('click', async () => {
  if (els.embeddingModelToggle.disabled) return;
  const previousSessionId = state.temporalSessionId;
  state.embeddingModel = state.embeddingModel === 'metaclip' ? 'beit3' : 'metaclip';
  if (state.searchMode === 'temporal' && previousSessionId) {
    try {
      await fetch('/temporal-search', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'reset', session_id: previousSessionId})
      });
    } catch (_) {
      // The local state is still reset; expired backend sessions are harmless.
    }
    state.temporalSessionId = null;
    state.temporalStage = 0;
    invalidateTemporalResults();
    renderStages();
    syncSearchModeControls();
    setLog(`Đã đổi sang ${state.embeddingModel === 'beit3' ? 'BEiT-3' : 'MetaCLIP-2'}; hãy tìm lại từ Query A.`);
    setStatus(state.backend ? 'Đã kết nối' : 'Sẵn sàng.', state.backend ? 'ok' : 'neutral');
  }
  syncEmbeddingModelControls();
});

if (els.autoTranslateToggle) {
  els.autoTranslateToggle.addEventListener('click', () => {
    state.autoTranslate = !state.autoTranslate;
    try {
      localStorage.setItem('aic_auto_translate', String(state.autoTranslate));
    } catch (_) {}
    syncAutoTranslateControls();
    setStatus(
      state.autoTranslate
        ? 'Đã BẬT tự động dịch tiếng Anh trước khi tìm kiếm.'
        : 'Đã TẮT tự động dịch tiếng Anh.',
      'ok'
    );
  });
}

els.stageList.addEventListener('keydown', event => {
  if (event.target.matches('.text-query, .similarity-query, .stage-asr-query') && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    const card = event.target.closest('.stage-card');
    const stageIndex = state.stages.findIndex(stage => String(stage.id) === String(card?.dataset.stageId));
    performSearch(state.searchMode === 'temporal' ? stageIndex : null);
  }
});
els.videoFilter.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    performSearch();
  }
});
els.clearBtn.addEventListener('click', clearMyVotes);
if (els.trayTabChung) {
  els.trayTabChung.addEventListener('click', () => {
    state.activeTrayTab = 'chung';
    renderSelection();
  });
}
if (els.trayTabTrake) {
  els.trayTabTrake.addEventListener('click', () => {
    state.activeTrayTab = 'trake';
    renderSelection();
  });
}
if (els.traySubmitBtn) els.traySubmitBtn.addEventListener('click', () => submit());
if (els.trakeSubmitBtn) els.trakeSubmitBtn.addEventListener('click', () => submit());
if (els.videoOpenTrakeDrawerBtn) {
  els.videoOpenTrakeDrawerBtn.addEventListener('click', () => toggleTrakeDrawer(true));
}
els.resetBtn.addEventListener('click', resetWorkspace);
els.taskType.addEventListener('change', renderTaskControls);

// Global Similarity Dropzone Logic
els.globalSimilarityBtn.addEventListener('click', () => {
  const isExpanded = els.globalSimilarityBtn.getAttribute('aria-expanded') === 'true';
  const nextExpanded = !isExpanded;
  els.globalSimilarityBtn.setAttribute('aria-expanded', String(nextExpanded));
  els.globalSimilarityBtn.classList.toggle('is-active', nextExpanded);
  els.globalSimilarityPopover.hidden = !nextExpanded;
  if (!nextExpanded) {
    state.similarityItem = null;
    state.similarityQuery = '';
    state.queryMode = 'text';
    if (els.globalSimilarityDropzone) {
      els.globalSimilarityDropzone.style.padding = '12px';
      els.globalSimilarityDropzone.innerHTML = `<strong id="globalSimilarityDropzoneText" style="color: var(--text-primary); font-size: 13px;">Thả ảnh vào đây</strong>`;
    }
    if (els.globalSimilarityQuery) {
      els.globalSimilarityQuery.value = '';
    }
  }
});



els.globalSimilarityQuery.addEventListener('input', () => {
  state.similarityQuery = els.globalSimilarityQuery.value;
});
els.globalSimilarityQuery.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    performSearch(0);
  }
});

els.globalSimilarityWeight.addEventListener('input', () => {
  const weight = Number(els.globalSimilarityWeight.value);
  state.similarityTextWeight = weight;
  els.globalSimilarityWeightValue.textContent = weight;
  els.globalSimilarityImageWeightValue.textContent = 100 - weight;
});

els.globalSimilarityDropzone.addEventListener('dragover', event => {
  event.preventDefault();
  els.globalSimilarityDropzone.style.borderColor = 'var(--text-primary)';
  els.globalSimilarityDropzone.style.backgroundColor = 'var(--bg-surface-hover)';
});
els.globalSimilarityDropzone.addEventListener('dragleave', () => {
  els.globalSimilarityDropzone.style.borderColor = 'var(--border-subtle)';
  els.globalSimilarityDropzone.style.backgroundColor = 'transparent';
});
els.globalSimilarityDropzone.addEventListener('drop', event => {
  event.preventDefault();
  els.globalSimilarityDropzone.style.borderColor = 'var(--border-subtle)';
  els.globalSimilarityDropzone.style.backgroundColor = 'transparent';
  try {
    const item = JSON.parse(event.dataTransfer.getData('application/x-aic-keyframe'));
    setSimilarityItem(item);
  } catch {
    showError('Frame ném vào không hợp lệ.');
  }
});

// Selection Tray Dropzone Logic (Tìm kiếm tương tự khi thả vào khay)
els.selectionTray.addEventListener('dragover', event => {
  event.preventDefault();
  els.selectionTray.classList.add('is-dragover');
});
els.selectionTray.addEventListener('dragleave', () => {
  els.selectionTray.classList.remove('is-dragover');
});
els.selectionTray.addEventListener('drop', event => {
  event.preventDefault();
  els.selectionTray.classList.remove('is-dragover');
  try {
    const item = JSON.parse(event.dataTransfer.getData('application/x-aic-keyframe'));
    setSimilarityItem(item);
  } catch {
    showError('Frame ném vào không hợp lệ.');
  }
});

els.submissionModeToggle.addEventListener('click', (e) => {
  const target = e.target.closest('[data-mode]');
  if (target && target.dataset.mode === 'dres' && state.submissionMode === 'dres') {
    openDresModal();
    return;
  }
  toggleSubmissionMode();
});
els.qaAnswer.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    submit(null, 'qa');
  }
});
els.connectionStatus.addEventListener('click', openLogModal);
els.closeLogBtn.addEventListener('click', closeLogModal);
document.querySelector('[data-close-log]').addEventListener('click', closeLogModal);
els.searchTimingBtn.addEventListener('click', openTimingModal);
els.closeTimingBtn.addEventListener('click', closeTimingModal);
document.querySelector('[data-close-timing]').addEventListener('click', closeTimingModal);
if (els.shortcutsBtn) els.shortcutsBtn.addEventListener('click', openShortcutsModal);
if (els.closeShortcutsBtn) els.closeShortcutsBtn.addEventListener('click', closeShortcutsModal);
document.querySelector('[data-close-shortcuts]')?.addEventListener('click', closeShortcutsModal);
els.dresOpenBtn.addEventListener('click', openDresModal);
els.closeDresBtn.addEventListener('click', closeDresModal);
document.querySelector('[data-close-dres]').addEventListener('click', closeDresModal);
els.dresModal.addEventListener('keydown', handleDresEnter);
els.dresLoginBtn.addEventListener('click', loginDres);
els.dresLogoutBtn.addEventListener('click', logoutDres);
els.chooseEvaluationBtn.addEventListener('click', chooseEvaluation);
els.saveMemberNameBtn.addEventListener('click', saveMemberName);
els.memberBackBtn.addEventListener('click', backToEvaluation);
els.closeImageBtn.addEventListener('click', closeFrameImage);
document.querySelector('[data-close-image]').addEventListener('click', closeFrameImage);
els.imageAddTrayBtn.addEventListener('click', async () => {
  if (state.imageItem && await addKeyframeToTray(state.imageItem)) {
    setImageAddTrayState(true);
  }
});
els.expandShotContextBtn.addEventListener('click', openShotOverview);
els.expandFrameContextBtn.addEventListener('click', openFrameOverview);
els.closeShotOverviewBtn.addEventListener('click', closeShotOverview);
document.querySelector('[data-close-shot-overview]').addEventListener('click', closeShotOverview);
els.closeFrameOverviewBtn.addEventListener('click', closeFrameOverview);
document.querySelector('[data-close-frame-overview]').addEventListener('click', closeFrameOverview);
els.closeVideoBtn.addEventListener('click', closeVideo);
document.querySelector('[data-close-video]').addEventListener('click', closeVideo);
els.captureFrameBtn.addEventListener('click', () => captureDisplayedFrame());
els.videoSubmitCurrentBtn.addEventListener('click', () => {
  const item = getDisplayedVideoFrameItem();
  if (item) submit(item);
});
els.videoTextToggleBtn.addEventListener('click', () => {
  setVideoFrameTextVisible(!state.showVideoFrameText);
});
if (window.ResizeObserver && els.videoShell) {
  const videoAsrSizeObserver = new ResizeObserver(syncVideoAsrPanelHeight);
  videoAsrSizeObserver.observe(els.videoShell);
}
window.addEventListener('resize', syncVideoAsrPanelHeight);
els.videoBackBtn.addEventListener('click', () => seekVideoToSeconds((els.player.currentTime || 0) - 5, true));
els.videoPlayBtn.addEventListener('click', () => {
  if (els.player.paused) {
    els.player.play().catch(() => {});
  } else {
    els.player.pause();
  }
});
els.videoForwardBtn.addEventListener('click', () => seekVideoToSeconds((els.player.currentTime || 0) + 5, true));
els.player.addEventListener('click', () => {
  if (els.player.paused) {
    els.player.play().catch(() => {});
  } else {
    els.player.pause();
  }
});
els.videoVolumeBtn.addEventListener('click', () => {
  toggleVideoControlPopover(els.videoVolumePopover, els.videoVolumeBtn);
});
els.videoVolumeSlider.addEventListener('input', () => {
  const volume = Math.min(1, Math.max(0, Number(els.videoVolumeSlider.value) / 100));
  els.player.volume = volume;
  els.player.muted = volume === 0;
  updateVideoControls();
});
els.videoProgress.addEventListener('input', () => {
  const duration = Number.isFinite(els.player.duration) ? els.player.duration : 0;
  if (duration <= 0) return;
  els.player.currentTime = (Number(els.videoProgress.value) / 1000) * duration;
  updateVideoControls();
  centerActiveFrameInStrip(false);
});
els.videoSpeedBtn.addEventListener('click', () => {
  toggleVideoControlPopover(els.videoSpeedMenu, els.videoSpeedBtn);
});
document.querySelectorAll('.video-speed-option').forEach(btn => {
  btn.addEventListener('click', () => {
    setVideoRate(Number(btn.dataset.rate));
    closeVideoControlPopovers();
  });
});
document.addEventListener('click', event => {
  if (!els.videoSpeedControl.contains(event.target) && !els.videoVolumeControl.contains(event.target)) {
    closeVideoControlPopovers();
  }
});
els.videoFullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  els.videoShell.requestFullscreen?.().catch(() => {});
});
els.player.addEventListener('loadedmetadata', updateVideoControls);
els.player.addEventListener('timeupdate', updateVideoControls);
els.player.addEventListener('seeking', updateVideoControls);
els.player.addEventListener('seeked', updateVideoControls);
els.player.addEventListener('play', updateVideoControls);
els.player.addEventListener('pause', updateVideoControls);
els.player.addEventListener('volumechange', updateVideoControls);

// Mouse Wheel & Trackpad scrubbing on video and filmstrip
if (els.videoShell) {
  els.videoShell.addEventListener('wheel', handleVideoScrubWheel, { passive: false });
}
if (els.videoFrameStrip) {
  els.videoFrameStrip.addEventListener('wheel', handleVideoScrubWheel, { passive: false });
}
setupFilmstripScrubbing();
document.addEventListener('keydown', event => {
  const inInput = event.target.matches('input, textarea');
  const key = event.key.toLowerCase();

  // Shift + K / T / Q (when not actively typing text inside an input or textarea)
  if (!inInput && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
    if (key === 'k') {
      event.preventDefault();
      setTaskType('kis');
      return;
    }
    if (key === 't') {
      event.preventDefault();
      setTaskType('trake');
      return;
    }
    if (key === 'q') {
      event.preventDefault();
      setTaskType('qa');
      return;
    }
  }

  // Alt-key combinations work even when typing inside an input field
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    if (key === '1' || key === 'k') {
      event.preventDefault();
      setTaskType('kis');
      return;
    }
    if (key === '2' || key === 't') {
      event.preventDefault();
      setTaskType('trake');
      return;
    }
    if (key === '3' || key === 'q') {
      event.preventDefault();
      setTaskType('qa');
      return;
    }
    if (key === 'e') {
      event.preventDefault();
      state.autoTranslate = !state.autoTranslate;
      try {
        localStorage.setItem('aic_auto_translate', String(state.autoTranslate));
      } catch (_) {}
      syncAutoTranslateControls();
      setStatus(
        state.autoTranslate
          ? 'Đã BẬT tự động dịch tiếng Anh (Alt+E).'
          : 'Đã TẮT tự động dịch tiếng Anh (Alt+E).',
        'ok'
      );
      return;
    }
  }

  if (inInput) return;

  if (
    !els.frameOverviewModal.hidden
    && els.imageModal.hidden
    && els.frameOverviewGrid.classList.contains('is-video-gallery')
    && ['ArrowUp', 'ArrowDown'].includes(event.key)
  ) {
    event.preventDefault();
    event.stopPropagation();
    scrollFrameOverview(event.key === 'ArrowUp' ? -1 : 1);
    return;
  }

  // Single-key shortcuts when NOT typing in text inputs
  if (key === '1') {
    event.preventDefault();
    setTaskType('kis');
    return;
  }
  if (key === '2') {
    event.preventDefault();
    setTaskType('trake');
    return;
  }
  if (key === '3') {
    event.preventDefault();
    setTaskType('qa');
    return;
  }
  if (key === 't') {
    event.preventDefault();
    cycleTaskType();
    return;
  }
  
  if (key === 'i') {
    event.preventDefault();
    els.globalSimilarityBtn.click();
    return;
  }
  if (key === 'a') {
    event.preventDefault();
    addTemporalStage();
    return;
  }
  if (key === 'd') {
    event.preventDefault();
    if (state.stages.length > 1) {
      removeStage(state.stages[state.stages.length - 1].id);
    }
    return;
  }
  if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
    event.preventDefault();
    if (els.shortcutsModal && !els.shortcutsModal.hidden) {
      closeShortcutsModal();
    } else {
      openShortcutsModal();
    }
    return;
  }
  if (event.key === 'Escape' && !els.correctCelebration.hidden) {
    event.preventDefault();
    event.stopPropagation();
    hideCorrectCelebration();
    return;
  }
  if (event.key === 'Escape' && (!els.videoSpeedMenu.hidden || !els.videoVolumePopover.hidden)) {
    event.preventDefault();
    event.stopPropagation();
    closeVideoControlPopovers();
    return;
  }
  if (!els.videoModal.hidden && [' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    if (event.key === ' ') {
      if (els.player.paused) {
        els.player.play().catch(() => {});
      } else {
        els.player.pause();
      }
    } else if (event.key === 'ArrowLeft') {
      seekVideoToSeconds((els.player.currentTime || 0) - (event.shiftKey ? 10 : 1), true);
    } else if (event.key === 'ArrowRight') {
      seekVideoToSeconds((els.player.currentTime || 0) + (event.shiftKey ? 10 : 1), true);
    }
    return;
  }
  if (event.key !== 'Escape') return;
  if (els.shortcutsModal && !els.shortcutsModal.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeShortcutsModal();
    return;
  }
  if (!els.dresModal.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeDresModal();
    return;
  }
  if (!els.logModal.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeLogModal();
    return;
  }
  if (!els.timingModal.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeTimingModal();
    return;
  }
  if (!els.imageModal.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeFrameImage();
    return;
  }
  if (!els.shotOverviewModal.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeShotOverview();
    return;
  }
  if (els.videoModal.hidden) return;
  event.preventDefault();
  event.stopPropagation();
  closeVideo();
}, true);

renderStages();
syncSearchModeControls();
syncEmbeddingModelControls();
syncFusionWeights();
renderResults();
renderSelection();
state.submissionMode = localStorage.getItem(SUBMISSION_MODE_CACHE_KEY) === 'csv' ? 'csv' : 'dres';
loadDresCache();
loadMemberCache();
renderEvaluations();
renderTaskControls();
renderDresSession();
renderSubmissionMode();
loadSubmissionQueries();
loadVideoFps();
refreshHealth();
connectTeamSocket();
initTrakeDrawerEvents();
if (state.memberName) void setMyTrakeEvent(state.myTrakeEvent);
window.setInterval(() => {
  loadSubmissionQueries();
  refreshTeamState();
}, 5000);
refreshIcons();
if (!state.dresSessionId && state.submissionMode === 'dres') {
  window.setTimeout(openDresModal, 150);
}


els.qaAnswer.addEventListener('input', () => {
  if (state.activeQueryFilename) {
    state.userDrafts[state.activeQueryFilename] = els.qaAnswer.value;
    clearTimeout(state.draftDebounceTimer);
    state.draftDebounceTimer = setTimeout(() => {
      syncUserProfile({
        active_query_for_draft: state.activeQueryFilename,
        draft_qa_answer: els.qaAnswer.value
      });
    }, 600);
  }
});
els.memberNameBtn?.addEventListener('click', openDresModal);
els.statsOpenBtn?.addEventListener('click', openStatsModal);
els.closeStatsBtn?.addEventListener('click', closeStatsModal);
document.querySelector('[data-close-stats]')?.addEventListener('click', closeStatsModal);
els.statsTabPersonal?.addEventListener('click', () => {
  els.statsTabPersonal.classList.add('is-active');
  els.statsTabTeamHistory?.classList.remove('is-active');
  els.statsTabLeaderboard.classList.remove('is-active');
  els.statsPersonalView.hidden = false;
  if (els.statsTeamHistoryView) els.statsTeamHistoryView.hidden = true;
  els.statsLeaderboardView.hidden = true;
});
els.statsTabTeamHistory?.addEventListener('click', () => {
  els.statsTabPersonal.classList.remove('is-active');
  els.statsTabTeamHistory.classList.add('is-active');
  els.statsTabLeaderboard.classList.remove('is-active');
  els.statsPersonalView.hidden = true;
  els.statsTeamHistoryView.hidden = false;
  els.statsLeaderboardView.hidden = true;
});
els.statsTabLeaderboard?.addEventListener('click', () => {
  els.statsTabPersonal.classList.remove('is-active');
  els.statsTabTeamHistory?.classList.remove('is-active');
  els.statsTabLeaderboard.classList.add('is-active');
  els.statsPersonalView.hidden = true;
  if (els.statsTeamHistoryView) els.statsTeamHistoryView.hidden = true;
  els.statsLeaderboardView.hidden = false;
});
if (!state.viewingHeartbeatTimer) {
  state.viewingHeartbeatTimer = window.setInterval(() => {
    if (state.activeQueryFilename) sendViewingStatus();
  }, 20000);
}

document.getElementById('sessionChangeNameBtn')?.addEventListener('click', promptChangeMemberName);

document.getElementById('clearStatsBtn')?.addEventListener('click', async () => {
  if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử nộp bài và đặt lại bảng xếp hạng về 0?')) return;
  try {
    const resp = await fetch('/team/user/stats/clear', { method: 'POST' });
    if (resp.ok) {
      openStatsModal();
    }
  } catch (err) {
    alert('Lỗi khi xóa: ' + err.message);
  }
});


/* ==========================================================================
   TRAKE Collaboration Drawer & User Cards Implementation
   ========================================================================== */

function toggleTrakeDrawer(forceState = null) {
  if (!els.trakeDrawer) return;
  const isOpen = els.trakeDrawer.classList.contains('is-open');
  const next = forceState !== null ? Boolean(forceState) : !isOpen;

  if (next) {
    els.trakeDrawer.hidden = false;
    void els.trakeDrawer.offsetWidth; // Force reflow
    els.trakeDrawer.classList.add('is-open');
    els.trakePanelToggleBtn?.classList.add('is-active');
    state.trakeDrawerOpen = true;
    renderTrakeDrawer();
    refreshIcons(els.trakeDrawer);
  } else {
    els.trakeDrawer.classList.remove('is-open');
    els.trakePanelToggleBtn?.classList.remove('is-active');
    state.trakeDrawerOpen = false;
    window.setTimeout(() => {
      if (!els.trakeDrawer.classList.contains('is-open')) {
        els.trakeDrawer.hidden = true;
      }
    }, 300);
  }
  try {
    localStorage.setItem('aic_trake_drawer_open', next ? '1' : '0');
  } catch {}
}

async function setMyTrakeEvent(eventNum) {
  const num = Math.max(1, Math.min(5, parseInt(eventNum, 10) || 1));
  state.myTrakeEvent = num;
  state.trakeUsers = state.trakeUsers || {};
  if (!state.trakeUsers[state.clientId]) {
    state.trakeUsers[state.clientId] = {
      name: state.memberName || 'Bạn',
      event: num,
      frames: []
    };
  } else {
    state.trakeUsers[state.clientId].event = num;
  }
  renderTrakeUserCards();
  try {
    await fetch('/team/trake/user-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: state.clientId,
        name: state.memberName || 'Bạn',
        event: num
      })
    });
  } catch (err) {
    console.error('Failed to update trake user state:', err);
  }
}

async function addFrameToMyEvent(item = null) {
  if (!state.memberName) {
    showError('Nhập tên gọi trước khi thêm frame vào khay TRAKE của bạn.');
    openDresModal();
    return false;
  }
  let targetItem = item;
  if (!targetItem) {
    if (state.activeVideoItem) targetItem = getDisplayedVideoFrameItem() || state.activeVideoItem;
    else if (state.selected?.length > 0) targetItem = state.selected[0];
    else if (state.results?.length > 0) {
      const first = state.results[0];
      targetItem = first.video_id ? first : (first.scenes?.[0] || null);
    }
  }
  if (!targetItem) {
    showError('Không tìm thấy frame nào để thêm vào Event của bạn.');
    return;
  }
  state.trakeUsers = state.trakeUsers || {};
  const myEntry = state.trakeUsers[state.clientId] || {
    name: state.memberName,
    event: state.myTrakeEvent || 1,
    frames: []
  };
  const keyframeId = targetItem.keyframe_id;
  if (myEntry.frames.some(frame => frame.item?.keyframe_id === keyframeId)) {
    showError('Frame này đã có trong khay TRAKE của bạn.');
    return false;
  }
  const previousFrames = [...myEntry.frames];
  myEntry.frames.push({
    selection_id: `temp_${Date.now()}`,
    event: state.myTrakeEvent || 1,
    item: targetItem,
    created_at: Date.now() / 1000
  });
  state.trakeUsers[state.clientId] = myEntry;
  renderTrakeDrawer();
  renderTrakeTray();
  try {
    const resp = await fetch('/team/trake/user-frame/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: state.clientId,
        name: state.memberName,
        event: state.myTrakeEvent || 1,
        item: targetItem
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Không thêm được frame vào khay TRAKE của bạn.');
    applyTeamState(data);
    showError('');
    return true;
  } catch (err) {
    myEntry.frames = previousFrames;
    state.trakeUsers[state.clientId] = myEntry;
    renderTrakeDrawer();
    renderTrakeTray();
    showError(err.message || String(err));
    return false;
  }
}

async function addFrameToBothTrays(item) {
  if (!item?.video_id) return false;
  const targetFrameId = keyframeTrayId(item);
  const existsInTeamTray = state.teamVotes.some(vote =>
    vote.client_id === state.clientId
    && vote.item?.video_id === item.video_id
    && (
      (item.keyframe_id && vote.item?.keyframe_id === item.keyframe_id)
      || Number(vote.item?.frame_id) === targetFrameId
    )
  );
  const existsInMyTray = (state.trakeUsers?.[state.clientId]?.frames || []).some(frame =>
    frame.item?.video_id === item.video_id
    && (
      (item.keyframe_id && frame.item?.keyframe_id === item.keyframe_id)
      || Number(frame.item?.frame_id) === targetFrameId
    )
  );
  if (existsInTeamTray && existsInMyTray) {
    showError('Frame này đã có trong cả hai khay.');
    return false;
  }

  let added = false;
  if (!existsInTeamTray) added = await voteForItem(item);
  if (!existsInMyTray) added = await addFrameToMyEvent(item) || added;
  return added;
}

async function removeFrameFromMyEvent(selectionId) {
  if (state.trakeUsers?.[state.clientId]?.frames) {
    state.trakeUsers[state.clientId].frames = state.trakeUsers[state.clientId].frames.filter(
      f => f.selection_id !== selectionId
    );
    renderTrakeDrawer();
    renderTrakeTray();
  }
  try {
    const resp = await fetch('/team/trake/user-frame/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: state.clientId,
        selection_id: selectionId
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Không xóa được frame khỏi khay của bạn.');
    applyTeamState(data);
  } catch (err) {
    showError(err.message || String(err));
  }
}

async function clearMyTrakeFrames() {
  const myEntry = state.trakeUsers?.[state.clientId];
  if (!myEntry || !Array.isArray(myEntry.frames) || myEntry.frames.length === 0) return;
  const previousFrames = myEntry.frames;
  myEntry.frames = [];
  renderTrakeDrawer();
  renderTrakeTray();
  try {
    const resp = await fetch('/team/trake/user-frame/clear', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({client_id: state.clientId})
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Không xóa được khay TRAKE của bạn.');
    applyTeamState(data);
  } catch (err) {
    myEntry.frames = previousFrames;
    renderTrakeDrawer();
    renderTrakeTray();
    showError(err.message || String(err));
  }
}

async function removeTrakeUser(clientId, name, frameCount) {
  const description = frameCount > 0
    ? `Xóa user ${name} cùng ${frameCount} frame khỏi cả hai khay?`
    : `Xóa user ${name} khỏi Team Hub?`;
  if (!window.confirm(description)) return;
  try {
    const resp = await fetch('/team/trake/user/remove', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({client_id: clientId})
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || `Không xóa được user ${name}.`);
    applyTeamState(data);
    showError('');
  } catch (err) {
    showError(err.message || String(err));
  }
}

function renderTrakeMasterTray() {
  if (!els.trakeMasterFrames) return;
  const allTrakeFrames = state.trakeFrames || [];
  const trakeVideoId = allTrakeFrames[0]?.item?.video_id;

  if (els.trakeMasterCount) {
    els.trakeMasterCount.textContent = `${allTrakeFrames.length} frame`;
  }
  if (els.trakeMasterVideo) {
    if (trakeVideoId) {
      els.trakeMasterVideo.textContent = `Video: ${trakeVideoId}`;
      els.trakeMasterVideo.hidden = false;
    } else {
      els.trakeMasterVideo.hidden = true;
    }
  }
  if (els.trakeMasterSubmitBtn) {
    els.trakeMasterSubmitBtn.disabled = allTrakeFrames.length === 0;
  }
  if (els.trakeMasterClearBtn) {
    els.trakeMasterClearBtn.disabled = allTrakeFrames.length === 0;
  }

  els.trakeMasterFrames.innerHTML = '';
  if (allTrakeFrames.length === 0) {
    els.trakeMasterFrames.innerHTML = '<div class="trake-empty-hint">Kéo frame từ khay của thành viên hoặc từ kết quả tìm kiếm thả vào đây để nộp.</div>';
    return;
  }

  allTrakeFrames.forEach((vote, index) => {
    const item = vote.item;
    if (!item) return;
    const imageUrl = item.thumbnail_url || item.image_url || `/thumbnail/${encodeURIComponent(item.keyframe_id)}`;
    const chip = document.createElement('div');
    chip.className = 'trake-frame-chip';
    chip.draggable = true;

    chip.addEventListener('dragstart', event => {
      chip.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-aic-trake-master-index', index.toString());
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('is-dragging');
    });

    chip.addEventListener('dragover', event => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
    });

    chip.addEventListener('drop', async event => {
      event.preventDefault();
      event.stopPropagation();
      const fromIndex = parseInt(event.dataTransfer.getData('application/x-aic-trake-master-index'), 10);
      if (!isNaN(fromIndex) && fromIndex !== index) {
        const itemToMove = allTrakeFrames.splice(fromIndex, 1)[0];
        allTrakeFrames.splice(index, 0, itemToMove);
        state.trakeFrames = [...allTrakeFrames];
        renderTrakeMasterTray();
        renderTrakeTray();
        try {
          await fetch('/team/trake/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frames: state.trakeFrames })
          });
        } catch (err) {
          console.error('Failed to sync reorder:', err);
        }
      }
    });

    chip.innerHTML = `
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.video_id)} #${escapeHtml(frameId(item))}" />
      <span class="trake-chip-order">${index + 1}</span>
      <span class="trake-chip-event-tag">E${index + 1}</span>
      <button class="trake-chip-remove" type="button" title="Xóa khỏi khay chung">&times;</button>
    `;

    chip.addEventListener('click', () => {
      if (state.activeVideoItem && state.activeVideoItem.video_id === item.video_id) {
        seekVideoToSeconds(answerTimeMs(item) / 1000, true);
      } else {
        openResult(item);
      }
    });

    chip.querySelector('.trake-chip-remove').addEventListener('click', event => {
      event.stopPropagation();
      removeTrakeFrame(vote);
    });

    els.trakeMasterFrames.appendChild(chip);
  });
}

function renderTrakeUserCards() {
  if (!els.trakeUserCards) return;
  const userCards = els.trakeUserCards;
  userCards.innerHTML = '';

  const userEntries = orderedTrakeUsers();
  const totalFrames = userEntries.reduce(
    (total, [, user]) => total + (Array.isArray(user.frames) ? user.frames.length : 0),
    0
  );
  if (els.trakeToggleCount) {
    els.trakeToggleCount.textContent = String(totalFrames);
    els.trakeToggleCount.hidden = totalFrames === 0;
  }

  userEntries.forEach(([uid, userData]) => {
    if (!uid) return;
    const isMe = uid === state.clientId;
    const name = isMe
      ? (state.memberName || state.dresUsername || userData.name || 'Bạn')
      : (userData.name || 'Thành viên');
    const currentEvent = isMe ? (state.myTrakeEvent || userData.event || 1) : (userData.event || 1);
    const frames = userData.frames || [];

    const card = document.createElement('div');
    card.className = `trake-user-card${isMe ? ' is-me' : ''}`;

    let eventButtonsHtml = '';
    for (let e = 1; e <= 5; e++) {
      const isActive = e === currentEvent;
      eventButtonsHtml += `
        <button class="trake-event-btn${isActive ? ' is-active' : ''}" type="button" data-event="${e}" ${isMe ? '' : 'disabled'}>
          E${e}
        </button>
      `;
    }

    card.innerHTML = `
      <div class="trake-user-head">
        <div class="trake-user-info">
          <span class="trake-user-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</span>
          <span class="trake-user-name">${escapeHtml(name)}</span>
          ${isMe ? '<span class="trake-me-badge">Bạn</span>' : ''}
        </div>
        <div class="trake-user-head-actions">
          ${isMe && frames.length > 0 ? '<button class="trake-user-clear-btn" type="button" title="Xóa toàn bộ frame trong khay của bạn">Xóa khay</button>' : ''}
          <button class="trake-user-delete-btn" type="button" title="Xóa user này khỏi Team Hub">Xóa user</button>
        </div>
      </div>
      <div class="trake-event-control-wrap">
        <span class="trake-event-label">Đang làm Event:</span>
        <div class="trake-event-selector">
          ${eventButtonsHtml}
        </div>
      </div>
      <div class="trake-user-tray" data-uid="${escapeHtml(uid)}">
      </div>
    `;

    card.querySelector('.trake-user-delete-btn')?.addEventListener('click', () => {
      void removeTrakeUser(uid, name, frames.length);
    });

    if (isMe) {
      card.querySelector('.trake-user-clear-btn')?.addEventListener('click', clearMyTrakeFrames);
      card.querySelectorAll('.trake-event-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const ev = parseInt(btn.dataset.event, 10);
          setMyTrakeEvent(ev);
        });
      });
    }

    const tray = card.querySelector('.trake-user-tray');
    if (isMe) {
      tray.addEventListener('dragover', event => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        tray.style.borderColor = '#6366f1';
        tray.style.background = 'rgba(99, 102, 241, 0.15)';
      });
      tray.addEventListener('dragleave', event => {
        event.stopPropagation();
        tray.style.borderColor = '';
        tray.style.background = '';
      });
      tray.addEventListener('drop', async event => {
        event.preventDefault();
        event.stopPropagation();
        tray.style.borderColor = '';
        tray.style.background = '';
        const keyframeJson = event.dataTransfer.getData('application/x-aic-keyframe');
        if (keyframeJson) {
          try {
            const item = JSON.parse(keyframeJson);
            if (item) {
              await addFrameToBothTrays(item);
            }
          } catch (err) {
            console.error('Failed to drop keyframe to user tray:', err);
          }
        }
      });
    }
    if (frames.length === 0) {
      tray.innerHTML = isMe
        ? `<span class="trake-user-empty">Khay của bạn đang trống. Bấm "Thêm frame" hoặc kéo frame vào đây.</span>`
        : `<span class="trake-user-empty">${escapeHtml(name)} chưa thêm frame nào.</span>`;
    } else {
      frames.forEach(f => {
        const item = f.item;
        if (!item) return;
        const imageUrl = item.thumbnail_url || item.image_url || `/thumbnail/${encodeURIComponent(item.keyframe_id)}`;
        const chip = document.createElement('div');
        chip.className = 'trake-frame-chip';
        chip.draggable = true;
        chip.title = 'Kéo thả lên Khay Chung để nộp bài';

        chip.addEventListener('dragstart', event => {
          chip.classList.add('is-dragging');
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData('application/x-aic-trake-user-frame', JSON.stringify({
            item: item,
            name: name,
            event: f.event || currentEvent
          }));
        });
        chip.addEventListener('dragend', () => {
          chip.classList.remove('is-dragging');
        });

        chip.innerHTML = `
          <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.video_id)} #${escapeHtml(frameId(item))}" />
          <span class="trake-chip-event-tag">E${f.event || currentEvent}</span>
          ${isMe ? '<button class="trake-chip-remove" type="button" title="Xóa frame này">&times;</button>' : ''}
        `;

        chip.addEventListener('click', () => {
          if (state.activeVideoItem && state.activeVideoItem.video_id === item.video_id) {
            seekVideoToSeconds(answerTimeMs(item) / 1000, true);
          } else {
            openResult(item);
          }
        });

        if (isMe) {
          chip.querySelector('.trake-chip-remove')?.addEventListener('click', ev => {
            ev.stopPropagation();
            removeFrameFromMyEvent(f.selection_id);
          });
        }

        tray.appendChild(chip);
      });
    }

    userCards.appendChild(card);
  });
}

function renderTrakeDrawer() {
  renderTrakeMasterTray();
  renderTrakeUserCards();
}

function initTrakeDrawerEvents() {
  if (els.trakePanelToggleBtn) {
    els.trakePanelToggleBtn.addEventListener('click', () => toggleTrakeDrawer());
  }
  if (els.closeTrakeDrawerBtn) {
    els.closeTrakeDrawerBtn.addEventListener('click', () => toggleTrakeDrawer(false));
  }
  if (els.trakeMasterClearBtn) {
    els.trakeMasterClearBtn.addEventListener('click', clearTrakeFrames);
  }
  if (els.trakeMasterSubmitBtn) {
    els.trakeMasterSubmitBtn.addEventListener('click', submitSharedTrakeToDres);
  }
  if (els.trakeAddMyEventBtn) {
    els.trakeAddMyEventBtn.addEventListener('click', () => {
      if (state.activeVideoItem) captureDisplayedFrame();
      else {
        const item = state.selected?.[0] || (state.results?.[0]?.video_id ? state.results[0] : state.results?.[0]?.scenes?.[0]);
        if (item) void addFrameToBothTrays(item);
        else showError('Không tìm thấy frame nào để thêm vào khay.');
      }
    });
  }
  if (els.trakeMasterDropzone) {
    els.trakeMasterDropzone.addEventListener('dragover', event => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      els.trakeMasterDropzone.classList.add('is-drag-over');
    });
    els.trakeMasterDropzone.addEventListener('dragleave', event => {
      event.stopPropagation();
      els.trakeMasterDropzone.classList.remove('is-drag-over');
    });
    els.trakeMasterDropzone.addEventListener('drop', async event => {
      event.preventDefault();
      event.stopPropagation();
      els.trakeMasterDropzone.classList.remove('is-drag-over');

      const userFrameJson = event.dataTransfer.getData('application/x-aic-trake-user-frame');
      if (userFrameJson) {
        try {
          const parsed = JSON.parse(userFrameJson);
          if (parsed?.item) {
            await addTrakeFrame(parsed.item);
          }
        } catch (err) {
          console.error('Failed to drop user frame to master tray:', err);
        }
        return;
      }

      const keyframeJson = event.dataTransfer.getData('application/x-aic-keyframe');
      if (keyframeJson) {
        try {
          const item = JSON.parse(keyframeJson);
          if (item) {
            await addTrakeFrame(item);
          }
        } catch (err) {
          console.error('Failed to drop keyframe to master tray:', err);
        }
      }
    });
  }

  // Restore open state
  try {
    if (localStorage.getItem('aic_trake_drawer_open') === '1') {
      toggleTrakeDrawer(true);
    }
  } catch {}
}
