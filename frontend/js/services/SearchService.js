/**
 * ==============================================================================
 * TỆP TIN: js/services/SearchService.js
 * LỚP: SearchService
 * MÔ TẢ:
 *   Xử lý toàn bộ các giao tiếp tìm kiếm với Backend AI thông qua Gateway:
 *   - POST /search: Tìm kiếm đơn lẻ đa phương thức (Text, Image, OCR, ASR).
 *   - POST /temporal-search: Tìm kiếm chuỗi sự kiện theo thời gian (Temporal stages).
 *   - POST /translate-query: Dịch câu truy vấn tiếng Việt sang tiếng Anh.
 *   - POST /api/log-latency: Ghi nhận phân tích độ trễ chặng mạng và backend.
 *   - GET /health: Kiểm tra trạng thái sẵn sàng của backend.
 * ==============================================================================
 */

export class SearchService {
  constructor(appState, eventBus) {
    this.state = appState;
    this.eventBus = eventBus;
  }

  async refreshHealth() {
    try {
      const response = await fetch('/health');
      const payload = await response.json();
      this.state.set('backend', payload);
      this.eventBus.emit('health:updated', payload);
      return payload;
    } catch (err) {
      this.state.set('backend', null);
      this.eventBus.emit('health:updated', null);
      throw err;
    }
  }

  async translateQuery(sourceText) {
    const text = String(sourceText || '').trim();
    if (!text) return '';
    const response = await fetch('/translate-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || `Translate failed HTTP ${response.status}`);
    }
    return String(payload.translated_query || '').trim();
  }

  async searchSingle(body) {
    const clientEpoch = Date.now();
    const startedAt = performance.now();
    const response = await fetch('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const finishedAt = performance.now();
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || `Search failed HTTP ${response.status}`);
    }
    return {
      payload,
      timings: {
        startedAt,
        finishedAt,
        clientEpoch,
        duration: finishedAt - startedAt
      }
    };
  }

  async temporalSearch(body) {
    const clientEpoch = Date.now();
    const startedAt = performance.now();
    const response = await fetch('/temporal-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const finishedAt = performance.now();
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || `Temporal search failed HTTP ${response.status}`);
    }
    return {
      payload,
      timings: {
        startedAt,
        finishedAt,
        clientEpoch,
        duration: finishedAt - startedAt
      }
    };
  }

  async resetTemporalSession(sessionId) {
    if (!sessionId) return;
    try {
      const response = await fetch('/temporal-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', session_id: sessionId })
      });
      return await response.json().catch(() => ({}));
    } catch (_) {
      // Backend session expiration is safe to ignore
    }
  }

  logLatencyMetrics({ user, path, transitUpMs, serverMs, transitDownMs, rttMs, clientEpoch }) {
    fetch('/api/log-latency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: user || 'Client',
        path: path || '/search',
        transit_up_ms: transitUpMs,
        server_ms: serverMs,
        transit_down_ms: transitDownMs,
        rtt_ms: rttMs,
        client_epoch: clientEpoch
      })
    }).catch(() => {});
  }
}
