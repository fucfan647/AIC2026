/**
 * ==============================================================================
 * TỆP TIN: js/controllers/VideoAsrController.js
 * LỚP: VideoAsrController
 * MÔ TẢ:
 *   Quản lý bảng phụ đề lời thoại ASR toàn bộ video theo thời gian thực:
 *   - Lấy dữ liệu ASR từ GET /video-asr/{video_id}.
 *   - Tự động bôi đậm (highlight) dòng thoại khớp với currentTime của video.
 *   - Tự động cuộn mượt (auto-scroll) danh sách lời thoại đến vị trí đang phát.
 *   - Cho phép người dùng bấm vào dòng thoại để tua nhanh video đến thời điểm đó.
 * ==============================================================================
 */

import { escapeHtml } from '../utils/dom.js';
import { formatVideoTime } from '../utils/time.js';

export class VideoAsrController {
  constructor(appState, eventBus, mediaService) {
    this.state = appState;
    this.eventBus = eventBus;
    this.mediaService = mediaService;

    this.els = {
      videoTextToggleBtn: document.getElementById('videoTextToggleBtn'),
      videoFrameTextPanel: document.getElementById('videoFrameTextPanel'),
      videoFrameTextLabel: document.getElementById('videoFrameTextLabel'),
      videoFrameTextDetails: document.getElementById('videoFrameTextDetails')
    };

    this.entries = [];
    this.activeHighlightIndex = -1;
    this.bindEvents();
  }

  bindEvents() {
    this.els.videoTextToggleBtn?.addEventListener('click', () => {
      this.togglePanel();
    });

    this.eventBus.on('video:opened', item => {
      this.loadAsr(item.video_id);
    });

    this.eventBus.on('video:timeupdate', curTime => {
      this.updateHighlight(curTime);
    });

    this.eventBus.on('video:closed', () => {
      this.entries = [];
      this.activeHighlightIndex = -1;
    });
  }

  togglePanel(forceState = null) {
    if (!this.els.videoFrameTextPanel) return;
    const isHidden = this.els.videoFrameTextPanel.hidden;
    const next = forceState !== null ? !forceState : isHidden;

    this.els.videoFrameTextPanel.hidden = !next;
    this.els.videoTextToggleBtn?.setAttribute('aria-pressed', String(next));
    this.state.set('showVideoFrameText', next);
  }

  async loadAsr(videoId) {
    if (!this.els.videoFrameTextDetails) return;
    this.els.videoFrameTextDetails.innerHTML = '<span class="asr-loading">Đang tải phụ đề ASR...</span>';

    try {
      const data = await this.mediaService.fetchVideoAsr(videoId);
      const items = Array.isArray(data?.segments) ? data.segments : (Array.isArray(data) ? data : []);
      this.entries = items;

      if (items.length === 0) {
        this.els.videoFrameTextDetails.innerHTML = '<span class="asr-empty">Video không có lời thoại ASR</span>';
        return;
      }

      this.els.videoFrameTextDetails.innerHTML = '';
      items.forEach((seg, idx) => {
        const row = document.createElement('div');
        row.className = 'asr-row';
        row.dataset.idx = String(idx);
        const start = Number(seg.start || 0);
        const text = seg.text || seg.transcript || '';

        row.innerHTML = `
          <span class="asr-time">${formatVideoTime(start)}</span>
          <span class="asr-text">${escapeHtml(text)}</span>
        `;

        row.addEventListener('click', () => {
          this.eventBus.emit('video:seek', start);
        });

        this.els.videoFrameTextDetails.appendChild(row);
      });
    } catch (_) {
      this.els.videoFrameTextDetails.innerHTML = '<span class="asr-empty">Không tải được ASR</span>';
    }
  }

  updateHighlight(curTime) {
    if (!this.entries || this.entries.length === 0 || !this.els.videoFrameTextDetails) return;

    let targetIdx = -1;
    for (let i = 0; i < this.entries.length; i++) {
      const seg = this.entries[i];
      const start = Number(seg.start || 0);
      const end = Number(seg.end || start + 5);
      if (curTime >= start && curTime <= end) {
        targetIdx = i;
        break;
      }
    }

    if (targetIdx !== this.activeHighlightIndex) {
      this.activeHighlightIndex = targetIdx;
      const allRows = this.els.videoFrameTextDetails.querySelectorAll('.asr-row');
      allRows.forEach((r, idx) => {
        r.classList.toggle('is-active', idx === targetIdx);
      });

      if (targetIdx >= 0 && allRows[targetIdx]) {
        allRows[targetIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }
}
