/**
 * ==============================================================================
 * TỆP TIN: js/modules/04_modals.js
 * MÔ TẢ:
 *   Quản lý các modal phụ: Log, Phân rã thời gian tìm kiếm (Timing breakdown), Thống kê & Bảng xếp hạng (Stats), Bảng phím tắt (Shortcuts).
 * ==============================================================================
 */

function openLogModal() {
  els.logContent.textContent = state.lastLog || 'Chưa có log.';
  els.logModal.hidden = false;
}

function closeLogModal() {
  els.logModal.hidden = true;
}

const TIMING_ROWS = [
  ['tokenize_ms', 'Tách và chuẩn bị câu chữ', 'Chia câu truy vấn thành các đơn vị mà mô hình MetaCLIP2 hiểu được.'],
  ['input_to_gpu_ms', 'Chuyển dữ liệu sang GPU', 'Đưa dữ liệu truy vấn từ bộ nhớ CPU sang GPU.'],
  ['model_forward_ms', 'Chạy mô hình MetaCLIP2', 'Thời gian mô hình tạo đặc trưng văn bản từ câu truy vấn.'],
  ['embedding_postprocess_ms', 'Hoàn thiện vector truy vấn', 'Lấy kết quả từ mô hình và chuẩn bị vector đầu ra.'],
  ['encode_ms', 'Tổng mã hóa truy vấn', 'Tổng phụ của các bước chuẩn bị câu chữ, chuyển dữ liệu và chạy MetaCLIP2.'],
  ['query_validate_ms', 'Kiểm tra vector truy vấn', 'Xác nhận vector truy vấn đúng kích thước và không chứa giá trị lỗi.'],
  ['normalize_ms', 'Chuẩn hóa vector', 'Đưa vector về cùng thang đo trước khi tính độ tương đồng.'],
  ['similarity_ms', 'So sánh với kho frame', 'Tính điểm giống nhau giữa truy vấn và toàn bộ vector frame trong database.'],
  ['topk_ms', 'Chọn kết quả tốt nhất', 'Lấy các frame có điểm cao nhất và sắp xếp theo thứ hạng.'],
  ['index_validate_ms', 'Kiểm tra kết quả truy hồi', 'Xác nhận chỉ số frame và điểm số trả về hợp lệ.'],
  ['retrieval_ms', 'Tổng thời gian truy hồi', 'Tổng phụ của chuẩn hóa, so sánh vector và chọn kết quả tốt nhất.'],
  ['gpu_to_cpu_conversion_ms', 'Đưa kết quả về CPU', 'Chuyển chỉ số và điểm số từ GPU về bộ nhớ CPU nếu cần.'],
  ['metadata_lookup_ms', 'Tra thông tin frame', 'Tìm metadata tương ứng với từng chỉ số vector kết quả.'],
  ['path_resolution_ms', 'Chuẩn bị đường dẫn', 'Tạo đường dẫn dùng để mở keyframe và video.'],
  ['response_building_ms', 'Tạo danh sách kết quả', 'Bổ sung thứ hạng, điểm số và thời điểm vào từng kết quả.'],
  ['metadata_ms', 'Tổng ghép thông tin kết quả', 'Tổng phụ của việc tra metadata và tạo danh sách frame/video trả về.'],
  ['ocr_search_ms', 'Tìm kiếm văn bản OCR', 'Tìm các frame có nội dung chữ khớp với truy vấn trong chỉ mục OCR.'],
  ['asr_search_ms', 'Tìm kiếm lời nói ASR', 'Tìm các đoạn transcript khớp với truy vấn và ánh xạ về shot đại diện.'],
  ['fusion_ms', 'Ghép điểm các nguồn', 'Kết hợp thứ hạng hình ảnh, OCR và ASR theo các trọng số đã chọn.'],
  ['anchor_search_ms', 'Tìm hành động anchor', 'Truy hồi toàn cục cho hành động nằm giữa chuỗi.'],
  ['local_stage_search_ms', 'Chấm các vùng lân cận', 'Chấm những shot trước và sau anchor có thể tạo thành chuỗi hợp lệ.'],
  ['stage_search_ms', 'Tổng tìm kiếm temporal', 'Tổng thời gian tìm anchor và chấm các vùng shot lân cận.'],
  ['temporal_join_ms', 'Ghép chuỗi thời gian', 'Dùng temporal DP để ghép các shot cùng video, đúng thứ tự và giới hạn khoảng cách.'],
  ['serialization_ms', 'Đóng gói phản hồi', 'Chuyển kết quả thành JSON để gửi về trình duyệt.']
  ,['candidate_filter_ms', 'Lọc cửa sổ temporal', 'Lấy frame cùng video, phía sau anchor và trong cửa sổ temporal đã cấu hình.']
  ,['global_search_ms', 'Tìm anchor toàn cục', 'Tìm Query A trên toàn bộ vector hợp lệ bằng PyTorch GPU.']
  ,['local_search_ms', 'Tìm kiếm cục bộ', 'Tổng thời gian tìm trên các cửa sổ temporal của tất cả anchor.']
  ,['sequence_build_ms', 'Ghép chuỗi temporal', 'Ghép frame theo A đến B đến C và tính Harmonic Mean.']
  ,['ranking_ms', 'Xếp hạng chuỗi', 'Loại chuỗi trùng, sắp xếp và lấy Top-K.']
  ,['session_update_ms', 'Cập nhật phiên', 'Cập nhật trạng thái phiên temporal trong RAM.']
  ,['frontend_response_ms', 'Frontend nhận phản hồi', 'Thời gian từ lúc gửi request đến khi trình duyệt đọc xong JSON.']
  ,['transit_up_ms', '🛫 Chặng đi (Client → Backend)', 'Thời gian request truyền qua mạng từ trình duyệt đến backend.']
  ,['transit_down_ms', '🛬 Chặng về (Backend → Client)', 'Thời gian kết quả truyền qua mạng từ backend về lại trình duyệt.']
  ,['frontend_render_ms', 'Frontend dựng kết quả', 'Thời gian dựng DOM kết quả sau khi nhận phản hồi.']
  ,['first_thumbnail_ms', 'Thumbnail đầu tiên', 'Thời gian từ lúc dựng kết quả đến khi thumbnail đầu tiên sẵn sàng.']
  ,['all_visible_thumbnails_ms', 'Toàn bộ thumbnail', 'Thời gian từ lúc dựng kết quả đến khi toàn bộ thumbnail hiện tại tải xong.']
];

function formatMilliseconds(value) {
  if (value === null || value === undefined || value === '') return '—';
  const ms = Number(value);
  if (!Number.isFinite(ms)) return '—';
  return `${new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 4
  }).format(ms / 1000)} giây`;
}

function resetSearchTiming() {
  state.lastSearchTiming = null;
  els.searchTimingBtn.textContent = 'Tổng thời gian: chưa có';
  els.searchTimingBtn.disabled = true;
  els.searchTimingBtn.hidden = false;
}

function trackThumbnailTimings(startedAt) {
  const images = [...els.results.querySelectorAll('img')];
  if (!state.lastSearchTiming || images.length === 0) return;
  let completed = 0;
  let firstRecorded = false;
  const record = () => {
    if (!state.lastSearchTiming) return;
    const elapsed = performance.now() - startedAt;
    if (!firstRecorded) {
      state.lastSearchTiming.timings.first_thumbnail_ms = elapsed;
      firstRecorded = true;
    }
    completed += 1;
    if (completed === images.length) {
      state.lastSearchTiming.timings.all_visible_thumbnails_ms = elapsed;
    }
  };
  images.forEach(image => {
    if (image.complete) record();
    else {
      image.addEventListener('load', record, {once: true});
      image.addEventListener('error', record, {once: true});
    }
  });
}

function backendMethodLabel(method) {
  if (method === 'asr_fts5') return 'tìm kiếm lời nói bằng ASR';
  if (method && method.endsWith('+asr_fts5')) {
    return `${backendMethodLabel(method.slice(0, -9))} + ASR`;
  }
  if (method === 'ocr_fts5') return 'tìm kiếm văn bản bằng OCR';
  if (method && method.endsWith('+ocr_filter_fts5')) {
    return `${backendMethodLabel(method.slice(0, -16))} + lọc OCR`;
  }
  if (method && method.endsWith('+ocr_fts5')) {
    return `${backendMethodLabel(method.slice(0, -9))} + OCR`;
  }
  if (method === 'linear') return 'tìm tuần tự trên toàn bộ kho vector';
  if (method === 'milvus') return 'tìm kiếm gần đúng bằng Milvus';
  if (method === 'faiss') return 'tìm kiếm gần đúng bằng FAISS';
  return method || 'backend';
}

function renderSearchTiming() {
  const report = state.lastSearchTiming;
  if (!report) return;
  const timings = report.timings || {};
  const backendTotal = Number(timings.total_ms);
  const outsideBackend = Number.isFinite(backendTotal)
    ? Math.max(0, report.clientTotalMs - backendTotal)
    : null;

  els.timingClientTotal.textContent = formatMilliseconds(report.clientTotalMs);
  els.timingBackendTotal.textContent = formatMilliseconds(backendTotal);
  els.timingOutsideBackend.textContent = formatMilliseconds(outsideBackend);
  els.timingBackendNote.textContent =
    `Backend đang dùng ${backendMethodLabel(report.searchBackend)} trên ${new Intl.NumberFormat('vi-VN').format(report.totalCandidates || 0)} vector.`;
  els.timingTableBody.innerHTML = '';

  TIMING_ROWS.forEach(([key, label, description]) => {
    const value = Number(timings[key]);
    if (!Number.isFinite(value)) return;
    const row = document.createElement('tr');
    row.innerHTML = `
      <th scope="row">${label}</th>
      <td>${formatMilliseconds(value)}</td>
      <td>${description}</td>`;
    els.timingTableBody.appendChild(row);
  });
}

function openTimingModal() {
  if (!state.lastSearchTiming) return;
  renderSearchTiming();
  els.timingModal.hidden = false;
}

function closeTimingModal() {
  els.timingModal.hidden = true;
}

async function openStatsModal() {
  els.statsModal.hidden = false;
  const name = (state.memberName || state.dresUsername || '').trim();
  els.personalStatsList.innerHTML = '<div class="stats-empty">Đang tải dữ liệu...</div>';
  if (els.teamHistoryList) els.teamHistoryList.innerHTML = '<div class="stats-empty">Đang tải dữ liệu...</div>';
  els.leaderboardList.innerHTML = '<div class="stats-empty">Đang tải dữ liệu...</div>';
  try {
    const resp = await fetch(`/team/user/stats?name=${encodeURIComponent(name)}`);
    if (!resp.ok) throw new Error('Không thể tải thống kê');
    const data = await resp.json();

    els.personalSubCount.textContent = String(data.user_submissions_count || 0);
    if (els.teamHistorySubCount) els.teamHistorySubCount.textContent = String(data.total_team_submissions || 0);
    els.teamSubCount.textContent = String(data.total_team_submissions || 0);

    // Render Personal History
    const personal = data.personal_history || [];
    if (personal.length === 0) {
      els.personalStatsList.innerHTML = `<div class="stats-empty">${name ? `User <strong>${escapeHtml(name)}</strong> chưa nộp câu nào.` : 'Chưa có tên user. Hãy đặt tên để theo dõi.'}</div>`;
    } else {
      els.personalStatsList.innerHTML = personal.map(item => {
        const timeStr = item.timestamp ? new Date(item.timestamp * 1000).toLocaleTimeString() : '';
        const summary = item.content_summary || (Array.isArray(item.row) ? item.row.join(', ') : '');
        return `
          <div class="stats-card">
            <div class="stats-card-main">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="stats-card-query">${escapeHtml(item.query_filename)}</span>
                <span class="query-chip-viewer" style="background: #ecfdf5; color: #047857; border-color: #a7f3d0;">${escapeHtml((item.task_type || '').toUpperCase())}</span>
              </div>
              <span class="stats-card-answer"><strong>Nội dung nộp:</strong> ${escapeHtml(summary)}</span>
            </div>
            <span class="stats-card-time">${escapeHtml(timeStr)}</span>
          </div>
        `;
      }).join('');
    }

    // Render Team History (Who modified what, which question)
    const teamHistory = data.team_history || [];
    if (els.teamHistoryList) {
      if (teamHistory.length === 0) {
        els.teamHistoryList.innerHTML = '<div class="stats-empty">Chưa có hoạt động nộp bài nào từ đội.</div>';
      } else {
        els.teamHistoryList.innerHTML = teamHistory.map(item => {
          const timeStr = item.timestamp ? new Date(item.timestamp * 1000).toLocaleTimeString() : '';
          const summary = item.content_summary || (Array.isArray(item.row) ? item.row.join(', ') : '');
          const isMe = name && (item.user_name || '').trim().toLowerCase() === name.toLowerCase();
          return `
            <div class="stats-card" style="border-left: 3px solid ${isMe ? 'var(--accent)' : '#9ca3af'};">
              <div class="stats-card-main">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="query-chip-viewer" style="${isMe ? 'background: #fdf2f2; color: var(--accent); border-color: #fca5a5;' : ''}">👤 ${escapeHtml(item.user_name || 'Ẩn danh')}</span>
                  <span class="stats-card-query">${escapeHtml(item.query_filename)}</span>
                  <span style="font-size: 11px; font-weight: 700; color: #6b7280;">[${escapeHtml((item.task_type || '').toUpperCase())}]</span>
                </div>
                <span class="stats-card-answer"><strong>Đã nộp/sửa:</strong> ${escapeHtml(summary)}</span>
              </div>
              <span class="stats-card-time">${escapeHtml(timeStr)}</span>
            </div>
          `;
        }).join('');
      }
    }

    // Render Leaderboard
    const leaderboard = data.leaderboard || [];
    if (leaderboard.length === 0) {
      els.leaderboardList.innerHTML = '<div class="stats-empty">Toàn đội chưa nộp câu nào.</div>';
    } else {
      els.leaderboardList.innerHTML = leaderboard.map((item, idx) => `
        <div class="leaderboard-item">
          <div>
            <span class="leaderboard-rank ${idx === 0 ? 'top-1' : ''}">${idx + 1}</span>
            <span class="leaderboard-name">${escapeHtml(item.name)}</span>
          </div>
          <span class="leaderboard-count">${item.count} câu</span>
        </div>
      `).join('');
    }
  } catch (err) {
    els.personalStatsList.innerHTML = `<div class="stats-empty is-error">${escapeHtml(err.message || String(err))}</div>`;
  }
}

function closeStatsModal() {
  els.statsModal.hidden = true;
}

function openShortcutsModal() {
  if (els.shortcutsModal) els.shortcutsModal.hidden = false;
}

function closeShortcutsModal() {
  if (els.shortcutsModal) els.shortcutsModal.hidden = true;
}


// Gắn các hàm và biến lên window để các module khác truy cập thông suốt
if (typeof window !== "undefined") {
  try { window.openLogModal = openLogModal; } catch (_) {}
  try { window.closeLogModal = closeLogModal; } catch (_) {}
  try { window.formatMilliseconds = formatMilliseconds; } catch (_) {}
  try { window.resetSearchTiming = resetSearchTiming; } catch (_) {}
  try { window.trackThumbnailTimings = trackThumbnailTimings; } catch (_) {}
  try { window.backendMethodLabel = backendMethodLabel; } catch (_) {}
  try { window.renderSearchTiming = renderSearchTiming; } catch (_) {}
  try { window.openTimingModal = openTimingModal; } catch (_) {}
  try { window.closeTimingModal = closeTimingModal; } catch (_) {}
  try { window.openStatsModal = openStatsModal; } catch (_) {}
  try { window.closeStatsModal = closeStatsModal; } catch (_) {}
  try { window.openShortcutsModal = openShortcutsModal; } catch (_) {}
  try { window.closeShortcutsModal = closeShortcutsModal; } catch (_) {}
  try { window.TIMING_ROWS = TIMING_ROWS; } catch (_) {}
}
