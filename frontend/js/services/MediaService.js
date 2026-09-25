/**
 * ==============================================================================
 * TỆP TIN: js/services/MediaService.js
 * LỚP: MediaService
 * MÔ TẢ:
 *   Quản lý toàn bộ tài nguyên đa phương tiện và dữ liệu phụ trợ:
 *   - Sinh URL cho thumbnail, keyframe gốc, video stream HLS/MP4.
 *   - Tải bảng tra cứu video_fps.json để tính chính xác frame FPS.
 *   - Lấy thông tin văn bản OCR/Caption (GET /frame-text/...)
 *   - Lấy dữ liệu lời thoại ASR toàn bộ video (GET /video-asr/{video_id})
 * ==============================================================================
 */

export class MediaService {
  constructor(appState, eventBus) {
    this.state = appState;
    this.eventBus = eventBus;
    this.asrCache = new Map();
  }

  getThumbnailUrl(item) {
    if (!item) return '';
    return item.thumbnail_url || item.image_url || `/thumbnail/${encodeURIComponent(item.keyframe_id || '')}`;
  }

  getKeyframeUrl(item) {
    if (!item) return '';
    return item.image_url || `/keyframe/${encodeURIComponent(item.keyframe_id || '')}`;
  }

  getVideoStreamUrl(videoId) {
    return `/videos/${encodeURIComponent(videoId)}`;
  }

  getHlsManifestUrl(videoId) {
    return `/hls/${encodeURIComponent(videoId)}/master.m3u8`;
  }

  async loadVideoFps() {
    try {
      const resp = await fetch('/video_fps.json');
      if (resp.ok) {
        const data = await resp.json();
        this.state.set('videoFps', data);
        return data;
      }
    } catch (_) {}
    return { default_fps: 25, overrides: {} };
  }

  getFpsForVideo(videoId) {
    const fpsConfig = this.state.get('videoFps') || { default_fps: 25, overrides: {} };
    return (fpsConfig.overrides && fpsConfig.overrides[videoId]) || fpsConfig.default_fps || 25;
  }

  async fetchFrameText(keyframeId) {
    if (!keyframeId) return null;
    try {
      const resp = await fetch(`/frame-text/${encodeURIComponent(keyframeId)}`);
      if (resp.ok) return await resp.json();
    } catch (_) {}
    return null;
  }

  async fetchVideoAsr(videoId) {
    if (!videoId) return null;
    if (this.asrCache.has(videoId)) {
      return this.asrCache.get(videoId);
    }
    try {
      const resp = await fetch(`/video-asr/${encodeURIComponent(videoId)}`);
      if (resp.ok) {
        const data = await resp.json();
        this.asrCache.set(videoId, data);
        return data;
      }
    } catch (_) {}
    return null;
  }

  async fetchShotContext(videoId, shotId) {
    try {
      const resp = await fetch(`/shot-context/${encodeURIComponent(videoId)}/${encodeURIComponent(shotId)}`);
      if (resp.ok) return await resp.json();
    } catch (_) {}
    return [];
  }

  async fetchFrameContext(videoId) {
    try {
      const resp = await fetch(`/frame-context/${encodeURIComponent(videoId)}`);
      if (resp.ok) return await resp.json();
    } catch (_) {}
    return [];
  }
}
