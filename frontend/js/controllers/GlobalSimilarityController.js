/**
 * ==============================================================================
 * TỆP TIN: js/controllers/GlobalSimilarityController.js
 * LỚP: GlobalSimilarityController
 * MÔ TẢ:
 *   Quản lý tìm kiếm tương tự bằng hình ảnh (Image Similarity Query):
 *   - Bật/tắt popover tìm ảnh từ nút icon trên Topbar hoặc phím tắt 'I'.
 *   - Vùng thả ảnh (Dropzone) nhận frame kéo thả từ kết quả hoặc file ngoài.
 *   - Thanh trượt tùy chỉnh trọng số Chữ (%) và Ảnh (%).
 *   - Kích hoạt tìm kiếm kết hợp khi nhấn Enter trong ô mô tả thêm.
 * ==============================================================================
 */

import { escapeHtml } from '../utils/dom.js';

export class GlobalSimilarityController {
  constructor(appState, eventBus) {
    this.state = appState;
    this.eventBus = eventBus;

    this.els = {
      globalSimilarityBtn: document.getElementById('globalSimilarityBtn'),
      globalSimilarityPopover: document.getElementById('globalSimilarityPopover'),
      globalSimilarityDropzone: document.getElementById('globalSimilarityDropzone'),
      globalSimilarityDropzoneText: document.getElementById('globalSimilarityDropzoneText'),
      globalSimilarityQuery: document.getElementById('globalSimilarityQuery'),
      globalSimilarityWeight: document.getElementById('globalSimilarityWeight'),
      globalSimilarityWeightValue: document.getElementById('globalSimilarityWeightValue'),
      globalSimilarityImageWeightValue: document.getElementById('globalSimilarityImageWeightValue')
    };

    this.bindEvents();
  }

  bindEvents() {
    if (this.els.globalSimilarityBtn) {
      this.els.globalSimilarityBtn.addEventListener('click', () => this.togglePopover());
    }

    if (this.els.globalSimilarityQuery) {
      this.els.globalSimilarityQuery.addEventListener('input', () => {
        this.state.set('similarityQuery', this.els.globalSimilarityQuery.value, true);
      });
      this.els.globalSimilarityQuery.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          this.eventBus.emit('search:trigger', { stageIndex: 0 });
        }
      });
    }

    if (this.els.globalSimilarityWeight) {
      this.els.globalSimilarityWeight.addEventListener('input', () => {
        const weight = Number(this.els.globalSimilarityWeight.value);
        this.state.set('similarityTextWeight', weight, true);
        if (this.els.globalSimilarityWeightValue) this.els.globalSimilarityWeightValue.textContent = weight;
        if (this.els.globalSimilarityImageWeightValue) this.els.globalSimilarityImageWeightValue.textContent = 100 - weight;
      });
    }

    if (this.els.globalSimilarityDropzone) {
      this.els.globalSimilarityDropzone.addEventListener('dragover', e => {
        e.preventDefault();
        this.els.globalSimilarityDropzone.style.borderColor = 'var(--text-primary)';
        this.els.globalSimilarityDropzone.style.backgroundColor = 'var(--bg-surface-hover)';
      });

      this.els.globalSimilarityDropzone.addEventListener('dragleave', () => {
        this.els.globalSimilarityDropzone.style.borderColor = 'var(--border-subtle)';
        this.els.globalSimilarityDropzone.style.backgroundColor = 'transparent';
      });

      this.els.globalSimilarityDropzone.addEventListener('drop', e => {
        e.preventDefault();
        this.els.globalSimilarityDropzone.style.borderColor = 'var(--border-subtle)';
        this.els.globalSimilarityDropzone.style.backgroundColor = 'transparent';
        try {
          const item = JSON.parse(e.dataTransfer.getData('application/x-aic-keyframe'));
          this.setSimilarityItem(item);
        } catch (_) {}
      });
    }
  }

  togglePopover(forceState = null) {
    if (!this.els.globalSimilarityPopover || !this.els.globalSimilarityBtn) return;
    const isExpanded = this.els.globalSimilarityBtn.getAttribute('aria-expanded') === 'true';
    const next = forceState !== null ? forceState : !isExpanded;

    this.els.globalSimilarityBtn.setAttribute('aria-expanded', String(next));
    this.els.globalSimilarityBtn.classList.toggle('is-active', next);
    this.els.globalSimilarityPopover.hidden = !next;

    if (!next) {
      this.state.set('similarityItem', null);
      this.state.set('similarityQuery', '');
      this.state.set('queryMode', 'text');
      if (this.els.globalSimilarityDropzone) {
        this.els.globalSimilarityDropzone.innerHTML = `<strong id="globalSimilarityDropzoneText" style="color: var(--text-primary); font-size: 13px;">Thả ảnh vào đây</strong>`;
      }
      if (this.els.globalSimilarityQuery) {
        this.els.globalSimilarityQuery.value = '';
      }
    }
  }

  setSimilarityItem(item) {
    if (!item) return;
    this.state.set('similarityItem', item);
    this.state.set('queryMode', 'similarity');
    this.togglePopover(true);

    const imageUrl = item.thumbnail_url || item.image_url || `/thumbnail/${encodeURIComponent(item.keyframe_id)}`;
    if (this.els.globalSimilarityDropzone) {
      this.els.globalSimilarityDropzone.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">
          <img src="${escapeHtml(imageUrl)}" alt="Similarity keyframe" style="width: 48px; height: 36px; object-fit: cover; border-radius: 4px;" />
          <div style="font-size: 12px; text-align: left;">
            <strong style="display: block;">${escapeHtml(item.video_id)}</strong>
            <span style="color: var(--text-secondary);">#${escapeHtml(item.frame_id || item.keyframe_id)}</span>
          </div>
        </div>
      `;
    }
  }
}
