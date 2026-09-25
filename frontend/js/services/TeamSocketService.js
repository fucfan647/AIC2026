/**
 * ==============================================================================
 * TỆP TIN: js/services/TeamSocketService.js
 * LỚP: TeamSocketService
 * MÔ TẢ:
 *   Quản lý toàn bộ giao tiếp thời gian thực của đội qua WebSocket /ws/team:
 *   - Kết nối WebSocket, tự động kết nối lại khi mất mạng.
 *   - Lắng nghe broadcast trạng thái từ Master Hub (team_state.json).
 *   - Đồng bộ danh tính (User Sync), vị trí câu hỏi đang xem (Viewing Status).
 *   - Cung cấp các API: vote frame, thêm/xóa TRAKE, xóa khay, xóa user.
 * ==============================================================================
 */

export class TeamSocketService {
  constructor(appState, eventBus) {
    this.state = appState;
    this.eventBus = eventBus;
    this.socket = null;
    this.retryTimer = null;
  }

  getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/team`;
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    clearTimeout(this.retryTimer);
    try {
      this.socket = new WebSocket(this.getWebSocketUrl());
      this.state.set('teamSocket', this.socket, true);

      this.socket.addEventListener('open', () => {
        this.eventBus.emit('connection:change', { status: 'ok', text: 'Đã kết nối' });
        this.syncUserProfile();
      });

      this.socket.addEventListener('message', event => {
        try {
          const payload = JSON.parse(event.data);
          this.handleSocketMessage(payload);
        } catch (err) {
          console.error('[TeamSocket] Parse error:', err);
        }
      });

      this.socket.addEventListener('close', () => {
        this.eventBus.emit('connection:change', { status: 'warning', text: 'Mất kết nối Hub' });
        this.scheduleReconnect();
      });

      this.socket.addEventListener('error', () => {
        this.eventBus.emit('connection:change', { status: 'error', text: 'Lỗi WebSocket' });
        try { this.socket.close(); } catch (_) {}
      });
    } catch (err) {
      console.error('[TeamSocket] Connect error:', err);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), 2000);
  }

  handleSocketMessage(payload) {
    if (!payload || typeof payload !== 'object') return;

    if (payload.type === 'submission_feedback' && payload.event) {
      this.eventBus.emit('submission:feedback', payload.event);
      return;
    }

    if (payload.type === 'query_viewers' && payload.viewers) {
      this.state.set('queryViewers', payload.viewers);
      this.eventBus.emit('team:viewers_updated', payload.viewers);
      return;
    }

    if (payload.type === 'team_state' && payload.state) {
      this.applyTeamState(payload.state);
      return;
    }

    if (Array.isArray(payload.votes) || Array.isArray(payload.trake_frames) || typeof payload.trake_users === 'object') {
      this.applyTeamState(payload);
    }
  }

  applyTeamState(teamState) {
    if (!teamState) return;
    const votes = Array.isArray(teamState.votes) ? teamState.votes : [];
    const trakeFrames = Array.isArray(teamState.trake_frames) ? teamState.trake_frames : [];
    const trakeUsers = (teamState.trake_users && typeof teamState.trake_users === 'object')
      ? teamState.trake_users
      : {};

    this.state.update({
      teamVotes: votes,
      trakeFrames,
      trakeUsers
    });

    this.eventBus.emit('team:state_updated', { votes, trakeFrames, trakeUsers });
  }

  async refreshTeamState() {
    try {
      const resp = await fetch('/team/state');
      if (resp.ok) {
        const state = await resp.json();
        this.applyTeamState(state);
      }
    } catch (_) {}
  }

  async syncUserProfile(updates = {}) {
    const clientId = this.state.get('clientId');
    const memberName = this.state.get('memberName');
    const dresUsername = this.state.get('dresUsername');
    const activeQuery = this.state.get('activeQueryFilename');

    const payload = {
      client_id: clientId,
      name: memberName || dresUsername || 'Bạn',
      active_query: activeQuery,
      ...updates
    };

    try {
      const resp = await fetch('/team/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.drafts) {
          this.state.set('userDrafts', data.drafts);
          this.eventBus.emit('team:drafts_updated', data.drafts);
        }
      }
    } catch (_) {}
  }

  async sendViewingStatus() {
    const clientId = this.state.get('clientId');
    const memberName = this.state.currentDisplayName();
    const filename = this.state.get('activeQueryFilename');
    if (!filename) return;

    try {
      await fetch('/team/viewing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          name: memberName,
          filename
        })
      });
    } catch (_) {}
  }

  async voteForItem(item) {
    const clientId = this.state.get('clientId');
    const memberName = this.state.currentDisplayName();
    const resp = await fetch('/team/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        name: memberName,
        item
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Vote failed');
    this.applyTeamState(data);
    return true;
  }

  async removeTeamSelection(vote) {
    const clientId = this.state.get('clientId');
    const resp = await fetch('/team/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        selection_id: vote.selection_id
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Remove vote failed');
    this.applyTeamState(data);
  }

  async clearMyVotes() {
    const clientId = this.state.get('clientId');
    const memberName = this.state.get('memberName');
    const resp = await fetch('/team/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        name: memberName
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Clear votes failed');
    this.applyTeamState(data);
  }

  // TRAKE Master Tray API
  async addTrakeFrame(item) {
    const clientId = this.state.get('clientId');
    const memberName = this.state.currentDisplayName();
    const resp = await fetch('/team/trake/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        name: memberName,
        item
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Add trake frame failed');
    this.applyTeamState(data);
    return true;
  }

  async removeTrakeFrame(frame) {
    const resp = await fetch('/team/trake/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selection_id: frame.selection_id
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Remove trake frame failed');
    this.applyTeamState(data);
  }

  async clearTrakeFrames() {
    const resp = await fetch('/team/trake/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Clear trake frames failed');
    this.applyTeamState(data);
  }

  async reorderTrakeFrames(frames) {
    const resp = await fetch('/team/trake/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Reorder failed');
    this.applyTeamState(data);
  }

  // TRAKE User Cards API
  async setUserTrakeEvent(eventNum) {
    const clientId = this.state.get('clientId');
    const memberName = this.state.currentDisplayName();
    const resp = await fetch('/team/trake/user-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        name: memberName,
        event: eventNum
      })
    });
    if (resp.ok) {
      const data = await resp.json();
      this.applyTeamState(data);
    }
  }

  async addUserTrakeFrame(item, eventNum) {
    const clientId = this.state.get('clientId');
    const memberName = this.state.currentDisplayName();
    const resp = await fetch('/team/trake/user-frame/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        name: memberName,
        event: eventNum,
        item
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Add user trake frame failed');
    this.applyTeamState(data);
    return true;
  }

  async removeUserTrakeFrame(selectionId) {
    const clientId = this.state.get('clientId');
    const resp = await fetch('/team/trake/user-frame/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        selection_id: selectionId
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Remove user frame failed');
    this.applyTeamState(data);
  }

  async clearUserTrakeFrames() {
    const clientId = this.state.get('clientId');
    const resp = await fetch('/team/trake/user-frame/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Clear user frames failed');
    this.applyTeamState(data);
  }

  async removeTrakeUser(targetClientId) {
    const resp = await fetch('/team/trake/user/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: targetClientId })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Remove user failed');
    this.applyTeamState(data);
  }

  publishSubmissionFeedback(verdict, submittedItems) {
    fetch('/team/submission-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.state.get('clientId'),
        user_name: this.state.currentDisplayName(),
        verdict,
        items: submittedItems
      })
    }).catch(() => {});
  }
}
