/**
 * ==============================================================================
 * TỆP TIN: js/app.js
 * MÔ TẢ:
 *   Tệp tin điều phối trung tâm (Main Orchestrator Entrypoint):
 *   - Trỏ tới và nạp toàn bộ 14 mô-đun chức năng chuyên biệt đã được phân tách.
 *   - Bảo tồn nguyên vẹn 100% giao diện (UI) và logic tìm kiếm/nộp bài gốc.
 *   - Các mô-đun được nạp tuần tự theo thứ tự phụ thuộc:
 *       1. 01_state.js            : State toàn cục & phần tử DOM (els)
 *       2. 02_query_catalog.js    : Danh mục câu hỏi đề thi (Query Strip)
 *       3. 03_audio_feedback.js   : Phản hồi nộp bài & âm thanh chúc mừng
 *       4. 04_modals.js           : Hộp thoại Log, Timing, Stats, Shortcuts
 *       5. 05_stages.js           : Giao diện chặng tìm kiếm Stage A, B, C...
 *       6. 06_video_player.js     : Trình phát video HLS, Filmstrip scrubbing
 *       7. 07_context_overviews.js: Modal toàn cảnh 24 shot & 48 frame
 *       8. 08_video_asr.js        : Bảng phụ đề ASR thời gian thực
 *       9. 09_results_selection.js: Lưới kết quả tìm kiếm & khay chọn
 *      10. 10_submission_dres.js  : Động cơ nộp bài DRES & CSV offline
 *      11. 11_team_socket.js      : WebSocket /ws/team đồng bộ nhóm
 *      12. 12_search_engine.js    : Động cơ tìm kiếm performSearch()
 *      13. 13_trake_drawer.js     : Bảng phối hợp TRAKE Collaboration
 *      14. 14_events_bootstrap.js : Gắn kết sự kiện bàn phím & khởi chạy
 * ==============================================================================
 */

import './modules/01_state.js';
import './modules/02_query_catalog.js';
import './modules/03_audio_feedback.js';
import './modules/04_modals.js';
import './modules/05_stages.js';
import './modules/06_video_player.js';
import './modules/07_context_overviews.js';
import './modules/08_video_asr.js';
import './modules/09_results_selection.js';
import './modules/10_submission_dres.js';
import './modules/11_team_socket.js';
import './modules/12_search_engine.js';
import './modules/13_trake_drawer.js';
import './modules/14_events_bootstrap.js';

console.log('[AICApp] All 14 modular components loaded successfully. Application ready.');
