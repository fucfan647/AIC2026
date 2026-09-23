/**
 * ==============================================================================
 * TỆP TIN: js/core/AppState.js
 * LỚP: AppState
 * MÔ TẢ:
 *   Quản lý toàn bộ trạng thái phản ứng (Reactive State) của ứng dụng:
 *   - Lưu trữ cấu hình tìm kiếm, danh sách kết quả, session DRES, team state.
 *   - Tự động đồng bộ với LocalStorage / SessionStorage.
 *   - Cung cấp cơ chế subscribe để lắng nghe thay đổi trạng thái cụ thể.
 * ==============================================================================
 */

import { STORAGE_KEYS, DEFAULT_CONFIG } from './Constants.js';

export class AppState {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.clientId = this.initClientId();

    this.data = {
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
      stages: [
        { id: 1, name: 'Hành động A', query: '', translatedQuery: '', ocrQuery: '', asrQuery: '', ocrWeight: 41, asrWeight: 20 }
      ],
      temporalSessionId: null,
      temporalStage: 0,
      results: [],
      selected: [],
      backend: null,
      dresSessionId: null,
      dresEvaluations: [],
      dresSelectedEvaluationId: '',
      dresUsername: '',
      dresServerUrl: DEFAULT_CONFIG.DRES_SERVER_URL,
      submissionMode: 'dres',
      queryCatalog: [],
      activeQueryFilename: typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem(STORAGE_KEYS.ACTIVE_QUERY) || '') : '',
      lastLog: 'Chưa có log.',
      clientId: this.clientId,
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
      videoFps: { default_fps: DEFAULT_CONFIG.DEFAULT_FPS, overrides: {} },
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

    this.subscribers = new Map();
    this.loadPersistedState();
  }

  initClientId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  get(key) {
    return this.data[key];
  }

  set(key, value, silent = false) {
    const oldValue = this.data[key];
    this.data[key] = value;
    if (!silent && oldValue !== value) {
      this.notifySubscribers(key, value, oldValue);
      if (this.eventBus) {
        this.eventBus.emit(`state:${key}`, { value, oldValue });
      }
    }
  }

  update(patch, silent = false) {
    for (const [key, value] of Object.entries(patch)) {
      this.set(key, value, silent);
    }
  }

  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key).add(callback);
    return () => this.subscribers.get(key)?.delete(callback);
  }

  notifySubscribers(key, value, oldValue) {
    if (this.subscribers.has(key)) {
      for (const cb of this.subscribers.get(key)) {
        try {
          cb(value, oldValue);
        } catch (e) {
          console.error(`[AppState] Error subscriber for "${key}":`, e);
        }
      }
    }
  }

  currentDisplayName() {
    return this.data.memberName || this.data.dresUsername || 'Bạn';
  }

  stageLetter(index) {
    return String.fromCharCode(65 + Math.max(0, index));
  }

  loadPersistedState() {
    if (typeof localStorage === 'undefined') return;

    // Submission mode
    const mode = localStorage.getItem(STORAGE_KEYS.SUBMISSION_MODE);
    if (mode === 'csv' || mode === 'dres') {
      this.data.submissionMode = mode;
    }

    // Member name
    try {
      const rawMember = localStorage.getItem(STORAGE_KEYS.MEMBER_NAME);
      if (rawMember) {
        const parsed = JSON.parse(rawMember);
        if (parsed?.name) this.data.memberName = String(parsed.name).trim();
      }
    } catch (_) {}

    // DRES cache
    try {
      const rawDres = localStorage.getItem(STORAGE_KEYS.DRES_SESSION);
      if (rawDres) {
        const cached = JSON.parse(rawDres);
        if (cached?.serverUrl) this.data.dresServerUrl = cached.serverUrl;
        if (cached?.username) this.data.dresUsername = cached.username;
        if (cached?.sessionId) this.data.dresSessionId = cached.sessionId;
        if (cached?.selectedEvaluationId) this.data.dresSelectedEvaluationId = cached.selectedEvaluationId;
        if (Array.isArray(cached?.evaluations)) this.data.dresEvaluations = cached.evaluations;
      }
    } catch (_) {}
  }

  saveDresCache() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.DRES_SESSION, JSON.stringify({
        serverUrl: this.data.dresServerUrl,
        username: this.data.dresUsername,
        sessionId: this.data.dresSessionId,
        selectedEvaluationId: this.data.dresSelectedEvaluationId,
        evaluations: this.data.dresEvaluations
      }));
    } catch (_) {}
  }

  saveMemberCache() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.MEMBER_NAME, JSON.stringify({
        name: this.data.memberName
      }));
    } catch (_) {}
  }

  clearLocalSessionCache() {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.DRES_SESSION);
    localStorage.removeItem(STORAGE_KEYS.MEMBER_NAME);
  }
}
