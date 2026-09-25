/**
 * ==============================================================================
 * TỆP TIN: js/modules/13_trake_drawer.js
 * MÔ TẢ:
 *   Bảng phối hợp sự kiện TRAKE (TRAKE Collaboration Drawer): Master Tray kéo thả đổi thứ tự (Reorder), Thẻ thành viên với nút Event E1-E5.
 * ==============================================================================
 */

/* ==========================================================================
   TRAKE Collaboration Drawer & User Cards Implementation
   ========================================================================== */

function toggleTrakeDrawer(forceState = null) {
  if (!els.trakeDrawer) return;
  const isOpen = els.trakeDrawer.classList.contains('is-open');
  const next = forceState !== null ? Boolean(forceState) : !isOpen;

  if (next) {
    els.trakeDrawer.hidden = false;
    void els.trakeDrawer.offsetWidth; // Force reflow
    els.trakeDrawer.classList.add('is-open');
    els.trakePanelToggleBtn?.classList.add('is-active');
    state.trakeDrawerOpen = true;
    renderTrakeDrawer();
    refreshIcons(els.trakeDrawer);
  } else {
    els.trakeDrawer.classList.remove('is-open');
    els.trakePanelToggleBtn?.classList.remove('is-active');
    state.trakeDrawerOpen = false;
    window.setTimeout(() => {
      if (!els.trakeDrawer.classList.contains('is-open')) {
        els.trakeDrawer.hidden = true;
      }
    }, 300);
  }
  try {
    localStorage.setItem('aic_trake_drawer_open', next ? '1' : '0');
  } catch {}
}

async function setMyTrakeEvent(eventNum) {
  const num = Math.max(1, Math.min(5, parseInt(eventNum, 10) || 1));
  state.myTrakeEvent = num;
  state.trakeUsers = state.trakeUsers || {};
  if (!state.trakeUsers[state.clientId]) {
    state.trakeUsers[state.clientId] = {
      name: state.memberName || 'Bạn',
      event: num,
      frames: []
    };
  } else {
    state.trakeUsers[state.clientId].event = num;
  }
  renderTrakeUserCards();
  try {
    await fetch('/team/trake/user-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: state.clientId,
        name: state.memberName || 'Bạn',
        event: num
      })
    });
  } catch (err) {
    console.error('Failed to update trake user state:', err);
  }
}

async function addFrameToMyEvent(item = null) {
  if (!state.memberName) {
    showError('Nhập tên gọi trước khi thêm frame vào khay TRAKE của bạn.');
    openDresModal();
    return false;
  }
  let targetItem = item;
  if (!targetItem) {
    if (state.activeVideoItem) targetItem = getDisplayedVideoFrameItem() || state.activeVideoItem;
    else if (state.selected?.length > 0) targetItem = state.selected[0];
    else if (state.results?.length > 0) {
      const first = state.results[0];
      targetItem = first.video_id ? first : (first.scenes?.[0] || null);
    }
  }
  if (!targetItem) {
    showError('Không tìm thấy frame nào để thêm vào Event của bạn.');
    return;
  }
  state.trakeUsers = state.trakeUsers || {};
  const myEntry = state.trakeUsers[state.clientId] || {
    name: state.memberName,
    event: state.myTrakeEvent || 1,
    frames: []
  };
  const keyframeId = targetItem.keyframe_id;
  if (myEntry.frames.some(frame => frame.item?.keyframe_id === keyframeId)) {
    showError('Frame này đã có trong khay TRAKE của bạn.');
    return false;
  }
  const previousFrames = [...myEntry.frames];
  myEntry.frames.push({
    selection_id: `temp_${Date.now()}`,
    event: state.myTrakeEvent || 1,
    item: targetItem,
    created_at: Date.now() / 1000
  });
  state.trakeUsers[state.clientId] = myEntry;
  renderTrakeDrawer();
  renderTrakeTray();
  try {
    const resp = await fetch('/team/trake/user-frame/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: state.clientId,
        name: state.memberName,
        event: state.myTrakeEvent || 1,
        item: targetItem
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Không thêm được frame vào khay TRAKE của bạn.');
    applyTeamState(data);
    showError('');
    return true;
  } catch (err) {
    myEntry.frames = previousFrames;
    state.trakeUsers[state.clientId] = myEntry;
    renderTrakeDrawer();
    renderTrakeTray();
    showError(err.message || String(err));
    return false;
  }
}

async function addFrameToBothTrays(item) {
  if (!item?.video_id) return false;
  const targetFrameId = keyframeTrayId(item);
  const existsInTeamTray = state.teamVotes.some(vote =>
    vote.client_id === state.clientId
    && vote.item?.video_id === item.video_id
    && (
      (item.keyframe_id && vote.item?.keyframe_id === item.keyframe_id)
      || Number(vote.item?.frame_id) === targetFrameId
    )
  );
  const existsInMyTray = (state.trakeUsers?.[state.clientId]?.frames || []).some(frame =>
    frame.item?.video_id === item.video_id
    && (
      (item.keyframe_id && frame.item?.keyframe_id === item.keyframe_id)
      || Number(frame.item?.frame_id) === targetFrameId
    )
  );
  if (existsInTeamTray && existsInMyTray) {
    showError('Frame này đã có trong cả hai khay.');
    return false;
  }

  let added = false;
  if (!existsInTeamTray) added = await voteForItem(item);
  if (!existsInMyTray) added = await addFrameToMyEvent(item) || added;
  return added;
}

async function removeFrameFromMyEvent(selectionId) {
  if (state.trakeUsers?.[state.clientId]?.frames) {
    state.trakeUsers[state.clientId].frames = state.trakeUsers[state.clientId].frames.filter(
      f => f.selection_id !== selectionId
    );
    renderTrakeDrawer();
    renderTrakeTray();
  }
  try {
    const resp = await fetch('/team/trake/user-frame/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: state.clientId,
        selection_id: selectionId
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Không xóa được frame khỏi khay của bạn.');
    applyTeamState(data);
  } catch (err) {
    showError(err.message || String(err));
  }
}

async function clearMyTrakeFrames() {
  const myEntry = state.trakeUsers?.[state.clientId];
  if (!myEntry || !Array.isArray(myEntry.frames) || myEntry.frames.length === 0) return;
  const previousFrames = myEntry.frames;
  myEntry.frames = [];
  renderTrakeDrawer();
  renderTrakeTray();
  try {
    const resp = await fetch('/team/trake/user-frame/clear', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({client_id: state.clientId})
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Không xóa được khay TRAKE của bạn.');
    applyTeamState(data);
  } catch (err) {
    myEntry.frames = previousFrames;
    renderTrakeDrawer();
    renderTrakeTray();
    showError(err.message || String(err));
  }
}

async function removeTrakeUser(clientId, name, frameCount) {
  try {
    const resp = await fetch('/team/trake/user/remove', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({client_id: clientId})
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || `Không xóa được user ${name}.`);
    applyTeamState(data);
    showError('');
  } catch (err) {
    showError(err.message || String(err));
  }
}

function renderTrakeMasterTray() {
  if (!els.trakeMasterFrames) return;
  const allTrakeFrames = state.trakeFrames || [];
  const trakeVideoId = allTrakeFrames[0]?.item?.video_id;

  if (els.trakeMasterCount) {
    els.trakeMasterCount.textContent = `${allTrakeFrames.length} frame`;
  }
  if (els.trakeMasterVideo) {
    if (trakeVideoId) {
      els.trakeMasterVideo.textContent = `Video: ${trakeVideoId}`;
      els.trakeMasterVideo.hidden = false;
    } else {
      els.trakeMasterVideo.hidden = true;
    }
  }
  if (els.trakeMasterSubmitBtn) {
    els.trakeMasterSubmitBtn.disabled = allTrakeFrames.length === 0;
  }
  if (els.trakeMasterClearBtn) {
    els.trakeMasterClearBtn.disabled = allTrakeFrames.length === 0;
  }

  els.trakeMasterFrames.innerHTML = '';
  if (allTrakeFrames.length === 0) {
    els.trakeMasterFrames.innerHTML = '<div class="trake-empty-hint">Kéo frame từ khay của thành viên hoặc từ kết quả tìm kiếm thả vào đây để nộp.</div>';
    return;
  }

  allTrakeFrames.forEach((vote, index) => {
    const item = vote.item;
    if (!item) return;
    const imageUrl = item.thumbnail_url || item.image_url || `/thumbnail/${encodeURIComponent(item.keyframe_id)}`;
    const chip = document.createElement('div');
    chip.className = 'trake-frame-chip';
    chip.draggable = true;

    chip.addEventListener('dragstart', event => {
      chip.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-aic-trake-master-index', index.toString());
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('is-dragging');
    });

    chip.addEventListener('dragover', event => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
    });

    chip.addEventListener('drop', async event => {
      event.preventDefault();
      event.stopPropagation();
      const fromIndex = parseInt(event.dataTransfer.getData('application/x-aic-trake-master-index'), 10);
      if (!isNaN(fromIndex) && fromIndex !== index) {
        const itemToMove = allTrakeFrames.splice(fromIndex, 1)[0];
        allTrakeFrames.splice(index, 0, itemToMove);
        state.trakeFrames = [...allTrakeFrames];
        renderTrakeMasterTray();
        renderTrakeTray();
        try {
          await fetch('/team/trake/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frames: state.trakeFrames })
          });
        } catch (err) {
          console.error('Failed to sync reorder:', err);
        }
      }
    });

    chip.innerHTML = `
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.video_id)} #${escapeHtml(frameId(item))}" />
      <span class="trake-chip-order">${index + 1}</span>
      <span class="trake-chip-event-tag">E${index + 1}</span>
      <button class="trake-chip-remove" type="button" title="Xóa khỏi khay chung">&times;</button>
    `;

    chip.addEventListener('click', () => {
      if (state.activeVideoItem && state.activeVideoItem.video_id === item.video_id) {
        seekVideoToSeconds(answerTimeMs(item) / 1000, true);
      } else {
        openResult(item);
      }
    });

    chip.querySelector('.trake-chip-remove').addEventListener('click', event => {
      event.stopPropagation();
      removeTrakeFrame(vote);
    });

    els.trakeMasterFrames.appendChild(chip);
  });
}

function renderTrakeUserCards() {
  if (!els.trakeUserCards) return;
  const userCards = els.trakeUserCards;
  userCards.innerHTML = '';

  const userEntries = orderedTrakeUsers();
  const totalFrames = userEntries.reduce(
    (total, [, user]) => total + (Array.isArray(user.frames) ? user.frames.length : 0),
    0
  );
  if (els.trakeToggleCount) {
    els.trakeToggleCount.textContent = String(totalFrames);
    els.trakeToggleCount.hidden = totalFrames === 0;
  }

  userEntries.forEach(([uid, userData]) => {
    if (!uid) return;
    const isMe = uid === state.clientId;
    const name = isMe
      ? (state.memberName || state.dresUsername || userData.name || 'Bạn')
      : (userData.name || 'Thành viên');
    const currentEvent = isMe ? (state.myTrakeEvent || userData.event || 1) : (userData.event || 1);
    const frames = userData.frames || [];

    const card = document.createElement('div');
    card.className = `trake-user-card${isMe ? ' is-me' : ''}`;

    let eventButtonsHtml = '';
    for (let e = 1; e <= 5; e++) {
      const isActive = e === currentEvent;
      eventButtonsHtml += `
        <button class="trake-event-btn${isActive ? ' is-active' : ''}" type="button" data-event="${e}" ${isMe ? '' : 'disabled'}>
          E${e}
        </button>
      `;
    }

    card.innerHTML = `
      <div class="trake-user-head">
        <div class="trake-user-info">
          <span class="trake-user-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</span>
          <span class="trake-user-name">${escapeHtml(name)}</span>
          ${isMe ? '<span class="trake-me-badge">Bạn</span>' : ''}
        </div>
        <div class="trake-user-head-actions">
          ${isMe && frames.length > 0 ? '<button class="trake-user-clear-btn" type="button" title="Xóa toàn bộ frame trong khay của bạn">Xóa khay</button>' : ''}
          <button class="trake-user-delete-btn" type="button" title="Xóa user này khỏi Team Hub">Xóa user</button>
        </div>
      </div>
      <div class="trake-event-control-wrap">
        <span class="trake-event-label">Đang làm Event:</span>
        <div class="trake-event-selector">
          ${eventButtonsHtml}
        </div>
      </div>
      <div class="trake-user-tray" data-uid="${escapeHtml(uid)}">
      </div>
    `;

    card.querySelector('.trake-user-delete-btn')?.addEventListener('click', () => {
      void removeTrakeUser(uid, name, frames.length);
    });

    if (isMe) {
      card.querySelector('.trake-user-clear-btn')?.addEventListener('click', clearMyTrakeFrames);
      card.querySelectorAll('.trake-event-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const ev = parseInt(btn.dataset.event, 10);
          setMyTrakeEvent(ev);
        });
      });
    }

    const tray = card.querySelector('.trake-user-tray');
    if (isMe) {
      tray.addEventListener('dragover', event => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        tray.style.borderColor = '#6366f1';
        tray.style.background = 'rgba(99, 102, 241, 0.15)';
      });
      tray.addEventListener('dragleave', event => {
        event.stopPropagation();
        tray.style.borderColor = '';
        tray.style.background = '';
      });
      tray.addEventListener('drop', async event => {
        event.preventDefault();
        event.stopPropagation();
        tray.style.borderColor = '';
        tray.style.background = '';
        const keyframeJson = event.dataTransfer.getData('application/x-aic-keyframe');
        if (keyframeJson) {
          try {
            const item = JSON.parse(keyframeJson);
            if (item) {
              await addFrameToBothTrays(item);
            }
          } catch (err) {
            console.error('Failed to drop keyframe to user tray:', err);
          }
        }
      });
    }
    if (frames.length === 0) {
      tray.innerHTML = isMe
        ? `<span class="trake-user-empty">Khay của bạn đang trống. Bấm "Thêm frame" hoặc kéo frame vào đây.</span>`
        : `<span class="trake-user-empty">${escapeHtml(name)} chưa thêm frame nào.</span>`;
    } else {
      frames.forEach(f => {
        const item = f.item;
        if (!item) return;
        const imageUrl = item.thumbnail_url || item.image_url || `/thumbnail/${encodeURIComponent(item.keyframe_id)}`;
        const chip = document.createElement('div');
        chip.className = 'trake-frame-chip';
        chip.draggable = true;
        chip.title = 'Kéo thả lên Khay Chung để nộp bài';

        chip.addEventListener('dragstart', event => {
          chip.classList.add('is-dragging');
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData('application/x-aic-trake-user-frame', JSON.stringify({
            item: item,
            name: name,
            event: f.event || currentEvent
          }));
        });
        chip.addEventListener('dragend', () => {
          chip.classList.remove('is-dragging');
        });

        chip.innerHTML = `
          <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.video_id)} #${escapeHtml(frameId(item))}" />
          <span class="trake-chip-event-tag">E${f.event || currentEvent}</span>
          ${isMe ? '<button class="trake-chip-remove" type="button" title="Xóa frame này">&times;</button>' : ''}
        `;

        chip.addEventListener('click', () => {
          if (state.activeVideoItem && state.activeVideoItem.video_id === item.video_id) {
            seekVideoToSeconds(answerTimeMs(item) / 1000, true);
          } else {
            openResult(item);
          }
        });

        if (isMe) {
          chip.querySelector('.trake-chip-remove')?.addEventListener('click', ev => {
            ev.stopPropagation();
            removeFrameFromMyEvent(f.selection_id);
          });
        }

        tray.appendChild(chip);
      });
    }

    userCards.appendChild(card);
  });
}

function renderTrakeDrawer() {
  renderTrakeMasterTray();
  renderTrakeUserCards();
}

function initTrakeDrawerEvents() {
  if (els.trakePanelToggleBtn) {
    els.trakePanelToggleBtn.addEventListener('click', () => toggleTrakeDrawer());
  }
  if (els.closeTrakeDrawerBtn) {
    els.closeTrakeDrawerBtn.addEventListener('click', () => toggleTrakeDrawer(false));
  }
  if (els.trakeMasterClearBtn) {
    els.trakeMasterClearBtn.addEventListener('click', clearTrakeFrames);
  }
  if (els.trakeMasterSubmitBtn) {
    els.trakeMasterSubmitBtn.addEventListener('click', submitSharedTrakeToDres);
  }
  if (els.trakeAddMyEventBtn) {
    els.trakeAddMyEventBtn.addEventListener('click', () => {
      if (state.activeVideoItem) captureDisplayedFrame();
      else {
        const item = state.selected?.[0] || (state.results?.[0]?.video_id ? state.results[0] : state.results?.[0]?.scenes?.[0]);
        if (item) void addFrameToBothTrays(item);
        else showError('Không tìm thấy frame nào để thêm vào khay.');
      }
    });
  }
  if (els.trakeMasterDropzone) {
    els.trakeMasterDropzone.addEventListener('dragover', event => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      els.trakeMasterDropzone.classList.add('is-drag-over');
    });
    els.trakeMasterDropzone.addEventListener('dragleave', event => {
      event.stopPropagation();
      els.trakeMasterDropzone.classList.remove('is-drag-over');
    });
    els.trakeMasterDropzone.addEventListener('drop', async event => {
      event.preventDefault();
      event.stopPropagation();
      els.trakeMasterDropzone.classList.remove('is-drag-over');

      const userFrameJson = event.dataTransfer.getData('application/x-aic-trake-user-frame');
      if (userFrameJson) {
        try {
          const parsed = JSON.parse(userFrameJson);
          if (parsed?.item) {
            await addTrakeFrame(parsed.item);
          }
        } catch (err) {
          console.error('Failed to drop user frame to master tray:', err);
        }
        return;
      }

      const keyframeJson = event.dataTransfer.getData('application/x-aic-keyframe');
      if (keyframeJson) {
        try {
          const item = JSON.parse(keyframeJson);
          if (item) {
            await addTrakeFrame(item);
          }
        } catch (err) {
          console.error('Failed to drop keyframe to master tray:', err);
        }
      }
    });
  }

  // Restore open state
  try {
    if (localStorage.getItem('aic_trake_drawer_open') === '1') {
      toggleTrakeDrawer(true);
    }
  } catch {}
}


// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.toggleTrakeDrawer = toggleTrakeDrawer; } catch (_) {}
  try { window.setMyTrakeEvent = setMyTrakeEvent; } catch (_) {}
  try { window.addFrameToMyEvent = addFrameToMyEvent; } catch (_) {}
  try { window.addFrameToBothTrays = addFrameToBothTrays; } catch (_) {}
  try { window.removeFrameFromMyEvent = removeFrameFromMyEvent; } catch (_) {}
  try { window.clearMyTrakeFrames = clearMyTrakeFrames; } catch (_) {}
  try { window.removeTrakeUser = removeTrakeUser; } catch (_) {}
  try { window.renderTrakeMasterTray = renderTrakeMasterTray; } catch (_) {}
  try { window.renderTrakeUserCards = renderTrakeUserCards; } catch (_) {}
  try { window.renderTrakeDrawer = renderTrakeDrawer; } catch (_) {}
  try { window.initTrakeDrawerEvents = initTrakeDrawerEvents; } catch (_) {}
}
