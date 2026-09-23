/**
 * ==============================================================================
 * TỆP TIN: js/modules/11_team_socket.js
 * MÔ TẢ:
 *   Kết nối WebSocket /ws/team và đồng bộ trạng thái nhóm thời gian thực (vote, frame TRAKE, broadcast).
 * ==============================================================================
 */

function applyTeamState(teamState) {
  if (Array.isArray(teamState.votes)) {
    state.teamVotes = teamState.votes;
  }
  if (Array.isArray(teamState.trake_frames)) {
    state.trakeFrames = teamState.trake_frames;
  }
  if (teamState.trake_users && typeof teamState.trake_users === 'object') {
    state.trakeUsers = teamState.trake_users;
    if (state.clientId && state.trakeUsers[state.clientId]?.event) {
      state.myTrakeEvent = state.trakeUsers[state.clientId].event;
    }
  }
  renderTrakeDrawer();
  // Active query is isolated locally per user
  const submissionCounts = teamState.submission_counts && typeof teamState.submission_counts === 'object'
    ? teamState.submission_counts
    : {};
  state.queryCatalog.forEach(query => {
    if (Object.prototype.hasOwnProperty.call(submissionCounts, query.filename)) {
      query.answer_count = Number(submissionCounts[query.filename]) || 0;
    }
  });
  const sharedFeedback = teamState.submission_feedback && typeof teamState.submission_feedback === 'object'
    ? teamState.submission_feedback
    : {};
  const nextFeedback = new Map(
    Object.entries(sharedFeedback)
      .map(([keyframeId, value]) => [String(keyframeId), String(value?.verdict || '')])
      .filter(([, verdict]) => ['correct', 'wrong'].includes(verdict))
  );
  const feedbackChanged = nextFeedback.size !== state.submissionFeedback.size
    || [...nextFeedback].some(([keyframeId, verdict]) => state.submissionFeedback.get(keyframeId) !== verdict);
  state.submissionFeedback = nextFeedback;
  if (feedbackChanged) renderResults();
  renderQueryStrip();
  renderActiveQuery();
  renderSubmissionMode();
  renderSelection();
  renderTrakeTray();
}

async function refreshTeamState() {
  try {
    const resp = await fetch('/team/state');
    const teamState = await resp.json();
    if (resp.ok) {
      if (teamState.query_viewers && typeof teamState.query_viewers === 'object') {
        state.queryViewers = teamState.query_viewers;
      }
      applyTeamState(teamState);
    }
  } catch {
    // Voting is a convenience layer; search should keep working if it is temporarily unavailable.
  }
}

function teamWebSocketUrl() {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/ws/team`;
}

function scheduleTeamSocketReconnect() {
  if (state.teamSocketRetryTimer) return;
  state.teamSocketRetryTimer = window.setTimeout(() => {
    state.teamSocketRetryTimer = null;
    connectTeamSocket();
  }, 1500);
}

function connectTeamSocket() {
  if (!('WebSocket' in window)) {
    refreshTeamState();
    state.teamSocketRetryTimer = window.setInterval(refreshTeamState, 2000);
    return;
  }
  if (state.teamSocket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(state.teamSocket.readyState)) return;

  const socket = new WebSocket(teamWebSocketUrl());
  state.teamSocket = socket;

  socket.addEventListener('open', () => {
    refreshTeamState();
  });
  socket.addEventListener('message', event => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'submission_feedback') {
        handleSubmissionFeedbackEvent(payload);
      } else if (payload.type === 'viewers_update') {
        state.queryViewers = payload.viewers || {};
        renderQueryStrip();
      } else if (
        payload.votes !== undefined
        || payload.members !== undefined
        || payload.trake_frames !== undefined
        || payload.trake_users !== undefined
      ) {
        applyTeamState(payload);
      }
    } catch {
      // Ignore malformed realtime updates; the next server event will refresh state.
    }
  });
  socket.addEventListener('close', () => {
    if (state.teamSocket === socket) state.teamSocket = null;
    scheduleTeamSocketReconnect();
  });
  socket.addEventListener('error', () => {
    socket.close();
  });
}

async function voteForItem(item) {
  if (!state.memberName) {
    showError('Đăng nhập DRES, chọn evaluation và nhập tên gọi trước khi chọn frame.');
    openDresModal();
    return false;
  }
  const previousVotes = state.teamVotes;
  const optimisticVote = {
    selection_id: `pending:${state.clientId}:${item.keyframe_id}`,
    client_id: state.clientId,
    name: state.memberName,
    item,
    created_at: Date.now() / 1000
  };
  state.teamVotes = [
    ...state.teamVotes.filter(vote => !(vote.client_id === state.clientId && vote.item?.keyframe_id === item.keyframe_id)),
    optimisticVote
  ];
  renderSelection();
  try {
    const resp = await fetch('/team/vote', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({client_id: state.clientId, name: state.memberName, item})
    });
    const teamState = await resp.json();
    if (!resp.ok) throw new Error(teamState.detail || 'Lưu vote thất bại.');
    applyTeamState(teamState);
    showError('');
    return true;
  } catch (error) {
    state.teamVotes = previousVotes;
    renderSelection();
    showError(error.message || String(error));
    return false;
  }
}

async function addTrakeFrame(item) {
  const existingVideo = state.trakeFrames[0]?.item?.video_id;
  if (existingVideo && existingVideo !== item.video_id) {
    showError(`TRAKE đang chứa frame của ${existingVideo}; không thể thêm frame từ ${item.video_id}.`);
    return false;
  }
  const trakeFrame = {
    selection_id: `local:trake:${Date.now()}:${item.keyframe_id || item.frame_id || Date.now()}`,
    client_id: state.clientId,
    name: state.memberName || 'Bạn',
    item,
    created_at: Date.now() / 1000
  };
  const previousFrames = state.trakeFrames;
  state.trakeFrames = [...state.trakeFrames, trakeFrame];
  renderTrakeTray();
  renderTrakeMasterTray();
  try {
    const resp = await fetch('/team/trake/add', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        client_id: state.clientId,
        name: state.memberName || state.dresUsername || 'Thành viên',
        item
      })
    });
    const teamState = await resp.json();
    if (!resp.ok) throw new Error(teamState.detail || 'Không thêm được frame vào khay nộp chung.');
    applyTeamState(teamState);
    showError('');
    return true;
  } catch (error) {
    state.trakeFrames = previousFrames;
    renderTrakeDrawer();
    renderTrakeTray();
    showError(error.message || String(error));
    return false;
  }
}

async function removeTeamSelection(vote) {
  const previousVotes = state.teamVotes;
  state.teamVotes = state.teamVotes.filter(item => item !== vote);
  renderSelection();
  try {
    const resp = await fetch('/team/remove', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({selection_id: vote.selection_id})
    });
    const teamState = await resp.json();
    if (!resp.ok) throw new Error(teamState.detail || 'Xóa frame dùng chung thất bại.');
    applyTeamState(teamState);
    showError('');
  } catch (error) {
    state.teamVotes = previousVotes;
    renderSelection();
    showError(error.message || String(error));
  }
}

async function removeTrakeFrame(frame) {
  state.trakeFrames = state.trakeFrames.filter(item => item !== frame);
  renderTrakeTray();
  renderTrakeMasterTray();
  try {
    const resp = await fetch('/team/trake/remove', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({selection_id: frame.selection_id})
    });
    if (resp.ok) {
      const teamState = await resp.json();
      applyTeamState(teamState);
    }
  } catch (err) {
    console.error('Lỗi khi xóa frame TRAKE trên server:', err);
  }
}

async function clearTrakeFrames() {
  state.trakeFrames = [];
  renderTrakeTray();
  renderTrakeMasterTray();
  try {
    const resp = await fetch('/team/trake/clear', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({})
    });
    if (resp.ok) {
      const teamState = await resp.json();
      applyTeamState(teamState);
    }
  } catch (err) {
    console.error('Lỗi khi xóa toàn bộ TRAKE trên server:', err);
  }
}

async function clearMyVotes() {
  if (!state.memberName) {
    showError('Nhập tên gọi trước khi xóa lựa chọn của bạn.');
    openDresModal();
    return;
  }
  const previousVotes = state.teamVotes;
  state.teamVotes = state.teamVotes.filter(vote => !isMyVote(vote));
  renderSelection();
  try {
    const resp = await fetch('/team/clear', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        client_id: state.clientId,
        name: state.memberName
      })
    });
    const teamState = await resp.json();
    if (!resp.ok) throw new Error(teamState.detail || 'Xóa lựa chọn thất bại.');
    applyTeamState(teamState);
    showError('');
  } catch (error) {
    state.teamVotes = previousVotes;
    renderSelection();
    showError(error.message || String(error));
  }
}



// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.applyTeamState = applyTeamState; } catch (_) {}
  try { window.refreshTeamState = refreshTeamState; } catch (_) {}
  try { window.teamWebSocketUrl = teamWebSocketUrl; } catch (_) {}
  try { window.scheduleTeamSocketReconnect = scheduleTeamSocketReconnect; } catch (_) {}
  try { window.connectTeamSocket = connectTeamSocket; } catch (_) {}
  try { window.voteForItem = voteForItem; } catch (_) {}
  try { window.addTrakeFrame = addTrakeFrame; } catch (_) {}
  try { window.removeTeamSelection = removeTeamSelection; } catch (_) {}
  try { window.removeTrakeFrame = removeTrakeFrame; } catch (_) {}
  try { window.clearTrakeFrames = clearTrakeFrames; } catch (_) {}
  try { window.clearMyVotes = clearMyVotes; } catch (_) {}
}
