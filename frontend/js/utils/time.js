/**
 * ==============================================================================
 * TỆP TIN: js/utils/time.js
 * MÔ TẢ:
 *   Cung cấp các hàm xử lý và định dạng thời gian:
 *   - formatVideoTime: Chuyển đổi giây thành chuỗi hiển thị mm:ss.
 *   - formatMilliseconds: Định dạng thời gian độ trễ ms / s với đơn vị phù hợp.
 *   - answerTimeMs: Trích xuất timestamp ms của một frame phục vụ nộp bài / seek.
 * ==============================================================================
 */

export function formatVideoTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatMilliseconds(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  const numeric = Number(value);
  if (numeric >= 1000) {
    return `${(numeric / 1000).toFixed(2)} s`;
  }
  return `${Math.round(numeric)} ms`;
}

export function answerTimeMs(item) {
  if (!item) return 0;
  if (item.answer_time_ms !== undefined && item.answer_time_ms !== null) {
    return Number(item.answer_time_ms);
  }
  if (item.start_time !== undefined && item.start_time !== null) {
    return Math.round(Number(item.start_time) * 1000);
  }
  if (item.pts_time !== undefined && item.pts_time !== null) {
    return Math.round(Number(item.pts_time) * 1000);
  }
  return 0;
}
