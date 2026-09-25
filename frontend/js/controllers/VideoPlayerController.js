/**
 * ==============================================================================
 * TỆP TIN: js/controllers/VideoPlayerController.js
 * LỚP: VideoPlayerController
 * MÔ TẢ:
 *   Quản lý toàn bộ trình phát video HLS/MP4 trong Modal:
 *   - Khởi tạo luồng phát HLS (hls.js) với cơ chế tự động fallback sang MP4 gốc.
 *   - Hệ thống điều khiển: Play/Pause, tua 5s, điều chỉnh tốc độ (0.25x - 10x), âm lượng.
 *   - Thanh Filmstrip Scrubber: Tua mượt theo con lăn chuột/trackpad với HUD hiển thị thời gian.
 *   - Tính toán Frame ID chính xác dựa trên video_fps.json và chụp frame (Capture Frame).
 *   - Tích hợp phím tắt: Space (phát/dừng), Mũi tên trái/phải (tua 1s/10s), Esc (đóng video).
 * ==============================================================================
 */

import { formatVideoTime, answerTimeMs } from '../utils/time.js';
import { volumeIcon, playIcon, escapeHtml } from '../utils/dom.js';

export class VideoPlayerController {
  constructor(appState, eventBus, mediaService) {
    this.state = appState;
    this.eventBus = eventBus;
    this.mediaService = mediaService;
    this.activeHls = null;

    this.els = {
      videoModal: document.getElementById('videoModal'),
      modalTitle: document.getElementById('modalTitle'),
      closeVideoBtn: document.getElementById('closeVideoBtn'),
      player: document.getElementById('player'),
      videoShell: document.getElementById('videoShell'),
      videoScrubHud: document.getElementById('videoScrubHud'),
      videoPlayBtn: document.getElementById('videoPlayBtn'),
      videoBackBtn: document.getElementById('videoBackBtn'),
      videoForwardBtn: document.getElementById('videoForwardBtn'),
      videoVolumeBtn: document.getElementById('videoVolumeBtn'),
      videoVolumePopover: document.getElementById('videoVolumePopover'),
      videoVolumeSlider: document.getElementById('videoVolumeSlider'),
      videoVolumeValue: document.getElementById('videoVolumeValue'),
      videoVolumeControl: document.getElementById('videoVolumeControl'),
      videoTime: document.getElementById('videoTime'),
      videoProgress: document.getElementById('videoProgress'),
      videoSpeedBtn: document.getElementById('videoSpeedBtn'),
      videoSpeedControl: document.getElementById('videoSpeedControl'),
      videoSpeedMenu: document.getElementById('videoSpeedMenu'),
      captureFrameBtn: document.getElementById('captureFrameBtn'),
      videoSubmitCurrentBtn: document.getElementById('videoSubmitCurrentBtn'),
      videoFrameStrip: document.getElementById('videoFrameStrip')
    };

    this.bindEvents();
  }

  bindEvents() {
    this.eventBus.on('video:open', item => this.open(item));
    this.eventBus.on('video:close', () => this.close());

    // Modal backdrop click
    document.querySelector('[data-close-video]')?.addEventListener('click', () => this.close());
    this.els.closeVideoBtn?.addEventListener('click', () => this.close());

    // Play / Pause
    this.els.videoPlayBtn?.addEventListener('click', () => this.togglePlay());
    this.els.player?.addEventListener('click', () => this.togglePlay());

    // Back / Forward 5s
    this.els.videoBackBtn?.addEventListener('click', () => this.seekDelta(-5));
    this.els.videoForwardBtn?.addEventListener('click', () => this.seekDelta(5));

    // Progress slider
    this.els.videoProgress?.addEventListener('input', () => {
      const dur = this.els.player.duration || 0;
      if (dur > 0) {
        this.els.player.currentTime = (Number(this.els.videoProgress.value) / 1000) * dur;
        this.updateControls();
      }
    });

    // Volume
    this.els.videoVolumeBtn?.addEventListener('click', () => {
      this.togglePopover(this.els.videoVolumePopover, this.els.videoVolumeBtn);
    });
    this.els.videoVolumeSlider?.addEventListener('input', () => {
      const vol = Math.min(1, Math.max(0, Number(this.els.videoVolumeSlider.value) / 100));
      this.els.player.volume = vol;
      this.els.player.muted = vol === 0;
      this.updateControls();
    });

    // Speed menu
    this.els.videoSpeedBtn?.addEventListener('click', () => {
      this.togglePopover(this.els.videoSpeedMenu, this.els.videoSpeedBtn);
    });
    document.querySelectorAll('.video-speed-option').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setPlaybackRate(Number(btn.dataset.rate));
        this.closePopovers();
      });
    });

    // Close popovers on outer click
    document.addEventListener('click', e => {
      if (!this.els.videoSpeedControl?.contains(e.target) && !this.els.videoVolumeControl?.contains(e.target)) {
        this.closePopovers();
      }
    });

    // Player events
    if (this.els.player) {
      this.els.player.addEventListener('timeupdate', () => {
        this.updateControls();
        this.eventBus.emit('video:timeupdate', this.els.player.currentTime);
      });
      this.els.player.addEventListener('loadedmetadata', () => this.updateControls());
      this.els.player.addEventListener('play', () => this.updateControls());
      this.els.player.addEventListener('pause', () => this.updateControls());
    }

    // Wheel scrubbing
    this.els.videoShell?.addEventListener('wheel', e => this.handleWheelScrub(e), { passive: false });
    this.els.videoFrameStrip?.addEventListener('wheel', e => this.handleWheelScrub(e), { passive: false });

    // Capture & Submit
    this.els.captureFrameBtn?.addEventListener('click', () => this.captureDisplayedFrame());
    this.els.videoSubmitCurrentBtn?.addEventListener('click', () => {
      const item = this.getDisplayedFrameItem();
      if (item) this.eventBus.emit('submission:trigger', { item });
    });
  }

  togglePlay() {
    if (!this.els.player) return;
    if (this.els.player.paused) {
      this.els.player.play().catch(() => {});
    } else {
      this.els.player.pause();
    }
  }

  seekDelta(seconds) {
    if (!this.els.player) return;
    const cur = this.els.player.currentTime || 0;
    this.seekTo(cur + seconds, true);
  }

  seekTo(seconds, shouldPlay = false) {
    if (!this.els.player) return;
    const dur = Number.isFinite(this.els.player.duration) ? this.els.player.duration : 0;
    const clamped = Math.max(0, dur > 0 ? Math.min(dur, seconds) : seconds);
    this.els.player.currentTime = clamped;
    this.updateControls();
    if (shouldPlay && this.els.player.paused) {
      this.els.player.play().catch(() => {});
    }
  }

  setPlaybackRate(rate) {
    if (!this.els.player) return;
    this.els.player.playbackRate = rate;
    if (this.els.videoSpeedBtn) {
      this.els.videoSpeedBtn.textContent = `x${rate}`;
    }
    document.querySelectorAll('.video-speed-option').forEach(btn => {
      const isCur = Number(btn.dataset.rate) === rate;
      btn.classList.toggle('is-active', isCur);
      btn.setAttribute('aria-checked', String(isCur));
    });
  }

  togglePopover(popover, button) {
    if (!popover) return;
    const isHidden = popover.hidden;
    this.closePopovers();
    popover.hidden = !isHidden;
    button?.setAttribute('aria-expanded', String(!isHidden));
  }

  closePopovers() {
    if (this.els.videoVolumePopover) this.els.videoVolumePopover.hidden = true;
    if (this.els.videoSpeedMenu) this.els.videoSpeedMenu.hidden = true;
    this.els.videoVolumeBtn?.setAttribute('aria-expanded', 'false');
    this.els.videoSpeedBtn?.setAttribute('aria-expanded', 'false');
  }

  updateControls() {
    if (!this.els.player) return;
    const cur = this.els.player.currentTime || 0;
    const dur = Number.isFinite(this.els.player.duration) ? this.els.player.duration : 0;

    if (this.els.videoTime) {
      this.els.videoTime.textContent = `${formatVideoTime(cur)} / ${formatVideoTime(dur)}`;
    }
    if (this.els.videoProgress && dur > 0) {
      this.els.videoProgress.value = Math.round((cur / dur) * 1000);
    }
    if (this.els.videoPlayBtn) {
      this.els.videoPlayBtn.innerHTML = playIcon(this.els.player.paused);
      this.els.videoPlayBtn.title = this.els.player.paused ? 'Phát' : 'Tạm dừng';
    }
    if (this.els.videoVolumeBtn) {
      this.els.videoVolumeBtn.innerHTML = volumeIcon(this.els.player.muted ? 0 : this.els.player.volume);
    }
  }

  handleWheelScrub(event) {
    if (!this.els.player) return;
    event.preventDefault();
    const delta = event.deltaY || event.deltaX || 0;
    const step = event.shiftKey ? 0.04 : 0.2; // 0.04s ~ 1 frame @ 25fps
    const direction = delta > 0 ? 1 : -1;
    this.seekDelta(direction * step);

    const cur = this.els.player.currentTime || 0;
    this.showScrubHud(`${formatVideoTime(cur)} (${direction > 0 ? '+1' : '-1'}f)`);
  }

  showScrubHud(text) {
    if (!this.els.videoScrubHud) return;
    this.els.videoScrubHud.textContent = text;
    this.els.videoScrubHud.hidden = false;
    clearTimeout(this._hudTimer);
    this._hudTimer = setTimeout(() => {
      if (this.els.videoScrubHud) this.els.videoScrubHud.hidden = true;
    }, 800);
  }

  destroyHls() {
    if (this.activeHls) {
      try {
        this.activeHls.destroy();
      } catch (_) {}
      this.activeHls = null;
    }
  }

  async open(item) {
    if (!item?.video_id) return;
    this.state.set('activeVideoItem', item);
    this.destroyHls();

    const videoId = item.video_id;
    const startSec = answerTimeMs(item) / 1000;

    if (this.els.modalTitle) {
      this.els.modalTitle.textContent = `${videoId} (Frame: ${item.frame_id || item.keyframe_id || '—'})`;
    }

    if (this.els.videoModal) {
      this.els.videoModal.hidden = false;
    }

    const hlsUrl = this.mediaService.getHlsManifestUrl(videoId);
    const mp4Url = this.mediaService.getVideoStreamUrl(videoId);

    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
      this.activeHls = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(this.els.player);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        this.seekTo(startSec, true);
      });
      hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          this.destroyHls();
          this.els.player.src = mp4Url;
          this.seekTo(startSec, true);
        }
      });
    } else {
      this.els.player.src = mp4Url;
      this.seekTo(startSec, true);
    }

    this.renderFilmstrip(item);
    this.eventBus.emit('video:opened', item);
  }

  close() {
    if (!this.els.videoModal || this.els.videoModal.hidden) return;
    this.destroyHls();
    if (this.els.player) {
      this.els.player.pause();
      this.els.player.removeAttribute('src');
      this.els.player.load();
    }
    this.els.videoModal.hidden = true;
    this.state.set('activeVideoItem', null);
    this.eventBus.emit('video:closed');
  }

  async renderFilmstrip(activeItem) {
    if (!this.els.videoFrameStrip) return;
    this.els.videoFrameStrip.innerHTML = '<span class="strip-loading">Đang tải frame lân cận...</span>';

    try {
      const frames = await this.mediaService.fetchFrameContext(activeItem.video_id);
      this.els.videoFrameStrip.innerHTML = '';
      if (!Array.isArray(frames) || frames.length === 0) {
        this.els.videoFrameStrip.innerHTML = '<span class="strip-empty">Không có frame lân cận</span>';
        return;
      }

      frames.forEach(frame => {
        const thumb = document.createElement('div');
        thumb.className = 'strip-thumb-card';
        const imgUrl = this.mediaService.getThumbnailUrl(frame);
        thumb.innerHTML = `<img src="${escapeHtml(imgUrl)}" alt="#${escapeHtml(frame.frame_id)}" loading="lazy" />`;
        thumb.addEventListener('click', () => {
          const sec = answerTimeMs(frame) / 1000;
          this.seekTo(sec, true);
        });
        this.els.videoFrameStrip.appendChild(thumb);
      });
    } catch (_) {
      this.els.videoFrameStrip.innerHTML = '';
    }
  }

  getDisplayedFrameItem() {
    const curItem = this.state.get('activeVideoItem');
    if (!curItem || !this.els.player) return null;

    const curSec = this.els.player.currentTime || 0;
    const fps = this.mediaService.getFpsForVideo(curItem.video_id);
    const frameNumber = Math.max(1, Math.round(curSec * fps));

    return {
      ...curItem,
      frame_id: frameNumber,
      answer_time_ms: Math.round(curSec * 1000)
    };
  }

  captureDisplayedFrame() {
    const item = this.getDisplayedFrameItem();
    if (!item) return;
    this.eventBus.emit('frame:captured', item);
    this.showScrubHud(`Đã thêm Frame #${item.frame_id}`);
  }
}
