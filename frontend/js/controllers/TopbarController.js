/**
 * ==============================================================================
 * TỆP TIN: js/controllers/TopbarController.js
 * LỚP: TopbarController
 * MÔ TẢ:
 *   Điều khiển thanh công cụ trên cùng (Topbar Header):
 *   - Chuyển đổi thể thức nộp bài: KIS, TRAKE, Q&A.
 *   - Ô nhập câu trả lời Q&A (tự động debounce lưu nháp draft).
 *   - Chuyển đổi chế độ nộp DRES vs CSV offline.
 *   - Nút đổi tên hiển thị thành viên (Member Name).
 *   - Nút bật/tắt giao diện Sáng / Tối (Theme Toggle).
 *   - Nút chuyển đổi mô hình nhúng MetaCLIP-2 vs BEiT-3.
 *   - Hiển thị trạng thái kết nối WebSocket / Backend.
 * ==============================================================================
 */

import { STORAGE_KEYS, TASK_TYPES, SUBMISSION_MODES, DEFAULT_CONFIG } from '../core/Constants.js';

export class TopbarController {
  constructor(appState, eventBus, teamSocketService) {
    this.state = appState;
    this.eventBus = eventBus;
    this.teamSocket = teamSocketService;
    this.draftDebounceTimer = null;

    this.els = {
      themeToggleBtn: document.getElementById('themeToggleBtn'),
      memberNameBtn: document.getElementById('memberNameBtn'),
      memberNameDisplay: document.getElementById('memberNameDisplay'),
      statsOpenBtn: document.getElementById('statsOpenBtn'),
      taskType: document.getElementById('taskType'),
      qaAnswer: document.getElementById('qaAnswer'),
      submissionModeToggle: document.getElementById('submissionModeToggle'),
      dresOpenBtn: document.getElementById('dresOpenBtn'),
      embeddingModelToggle: document.getElementById('embeddingModelToggle'),
      autoTranslateToggle: document.getElementById('autoTranslateToggle'),
      autoTranslateLabel: document.getElementById('autoTranslateLabel'),
      connectionStatus: document.getElementById('logOpenBtn')
    };

    this.bindEvents();
    this.initTheme();
    this.render();
  }

  bindEvents() {
    // Theme toggle
    if (this.els.themeToggleBtn) {
      this.els.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Member name change
    if (this.els.memberNameBtn) {
      this.els.memberNameBtn.addEventListener('click', () => {
        this.eventBus.emit('modal:open_dres');
      });
    }

    // Task type change (KIS, TRAKE, QA)
    if (this.els.taskType) {
      this.els.taskType.addEventListener('change', () => {
        this.setTaskType(this.els.taskType.value);
      });
    }

    // QA answer input
    if (this.els.qaAnswer) {
      this.els.qaAnswer.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          this.eventBus.emit('submission:trigger', { taskType: TASK_TYPES.QA });
        }
      });

      this.els.qaAnswer.addEventListener('input', () => {
        const activeFilename = this.state.get('activeQueryFilename');
        if (!activeFilename) return;

        const val = this.els.qaAnswer.value;
        const drafts = this.state.get('userDrafts') || {};
        drafts[activeFilename] = val;
        this.state.set('userDrafts', drafts, true);

        clearTimeout(this.draftDebounceTimer);
        this.draftDebounceTimer = setTimeout(() => {
          this.teamSocket.syncUserProfile({
            active_query_for_draft: activeFilename,
            draft_qa_answer: val
          });
        }, DEFAULT_CONFIG.DRAFT_DEBOUNCE_MS);
      });
    }

    // Submission mode toggle (DRES vs CSV)
    if (this.els.submissionModeToggle) {
      this.els.submissionModeToggle.addEventListener('click', e => {
        const target = e.target.closest('[data-mode]');
        if (target && target.dataset.mode === SUBMISSION_MODES.DRES && this.state.get('submissionMode') === SUBMISSION_MODES.DRES) {
          this.eventBus.emit('modal:open_dres');
          return;
        }
        this.toggleSubmissionMode();
      });
    }

    // Embedding model toggle (MetaCLIP-2 vs BEiT-3)
    if (this.els.embeddingModelToggle) {
      this.els.embeddingModelToggle.addEventListener('click', () => this.toggleEmbeddingModel());
    }

    // Auto translate toggle
    if (this.els.autoTranslateToggle) {
      this.els.autoTranslateToggle.addEventListener('click', () => this.toggleAutoTranslate());
    }

    // Connection status click -> open log modal
    if (this.els.connectionStatus) {
      this.els.connectionStatus.addEventListener('click', () => {
        this.eventBus.emit('modal:open_log');
      });
    }

    // Listen to state changes
    this.eventBus.on('state:memberName', () => this.updateMemberNameDisplay());
    this.eventBus.on('state:submissionMode', () => this.renderSubmissionMode());
    this.eventBus.on('connection:change', ({ status, text }) => this.updateConnectionStatus(status, text));
  }

  initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
  }

  setTaskType(type) {
    if (!this.els.taskType) return;
    this.els.taskType.value = type;
    const isQa = type === TASK_TYPES.QA;
    if (this.els.qaAnswer) {
      this.els.qaAnswer.style.display = isQa ? 'block' : 'none';
      if (isQa) this.els.qaAnswer.focus();
    }
    this.eventBus.emit('taskType:change', type);
  }

  cycleTaskType() {
    const current = this.els.taskType ? this.els.taskType.value : TASK_TYPES.KIS;
    const sequence = [TASK_TYPES.KIS, TASK_TYPES.TRAKE, TASK_TYPES.QA];
    const next = sequence[(sequence.indexOf(current) + 1) % sequence.length];
    this.setTaskType(next);
  }

  toggleSubmissionMode() {
    const current = this.state.get('submissionMode');
    const next = current === SUBMISSION_MODES.DRES ? SUBMISSION_MODES.CSV : SUBMISSION_MODES.DRES;
    this.state.set('submissionMode', next);
    localStorage.setItem(STORAGE_KEYS.SUBMISSION_MODE, next);
    this.renderSubmissionMode();
  }

  renderSubmissionMode() {
    const mode = this.state.get('submissionMode');
    if (this.els.submissionModeToggle) {
      this.els.submissionModeToggle.setAttribute('data-active-mode', mode);
      this.els.submissionModeToggle.setAttribute(
        'aria-label',
        `Chế độ nộp bài hiện tại ${mode === SUBMISSION_MODES.DRES ? 'DRES' : 'CSV'}`
      );
      this.els.submissionModeToggle.querySelectorAll('[data-mode]').forEach(span => {
        span.classList.toggle('is-active', span.dataset.mode === mode);
      });
    }
  }

  async toggleEmbeddingModel() {
    if (this.els.embeddingModelToggle?.disabled) return;
    const current = this.state.get('embeddingModel');
    const next = current === 'metaclip' ? 'beit3' : 'metaclip';
    const previousSessionId = this.state.get('temporalSessionId');

    this.state.set('embeddingModel', next);

    if (this.state.get('searchMode') === 'temporal' && previousSessionId) {
      this.eventBus.emit('temporal:reset_needed', previousSessionId);
    }
    this.syncEmbeddingModelControls();
  }

  toggleAutoTranslate() {
    const current = Boolean(this.state.get('autoTranslate'));
    const next = !current;
    this.state.set('autoTranslate', next);
    try {
      localStorage.setItem('aic_auto_translate', String(next));
    } catch (_) {}
    this.renderAutoTranslate();
  }

  renderAutoTranslate() {
    const enabled = Boolean(this.state.get('autoTranslate'));
    if (this.els.autoTranslateToggle) {
      this.els.autoTranslateToggle.classList.toggle('is-active', enabled);
      this.els.autoTranslateToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      this.els.autoTranslateToggle.title = enabled
        ? 'Auto Dịch tiếng Anh đang BẬT (Phím tắt: Alt+E). Bấm để tắt.'
        : 'Auto Dịch tiếng Anh đang TẮT (Phím tắt: Alt+E). Bấm để bật tự động dịch câu query tiếng Việt sang tiếng Anh trước khi tìm kiếm.';
    }
    if (this.els.autoTranslateLabel) {
      this.els.autoTranslateLabel.textContent = enabled ? 'Auto EN: BẬT' : 'Auto EN: Tắt';
    }
  }

  syncEmbeddingModelControls() {
    if (!this.els.embeddingModelToggle) return;
    const model = this.state.get('embeddingModel');
    const isBeit3 = model === 'beit3';
    this.els.embeddingModelToggle.textContent = isBeit3 ? 'BEiT-3' : 'MetaCLIP-2';
    this.els.embeddingModelToggle.setAttribute(
      'aria-label',
      `Mô hình hiện tại ${isBeit3 ? 'BEiT-3' : 'MetaCLIP-2'}; bấm để đổi`
    );
  }

  updateMemberNameDisplay() {
    if (this.els.memberNameDisplay) {
      this.els.memberNameDisplay.textContent = this.state.currentDisplayName();
    }
  }

  updateConnectionStatus(status, text) {
    if (!this.els.connectionStatus) return;
    this.els.connectionStatus.className = `status-pill ${status}`;
    this.els.connectionStatus.textContent = text;
  }

  setQaAnswerText(text) {
    if (this.els.qaAnswer) {
      this.els.qaAnswer.value = text || '';
    }
  }

  render() {
    this.updateMemberNameDisplay();
    this.renderSubmissionMode();
    this.syncEmbeddingModelControls();
    this.renderAutoTranslate();
    if (this.els.taskType) {
      this.setTaskType(this.els.taskType.value || TASK_TYPES.KIS);
    }
  }
}
