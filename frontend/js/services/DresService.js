/**
 * ==============================================================================
 * TỆP TIN: js/services/DresService.js
 * LỚP: DresService
 * MÔ TẢ:
 *   Xử lý toàn bộ các giao tiếp chấm điểm và nộp bài:
 *   - Đăng nhập máy chủ DRES và lấy phiên đánh giá (evaluations).
 *   - Gửi payload nộp bài KIS / TRAKE / QA lên DRES qua gateway.
 *   - Nộp bài offline xuất ra tệp CSV theo format BTC.
 * ==============================================================================
 */

export class DresService {
  constructor(appState, eventBus) {
    this.state = appState;
    this.eventBus = eventBus;
  }

  async login({ serverUrl, username, password }) {
    const response = await fetch('/dres/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server_url: serverUrl,
        username,
        password
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || `Đăng nhập DRES thất bại: HTTP ${response.status}`);
    }
    return payload;
  }

  async listEvaluations({ serverUrl, sessionId }) {
    const response = await fetch('/dres/evaluations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server_url: serverUrl,
        session_id: sessionId
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || `Lấy danh sách evaluation thất bại: HTTP ${response.status}`);
    }
    return Array.isArray(payload) ? payload : [];
  }

  async submitToDres({ serverUrl, sessionId, evaluationId, submission }) {
    const response = await fetch('/dres/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server_url: serverUrl,
        session_id: sessionId,
        evaluation_id: evaluationId,
        ...submission
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || `Nộp DRES thất bại: HTTP ${response.status}`);
    }
    return payload;
  }

  async submitCsv({ items, submission, activeQueryFilename, memberName }) {
    const response = await fetch('/submission/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: activeQueryFilename,
        member_name: memberName,
        task_type: submission?.task_type,
        submission,
        items
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || `Nộp CSV thất bại: HTTP ${response.status}`);
    }
    return payload;
  }
}
