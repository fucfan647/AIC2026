/**
 * ==============================================================================
 * TỆP TIN: js/utils/audio.js
 * MÔ TẢ:
 *   Quản lý âm thanh và hoạt ảnh chúc mừng khi nộp bài thành công (CORRECT):
 *   - unlockCorrectSound: Mở khóa AudioContext trên trình duyệt khi có user interaction.
 *   - showCorrectCelebration: Hiển thị banner mừng điểm và phát âm thanh.
 *   - hideCorrectCelebration: Đóng banner và ngắt âm thanh.
 * ==============================================================================
 */

let correctCelebrationTimer = null;
let correctSoundUnlocked = false;

export function unlockCorrectSound() {
  if (correctSoundUnlocked) return;
  const audio = document.getElementById('correctSubmissionSound');
  if (!audio) return;

  const originalMuted = audio.muted;
  audio.muted = true;
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.then === 'function') {
    playPromise.then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = originalMuted;
      correctSoundUnlocked = true;
    }).catch(() => {
      audio.muted = originalMuted;
    });
  } else {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = originalMuted;
    correctSoundUnlocked = true;
  }
}

export function hideCorrectCelebration() {
  const celebration = document.getElementById('correctCelebration');
  const sound = document.getElementById('correctSubmissionSound');
  if (correctCelebrationTimer) {
    clearTimeout(correctCelebrationTimer);
    correctCelebrationTimer = null;
  }
  if (celebration) celebration.hidden = true;
  if (sound) {
    sound.pause();
    sound.currentTime = 0;
  }
}

export function showCorrectCelebration() {
  const celebration = document.getElementById('correctCelebration');
  const sound = document.getElementById('correctSubmissionSound');
  if (!celebration) return;

  hideCorrectCelebration();
  celebration.hidden = false;

  if (sound) {
    sound.currentTime = 0;
    const playPromise = sound.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  correctCelebrationTimer = setTimeout(() => {
    hideCorrectCelebration();
  }, 10000);
}
