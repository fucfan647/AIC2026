/**
 * ==============================================================================
 * TỆP TIN: js/controllers/ModalsController.js
 * LỚP: ModalsController
 * MÔ TẢ:
 *   Quản lý toàn bộ các hộp thoại (Modal Windows / Overlays):
 *   - dresModal: Đăng nhập DRES, lấy danh sách evaluation và đổi tên thành viên.
 *   - statsModal: Thống kê đóng góp, nhật ký nộp bài toàn đội, bảng xếp hạng.
 *   - timingModal: Xem phân rã thời gian tìm kiếm chi tiết (Client, Backend, Transit).
 *   - shortcutsModal: Bảng hướng dẫn phím tắt.
 *   - imageModal / shotOverviewModal / frameOverviewModal: Xem phóng to ảnh và frame lân cận.
 * ==============================================================================
 */

import { escapeHtml } from '../utils/dom.js';
import { formatMilliseconds } from '../utils/time.js';

export class ModalsController {
  constructor(appState, eventBus, dresService, mediaService) {
    this.state = appState;
    this.eventBus = eventBus;
    this.dresService = dresService;
    this.mediaService = mediaService;

    this.els = {
      // DRES Modal
      dresModal: document.getElementById('dresModal'),
      closeDresBtn: document.getElementById('closeDresBtn'),
      dresServer: document.getElementById('dresServer'),
      dresUsername: document.getElementById('dresUsername'),
      dresPassword: document.getElementById('dresPassword'),
      dresLoginBtn: document.getElementById('dresLoginBtn'),
      dresLogoutBtn: document.getElementById('dresLogoutBtn'),
      dresLoginView: document.getElementById('dresLoginView'),
      dresSessionView: document.getElementById('dresSessionView'),
      evaluationSelect: document.getElementById('evaluationSelect'),
      chooseEvaluationBtn: document.getElementById('chooseEvaluationBtn'),
      dresStatus: document.getElementById('dresStatus'),
      sessionMemberNameDisplay: document.getElementById('sessionMemberNameDisplay'),
      sessionChangeNameBtn: document.getElementById('sessionChangeNameBtn'),

      // Log Modal
      logModal: document.getElementById('logModal'),
      closeLogBtn: document.getElementById('closeLogBtn'),
      logContent: document.getElementById('logContent'),

      // Timing Modal
      timingModal: document.getElementById('timingModal'),
      closeTimingBtn: document.getElementById('closeTimingBtn'),
      timingClientTotal: document.getElementById('timingClientTotal'),
      timingBackendTotal: document.getElementById('timingBackendTotal'),
      timingOutsideBackend: document.getElementById('timingOutsideBackend'),
      timingBackendNote: document.getElementById('timingBackendNote'),
      timingTableBody: document.getElementById('timingTableBody'),
      searchTimingBtn: document.getElementById('searchTimingBtn'),

      // Shortcuts Modal
      shortcutsModal: document.getElementById('shortcutsModal'),
      closeShortcutsBtn: document.getElementById('closeShortcutsBtn'),
      shortcutsBtn: document.getElementById('shortcutsBtn'),

      // Stats Modal
      statsModal: document.getElementById('statsModal'),
      closeStatsBtn: document.getElementById('closeStatsBtn'),
      statsTabPersonal: document.getElementById('statsTabPersonal'),
      statsTabTeamHistory: document.getElementById('statsTabTeamHistory'),
      statsTabLeaderboard: document.getElementById('statsTabLeaderboard'),
      statsPersonalView: document.getElementById('statsPersonalView'),
      statsTeamHistoryView: document.getElementById('statsTeamHistoryView'),
      statsLeaderboardView: document.getElementById('statsLeaderboardView'),
      personalStatsList: document.getElementById('personalStatsList'),
      teamHistoryList: document.getElementById('teamHistoryList'),
      leaderboardList: document.getElementById('leaderboardList'),
      personalSubCount: document.getElementById('personalSubCount'),
      teamHistorySubCount: document.getElementById('teamHistorySubCount'),
      teamSubCount: document.getElementById('teamSubCount'),
      clearStatsBtn: document.getElementById('clearStatsBtn'),

      // Image / Overview modals
      imageModal: document.getElementById('imageModal'),
      imagePreview: document.getElementById('imagePreview'),
      imageTextDetails: document.getElementById('imageTextDetails'),
      closeImageBtn: document.getElementById('closeImageBtn'),
      shotOverviewModal: document.getElementById('shotOverviewModal'),
      shotOverviewGrid: document.getElementById('shotOverviewGrid'),
      closeShotOverviewBtn: document.getElementById('closeShotOverviewBtn'),
      frameOverviewModal: document.getElementById('frameOverviewModal'),
      frameOverviewGrid: document.getElementById('frameOverviewGrid'),
      closeFrameOverviewBtn: document.getElementById('closeFrameOverviewBtn')
    };

    this.bindEvents();
    this.renderDresSession();
  }

  bindEvents() {
    this.eventBus.on('modal:open_dres', () => this.openDresModal());
    this.eventBus.on('modal:open_log', () => this.openLogModal());
    this.eventBus.on('modal:open_timing', () => this.openTimingModal());
    this.eventBus.on('modal:open_shortcuts', () => this.openShortcutsModal());
    this.eventBus.on('gallery:open_context', item => this.openShotOverview(item));

    // DRES Modal actions
    this.els.closeDresBtn?.addEventListener('click', () => this.closeDresModal());
    document.querySelector('[data-close-dres]')?.addEventListener('click', () => this.closeDresModal());
    this.els.dresLoginBtn?.addEventListener('click', () => this.loginDres());
    this.els.dresLogoutBtn?.addEventListener('click', () => this.logoutDres());
    this.els.chooseEvaluationBtn?.addEventListener('click', () => this.chooseEvaluation());
    this.els.sessionChangeNameBtn?.addEventListener('click', () => this.promptChangeMemberName());

    // Log Modal
    this.els.closeLogBtn?.addEventListener('click', () => this.closeLogModal());
    document.querySelector('[data-close-log]')?.addEventListener('click', () => this.closeLogModal());

    // Timing Modal
    this.els.searchTimingBtn?.addEventListener('click', () => this.openTimingModal());
    this.els.closeTimingBtn?.addEventListener('click', () => this.closeTimingModal());
    document.querySelector('[data-close-timing]')?.addEventListener('click', () => this.closeTimingModal());

    // Shortcuts Modal
    this.els.shortcutsBtn?.addEventListener('click', () => this.openShortcutsModal());
    this.els.closeShortcutsBtn?.addEventListener('click', () => this.closeShortcutsModal());
    document.querySelector('[data-close-shortcuts]')?.addEventListener('click', () => this.closeShortcutsModal());

    // Stats Modal
    document.getElementById('statsOpenBtn')?.addEventListener('click', () => this.openStatsModal());
    this.els.closeStatsBtn?.addEventListener('click', () => this.closeStatsModal());
    document.querySelector('[data-close-stats]')?.addEventListener('click', () => this.closeStatsModal());
    this.setupStatsTabs();

    // Image / Context overview
    this.els.closeImageBtn?.addEventListener('click', () => this.closeImageModal());
    document.querySelector('[data-close-image]')?.addEventListener('click', () => this.closeImageModal());
    this.els.closeShotOverviewBtn?.addEventListener('click', () => this.closeShotOverview());
    document.querySelector('[data-close-shot-overview]')?.addEventListener('click', () => this.closeShotOverview());
    this.els.closeFrameOverviewBtn?.addEventListener('click', () => this.closeFrameOverview());
    document.querySelector('[data-close-frame-overview]')?.addEventListener('click', () => this.closeFrameOverview());
  }

  // --- DRES Modal ---
  openDresModal() {
    if (this.els.dresModal) this.els.dresModal.hidden = false;
    this.renderDresSession();
  }

  closeDresModal() {
    if (this.els.dresModal) this.els.dresModal.hidden = true;
  }

  async loginDres() {
    const serverUrl = this.els.dresServer?.value.trim() || this.state.get('dresServerUrl');
    const username = this.els.dresUsername?.value.trim();
    const password = this.els.dresPassword?.value;

    if (!username || !password) {
      alert('Vui lòng nhập tên đăng nhập và mật khẩu DRES');
      return;
    }

    try {
      this.setDresStatus('Đang đăng nhập DRES...');
      const resp = await this.dresService.login({ serverUrl, username, password });
      this.state.update({
        dresServerUrl: serverUrl,
        dresUsername: username,
        dresSessionId: resp.sessionId || resp.session || ''
      });

      const evals = await this.dresService.listEvaluations({
        serverUrl,
        sessionId: this.state.get('dresSessionId')
      });
      this.state.set('dresEvaluations', evals);
      this.state.saveDresCache();
      this.setDresStatus('Đăng nhập thành công.');
      this.renderDresSession();
    } catch (err) {
      this.setDresStatus(err.message || 'Lỗi đăng nhập');
    }
  }

  logoutDres() {
    this.state.update({
      dresSessionId: null,
      dresEvaluations: [],
      dresSelectedEvaluationId: ''
    });
    this.state.clearLocalSessionCache();
    this.renderDresSession();
    this.setDresStatus('Đã đăng xuất DRES.');
  }

  chooseEvaluation() {
    const evalId = this.els.evaluationSelect?.value;
    if (!evalId) {
      alert('Vui lòng chọn một evaluation');
      return;
    }
    this.state.set('dresSelectedEvaluationId', evalId);
    this.state.saveDresCache();
    this.closeDresModal();
  }

  promptChangeMemberName() {
    const cur = this.state.get('memberName') || '';
    const next = prompt('Nhập biệt danh của bạn:', cur);
    if (next !== null && next.trim()) {
      this.state.set('memberName', next.trim());
      this.state.saveMemberCache();
      this.renderDresSession();
    }
  }

  setDresStatus(text) {
    if (this.els.dresStatus) this.els.dresStatus.textContent = text;
  }

  renderDresSession() {
    const isLogged = Boolean(this.state.get('dresSessionId'));
    if (this.els.dresLoginView) this.els.dresLoginView.hidden = isLogged;
    if (this.els.dresSessionView) this.els.dresSessionView.hidden = !isLogged;

    if (this.els.sessionMemberNameDisplay) {
      this.els.sessionMemberNameDisplay.textContent = this.state.currentDisplayName();
    }

    if (isLogged && this.els.evaluationSelect) {
      const evals = this.state.get('dresEvaluations') || [];
      const curId = this.state.get('dresSelectedEvaluationId');
      this.els.evaluationSelect.innerHTML = evals.length === 0
        ? '<option value="">Chưa có evaluation</option>'
        : evals.map(e => `<option value="${escapeHtml(e.id)}" ${e.id === curId ? 'selected' : ''}>${escapeHtml(e.name || e.id)}</option>`).join('');
    }
  }

  // --- Log Modal ---
  openLogModal() {
    if (this.els.logModal) {
      this.els.logModal.hidden = false;
      if (this.els.logContent) {
        this.els.logContent.textContent = this.state.get('lastLog') || 'Chưa có log.';
      }
    }
  }

  closeLogModal() {
    if (this.els.logModal) this.els.logModal.hidden = true;
  }

  // --- Timing Modal ---
  openTimingModal() {
    const timing = this.state.get('lastSearchTiming');
    if (!timing || !this.els.timingModal) return;

    if (this.els.timingClientTotal) this.els.timingClientTotal.textContent = formatMilliseconds(timing.clientDuration);
    if (this.els.timingBackendTotal) this.els.timingBackendTotal.textContent = formatMilliseconds(timing.serverDuration);
    if (this.els.timingOutsideBackend) this.els.timingOutsideBackend.textContent = formatMilliseconds(timing.outsideBackend);
    if (this.els.timingBackendNote) this.els.timingBackendNote.textContent = timing.methodLabel || '';

    if (this.els.timingTableBody && Array.isArray(timing.breakdown)) {
      this.els.timingTableBody.innerHTML = timing.breakdown.map(row => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td>${formatMilliseconds(row.time)}</td>
          <td>${escapeHtml(row.desc)}</td>
        </tr>
      `).join('');
    }

    this.els.timingModal.hidden = false;
  }

  closeTimingModal() {
    if (this.els.timingModal) this.els.timingModal.hidden = true;
  }

  // --- Shortcuts Modal ---
  openShortcutsModal() {
    if (this.els.shortcutsModal) this.els.shortcutsModal.hidden = false;
  }

  closeShortcutsModal() {
    if (this.els.shortcutsModal) this.els.shortcutsModal.hidden = true;
  }

  // --- Stats Modal ---
  async openStatsModal() {
    if (!this.els.statsModal) return;
    this.els.statsModal.hidden = false;

    try {
      const resp = await fetch('/team/user/stats');
      if (!resp.ok) return;
      const data = await resp.json();

      if (this.els.personalSubCount) this.els.personalSubCount.textContent = String(data.personal_count || 0);
      if (this.els.teamHistorySubCount) this.els.teamHistorySubCount.textContent = String(data.team_count || 0);
      if (this.els.teamSubCount) this.els.teamSubCount.textContent = String(data.leaderboard?.length || 0);

      if (this.els.personalStatsList) {
        this.els.personalStatsList.innerHTML = (data.personal_submissions || []).map(s => `
          <div class="stats-item">
            <strong>${escapeHtml(s.task_type?.toUpperCase())}</strong> - ${escapeHtml(s.query_filename)}
            <span class="badge ${s.verdict === 'CORRECT' ? 'is-correct' : 'is-wrong'}">${escapeHtml(s.verdict)}</span>
          </div>
        `).join('') || '<div class="stats-empty">Chưa có bài nộp nào.</div>';
      }

      if (this.els.leaderboardList) {
        this.els.leaderboardList.innerHTML = (data.leaderboard || []).map((u, i) => `
          <div class="leaderboard-item">
            <span class="rank">#${i + 1}</span>
            <span class="name">${escapeHtml(u.name)}</span>
            <span class="score">${u.correct_count} đúng / ${u.total_count} nộp</span>
          </div>
        `).join('') || '<div class="stats-empty">Chưa có xếp hạng.</div>';
      }
    } catch (_) {}
  }

  closeStatsModal() {
    if (this.els.statsModal) this.els.statsModal.hidden = true;
  }

  setupStatsTabs() {
    this.els.statsTabPersonal?.addEventListener('click', () => {
      this.els.statsTabPersonal.classList.add('is-active');
      this.els.statsTabTeamHistory?.classList.remove('is-active');
      this.els.statsTabLeaderboard?.classList.remove('is-active');
      if (this.els.statsPersonalView) this.els.statsPersonalView.hidden = false;
      if (this.els.statsTeamHistoryView) this.els.statsTeamHistoryView.hidden = true;
      if (this.els.statsLeaderboardView) this.els.statsLeaderboardView.hidden = true;
    });

    this.els.statsTabTeamHistory?.addEventListener('click', () => {
      this.els.statsTabPersonal?.classList.remove('is-active');
      this.els.statsTabTeamHistory.classList.add('is-active');
      this.els.statsTabLeaderboard?.classList.remove('is-active');
      if (this.els.statsPersonalView) this.els.statsPersonalView.hidden = true;
      if (this.els.statsTeamHistoryView) this.els.statsTeamHistoryView.hidden = false;
      if (this.els.statsLeaderboardView) this.els.statsLeaderboardView.hidden = true;
    });

    this.els.statsTabLeaderboard?.addEventListener('click', () => {
      this.els.statsTabPersonal?.classList.remove('is-active');
      this.els.statsTabTeamHistory?.classList.remove('is-active');
      this.els.statsTabLeaderboard.classList.add('is-active');
      if (this.els.statsPersonalView) this.els.statsPersonalView.hidden = true;
      if (this.els.statsTeamHistoryView) this.els.statsTeamHistoryView.hidden = true;
      if (this.els.statsLeaderboardView) this.els.statsLeaderboardView.hidden = false;
    });

    this.els.clearStatsBtn?.addEventListener('click', async () => {
      if (confirm('Bạn có chắc muốn xóa lịch sử nộp bài?')) {
        await fetch('/team/user/stats/clear', { method: 'POST' });
        this.openStatsModal();
      }
    });
  }

  // --- Image / Context Overviews ---
  async openShotOverview(item) {
    if (!item?.video_id || !this.els.shotOverviewModal) return;
    this.els.shotOverviewModal.hidden = false;
    if (this.els.shotOverviewGrid) {
      this.els.shotOverviewGrid.innerHTML = '<span class="strip-loading">Đang tải 24 shot lân cận...</span>';
    }

    try {
      const shots = await this.mediaService.fetchShotContext(item.video_id, item.shot_id || 0);
      if (!this.els.shotOverviewGrid) return;
      this.els.shotOverviewGrid.innerHTML = '';
      (shots || []).forEach(shot => {
        const thumb = document.createElement('div');
        thumb.className = 'shot-thumb-card';
        const imgUrl = this.mediaService.getThumbnailUrl(shot);
        thumb.innerHTML = `<img src="${escapeHtml(imgUrl)}" alt="#${escapeHtml(shot.shot_id)}" loading="lazy" />`;
        thumb.addEventListener('click', () => {
          this.closeShotOverview();
          this.eventBus.emit('video:open', shot);
        });
        this.els.shotOverviewGrid.appendChild(thumb);
      });
    } catch (_) {
      if (this.els.shotOverviewGrid) this.els.shotOverviewGrid.innerHTML = '';
    }
  }

  closeShotOverview() {
    if (this.els.shotOverviewModal) this.els.shotOverviewModal.hidden = true;
  }

  closeFrameOverview() {
    if (this.els.frameOverviewModal) this.els.frameOverviewModal.hidden = true;
  }

  closeImageModal() {
    if (this.els.imageModal) this.els.imageModal.hidden = true;
  }

  closeAllModals() {
    this.closeDresModal();
    this.closeLogModal();
    this.closeTimingModal();
    this.closeShortcutsModal();
    this.closeStatsModal();
    this.closeShotOverview();
    this.closeFrameOverview();
    this.closeImageModal();
  }
}
