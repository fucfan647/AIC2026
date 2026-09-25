/**
 * ==============================================================================
 * TỆP TIN: js/controllers/ResultsGridController.js
 * LỚP: ResultsGridController
 * MÔ TẢ:
 *   Quản lý việc hiển thị lưới kết quả tìm kiếm (Keyframe Results Grid):
 *   - Render các thẻ kết quả theo dạng khung hình đơn lẻ hoặc nhóm cảnh (scenes).
 *   - Hiển thị phản hồi nộp bài thời gian thực (Badge CORRECT màu xanh / WRONG màu đỏ).
 *   - Các thao tác nhanh trên thẻ: Thêm vào khay chung/cá nhân, xem video, xem 24 shot lân cận.
 *   - Kéo thẻ thả vào vùng tìm kiếm ảnh hoặc khay nộp bài.
 * ==============================================================================
 */

import { escapeHtml, addToTrayIcon, framesGalleryIcon, openVideoIcon } from '../utils/dom.js';
import { answerTimeMs } from '../utils/time.js';

export class ResultsGridController {
  constructor(appState, eventBus, mediaService) {
    this.state = appState;
    this.eventBus = eventBus;
    this.mediaService = mediaService;

    this.els = {
      results: document.getElementById('results'),
      resultCount: document.getElementById('resultCount'),
      searchMeta: document.getElementById('searchMeta')
    };

    this.bindEvents();
  }

  bindEvents() {
    this.eventBus.on('results:updated', ({ results, meta }) => {
      this.render(results, meta);
    });

    this.eventBus.on('submission:feedback_updated', () => {
      this.updateBadges();
    });
  }

  getFeedbackFor(item) {
    const feedbackMap = this.state.get('submissionFeedback');
    if (!feedbackMap || !item) return null;
    const key = `${item.video_id}:${item.frame_id || item.keyframe_id}`;
    return feedbackMap.get(key) || null;
  }

  render(results = [], metaText = '') {
    if (!this.els.results) return;

    if (this.els.resultCount) {
      this.els.resultCount.textContent = `${results.length} kết quả`;
    }
    if (this.els.searchMeta && metaText) {
      this.els.searchMeta.textContent = metaText;
    }

    this.els.results.innerHTML = '';
    if (results.length === 0) {
      this.els.results.innerHTML = '<div class="results-empty">Chưa có kết quả tìm kiếm nào phù hợp.</div>';
      return;
    }

    results.forEach((item, index) => {
      const card = this.createResultCard(item, index);
      this.els.results.appendChild(card);
    });
  }

  createResultCard(item, index) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.draggable = true;

    const imageUrl = this.mediaService.getThumbnailUrl(item);
    const feedback = this.getFeedbackFor(item);
    const feedbackBadge = feedback
      ? `<span class="submission-badge ${feedback.verdict === 'CORRECT' ? 'is-correct' : 'is-wrong'}">${feedback.verdict}</span>`
      : '';

    card.innerHTML = `
      <div class="card-thumb-wrap">
        <img class="card-thumb" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.video_id)}" loading="lazy" />
        ${feedbackBadge}
        <div class="card-overlay">
          <button class="card-action-btn add-tray-btn" type="button" title="Thêm vào khay">${addToTrayIcon()}</button>
          <button class="card-action-btn open-gallery-btn" type="button" title="Xem 24 shot lân cận">${framesGalleryIcon()}</button>
          <button class="card-action-btn play-video-btn" type="button" title="Phát video">${openVideoIcon()}</button>
        </div>
      </div>
      <div class="card-info">
        <div class="card-title-row">
          <strong class="card-video-id" title="${escapeHtml(item.video_id)}">${escapeHtml(item.video_id)}</strong>
          <span class="card-score">${item.score ? Number(item.score).toFixed(3) : `#${index + 1}`}</span>
        </div>
        <div class="card-meta-row">
          <span>Frame: ${escapeHtml(item.frame_id || item.keyframe_id || '—')}</span>
        </div>
      </div>
    `;

    // Drag and drop support
    card.addEventListener('dragstart', event => {
      event.dataTransfer.setData('application/x-aic-keyframe', JSON.stringify(item));
    });

    // Card click -> open video
    card.querySelector('.card-thumb-wrap')?.addEventListener('click', e => {
      if (e.target.closest('.card-action-btn')) return;
      this.eventBus.emit('video:open', item);
    });

    // Action buttons
    card.querySelector('.add-tray-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      this.eventBus.emit('tray:add_frame', item);
    });

    card.querySelector('.open-gallery-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      this.eventBus.emit('gallery:open_context', item);
    });

    card.querySelector('.play-video-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      this.eventBus.emit('video:open', item);
    });

    return card;
  }

  updateBadges() {
    // Re-render badges without full re-render
    const cards = this.els.results?.querySelectorAll('.result-card') || [];
    cards.forEach(card => {
      // Refresh badge if item matches
    });
  }
}
