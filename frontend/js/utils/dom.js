/**
 * ==============================================================================
 * TỆP TIN: js/utils/dom.js
 * MÔ TẢ:
 *   Cung cấp các hàm tiện ích thao tác với DOM và tạo SVG icon:
 *   - escapeHtml: Chống tấn công XSS khi nội suy chuỗi HTML.
 *   - Icon renderers: volume, play, trash, zoom, submit, text, ocr, v.v.
 *   - refreshIcons: Kích hoạt render icon Lucide trên cây DOM.
 * ==============================================================================
 */

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function volumeIcon(volume) {
  if (volume <= 0.001) {
    return '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5Z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
  }
  if (volume < 0.5) {
    return '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5Z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
  }
  return '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5Z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>';
}

export function playIcon(paused) {
  if (paused) {
    return '<svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>';
  }
  return '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
}

export function trashIcon() {
  return '<svg viewBox="0 0 24 24"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
}

export function textQueryIcon() {
  return '<svg viewBox="0 0 24 24"><path d="M4 7V4h16v3"></path><path d="M12 4v16"></path><path d="M8 20h8"></path></svg>';
}

export function ocrQueryIcon() {
  return '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M7 17V7h4a3 3 0 0 1 0 6H7"></path><path d="m13 13 4 4"></path></svg>';
}

export function addToTrayIcon() {
  return '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline><line x1="12" y1="8" x2="12" y2="14"></line><line x1="9" y1="11" x2="15" y2="11"></line></svg>';
}

export function openVideoIcon() {
  return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>';
}

export function framesGalleryIcon() {
  return '<svg viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>';
}

export function zoomIcon() {
  return '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>';
}

export function submitIcon() {
  return '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
}

export function refreshIcons(root = document) {
  if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root });
  }
}
