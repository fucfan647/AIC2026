/**
 * ==============================================================================
 * TỆP TIN: js/controllers/TrakeDrawerController.js
 * LỚP: TrakeDrawerController
 * MÔ TẢ:
 *   Quản lý bảng phối hợp sự kiện TRAKE (TRAKE Collaboration Drawer):
 *   - Bảng trượt từ cạnh phải, mở bằng nút nổi 🎯 TRAKE hoặc phím tắt.
 *   - Khay Chung Nộp Bài (Master Tray): Hỗ trợ kéo thả đổi thứ tự các frame (Reorder).
 *   - Khay Cá Nhân Của Thành Viên: Phân công theo Event E1 - E5, kéo thả frame lên Khay Chung.
 *   - Nút Nộp Bài TRAKE lên DRES.
 * ==============================================================================
 */

import { escapeHtml } from '../utils/dom.js';
import { STORAGE_KEYS, TASK_TYPES } from '../core/Constants.js';

export class TrakeDrawerController {
  constructor(appState, eventBus, teamSocketService, mediaService) {
    this.state = appState;
    this.eventBus = eventBus;
    this.teamSocket = teamSocketService;
    this.mediaService = mediaService;

    this.els = {
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
      videoOpenTrakeDrawerBtn: document.getElementById('videoOpenTrakeDrawerBtn')
    };

    this.bindEvents();
    this.restoreState();
  }

  bindEvents() {
    this.els.trakePanelToggleBtn?.addEventListener('click', () => this.toggleDrawer());
    this.els.closeTrakeDrawerBtn?.addEventListener('click', () => this.toggleDrawer(false));
    this.els.videoOpenTrakeDrawerBtn?.addEventListener('click', () => this.toggleDrawer(true));

    this.els.trakeMasterClearBtn?.addEventListener('click', () => {
      this.teamSocket.clearTrakeFrames();
    });

    this.els.trakeMasterSubmitBtn?.addEventListener('click', () => {
      this.eventBus.emit('submission:trigger', { taskType: TASK_TYPES.TRAKE });
    });

    this.els.trakeAddMyEventBtn?.addEventListener('click', () => {
      const curItem = this.state.get('activeVideoItem') || this.state.get('results')?.[0];
      if (curItem) {
        this.addFrameToMyEvent(curItem);
      }
    });

    this.setupMasterDropzone();

    this.eventBus.on('team:state_updated', () => {
      this.render();
    });

    this.eventBus.on('frame:captured', item => {
      this.addFrameToMyEvent(item);
    });
  }

  restoreState() {
    try {
      if (localStorage.getItem(STORAGE_KEYS.TRAKE_DRAWER_OPEN) === '1') {
        this.toggleDrawer(true);
      }
    } catch (_) {}
  }

  toggleDrawer(forceState = null) {
    if (!this.els.trakeDrawer) return;
    const isOpen = this.els.trakeDrawer.classList.contains('is-open');
    const next = forceState !== null ? forceState : !isOpen;

    if (next) {
      this.els.trakeDrawer.hidden = false;
      void this.els.trakeDrawer.offsetWidth; // Force reflow
      this.els.trakeDrawer.classList.add('is-open');
      this.els.trakePanelToggleBtn?.classList.add('is-active');
      this.state.set('trakeDrawerOpen', true);
      this.render();
    } else {
      this.els.trakeDrawer.classList.remove('is-open');
      this.els.trakePanelToggleBtn?.classList.remove('is-active');
      this.state.set('trakeDrawerOpen', false);
      setTimeout(() => {
        if (!this.els.trakeDrawer.classList.contains('is-open')) {
          this.els.trakeDrawer.hidden = true;
        }
      }, 300);
    }

    try {
      localStorage.setItem(STORAGE_KEYS.TRAKE_DRAWER_OPEN, next ? '1' : '0');
    } catch (_) {}
  }

  setupMasterDropzone() {
    const dropzone = this.els.trakeMasterDropzone;
    if (!dropzone) return;

    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dropzone.classList.add('is-drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('is-drag-over');
    });

    dropzone.addEventListener('drop', async e => {
      e.preventDefault();
      dropzone.classList.remove('is-drag-over');

      // Drop from user card
      const userFrameJson = e.dataTransfer.getData('application/x-aic-trake-user-frame');
      if (userFrameJson) {
        try {
          const parsed = JSON.parse(userFrameJson);
          if (parsed?.item) await this.teamSocket.addTrakeFrame(parsed.item);
        } catch (_) {}
        return;
      }

      // Drop from keyframe card
      const keyframeJson = e.dataTransfer.getData('application/x-aic-keyframe');
      if (keyframeJson) {
        try {
          const item = JSON.parse(keyframeJson);
          if (item) await this.teamSocket.addTrakeFrame(item);
        } catch (_) {}
      }
    });
  }

  async addFrameToMyEvent(item) {
    if (!item) return;
    const myEvent = this.state.get('myTrakeEvent') || 1;
    await this.teamSocket.addUserTrakeFrame(item, myEvent);
  }

  render() {
    this.renderMasterTray();
    this.renderUserCards();
  }

  renderMasterTray() {
    if (!this.els.trakeMasterFrames) return;
    const frames = this.state.get('trakeFrames') || [];
    const videoId = frames[0]?.item?.video_id;

    if (this.els.trakeMasterCount) {
      this.els.trakeMasterCount.textContent = `${frames.length} frame`;
    }
    if (this.els.trakeMasterVideo) {
      if (videoId) {
        this.els.trakeMasterVideo.textContent = `Video: ${videoId}`;
        this.els.trakeMasterVideo.hidden = false;
      } else {
        this.els.trakeMasterVideo.hidden = true;
      }
    }
    if (this.els.trakeMasterSubmitBtn) {
      this.els.trakeMasterSubmitBtn.disabled = frames.length === 0;
    }
    if (this.els.trakeMasterClearBtn) {
      this.els.trakeMasterClearBtn.disabled = frames.length === 0;
    }

    this.els.trakeMasterFrames.innerHTML = '';
    if (frames.length === 0) {
      this.els.trakeMasterFrames.innerHTML = '<div class="trake-empty-hint">Kéo frame từ khay của thành viên hoặc từ kết quả tìm kiếm thả vào đây để nộp.</div>';
      return;
    }

    frames.forEach((vote, idx) => {
      const item = vote.item;
      if (!item) return;

      const chip = document.createElement('div');
      chip.className = 'trake-frame-chip';
      chip.draggable = true;
      const imgUrl = this.mediaService.getThumbnailUrl(item);

      chip.innerHTML = `
        <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(item.video_id)}" />
        <span class="trake-chip-order">${idx + 1}</span>
        <span class="trake-chip-event-tag">E${idx + 1}</span>
        <button class="trake-chip-remove" type="button" title="Xóa">&times;</button>
      `;

      // Reordering via drag and drop
      chip.addEventListener('dragstart', e => {
        chip.classList.add('is-dragging');
        e.dataTransfer.setData('application/x-aic-trake-master-index', idx.toString());
      });
      chip.addEventListener('dragend', () => chip.classList.remove('is-dragging'));

      chip.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      chip.addEventListener('drop', async e => {
        e.preventDefault();
        e.stopPropagation();
        const fromIdx = parseInt(e.dataTransfer.getData('application/x-aic-trake-master-index'), 10);
        if (!isNaN(fromIdx) && fromIdx !== idx) {
          const list = [...frames];
          const [moved] = list.splice(fromIdx, 1);
          list.splice(idx, 0, moved);
          await this.teamSocket.reorderTrakeFrames(list);
        }
      });

      chip.querySelector('.trake-chip-remove')?.addEventListener('click', e => {
        e.stopPropagation();
        this.teamSocket.removeTrakeFrame(vote);
      });

      chip.addEventListener('click', () => {
        this.eventBus.emit('video:open', item);
      });

      this.els.trakeMasterFrames.appendChild(chip);
    });
  }

  renderUserCards() {
    if (!this.els.trakeUserCards) return;
    const users = this.state.get('trakeUsers') || {};
    const myClientId = this.state.get('clientId');
    const userEntries = Object.entries(users);

    const totalFrames = userEntries.reduce((total, [, u]) => total + (u.frames?.length || 0), 0);
    if (this.els.trakeToggleCount) {
      this.els.trakeToggleCount.textContent = String(totalFrames);
      this.els.trakeToggleCount.hidden = totalFrames === 0;
    }

    this.els.trakeUserCards.innerHTML = '';
    userEntries.forEach(([uid, userData]) => {
      const isMe = uid === myClientId;
      const name = isMe ? this.state.currentDisplayName() : (userData.name || 'Thành viên');
      const currentEvent = isMe ? (this.state.get('myTrakeEvent') || 1) : (userData.event || 1);
      const frames = Array.isArray(userData.frames) ? userData.frames : [];

      const card = document.createElement('div');
      card.className = `trake-user-card${isMe ? ' is-me' : ''}`;

      let eventBtns = '';
      for (let e = 1; e <= 5; e++) {
        eventBtns += `<button class="trake-event-btn${e === currentEvent ? ' is-active' : ''}" type="button" data-event="${e}" ${isMe ? '' : 'disabled'}>E${e}</button>`;
      }

      card.innerHTML = `
        <div class="trake-user-head">
          <div class="trake-user-info">
            <span class="trake-user-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</span>
            <span class="trake-user-name">${escapeHtml(name)}</span>
            ${isMe ? '<span class="trake-me-badge">Bạn</span>' : ''}
          </div>
          <div class="trake-user-head-actions">
            ${isMe && frames.length > 0 ? '<button class="trake-user-clear-btn" type="button">Xóa khay</button>' : ''}
            <button class="trake-user-delete-btn" type="button">Xóa user</button>
          </div>
        </div>
        <div class="trake-event-control-wrap">
          <span class="trake-event-label">Đang làm Event:</span>
          <div class="trake-event-selector">${eventBtns}</div>
        </div>
        <div class="trake-user-tray"></div>
      `;

      if (isMe) {
        card.querySelectorAll('.trake-event-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const ev = Number(btn.dataset.event);
            this.state.set('myTrakeEvent', ev);
            this.teamSocket.setUserTrakeEvent(ev);
            this.renderUserCards();
          });
        });

        card.querySelector('.trake-user-clear-btn')?.addEventListener('click', () => {
          this.teamSocket.clearUserTrakeFrames();
        });
      }

      card.querySelector('.trake-user-delete-btn')?.addEventListener('click', () => {
        if (confirm(`Xóa user ${name}?`)) {
          this.teamSocket.removeTrakeUser(uid);
        }
      });

      const tray = card.querySelector('.trake-user-tray');
      if (frames.length === 0) {
        tray.innerHTML = `<span class="trake-user-empty">${isMe ? 'Khay của bạn đang trống.' : `${escapeHtml(name)} chưa thêm frame nào.`}</span>`;
      } else {
        frames.forEach(f => {
          const item = f.item;
          if (!item) return;

          const chip = document.createElement('div');
          chip.className = 'trake-frame-chip';
          chip.draggable = true;
          const imgUrl = this.mediaService.getThumbnailUrl(item);

          chip.innerHTML = `
            <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(item.video_id)}" />
            <span class="trake-chip-event-tag">E${f.event || currentEvent}</span>
            ${isMe ? '<button class="trake-chip-remove" type="button">&times;</button>' : ''}
          `;

          chip.addEventListener('dragstart', e => {
            e.dataTransfer.setData('application/x-aic-trake-user-frame', JSON.stringify({ item, name, event: f.event || currentEvent }));
          });

          if (isMe) {
            chip.querySelector('.trake-chip-remove')?.addEventListener('click', e => {
              e.stopPropagation();
              this.teamSocket.removeUserTrakeFrame(f.selection_id);
            });
          }

          chip.addEventListener('click', () => {
            this.eventBus.emit('video:open', item);
          });

          tray.appendChild(chip);
        });
      }

      this.els.trakeUserCards.appendChild(card);
    });
  }
}
