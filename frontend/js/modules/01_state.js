/**
 * ==============================================================================
 * TỆP TIN: js/modules/01_state.js
 * MÔ TẢ:
 *   Khởi tạo State toàn cục, bảng tham chiếu phần tử DOM (els), cache keys, và các hàm tiện ích cơ sở (setStatus, showError, setDresStatus, makeClientId, stageLetter).
 * ==============================================================================
 */

const state = {
  searchMode: 'temporal',
  embeddingModel: 'metaclip',
  ocrModel: 'union',
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
  dresNameConfirmed: false,
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
  hoveredCardItem: null,
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
  quickNoteBtn: document.getElementById('quickNoteBtn'),
  quickNoteModal: document.getElementById('quickNoteModal'),
  quickNoteTextarea: document.getElementById('quickNoteTextarea'),
  closeQuickNoteBtn: document.getElementById('closeQuickNoteBtn'),
  clearQuickNoteBtn: document.getElementById('clearQuickNoteBtn'),
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

function formatLogSummary(text, mode) {
  const t = String(text || '').toLowerCase().trim();
  if (t === 'correct' || t.includes('correct')) return 'Correct';
  if (t === 'wrong' || t.includes('wrong')) return 'Wrong';
  if (t.includes('đang submit') || t.includes('request') || t.includes('nộp')) return 'Request';
  if (t.includes('đang tìm') || t.includes('searching') || t.includes('đang dịch')) return 'Searching';
  if (t.includes('loading') || t.includes('đang tải') || t.includes('đang kết nối')) return 'Loading';
  if (t.includes('response') || t.includes('đã submit') || t.includes('đã ghi csv')) return 'Response';
  if (t.includes('lỗi') || t.includes('error') || mode === 'error') return 'Error';
  if (t.includes('done') || t.includes('hoàn tất')) return 'Done';
  if (t.includes('đã kết nối') || t.includes('sẵn sàng') || t.includes('ready')) return 'Ready';
  if (mode === 'ok') return 'Done';
  if (mode === 'searching') return 'Searching';
  return text.length <= 10 ? text : 'Ready';
}

function setStatus(text, mode = 'neutral', explicitSummary = null) {
  els.status.textContent = text;
  const statusMode = mode === 'searching' ? 'searching' : (mode === 'ok' ? 'ok' : (mode === 'error' ? 'error' : 'warning'));
  const summary = explicitSummary || formatLogSummary(text, statusMode);
  state.lastStatusSummary = summary;
  state.lastStatusMode = statusMode;

  if (els.connectionStatus) {
    els.connectionStatus.className = `ghost compact log-btn status-pill ${statusMode}`;
    els.connectionStatus.title = `Trạng thái: ${summary} (${text}) - Bấm để xem log chi tiết`;
    const labelEl = els.connectionStatus.querySelector('.log-status-text');
    if (labelEl) {
      labelEl.textContent = summary;
    } else {
      els.connectionStatus.innerHTML = `<svg class="top-btn-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><span class="status-dot" aria-hidden="true"></span><span id="logStatusText" class="log-status-text">${escapeHtml(summary)}</span>`;
    }
  }
  const timestamp = new Date().toLocaleTimeString('vi-VN');
  const logLine = `[${timestamp}] [${summary.toUpperCase()}] ${text}`;
  if (!state.logs) state.logs = [];
  state.logs.push(logLine);
  if (state.logs.length > 100) state.logs.shift();
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.makeClientId = makeClientId; } catch (_) {}
  try { window.stageLetter = stageLetter; } catch (_) {}
  try { window.setStatus = setStatus; } catch (_) {}
  try { window.showError = showError; } catch (_) {}
  try { window.setDresStatus = setDresStatus; } catch (_) {}
  try { window.escapeHtml = escapeHtml; } catch (_) {}
  try { window.state = state; } catch (_) {}
  try { window.DRES_CACHE_KEY = DRES_CACHE_KEY; } catch (_) {}
  try { window.ACTIVE_QUERY_CACHE_KEY = ACTIVE_QUERY_CACHE_KEY; } catch (_) {}
  try { window.MEMBER_CACHE_KEY = MEMBER_CACHE_KEY; } catch (_) {}
  try { window.SUBMISSION_MODE_CACHE_KEY = SUBMISSION_MODE_CACHE_KEY; } catch (_) {}
  try { window.activeHls = activeHls; } catch (_) {}
  try { window.correctCelebrationTimer = correctCelebrationTimer; } catch (_) {}
  try { window.correctSoundUnlocked = correctSoundUnlocked; } catch (_) {}
  try { window.els = els; } catch (_) {}
}
