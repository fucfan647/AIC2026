/**
 * ==============================================================================
 * TỆP TIN: js/core/Constants.js
 * MÔ TẢ:
 *   Định nghĩa các hằng số dùng chung trên toàn bộ ứng dụng:
 *   - Khóa lưu trữ LocalStorage / SessionStorage.
 *   - Các thiết lập mặc định cho DRES, mô hình nhúng và giao diện.
 * ==============================================================================
 */

export const STORAGE_KEYS = {
  DRES_SESSION: 'aic_dres_session_v1',
  ACTIVE_QUERY: 'aic_active_query_v1',
  MEMBER_NAME: 'aic_team_member_v1',
  SUBMISSION_MODE: 'aic_submission_mode_v1',
  THEME: 'theme',
  TRAKE_DRAWER_OPEN: 'aic_trake_drawer_open'
};

export const DEFAULT_CONFIG = {
  DRES_SERVER_URL: 'http://192.168.28.151:5000',
  DEFAULT_FPS: 25,
  MAX_TRAKE_EVENTS: 5,
  POLL_INTERVAL_MS: 5000,
  VIEWING_HEARTBEAT_MS: 20000,
  DRAFT_DEBOUNCE_MS: 600
};

export const TASK_TYPES = {
  KIS: 'kis',
  TRAKE: 'trake',
  QA: 'qa'
};

export const SUBMISSION_MODES = {
  DRES: 'dres',
  CSV: 'csv'
};
