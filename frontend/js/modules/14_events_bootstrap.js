/**
 * ==============================================================================
 * TỆP TIN: js/modules/14_events_bootstrap.js
 * MÔ TẢ:
 *   Gắn kết toàn bộ các sự kiện DOM, phím tắt bàn phím và khởi chạy ứng dụng khi tải trang.
 * ==============================================================================
 */


document.addEventListener('pointerdown', unlockCorrectSound, {once: true});
document.addEventListener('keydown', unlockCorrectSound, {once: true});

const savedTheme = localStorage.getItem('theme') || 'light';
if (savedTheme === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark');
}
if (els.themeToggleBtn) {
  els.themeToggleBtn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  });
}
els.embeddingModelToggle.addEventListener('click', async () => {
  if (els.embeddingModelToggle.disabled) return;
  const previousSessionId = state.temporalSessionId;
  state.embeddingModel = state.embeddingModel === 'metaclip' ? 'beit3' : 'metaclip';
  if (state.searchMode === 'temporal' && previousSessionId) {
    try {
      await fetch('/temporal-search', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'reset', session_id: previousSessionId})
      });
    } catch (_) {
      // The local state is still reset; expired backend sessions are harmless.
    }
    state.temporalSessionId = null;
    state.temporalStage = 0;
    invalidateTemporalResults();
    renderStages();
    syncSearchModeControls();
    setLog(`Đã đổi sang ${state.embeddingModel === 'beit3' ? 'BEiT-3' : 'MetaCLIP-2'}; hãy tìm lại từ Query A.`);
    setStatus(state.backend ? 'Đã kết nối' : 'Sẵn sàng.', state.backend ? 'ok' : 'neutral');
  }
  syncEmbeddingModelControls();
});

els.stageList.addEventListener('keydown', event => {
  if (event.target.matches('.text-query, .similarity-query, .stage-asr-query') && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    const card = event.target.closest('.stage-card');
    const stageIndex = state.stages.findIndex(stage => String(stage.id) === String(card?.dataset.stageId));
    performSearch(state.searchMode === 'temporal' ? stageIndex : null);
  }
});
els.videoFilter.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    performSearch();
  }
});
els.clearBtn.addEventListener('click', clearMyVotes);
if (els.trayTabChung) {
  els.trayTabChung.addEventListener('click', () => {
    state.activeTrayTab = 'chung';
    renderSelection();
  });
}
if (els.trayTabTrake) {
  els.trayTabTrake.addEventListener('click', () => {
    state.activeTrayTab = 'trake';
    renderSelection();
  });
}
if (els.traySubmitBtn) els.traySubmitBtn.addEventListener('click', () => submit());
if (els.trakeSubmitBtn) els.trakeSubmitBtn.addEventListener('click', () => submit());
if (els.videoOpenTrakeDrawerBtn) {
  els.videoOpenTrakeDrawerBtn.addEventListener('click', () => toggleTrakeDrawer(true));
}
els.resetBtn.addEventListener('click', resetWorkspace);
els.taskType.addEventListener('change', renderTaskControls);

// Global Similarity Dropzone Logic
els.globalSimilarityBtn.addEventListener('click', () => {
  const isExpanded = els.globalSimilarityBtn.getAttribute('aria-expanded') === 'true';
  const nextExpanded = !isExpanded;
  els.globalSimilarityBtn.setAttribute('aria-expanded', String(nextExpanded));
  els.globalSimilarityBtn.classList.toggle('is-active', nextExpanded);
  els.globalSimilarityPopover.hidden = !nextExpanded;
  if (!nextExpanded) {
    state.similarityItem = null;
    state.similarityQuery = '';
    state.queryMode = 'text';
    if (els.globalSimilarityDropzone) {
      els.globalSimilarityDropzone.style.padding = '12px';
      els.globalSimilarityDropzone.innerHTML = `<strong id="globalSimilarityDropzoneText" style="color: var(--text-primary); font-size: 13px;">Thả ảnh vào đây</strong>`;
    }
    if (els.globalSimilarityQuery) {
      els.globalSimilarityQuery.value = '';
    }
  }
});



els.globalSimilarityQuery.addEventListener('input', () => {
  state.similarityQuery = els.globalSimilarityQuery.value;
});
els.globalSimilarityQuery.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    performSearch(0);
  }
});

els.globalSimilarityWeight.addEventListener('input', () => {
  const weight = Number(els.globalSimilarityWeight.value);
  state.similarityTextWeight = weight;
  els.globalSimilarityWeightValue.textContent = weight;
  els.globalSimilarityImageWeightValue.textContent = 100 - weight;
});

els.globalSimilarityDropzone.addEventListener('dragover', event => {
  event.preventDefault();
  els.globalSimilarityDropzone.style.borderColor = 'var(--text-primary)';
  els.globalSimilarityDropzone.style.backgroundColor = 'var(--bg-surface-hover)';
});
els.globalSimilarityDropzone.addEventListener('dragleave', () => {
  els.globalSimilarityDropzone.style.borderColor = 'var(--border-subtle)';
  els.globalSimilarityDropzone.style.backgroundColor = 'transparent';
});
els.globalSimilarityDropzone.addEventListener('drop', event => {
  event.preventDefault();
  els.globalSimilarityDropzone.style.borderColor = 'var(--border-subtle)';
  els.globalSimilarityDropzone.style.backgroundColor = 'transparent';
  try {
    const item = JSON.parse(event.dataTransfer.getData('application/x-aic-keyframe'));
    setSimilarityItem(item);
  } catch {
    showError('Frame ném vào không hợp lệ.');
  }
});

// Selection Tray Dropzone Logic (Tìm kiếm tương tự khi thả vào khay)
els.selectionTray.addEventListener('dragover', event => {
  event.preventDefault();
  els.selectionTray.classList.add('is-dragover');
});
els.selectionTray.addEventListener('dragleave', () => {
  els.selectionTray.classList.remove('is-dragover');
});
els.selectionTray.addEventListener('drop', event => {
  event.preventDefault();
  els.selectionTray.classList.remove('is-dragover');
  try {
    const item = JSON.parse(event.dataTransfer.getData('application/x-aic-keyframe'));
    setSimilarityItem(item);
  } catch {
    showError('Frame ném vào không hợp lệ.');
  }
});

els.submissionModeToggle.addEventListener('click', (e) => {
  const target = e.target.closest('[data-mode]');
  if (target && target.dataset.mode === 'dres' && state.submissionMode === 'dres') {
    openDresModal();
    return;
  }
  toggleSubmissionMode();
});
els.qaAnswer.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    submit(null, 'qa');
  }
});
els.connectionStatus.addEventListener('click', openLogModal);
els.closeLogBtn.addEventListener('click', closeLogModal);
document.querySelector('[data-close-log]').addEventListener('click', closeLogModal);
els.searchTimingBtn.addEventListener('click', openTimingModal);
els.closeTimingBtn.addEventListener('click', closeTimingModal);
document.querySelector('[data-close-timing]').addEventListener('click', closeTimingModal);
if (els.shortcutsBtn) els.shortcutsBtn.addEventListener('click', openShortcutsModal);
if (els.closeShortcutsBtn) els.closeShortcutsBtn.addEventListener('click', closeShortcutsModal);
document.querySelector('[data-close-shortcuts]')?.addEventListener('click', closeShortcutsModal);
els.dresOpenBtn.addEventListener('click', openDresModal);
els.closeDresBtn.addEventListener('click', closeDresModal);
document.querySelector('[data-close-dres]').addEventListener('click', closeDresModal);
els.dresModal.addEventListener('keydown', handleDresEnter);
els.dresLoginBtn.addEventListener('click', loginDres);
els.dresLogoutBtn.addEventListener('click', logoutDres);
els.chooseEvaluationBtn.addEventListener('click', chooseEvaluation);
els.saveMemberNameBtn.addEventListener('click', saveMemberName);
els.memberBackBtn.addEventListener('click', backToEvaluation);
els.closeImageBtn.addEventListener('click', closeFrameImage);
document.querySelector('[data-close-image]').addEventListener('click', closeFrameImage);
els.imageAddTrayBtn.addEventListener('click', async () => {
  if (state.imageItem && await addKeyframeToTray(state.imageItem)) {
    setImageAddTrayState(true);
  }
});
els.expandShotContextBtn.addEventListener('click', openShotOverview);
els.expandFrameContextBtn.addEventListener('click', openFrameOverview);
els.closeShotOverviewBtn.addEventListener('click', closeShotOverview);
document.querySelector('[data-close-shot-overview]').addEventListener('click', closeShotOverview);
els.closeFrameOverviewBtn.addEventListener('click', closeFrameOverview);
document.querySelector('[data-close-frame-overview]').addEventListener('click', closeFrameOverview);
els.closeVideoBtn.addEventListener('click', closeVideo);
document.querySelector('[data-close-video]').addEventListener('click', closeVideo);
els.captureFrameBtn.addEventListener('click', () => captureDisplayedFrame());
els.videoSubmitCurrentBtn.addEventListener('click', () => {
  const item = getDisplayedVideoFrameItem();
  if (item) submit(item);
});
els.videoTextToggleBtn.addEventListener('click', () => {
  setVideoFrameTextVisible(!state.showVideoFrameText);
});
if (window.ResizeObserver && els.videoShell) {
  const videoAsrSizeObserver = new ResizeObserver(syncVideoAsrPanelHeight);
  videoAsrSizeObserver.observe(els.videoShell);
}
window.addEventListener('resize', syncVideoAsrPanelHeight);
els.videoBackBtn.addEventListener('click', () => seekVideoToSeconds((els.player.currentTime || 0) - 5, true));
els.videoPlayBtn.addEventListener('click', () => {
  if (els.player.paused) {
    els.player.play().catch(() => {});
  } else {
    els.player.pause();
  }
});
els.videoForwardBtn.addEventListener('click', () => seekVideoToSeconds((els.player.currentTime || 0) + 5, true));
els.player.addEventListener('click', () => {
  if (els.player.paused) {
    els.player.play().catch(() => {});
  } else {
    els.player.pause();
  }
});
els.videoVolumeBtn.addEventListener('click', () => {
  toggleVideoControlPopover(els.videoVolumePopover, els.videoVolumeBtn);
});
els.videoVolumeSlider.addEventListener('input', () => {
  const volume = Math.min(1, Math.max(0, Number(els.videoVolumeSlider.value) / 100));
  els.player.volume = volume;
  els.player.muted = volume === 0;
  updateVideoControls();
});
els.videoProgress.addEventListener('input', () => {
  const duration = Number.isFinite(els.player.duration) ? els.player.duration : 0;
  if (duration <= 0) return;
  els.player.currentTime = (Number(els.videoProgress.value) / 1000) * duration;
  updateVideoControls();
  centerActiveFrameInStrip(false);
});
els.videoSpeedBtn.addEventListener('click', () => {
  toggleVideoControlPopover(els.videoSpeedMenu, els.videoSpeedBtn);
});
document.querySelectorAll('.video-speed-option').forEach(btn => {
  btn.addEventListener('click', () => {
    setVideoRate(Number(btn.dataset.rate));
    closeVideoControlPopovers();
  });
});
document.addEventListener('click', event => {
  if (!els.videoSpeedControl.contains(event.target) && !els.videoVolumeControl.contains(event.target)) {
    closeVideoControlPopovers();
  }
});
els.videoFullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  els.videoShell.requestFullscreen?.().catch(() => {});
});
els.player.addEventListener('loadedmetadata', updateVideoControls);
els.player.addEventListener('timeupdate', updateVideoControls);
els.player.addEventListener('seeking', updateVideoControls);
els.player.addEventListener('seeked', updateVideoControls);
els.player.addEventListener('play', updateVideoControls);
els.player.addEventListener('pause', updateVideoControls);
els.player.addEventListener('volumechange', updateVideoControls);

// Mouse Wheel & Trackpad scrubbing on video and filmstrip
if (els.videoShell) {
  els.videoShell.addEventListener('wheel', handleVideoScrubWheel, { passive: false });
}
if (els.videoFrameStrip) {
  els.videoFrameStrip.addEventListener('wheel', handleVideoScrubWheel, { passive: false });
}
setupFilmstripScrubbing();
document.addEventListener('keydown', event => {
  const inInput = event.target.matches('input, textarea');
  const key = event.key.toLowerCase();

  // Shift + K / T / Q (when not actively typing text inside an input or textarea)
  if (!inInput && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
    if (key === 'k') {
      event.preventDefault();
      setTaskType('kis');
      return;
    }
    if (key === 't') {
      event.preventDefault();
      setTaskType('trake');
      return;
    }
    if (key === 'q') {
      event.preventDefault();
      setTaskType('qa');
      return;
    }
  }

  // Alt-key combinations work even when typing inside an input field
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    if (key === '1' || key === 'k') {
      event.preventDefault();
      setTaskType('kis');
      return;
    }
    if (key === '2' || key === 't') {
      event.preventDefault();
      setTaskType('trake');
      return;
    }
    if (key === '3' || key === 'q') {
      event.preventDefault();
      setTaskType('qa');
      return;
    }
  }

  if (inInput) return;

  if (
    !els.frameOverviewModal.hidden
    && els.imageModal.hidden
    && els.frameOverviewGrid.classList.contains('is-video-gallery')
    && ['ArrowUp', 'ArrowDown'].includes(event.key)
  ) {
    event.preventDefault();
    event.stopPropagation();
    scrollFrameOverview(event.key === 'ArrowUp' ? -1 : 1);
    return;
  }

  // Single-key shortcuts when NOT typing in text inputs
  if (key === '1') {
    event.preventDefault();
    setTaskType('kis');
    return;
  }
  if (key === '2') {
    event.preventDefault();
    setTaskType('trake');
    return;
  }
  if (key === '3') {
    event.preventDefault();
    setTaskType('qa');
    return;
  }
  if (key === 't') {
    event.preventDefault();
    cycleTaskType();
    return;
  }
  
  if (key === 'i') {
    event.preventDefault();
    els.globalSimilarityBtn.click();
    return;
  }
  if (key === 'a') {
    event.preventDefault();
    addTemporalStage();
    return;
  }
  if (key === 'd') {
    event.preventDefault();
    if (state.stages.length > 1) {
      removeStage(state.stages[state.stages.length - 1].id);
    }
    return;
  }
  if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
    event.preventDefault();
    if (els.shortcutsModal && !els.shortcutsModal.hidden) {
      closeShortcutsModal();
    } else {
      openShortcutsModal();
    }
    return;
  }
  if (event.key === 'Escape' && !els.correctCelebration.hidden) {
    event.preventDefault();
    event.stopPropagation();
    hideCorrectCelebration();
    return;
  }
  if (event.key === 'Escape' && (!els.videoSpeedMenu.hidden || !els.videoVolumePopover.hidden)) {
    event.preventDefault();
    event.stopPropagation();
    closeVideoControlPopovers();
    return;
  }
  if (!els.videoModal.hidden && [' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    if (event.key === ' ') {
      if (els.player.paused) {
        els.player.play().catch(() => {});
      } else {
        els.player.pause();
      }
    } else if (event.key === 'ArrowLeft') {
      seekVideoToSeconds((els.player.currentTime || 0) - (event.shiftKey ? 10 : 1), true);
    } else if (event.key === 'ArrowRight') {
      seekVideoToSeconds((els.player.currentTime || 0) + (event.shiftKey ? 10 : 1), true);
    }
    return;
  }
  if (event.key !== 'Escape') return;
  if (els.shortcutsModal && !els.shortcutsModal.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeShortcutsModal();
    return;
  }
  if (!els.dresModal.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeDresModal();
    return;
  }
  if (!els.logModal.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeLogModal();
    return;
  }
  if (!els.timingModal.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeTimingModal();
    return;
  }
  if (!els.imageModal.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeFrameImage();
    return;
  }
  if (!els.shotOverviewModal.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeShotOverview();
    return;
  }
  if (els.videoModal.hidden) return;
  event.preventDefault();
  event.stopPropagation();
  closeVideo();
}, true);

renderStages();
syncSearchModeControls();
syncEmbeddingModelControls();
syncFusionWeights();
renderResults();
renderSelection();
state.submissionMode = localStorage.getItem(SUBMISSION_MODE_CACHE_KEY) === 'csv' ? 'csv' : 'dres';
loadDresCache();
loadMemberCache();
renderEvaluations();
renderTaskControls();
renderDresSession();
renderSubmissionMode();
loadSubmissionQueries();
loadVideoFps();
refreshHealth();
connectTeamSocket();
initTrakeDrawerEvents();
if (state.memberName) void setMyTrakeEvent(state.myTrakeEvent);
window.setInterval(() => {
  loadSubmissionQueries();
  refreshTeamState();
}, 5000);
refreshIcons();
if (!state.dresSessionId && state.submissionMode === 'dres') {
  window.setTimeout(openDresModal, 150);
}


els.qaAnswer.addEventListener('input', () => {
  if (state.activeQueryFilename) {
    state.userDrafts[state.activeQueryFilename] = els.qaAnswer.value;
    clearTimeout(state.draftDebounceTimer);
    state.draftDebounceTimer = setTimeout(() => {
      syncUserProfile({
        active_query_for_draft: state.activeQueryFilename,
        draft_qa_answer: els.qaAnswer.value
      });
    }, 600);
  }
});
els.memberNameBtn?.addEventListener('click', openDresModal);
els.statsOpenBtn?.addEventListener('click', openStatsModal);
els.closeStatsBtn?.addEventListener('click', closeStatsModal);
document.querySelector('[data-close-stats]')?.addEventListener('click', closeStatsModal);
els.statsTabPersonal?.addEventListener('click', () => {
  els.statsTabPersonal.classList.add('is-active');
  els.statsTabTeamHistory?.classList.remove('is-active');
  els.statsTabLeaderboard.classList.remove('is-active');
  els.statsPersonalView.hidden = false;
  if (els.statsTeamHistoryView) els.statsTeamHistoryView.hidden = true;
  els.statsLeaderboardView.hidden = true;
});
els.statsTabTeamHistory?.addEventListener('click', () => {
  els.statsTabPersonal.classList.remove('is-active');
  els.statsTabTeamHistory.classList.add('is-active');
  els.statsTabLeaderboard.classList.remove('is-active');
  els.statsPersonalView.hidden = true;
  els.statsTeamHistoryView.hidden = false;
  els.statsLeaderboardView.hidden = true;
});
els.statsTabLeaderboard?.addEventListener('click', () => {
  els.statsTabPersonal.classList.remove('is-active');
  els.statsTabTeamHistory?.classList.remove('is-active');
  els.statsTabLeaderboard.classList.add('is-active');
  els.statsPersonalView.hidden = true;
  if (els.statsTeamHistoryView) els.statsTeamHistoryView.hidden = true;
  els.statsLeaderboardView.hidden = false;
});
if (!state.viewingHeartbeatTimer) {
  state.viewingHeartbeatTimer = window.setInterval(() => {
    if (state.activeQueryFilename) sendViewingStatus();
  }, 20000);
}

document.getElementById('sessionChangeNameBtn')?.addEventListener('click', promptChangeMemberName);

document.getElementById('clearStatsBtn')?.addEventListener('click', async () => {
  if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử nộp bài và đặt lại bảng xếp hạng về 0?')) return;
  try {
    const resp = await fetch('/team/user/stats/clear', { method: 'POST' });
    if (resp.ok) {
      openStatsModal();
    }
  } catch (err) {
    alert('Lỗi khi xóa: ' + err.message);
  }
});




// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.savedTheme = savedTheme; } catch (_) {}
}
