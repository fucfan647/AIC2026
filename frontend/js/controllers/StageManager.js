/**
 * ==============================================================================
 * TỆP TIN: js/controllers/StageManager.js
 * LỚP: StageManager
 * MÔ TẢ:
 *   Quản lý toàn bộ các chặng tìm kiếm theo thời gian (Temporal Stages A, B, C...):
 *   - Tạo / Xóa các stage tìm kiếm chuỗi hành động.
 *   - Nhận diện câu tiếng Việt và tự động gọi dịch thuật sang tiếng Anh.
 *   - Điều khiển các thanh trượt trọng số đa phương thức (Chữ, OCR, ASR).
 *   - Lắng nghe phím tắt 'A' (+Stage), 'D' (-Stage), và Enter để kích hoạt tìm kiếm.
 * ==============================================================================
 */

import { escapeHtml, textQueryIcon, ocrQueryIcon } from '../utils/dom.js';

export class StageManager {
  constructor(appState, eventBus, searchService) {
    this.state = appState;
    this.eventBus = eventBus;
    this.searchService = searchService;

    this.els = {
      stageList: document.getElementById('stageList'),
      videoFilter: document.getElementById('videoFilter')
    };

    this.bindEvents();
    this.render();
  }

  bindEvents() {
    if (this.els.stageList) {
      this.els.stageList.addEventListener('keydown', event => {
        if (event.target.matches('.text-query, .stage-ocr-query, .stage-asr-query') && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          const card = event.target.closest('.stage-card');
          const stageIndex = this.state.get('stages').findIndex(stage => String(stage.id) === String(card?.dataset.stageId));
          this.eventBus.emit('search:trigger', { stageIndex });
        }
      });
    }

    if (this.els.videoFilter) {
      this.els.videoFilter.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          this.eventBus.emit('search:trigger', { stageIndex: null });
        }
      });
    }
  }

  looksLikeVietnamese(text) {
    if (!text) return false;
    const vnChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    return vnChars.test(text);
  }

  addTemporalStage() {
    const stages = [...this.state.get('stages')];
    if (stages.length >= 5) return;

    const lastStage = stages[stages.length - 1];
    const lastHasContent = Boolean(
      String(lastStage?.query || '').trim() ||
      String(lastStage?.ocrQuery || '').trim() ||
      String(lastStage?.asrQuery || '').trim()
    );
    if (lastStage && !lastStage.isCompleted && !lastHasContent) {
      lastStage.temporalExpanded = true;
      this.state.set('stages', stages);
      this.render();
      setTimeout(() => {
        const card = this.els.stageList?.querySelector(`.stage-card[data-stage-id="${lastStage.id}"] .text-query`);
        card?.focus();
      }, 50);
      return;
    }

    const nextIndex = stages.length;
    const nextLetter = this.state.stageLetter(nextIndex);
    const newStage = {
      id: Date.now(),
      name: `Hành động ${nextLetter}`,
      query: '',
      translatedQuery: '',
      ocrQuery: '',
      asrQuery: '',
      ocrWeight: 41,
      asrWeight: 20,
      isCompleted: false,
      temporalExpanded: true
    };
    stages.push(newStage);
    this.state.set('stages', stages);
    this.render();

    setTimeout(() => {
      const card = this.els.stageList?.querySelector(`.stage-card[data-stage-id="${newStage.id}"] .text-query`);
      card?.focus();
    }, 50);
  }

  removeStage(stageId) {
    let stages = [...this.state.get('stages')];
    if (stages.length <= 1) return;
    stages = stages.filter(s => s.id !== stageId);
    stages.forEach((stage, idx) => {
      stage.name = `Hành động ${this.state.stageLetter(idx)}`;
    });
    this.state.set('stages', stages);
    this.render();
  }


  collectQueries() {
    return this.state.get('stages').map(s => s.query.trim());
  }

  collectOcrQueries() {
    return this.state.get('stages').map(s => (s.ocrQuery || '').trim());
  }

  collectAsrQueries() {
    return this.state.get('stages').map(s => (s.asrQuery || '').trim());
  }

  getVideoFilter() {
    return this.els.videoFilter ? this.els.videoFilter.value.trim() : '';
  }

  render() {
    if (!this.els.stageList) return;
    const stages = this.state.get('stages') || [];
    this.els.stageList.innerHTML = '';

    stages.forEach((stage, index) => {
      const card = document.createElement('div');
      card.className = 'stage-card';
      card.dataset.stageId = String(stage.id);

      const letter = this.state.stageLetter(index);
      const isMulti = stages.length > 1;

      card.innerHTML = `
        <div class="stage-head">
          <strong class="stage-title">${letter}. ${escapeHtml(stage.name || `Hành động ${letter}`)}</strong>
          <div class="stage-actions">
            ${isMulti ? `<button class="ghost compact remove-stage-btn" type="button" title="Xóa stage này">&times;</button>` : ''}
          </div>
        </div>
        <div class="stage-body">
          <div class="query-field-wrap">
            <span class="query-field-icon">${textQueryIcon()}</span>
            <input class="text-query" type="text" placeholder="Mô tả hành động ${letter} (Enter để tìm)..." value="${escapeHtml(stage.query || '')}" />
          </div>
          <span class="translation-preview" ${stage.translatedQuery ? '' : 'hidden'}>
            ${stage.translatedQuery ? `(EN: ${escapeHtml(stage.translatedQuery)})` : ''}
          </span>
          <div class="query-field-wrap stage-extra-field" style="margin-top: 6px;">
            <span class="query-field-icon">${ocrQueryIcon()}</span>
            <input class="stage-ocr-query" type="text" placeholder="Chữ xuất hiện trong video (OCR)..." value="${escapeHtml(stage.ocrQuery || '')}" />
          </div>
        </div>
      `;

      const textInput = card.querySelector('.text-query');
      textInput.addEventListener('input', () => {
        stage.query = textInput.value;
      });

      const ocrInput = card.querySelector('.stage-ocr-query');
      ocrInput.addEventListener('input', () => {
        stage.ocrQuery = ocrInput.value;
      });

      const removeBtn = card.querySelector('.remove-stage-btn');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => this.removeStage(stage.id));
      }

      this.els.stageList.appendChild(card);
    });

    // Add +Stage button below
    const addWrap = document.createElement('div');
    addWrap.style.marginTop = '8px';
    addWrap.innerHTML = `
      <button id="addStageBtn" class="ghost compact" type="button" style="width: 100%; border: 1px dashed var(--border-subtle); padding: 6px 12px; font-size: 12px;">
        + Thêm chặng thời gian (+Stage)
      </button>
    `;
    addWrap.querySelector('#addStageBtn').addEventListener('click', () => this.addTemporalStage());
    this.els.stageList.appendChild(addWrap);
  }
}
