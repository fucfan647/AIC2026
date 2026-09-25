/**
 * ==============================================================================
 * TỆP TIN: js/controllers/SelectionTrayController.js
 * LỚP: SelectionTrayController
 * MÔ TẢ:
 *   Quản lý khay chọn khung hình dưới đáy màn hình (Bottom Selection Tray):
 *   - Hiển thị danh sách các frame đã vote hoặc đã chọn của toàn đội.
 *   - Hỗ trợ chuyển tab: Khay Chung vs Khay TRAKE.
 *   - Các thao tác: Bấm vào frame để xem video, xóa frame, xóa toàn bộ khay.
 *   - Nút nộp bài trực tiếp từ khay.
 * ==============================================================================
 */

import { escapeHtml } from '../utils/dom.js';

export class SelectionTrayController {
  constructor(appState, eventBus, teamSocketService, mediaService) {
    this.state = appState;
    this.eventBus = eventBus;
    this.teamSocket = teamSocketService;
    this.mediaService = mediaService;

    this.els = {
      selectionTray: document.getElementById('selectionTray'),
      trayTabChung: document.getElementById('trayTabChung'),
      selectedFrames: document.getElementById('selectedFrames'),
      selectionCount: document.getElementById('selectionCount')
    };

    this.bindEvents();
  }

  bindEvents() {
    this.eventBus.on('team:state_updated', () => this.render());

    if (this.els.trayTabChung) {
      this.els.trayTabChung.addEventListener('click', () => {
        this.state.set('activeTrayTab', 'chung');
        this.render();
      });
    }

    // Drag and drop into tray
    if (this.els.selectionTray) {
      this.els.selectionTray.addEventListener('dragover', e => {
        e.preventDefault();
        this.els.selectionTray.classList.add('is-dragover');
      });
      this.els.selectionTray.addEventListener('dragleave', () => {
        this.els.selectionTray.classList.remove('is-dragover');
      });
      this.els.selectionTray.addEventListener('drop', e => {
        e.preventDefault();
        this.els.selectionTray.classList.remove('is-dragover');
        try {
          const item = JSON.parse(e.dataTransfer.getData('application/x-aic-keyframe'));
          if (item) this.eventBus.emit('tray:add_frame', item);
        } catch (_) {}
      });
    }
  }

  render() {
    if (!this.els.selectedFrames) return;
    const votes = this.state.get('teamVotes') || [];
    const myClientId = this.state.get('clientId');

    if (this.els.selectionCount) {
      this.els.selectionCount.textContent = `${votes.length} frame`;
      this.els.selectionCount.hidden = votes.length === 0;
    }

    this.els.selectedFrames.innerHTML = '';
    if (votes.length === 0) {
      this.els.selectedFrames.innerHTML = '<span class="tray-empty">Chưa có frame nào trong khay chung. Bấm "Thêm vào khay" hoặc kéo thả frame vào đây.</span>';
      return;
    }

    votes.forEach(vote => {
      const item = vote.item;
      if (!item) return;

      const chip = document.createElement('div');
      chip.className = 'tray-chip';
      const imgUrl = this.mediaService.getThumbnailUrl(item);
      const isMine = vote.client_id === myClientId;

      chip.innerHTML = `
        <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(item.video_id)}" />
        <span class="tray-chip-tag">${escapeHtml(vote.name || 'Member')}</span>
        ${isMine ? `<button class="tray-chip-remove" type="button" title="Xóa">&times;</button>` : ''}
      `;

      chip.addEventListener('click', e => {
        if (e.target.matches('.tray-chip-remove')) return;
        this.eventBus.emit('video:open', item);
      });

      if (isMine) {
        chip.querySelector('.tray-chip-remove')?.addEventListener('click', e => {
          e.stopPropagation();
          this.teamSocket.removeTeamSelection(vote);
        });
      }

      this.els.selectedFrames.appendChild(chip);
    });
  }
}
