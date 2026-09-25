/**
 * ==============================================================================
 * TỆP TIN: js/modules/03_audio_feedback.js
 * MÔ TẢ:
 *   Xử lý phản hồi nộp bài thời gian thực, banner mừng điểm và âm thanh chúc mừng CORRECT.
 * ==============================================================================
 */

function parseSubmissionFeedback(text) {
  try {
    const submission = String(JSON.parse(text)?.submission || '').toUpperCase();
    if (submission === 'CORRECT') return 'correct';
    if (submission === 'WRONG') return 'wrong';
  } catch {
    return null;
  }
  return null;
}

function submissionFeedbackFor(item) {
  return state.submissionFeedback.get(String(item?.keyframe_id || '')) || '';
}

function submissionFeedbackMarkup(feedback) {
  return '';
}

function hideCorrectCelebration() {
  window.clearTimeout(correctCelebrationTimer);
  correctCelebrationTimer = null;
  els.correctSubmissionSound.pause();
  els.correctSubmissionSound.currentTime = 0;
  els.correctCelebration.hidden = true;
}

function unlockCorrectSound() {
  if (correctSoundUnlocked) return;
  const audio = els.correctSubmissionSound;
  audio.muted = true;
  const playPromise = audio.play();
  if (!playPromise) return;
  playPromise.then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    correctSoundUnlocked = true;
  }).catch(() => {
    audio.muted = false;
  });
}

function showCorrectCelebration() {
  const audio = els.correctSubmissionSound;
  window.clearTimeout(correctCelebrationTimer);
  audio.pause();
  audio.src = `/correct-submission-sound.mp3?event=${encodeURIComponent(makeClientId())}`;
  audio.load();
  audio.currentTime = 0;
  audio.muted = false;
  els.correctCelebration.hidden = false;
  audio.onended = hideCorrectCelebration;
  audio.ontimeupdate = () => {
    if (audio.currentTime >= 20) hideCorrectCelebration();
  };
  audio.play().catch(() => {
    // Keep the visual effect for the audio duration if browser autoplay is blocked.
  });
  correctCelebrationTimer = window.setTimeout(hideCorrectCelebration, 22000);
}

function handleSubmissionFeedbackEvent(event) {
  if (event?.type !== 'submission_feedback' || !event.event_id) return;
  if (state.handledSubmissionEvents.has(event.event_id)) return;
  state.handledSubmissionEvents.add(event.event_id);
  if (event.verdict === 'correct') {
    for (const [keyframeId, verdict] of state.submissionFeedback) {
      if (verdict === 'wrong') state.submissionFeedback.delete(keyframeId);
    }
  }
  const hasCorrect = [...state.submissionFeedback.values()].includes('correct');
  (event.keyframe_ids || []).forEach(keyframeId => {
    if (event.verdict === 'clear') state.submissionFeedback.delete(String(keyframeId));
    else if (event.verdict !== 'wrong' || !hasCorrect) state.submissionFeedback.set(String(keyframeId), event.verdict);
  });
  renderResults();
  renderSelection();
  if (event.verdict === 'correct') showCorrectCelebration();
  if (event.verdict === 'clear' && ![...state.submissionFeedback.values()].includes('correct')) hideCorrectCelebration();
}

function publishSubmissionFeedback(verdict, submittedItems) {
  const keyframeIds = submittedItems.map(item => String(item?.keyframe_id || '')).filter(Boolean);
  if (!keyframeIds.length) return;
  const event = {
    type: 'submission_feedback',
    event_id: makeClientId(),
    verdict,
    name: state.memberName || state.dresUsername || 'Thành viên',
    keyframe_ids: keyframeIds
  };
  handleSubmissionFeedbackEvent(event);
  fetch('/team/submission-feedback', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(event)
  }).catch(() => {
    // DRES submission has already completed; realtime feedback is best-effort.
  });
}

function clearSubmissionFeedback() {
  const keyframeIds = [...state.submissionFeedback.keys()];
  state.submissionFeedback.clear();
  state.handledSubmissionEvents.clear();
  for (let offset = 0; offset < keyframeIds.length; offset += 100) {
    const event = {
      type: 'submission_feedback',
      event_id: makeClientId(),
      verdict: 'clear',
      name: state.memberName || state.dresUsername || 'Thành viên',
      keyframe_ids: keyframeIds.slice(offset, offset + 100)
    };
    fetch('/team/submission-feedback', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(event)
    }).catch(() => {
      // The local reset should still complete if realtime cleanup is unavailable.
    });
  }
}

async function clearCorrectSubmissionFeedback() {
  const keyframeIds = [...state.submissionFeedback]
    .filter(([, verdict]) => verdict === 'correct')
    .map(([keyframeId]) => keyframeId);
  for (let offset = 0; offset < keyframeIds.length; offset += 100) {
    const event = {
      type: 'submission_feedback',
      event_id: makeClientId(),
      verdict: 'clear',
      name: state.memberName || state.dresUsername || 'Thành viên',
      keyframe_ids: keyframeIds.slice(offset, offset + 100)
    };
    const resp = await fetch('/team/submission-feedback', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(event)
    });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.detail || 'Không đồng bộ được trạng thái CORRECT.');
    handleSubmissionFeedbackEvent(payload);
  }
}



// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.parseSubmissionFeedback = parseSubmissionFeedback; } catch (_) {}
  try { window.submissionFeedbackFor = submissionFeedbackFor; } catch (_) {}
  try { window.submissionFeedbackMarkup = submissionFeedbackMarkup; } catch (_) {}
  try { window.hideCorrectCelebration = hideCorrectCelebration; } catch (_) {}
  try { window.unlockCorrectSound = unlockCorrectSound; } catch (_) {}
  try { window.showCorrectCelebration = showCorrectCelebration; } catch (_) {}
  try { window.handleSubmissionFeedbackEvent = handleSubmissionFeedbackEvent; } catch (_) {}
  try { window.publishSubmissionFeedback = publishSubmissionFeedback; } catch (_) {}
  try { window.clearSubmissionFeedback = clearSubmissionFeedback; } catch (_) {}
  try { window.clearCorrectSubmissionFeedback = clearCorrectSubmissionFeedback; } catch (_) {}
}
