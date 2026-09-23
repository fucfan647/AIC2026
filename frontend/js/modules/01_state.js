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
  ocrModel: 'monkey',
  queryMode: 'text',
  similarityItem: null,
  similarityQuery: '',
  similarityTextWeight: 30,
  asrWeight: 20,
  asrOnly: false,
  autoTranslate: typeof localStorage !== 'undefined' ? localStorage.getItem('aic_auto_translate') === 'true' : false,
  stages: [{id: 1, name: 'Hành động A', query: '', translatedQuery: '', ocrQuery: '', asrQuery: '', ocrWeight: 41, asrWeight: 20, isCompleted: false, temporalExpanded: true}],
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
