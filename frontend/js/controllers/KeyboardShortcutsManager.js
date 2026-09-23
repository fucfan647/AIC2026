/**
 * ==============================================================================
 * TỆP TIN: js/controllers/KeyboardShortcutsManager.js
 * LỚP: KeyboardShortcutsManager
 * MÔ TẢ:
 *   Trung tâm điều phối toàn bộ phím tắt bàn phím của hệ thống:
 *   - Shift + K / T / Q: Chuyển đổi nhanh giữa các dạng đề KIS, TRAKE, Q&A.
 *   - Alt + 1 / 2 / 3: Chuyển dạng đề ngay cả khi đang gõ trong ô nhập văn bản.
 *   - Phím A (+Stage), Phím D (-Stage): Thêm/xóa chặng tìm kiếm theo thời gian.
 *   - Phím I: Bật/Tắt tìm kiếm bằng hình ảnh (Image Query Dropzone).
 *   - Phím ?: Bật/Tắt bảng tra cứu phím tắt.
 *   - Phím Space & Mũi tên trái/phải: Điều khiển phát/dừng và tua video.
 *   - Phím Escape: Đóng mọi popup modal đang mở và tắt âm thanh chúc mừng.
 * ==============================================================================
 */

import { TASK_TYPES } from '../core/Constants.js';
import { hideCorrectCelebration } from '../utils/audio.js';

export class KeyboardShortcutsManager {
  constructor(appState, eventBus, topbarController, stageManager, similarityController, videoPlayer, modalsController) {
    this.state = appState;
    this.eventBus = eventBus;
    this.topbar = topbarController;
    this.stageManager = stageManager;
    this.similarity = similarityController;
    this.videoPlayer = videoPlayer;
    this.modals = modalsController;

    this.bindEvents();
  }

  bindEvents() {
    document.addEventListener('keydown', event => this.handleKeyDown(event), true);
  }

  handleKeyDown(event) {
    const inInput = event.target.matches('input, textarea');
    const key = event.key.toLowerCase();

    // 1. Shift + K / T / Q (khi không trong input)
    if (!inInput && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      if (key === 'k') {
        event.preventDefault();
        this.topbar.setTaskType(TASK_TYPES.KIS);
        return;
      }
      if (key === 't') {
        event.preventDefault();
        this.topbar.setTaskType(TASK_TYPES.TRAKE);
        return;
      }
      if (key === 'q') {
        event.preventDefault();
        this.topbar.setTaskType(TASK_TYPES.QA);
        return;
      }
    }

    // 2. Alt + 1 / 2 / 3 (hoạt động kể cả khi đang gõ input)
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      if (key === '1' || key === 'k') {
        event.preventDefault();
        this.topbar.setTaskType(TASK_TYPES.KIS);
        return;
      }
      if (key === '2' || key === 't') {
        event.preventDefault();
        this.topbar.setTaskType(TASK_TYPES.TRAKE);
        return;
      }
      if (key === '3' || key === 'q') {
        event.preventDefault();
        this.topbar.setTaskType(TASK_TYPES.QA);
        return;
      }
      if (key === 'e') {
        event.preventDefault();
        this.topbar.toggleAutoTranslate();
        return;
      }
      if (key === 'a') {
        event.preventDefault();
        this.stageManager.addTemporalStage();
        return;
      }
      if (key === 'd') {
        event.preventDefault();
        const stages = this.state.get('stages');
        if (stages && stages.length > 1) {
          this.stageManager.removeStage(stages[stages.length - 1].id);
        }
        return;
      }
      if (key === 'i') {
        event.preventDefault();
        this.similarity.togglePopover();
        return;
      }
    }

    // 3. Phím Escape: đóng mọi modal và celebration
    if (event.key === 'Escape') {
      event.preventDefault();
      hideCorrectCelebration();
      this.videoPlayer.close();
      this.modals.closeAllModals();
      return;
    }

    // 4. Nếu đang trong input thì bỏ qua các phím đơn bên dưới
    if (inInput) return;

    // 5. Video Player controls
    if (!this.videoPlayer.els.videoModal?.hidden) {
      if (event.key === ' ') {
        event.preventDefault();
        this.videoPlayer.togglePlay();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.videoPlayer.seekDelta(event.shiftKey ? -10 : -1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.videoPlayer.seekDelta(event.shiftKey ? 10 : 1);
        return;
      }
    }

    // 6. Single-key shortcuts
    if (key === '1') {
      event.preventDefault();
      this.topbar.setTaskType(TASK_TYPES.KIS);
      return;
    }
    if (key === '2') {
      event.preventDefault();
      this.topbar.setTaskType(TASK_TYPES.TRAKE);
      return;
    }
    if (key === '3') {
      event.preventDefault();
      this.topbar.setTaskType(TASK_TYPES.QA);
      return;
    }
    if (key === 't') {
      event.preventDefault();
      this.topbar.cycleTaskType();
      return;
    }
    if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
      event.preventDefault();
      this.modals.openShortcutsModal();
    }
  }
}
