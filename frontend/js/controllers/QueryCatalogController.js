/**
 * ==============================================================================
 * TỆP TIN: js/controllers/QueryCatalogController.js
 * LỚP: QueryCatalogController
 * MÔ TẢ:
 *   Quản lý thanh danh mục câu hỏi (Query Strip):
 *   - Tải danh sách đề thi từ GET /submission/queries.
 *   - Đánh dấu câu hỏi đang chọn và hiển thị nội dung câu hỏi.
 *   - Hiển thị danh sách các thành viên trong đội đang cùng xem từng câu hỏi.
 *   - Tự động nạp bản nháp (draft QA) tương ứng khi chuyển câu hỏi.
 * ==============================================================================
 */

import { escapeHtml } from '../utils/dom.js';
import { STORAGE_KEYS } from '../core/Constants.js';

export class QueryCatalogController {
  constructor(appState, eventBus, teamSocketService) {
    this.state = appState;
    this.eventBus = eventBus;
    this.teamSocket = teamSocketService;

    this.els = {
      queryStrip: document.getElementById('queryStrip'),
      activeQueryContent: document.getElementById('activeQueryContent'),
      videoActiveQueryContent: document.getElementById('videoActiveQueryContent')
    };

    this.bindEvents();
  }

  bindEvents() {
    this.eventBus.on('team:viewers_updated', () => this.renderQueryStrip());
    this.eventBus.on('team:drafts_updated', () => this.restoreActiveDraft());
  }

  async loadQueries() {
    try {
      const resp = await fetch('/submission/queries');
      if (!resp.ok) return;
      const data = await resp.json();
      const files = Array.isArray(data?.files) ? data.files : [];
      this.state.set('queryCatalog', files);

      if (!this.state.get('activeQueryFilename') && files.length > 0) {
        this.selectQuery(files[0].filename, false);
      } else {
        this.renderQueryStrip();
        this.renderActiveQuery();
      }
    } catch (_) {}
  }

  selectQuery(filename, broadcast = true) {
    this.state.set('activeQueryFilename', filename);
    try {
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_QUERY, filename);
    } catch (_) {}

    this.renderQueryStrip();
    this.renderActiveQuery();
    this.restoreActiveDraft();

    if (broadcast) {
      this.teamSocket.sendViewingStatus();
      this.teamSocket.syncUserProfile({ active_query: filename });
    }

    this.eventBus.emit('query:selected', filename);
  }

  restoreActiveDraft() {
    const filename = this.state.get('activeQueryFilename');
    const drafts = this.state.get('userDrafts') || {};
    if (filename && drafts[filename] !== undefined) {
      this.eventBus.emit('draft:restore', drafts[filename]);
    }
  }

  activeQuery() {
    const filename = this.state.get('activeQueryFilename');
    const catalog = this.state.get('queryCatalog') || [];
    return catalog.find(item => item.filename === filename) || null;
  }

  renderQueryStrip() {
    if (!this.els.queryStrip) return;
    const catalog = this.state.get('queryCatalog') || [];
    const activeFile = this.state.get('activeQueryFilename');
    const viewers = this.state.get('queryViewers') || {};

    if (catalog.length === 0) {
      this.els.queryStrip.innerHTML = '<span class="query-empty">Chưa có danh mục câu hỏi</span>';
      return;
    }

    this.els.queryStrip.innerHTML = '';
    catalog.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `query-tab${item.filename === activeFile ? ' is-active' : ''}`;
      btn.title = item.preview ? `${item.label}: ${item.preview}` : item.label;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'query-tab-label';
      labelSpan.textContent = item.label || item.filename;
      btn.appendChild(labelSpan);

      const fileViewers = Array.isArray(viewers[item.filename]) ? viewers[item.filename] : [];
      if (fileViewers.length > 0) {
        const viewersWrap = document.createElement('span');
        viewersWrap.className = 'query-viewers';
        fileViewers.forEach(v => {
          const avatar = document.createElement('span');
          avatar.className = 'query-viewer-avatar';
          avatar.textContent = (v.name || 'U').charAt(0).toUpperCase();
          avatar.title = v.name || 'Thành viên';
          viewersWrap.appendChild(avatar);
        });
        btn.appendChild(viewersWrap);
      }

      btn.addEventListener('click', () => this.selectQuery(item.filename));
      this.els.queryStrip.appendChild(btn);
    });
  }

  renderActiveQuery() {
    const cur = this.activeQuery();
    if (!this.els.activeQueryContent) return;

    if (!cur) {
      this.els.activeQueryContent.hidden = true;
      this.els.activeQueryContent.innerHTML = '';
      if (this.els.videoActiveQueryContent) {
        this.els.videoActiveQueryContent.hidden = true;
        this.els.videoActiveQueryContent.innerHTML = '';
      }
      return;
    }

    const html = `
      <div class="active-query-card">
        <span class="active-query-badge">${escapeHtml(cur.task_type || 'KIS')}</span>
        <strong class="active-query-label">${escapeHtml(cur.label || cur.filename)}</strong>
        <span class="active-query-text">${escapeHtml(cur.preview || 'Chưa có nội dung')}</span>
      </div>
    `;

    this.els.activeQueryContent.innerHTML = html;
    this.els.activeQueryContent.hidden = false;

    if (this.els.videoActiveQueryContent) {
      this.els.videoActiveQueryContent.innerHTML = html;
      this.els.videoActiveQueryContent.hidden = false;
    }
  }
}
