# 🏆 AI Challenge 2026 - Video Retrieval System (Team Prometheus)

Hệ thống truy vấn video đa phương thức tốc độ cao (**Multi-modal Video Retrieval System**) được xây dựng phục vụ cuộc thi **AI Challenge 2026**. Hệ thống tích hợp tìm kiếm hình ảnh (Visual Embeddings), nhận diện văn bản trong ảnh (OCR), nhận diện giọng nói / phụ đề (ASR), tìm kiếm chuỗi sự kiện theo dòng thời gian (Temporal Multi-Stage Search), đồng bộ đội thi thời gian thực qua WebSocket và tích hợp nộp bài tự động qua DRES / CSV.

---

## 📑 Mục Lục
1. [Tổng Quan Kiến Trúc](#-tổng-quan-kiến-trúc)
2. [Cấu Trúc Chi Tiết Toàn Bộ File & Thư Mục](#-cấu-trúc-chi-tiết-toàn-bộ-file--thư-mục)
   - [Thư mục Gốc (Root)](#thư-mục-gốc-root)
   - [Backend Engine (`backend/`)](#backend-engine-backend)
   - [Frontend Web & Gateway (`frontend/`)](#frontend-web--gateway-frontend)
   - [BEiT-3 Model Runtimes](#beit-3-model-runtimes)
3. [Quy Tắc Quản Lý Dữ Liệu Nặng & `.gitignore`](#-quy-tắc-quản-lý-dữ-liệu-nặng--gitignore)
4. [Yêu Cầu Hệ Thống & Cài Đặt](#-yêu-cầu-hệ-thống--cài-đặt)
5. [Hướng Dẫn Khởi Chạy Hệ Thống](#-hướng-dẫn-khởi-chạy-hệ-thống)
   - [Cơ Chế Quét & Kiểm Tra Tài Nguyên](#-cơ-chế-quét--kiểm-tra-tài-nguyên)
   - [Kịch Bản 1: Mô Hình Phân Tán (Server GPU + Local PC) - Khuyên Dùng Khi Thi Đấu](#-kịch-bản-1-mô-hình-phân-tán-server-gpu--local-pc---khuyên-dùng-khi-thi-đấu)
   - [Kịch Bản 2: Chạy All-in-One Trên Một Máy Cá Nhân (PowerShell / Batch)](#-kịch-bản-2-chạy-all-in-one-trên-một-máy-cá-nhân-powershell--batch)
   - [Kịch Bản 3: Khởi Chạy Thủ Công Qua Terminal](#-kịch-bản-3-khởi-chạy-thủ-công-qua-terminal)
6. [Luồng Hoạt Động Của Hệ Thống (Data & Workflow)](#-luồng-hoạt-động-của-hệ-thống-data--workflow)
7. [Bảng Phím Tắt Tiện Ích (Hotkeys)](#-bảng-phím-tắt-tiện-ích-hotkeys)
8. [Hướng Dẫn Đẩy Mã Nguồn Lên GitHub](#-hướng-dẫn-đẩy-mã-nguồn-lên-github)

---

## 🌟 Tổng Quan Kiến Trúc

Hệ thống được thiết kế theo mô hình kiến trúc phân tán hiệu năng cao (**Decoupled High-Throughput Architecture**):

```
+-------------------------------------------------------------------------+
|                       CLIENT BROWSER (User UI)                          |
|   - Multi-stage Query UI   - Image Similarity Dropzone   - HLS Player   |
|   - Realtime Team Sync     - DRES / CSV Submission       - Video Modal  |
+------------------------------------+------------------------------------+
                                     | (HTTP & WebSockets: 8080)
                                     v
+-------------------------------------------------------------------------+
|                 FRONTEND SERVER (FastAPI Gateway - Port 8080)           |
|   - serve_frontend.py: Web UI Hosting & Static Asset Server             |
|   - WebSocket Hub (/ws/team): Đồng bộ thành viên, bình chọn, TRAKE      |
|   - DRES Client: Đăng nhập session, nộp KIS/QA/TRAKE, nhận feedback     |
|   - Reverse Proxy: Chuyển tiếp truy vấn Search & Stream HLS             |
+------------------------------------+------------------------------------+
                                     | (Internal REST API: 8036)
                                     v
+-------------------------------------------------------------------------+
|                  BACKEND ENGINE (Torch-GPU - Port 8036)                 |
|   - lazy_server.py: Quản lý nạp model bất đồng bộ & định tuyến truy vấn |
|   - embedder.py: Trích xuất vector MetaCLIP-2 (512D) & BEiT-3 (1024D)   |
|   - index.py: GPU Cosine Similarity Dot-Product & SQLite Metadata Filter|
|   - temporal_search.py: Khớp chuỗi sự kiện A -> B -> C qua Sliding Window|
|   - ocr.py & asr.py: BM25/Fuzzy Search trên OCR (Monkey/PP) & ASR Audio |
+-------------------------------------------------------------------------+
```

---

## 📂 Cấu Trúc Chi Tiết Toàn Bộ File & Thư Mục

### Thư mục Gốc (Root)

```text
system/
├── backend/                        # Module Backend AI Retrieval Engine (MetaCLIP-2, BEiT-3, OCR, ASR)
├── frontend/                       # Module Frontend Web SPA & FastAPI Gateway Server
├── beit3_runtime/                  # Mã nguồn môi trường & tokenizer cho mô hình BEiT-3
├── merged_beit3_large_numeric/     # (Local) Checkpoints & Embeddings BEiT-3
├── scripts/                        # Thư viện script hỗ trợ PowerShell (system_common.ps1)
├── run_backend.sh                  # [Linux] Khởi động Backend trên Server GPU (mask tên aic_system)
├── run_frontend.sh                 # [Linux] Khởi động Frontend Gateway trên Server
├── start_backend.bat               # [Windows] Batch 1-Click khởi động Backend
├── start_frontend.bat              # [Windows] Batch 1-Click khởi động Frontend (nối Server GPU + Local frames)
├── start_backend.ps1               # [Windows] PowerShell 1-Click khởi động Backend
├── start_frontend.ps1              # [Windows] PowerShell 1-Click khởi động Frontend
├── start_system.ps1                # [Windows] PowerShell khởi động toàn bộ hệ thống All-in-One
├── check_system.ps1                # [Windows] Kiểm tra tính hợp lệ của toàn bộ tài nguyên hệ thống
├── system.config.json              # File cấu hình trung tâm (đường dẫn, port, GPU, model, features)
├── requirements.txt                # Danh sách thư viện Python cần thiết
├── .gitignore                      # Bộ lọc loại trừ file nặng khi đẩy lên GitHub
└── README.md                       # Tài liệu hướng dẫn sử dụng và cấu trúc hệ thống
```

---

### Backend Engine (`backend/`)

Thư mục xử lý tính toán AI, trích xuất embedding, lập chỉ mục vector trên GPU và thực hiện các thuật toán truy vấn.

```text
backend/
├── app/
│   ├── __init__.py                 # Package marker cho module app
│   ├── config.py                   # Cấu hình đường dẫn dataset, thư mục frames, database & model
│   ├── lazy_server.py              # HTTP Server độc lập, hỗ trợ lazy-loading model, profiler độ trễ
│   ├── embedder.py                 # Lớp Text/Image Embedder cho MetaCLIP-2 và BEiT-3 (PyTorch CUDA FP16)
│   ├── index.py                    # Vector search engine trên GPU (TorchGpuIndex) và SQLite Metadata
│   ├── temporal_search.py          # Thuật toán truy vấn sự kiện thời gian (Temporal Search A -> B -> C)
│   ├── ocr.py                      # Bộ tra cứu và xếp hạng văn bản OCR (MonkeyOCR v2, PP-OCRv6)
│   ├── asr.py                      # Bộ tra cứu và khớp phụ đề âm thanh / giọng nói (ASR Transcript)
│   └── milvus_store.py             # Adapter kết nối lưu trữ và truy vấn trên Milvus Vector DB
│
├── artifacts/                      # (Local) Thư mục chứa cơ sở dữ liệu SQLite & cấu hình chỉ mục
│   ├── asr_index/
│   │   └── asr.sqlite              # SQLite database chứa toàn bộ transcript ASR theo timestamp
│   └── current_index/
│       ├── records.sqlite          # Metadata chi tiết từng keyframe (video_id, frame_idx, pts_time)
│       ├── monkey_ocr.sqlite       # Cơ sở dữ liệu chữ nhận diện từ MonkeyOCR v2
│       ├── monkey_ocr_merged.jsonl # File trung gian raw text OCR phục vụ index
│       ├── active_deleted_manifest.jsonl # Danh sách frame bị loại trừ / frame trùng lặp
│       ├── index_config.json       # Cấu hình tham số chỉ mục (số lượng vector, chiều embedding)
│       └── video_ranges.json       # Bảng ánh xạ khoảng cách frame đầu/cuối của từng video
│
├── query_BTC/                      # Danh sách file đề bài chính thức của BTC (Phase 2)
│   ├── query-p2-1-kis.txt          # Đề bài dạng KIS (Known-Item Search)
│   ├── query-p2-8-trake.txt        # Đề bài dạng TRAKE (Tracking Keyframes Sequence)
│   ├── query-p2-12-qa.txt          # Đề bài dạng Q&A (Video Question Answering)
│   └── ...                         # 30 câu truy vấn thi đấu chính thức
│
├── music/                          # (Local) File âm thanh hiệu ứng khi nộp bài
│   ├── HEAVENLY JUMPSTYLE.mp3
│   ├── MONTAGEM ALQUIMIA.mp3
│   └── ...
│
├── embeddings.npy                  # (Local - 738MB) Vector embeddings MetaCLIP-2 đã tính sẵn
└── requirements-milvus.txt         # Thư viện bổ sung nếu kích hoạt Milvus Backend
```

#### Chi tiết các file cốt lõi của Backend:
1. **`app/lazy_server.py`**:
   - Khởi tạo máy chủ HTTP đa luồng (`ThreadingHTTPServer`) với hệ thống logging màu sắc chuẩn ANSI (Uvicorn-style).
   - Tải mô hình bất đồng bộ trong nền (background thread), không làm nghẽn quá trình kiểm tra `/health`.
   - Cung cấp các REST endpoints chính:
     - `GET /health`: Trả về trạng thái máy chủ, bộ nhớ GPU sử dụng, số lượng vector và mô hình đang hoạt động.
     - `POST /search`: Tìm kiếm đơn truy vấn, đa truy vấn (multi-query), lọc OCR, lọc ASR và Image Similarity.
     - `POST /temporal-search`: Tìm kiếm chuỗi sự kiện A -> B -> C với cửa sổ trượt thời gian (Dynamic Sliding Window).
     - `GET /thumbnail/{keyframe_id}` & `GET /keyframe/{keyframe_id}`: Trả về hình ảnh thumbnail/frame WebP hoặc JPEG.
2. **`app/embedder.py`**:
   - `MetaClip2Embedder`: Nạp mô hình `facebook/metaclip-2-worldwide-b16-384`, mã hóa câu truy vấn thành vector 512 chiều chuẩn hóa L2 trên GPU CUDA (FP16).
   - `Beit3Embedder`: Nạp checkpoint `beit3_large_itc_patch16_224.pth`, tokenization qua SentencePiece và trích xuất vector 1024 chiều.
3. **`app/index.py`**:
   - `TorchGpuIndex`: Thực thi phép nhân ma trận trên GPU Tensor (`torch.mm`) để tính Cosine Similarity tức thì với hàng triệu frame trong thời gian < 15ms.
   - `RetrievalState`: Quản lý bộ đệm vector, nạp metadata từ SQLite và loại trừ tự động các frame bị xóa.
4. **`app/temporal_search.py`**:
   - `TemporalSearchService`: Thuật toán 2 giai đoạn (Stage 1 Top-K Candidate Selection + Stage 2 Local Search & Window Filtering) giúp truy tìm chính xác chuỗi hành động diễn ra liên tiếp trong cùng một video.
5. **`app/ocr.py` & `app/asr.py`**:
   - Tìm kiếm từ khóa text xuất hiện trên màn hình hoặc trong lời thoại với thuật toán đối sánh từ vựng (BM25 / Substring Matching) và trộn điểm số (Score Fusion) vào điểm Visual.

---

### Frontend Web & Gateway (`frontend/`)

Thư mục chứa giao diện web điều khiển thi đấu (Single Page Application) và máy chủ trung gian FastAPI.

```text
frontend/
├── app.js                          # Toàn bộ logic giao diện, phím tắt, WebSocket & API client
├── index.html                      # Giao diện chính của Team Prometheus (Dark/Light mode)
├── styles.css                      # Hệ thống Design System CSS hiện đại (Glassmorphism, animations)
├── serve_frontend.py               # FastAPI Gateway Server (Port 8080)
├── video_fps.json                  # Bảng metadata ánh xạ chỉ số FPS chính xác của từng video
│
├── runtime/                        # (Local) Bộ đệm phiên làm việc & log hoạt động
│   ├── team_state.json             # Trạng thái phòng thi đấu của đội (thành viên, pinboard, vote)
│   ├── team_captures/              # Ảnh chụp màn hình tạm thời được các thành viên chia sẻ
│   ├── user_profiles.json          # Danh sách người dùng cục bộ
│   ├── submission_activity.csv     # Nhật ký nộp bài chi tiết theo thời gian thực
│   └── submission_log.json         # Lịch sử phản hồi từ hệ thống chấm thi DRES
│
└── submission/                     # (Local) Thư mục tự động xuất file nộp bài offline
    ├── query-p2-1-kis.csv          # File kết quả nộp bài dạng CSV
    ├── submission_activity.csv     # Thống kê đóng góp của từng thành viên
    └── submission.zip              # File nén toàn bộ kết quả nộp bài của đợt thi
```

#### Chi tiết các file cốt lõi của Frontend:
1. **`serve_frontend.py`**:
   - Chạy trên nền tảng **FastAPI & Uvicorn** (Port 8080).
   - Đóng vai trò **API Gateway & Reverse Proxy**:
     - Định tuyến `/search`, `/temporal-search`, `/keyframe/` sang Backend AI Engine (Port 8036).
     - Định tuyến video HLS streaming `/hls/` sang máy chủ media (Port 8052).
   - **Real-time Collaboration (`/ws/team`)**: Quản lý WebSocket hub kết nối các thành viên trong đội; đồng bộ tức thì câu hỏi đang làm (`active_query`), các frame được vote, chuỗi timeline TRAKE và bảng xếp hạng thành viên.
   - **DRES Client**: Quản lý kết nối tới server thi đấu DRES chính thức, hỗ trợ đăng nhập session, nộp câu trả lời KIS/QA/TRAKE và cập nhật trạng thái chấm điểm (CORRECT, WRONG, DUPLICATE).
   - **Offline CSV Exporter**: Tự động ghi nhận các lựa chọn của đội thành các file CSV đạt chuẩn định dạng nộp bài của BTC và đóng gói thành `submission.zip`.
2. **`index.html`**:
   - Giao diện thiết kế cao cấp dành riêng cho Team Prometheus với bố cục tối ưu hóa cho màn hình thi đấu:
     - **Top Bar**: Query Strip (chuyển câu hỏi 1-click), Đổi tên thành viên, Chế độ DRES/CSV, Chuyển đổi mô hình (MetaCLIP-2 / BEiT-3), Nút Thống kê, Nút Đổi giao diện Sáng/Tối.
     - **Query Panel (Trái)**: Nhập câu truy vấn sự kiện (hỗ trợ nhiều Stage A, B, C cho Temporal Search), Bộ lọc Video ID, Image Similarity Dropzone (kéo thả ảnh tìm kiếm tương đồng).
     - **Results Area (Phải)**: Lưới hiển thị kết quả Keyframe sắc nét, thanh tóm tắt thời gian truy vấn (Profiling ms), nhãn thời gian PTS.
     - **Modals & Overlays**: Video Player Modal (xem video HLS tại giây tương ứng), DRES Config Modal, Thống kê cá nhân & Lịch sử nộp bài.
3. **`app.js`**:
   - Điều khiển toàn bộ tương tác phía Client mà không phụ thuộc thư viện nặng (Vanilla JS tốc độ cao).
   - Tích hợp phím tắt nhanh, tự động lưu trữ trạng thái vào LocalStorage, xử lý kéo thả ảnh, cắt ghép đoạn video và ghép chuỗi TRAKE.
4. **`styles.css`**:
   - Thiết kế chuẩn Modern Web UI: Tông màu Dark Mode chống mỏi mắt, hiệu ứng kính mờ (Glassmorphism), hiệu ứng hover mượt mà, layout CSS Grid co giãn linh hoạt.

---

### BEiT-3 Model Runtimes

* **`beit3_runtime/`**: Chứa mã nguồn kiến trúc mô hình BEiT-3 được tinh chỉnh (`fairscale`, `timm`, `torchscale`) và file tokenizer `beit3.spm`.
* **`merged_beit3_large_numeric/`**: Thư mục cục bộ chứa các file checkpoint trọng số mô hình lớn (`beit3_large_itc_patch16_224.pth`, `beit3_large_itc_patch16_224_COCO.pth`) và file vector chỉ mục `embeddings.npy`. *(Đã được cấu hình tự động loại trừ khỏi Git)*.

---

## 🚫 Quy Tắc Quản Lý Dữ Liệu Nặng & `.gitignore`

Để đảm bảo không vượt quá giới hạn **100MB** của GitHub và giữ repository luôn gọn nhẹ, file [`.gitignore`](.gitignore) đã được quét và cấu hình loại trừ:

| Nhóm dữ liệu | Các mẫu tệp / thư mục bị loại trừ | Lý do loại trừ |
| :--- | :--- | :--- |
| **Model Weights** | `*.pth`, `*.pt`, `*.bin`, `*.onnx`, `*.safetensors`, `*.ckpt` | Dung lượng rất lớn (>1.3GB/file) |
| **Embeddings** | `*.npy`, `*.npz`, `backend/embeddings.npy`, `merged_beit3_large_numeric/` | Mảng vector nhị phân lớn (>700MB) |
| **Databases & Indexes** | `*.sqlite`, `*.sqlite3`, `*.db`, `*.jsonl` | Cơ sở dữ liệu metadata và text OCR (>250MB); các JSON cấu hình nhỏ vẫn được lưu trong Git |
| **Datasets & Videos** | `data/`, `keyframes/`, `synthetic_frames/`, `*.mp4`, `*.ts`, `*.m3u8` | Bộ dữ liệu video cuộc thi gốc |
| **Audio & Media** | `backend/music/`, `*.mp3`, `*.wav`, `*.flac` | File nhạc hiệu ứng cục bộ |
| **Submissions & Zip** | `*.zip`, `submission/`, `frontend/submission/` | File kết quả nộp bài sinh ra khi thi đấu |
| **Runtime & Cache** | `runtime/`, `frontend/runtime/`, `team_state.json`, `team_captures/`, `__pycache__/` | Dữ liệu tạm thời và bộ đệm phiên chạy |
| **Backups** | `frontend_backup*/`, `*_backup*/` | Bản sao lưu mã nguồn cục bộ |

---

## 💻 Yêu Cầu Hệ Thống & Cài Đặt

### 1. Yêu Cầu Phần Cứng & Môi Trường
* **Hệ điều hành**: Windows 10/11 hoặc Linux (Ubuntu 20.04/22.04).
* **GPU**: NVIDIA GPU có hỗ trợ CUDA (VRAM khuyến nghị >= 8GB để tải mô hình và vector trên GPU).
* **RAM**: Khuyến nghị >= 16GB.
* **Python**: Phiên bản 3.10 hoặc 3.11.

### 2. Cài Đặt Thư Viện Phụ Thuộc
Chạy lệnh sau tại thư mục gốc `system`:

```bash
pip install -r requirements.txt
```

---

## 🚀 Hướng Dẫn Khởi Chạy Hệ Thống

### 🔍 Cơ Chế Quét & Kiểm Tra Tài Nguyên

Hệ thống được thiết kế với cơ chế kiểm tra tài nguyên độc lập giữa khâu cấu hình, khâu Backend AI và khâu Frontend Web:

1. **Kiểm tra trước khi chạy (Pre-flight Check)**:
   * Chạy script `.\check_system.ps1` (trên Windows PowerShell).
   * Script sẽ quét toàn bộ file weights, checkpoints, các mảng vector `.npy`, database SQLite, keyframes, virtual environment và CUDA GPU. Báo cáo rõ ràng thành phần nào thiếu hoặc tùy chọn.
2. **Khi Backend khởi động (`lazy_server.py`)**:
   * Kiểm tra thiết bị CUDA GPU và cấp phát VRAM.
   * Quét và nạp ma trận vector (`embeddings.npy`) vào GPU Tensor VRAM (~4-5GB VRAM cho cả 2 model MetaCLIP-2 và BEiT-3).
   * Kết nối SQLite metadata (`records.sqlite`), text OCR (`monkey_ocr.sqlite`) và giọng nói (`asr.sqlite`).
3. **Khi Frontend khởi động (`serve_frontend.py`)**:
   * Quét thư mục ảnh Keyframes (`paths.keyframes_root` hoặc tham số `--keyframes-dir` / `--keyframe-root`).
   * **Cơ chế Zero-Network Local SSD Rendering**: Frontend ưu tiên đọc trực tiếp ảnh từ ổ đĩa cứng của máy cá nhân (Local SSD/HDD) mà không cần nạp qua mạng từ Server, giúp thao tác duyệt hàng trăm frame đạt độ trễ ~0ms.
   * **Tự động Fallback**: Nếu một frame bất kỳ chưa có trong ổ cứng cá nhân, Gateway sẽ tự động chuyển tiếp request để tải ảnh từ Backend Server về đệm.

---

### 🌐 Kịch Bản 1: Mô Hình Phân Tán (Server GPU + Local PC) - Khuyên Dùng Khi Thi Đấu

Đây là mô hình chuẩn tối ưu nhất cho đội thi: **Backend tính toán AI đặt trên máy chủ GPU** và **mỗi thành viên sử dụng máy cá nhân (Laptop/PC) mở Frontend** để tìm kiếm, chia sẻ và đồng bộ dữ liệu.

```
[ GPU Server: 192.168.20.156 ]                 [ Local PC của Thành Viên ]
+----------------------------+                 +----------------------------+
|  run_backend.sh            |  REST API 8036  |  start_frontend.bat        |
|  - MetaCLIP-2 + BEiT-3     | <-------------- |  - Fast Web UI (Port 8080) |
|  - Process: aic_system     |                 |  - Keyframes nạp từ SSD    |
+----------------------------+                 +----------------------------+
```

#### 🖥️ Bước 1: Khởi động Backend trên Server GPU (Linux)
Trên máy chủ Linux có GPU:
```bash
cd system
bash run_backend.sh
```
* Script tự động tìm môi trường Python (Conda hoặc `.venv`), cấu hình GPU 0 (có thể ghi đè qua `GPU_ID=1 bash run_backend.sh`), bind cổng `0.0.0.0:8036`.
* Tiến trình được tự động ngụy trang với tên **`aic_system`** trên `nvitop` và `nvidia-smi` để quản lý tập trung và bảo mật khi thi đấu.

#### 💻 Bước 2: Khởi động Frontend trên Máy Cá Nhân (Windows)
1. Mở file `start_frontend.bat` bằng text editor (Notepad, VS Code,...):
   * Đặt đường dẫn chứa keyframes trên máy cá nhân:
     ```bat
     set "KEYFRAMES_DIR=D:\keyframes_AIC_2026"
     ```
   * Kiểm tra địa chỉ Server Backend (mặc định đã cấu hình sẵn IP server):
     ```bat
     set "BACKEND_URL=http://192.168.20.156:8036"
     set "HLS_URL=http://192.168.20.156:8052"
     ```
2. Nhấp đúp chuột chạy file **`start_frontend.bat`** (hoặc chạy `.\start_frontend.ps1`).
3. Mở trình duyệt web truy cập: **`http://127.0.0.1:8080`**.

> [!TIP]
> **Khi làm việc từ xa / không chung mạng LAN (Dùng SSH Tunnel):**
> Nếu bạn ở nhà hoặc ngoài mạng nội bộ của server `192.168.20.156`, hãy mở một cửa sổ Command Prompt / Terminal trên máy cá nhân và gõ lệnh:
> ```bash
> ssh -L 8036:127.0.0.1:8036 -L 8052:127.0.0.1:8052 <username>@<ip_server_hoac_ten_mien>
> ```
> Khi đường hầm SSH đã thiết lập, trong file `start_frontend.bat` chỉ cần trỏ `BACKEND_URL=http://127.0.0.1:8036` và `HLS_URL=http://127.0.0.1:8052`. Toàn bộ dữ liệu truy vấn sẽ được mã hóa và truyền an toàn qua cổng 8036 cục bộ về máy chủ.

---

### 💻 Kịch Bản 2: Chạy All-in-One Trên Một Máy Cá Nhân (PowerShell / Batch)

Dành cho trường hợp máy cá nhân có GPU NVIDIA rời (VRAM >= 8GB) và chứa đầy đủ cả Model, Vector lẫn Keyframes.

#### Cách 2.1: Khởi chạy 1-Click bằng Batch Scripts (.bat)
1. Nhấp đúp chạy file **`start_backend.bat`** (Mở Backend AI lắng nghe tại `http://127.0.0.1:8036`).
2. Nhấp đúp chạy file **`start_frontend.bat`** (Mở Frontend Web Gateway tại `http://127.0.0.1:8080`).

#### Cách 2.2: Khởi chạy qua PowerShell & File Cấu Hình (`system.config.json`)
Mọi đường dẫn, cổng, model và tính năng quan trọng nằm trong `system.config.json`. Đường dẫn tương đối được tính từ thư mục `system`, vì vậy mỗi thành viên chỉ cần sửa một file sau khi tải model và dữ liệu về:

- `paths.keyframes_root`: thư mục gốc chứa ảnh đầy đủ (ưu tiên `.jpg`).
- `paths.thumbnails_root`: thư mục gốc chứa thumbnail (ưu tiên `.webp`).
- Nếu chưa tách thumbnail riêng, cho hai giá trị trỏ tới cùng một thư mục.
- Nếu dùng virtual environment, đặt đường dẫn trong config: `"python_executable": ".venv/Scripts/python.exe"`.

Thao tác khởi chạy:
```powershell
# 1. Kiểm tra tài nguyên toàn diện trước khi khởi động
.\check_system.ps1

# 2. Khởi chạy toàn bộ hệ thống (Backend mở cửa sổ riêng, Frontend chạy ở cửa sổ hiện tại)
.\start_system.ps1
```
*(Bạn cũng có thể chạy riêng từng thành phần bằng `.\start_backend.ps1` hoặc `.\start_frontend.ps1`).*

---

### ⌨️ Kịch Bản 3: Khởi Chạy Thủ Công Qua Terminal

Dành cho môi trường lập trình viên tùy biến tham số trực tiếp qua dòng lệnh.

#### 🔹 Bước 1: Khởi động Backend (Port 8036)
```bash
cd backend

python -u -m app.lazy_server \
  --records-db "artifacts/current_index/records.sqlite" \
  --video-ranges "artifacts/current_index/video_ranges.json" \
  --embeddings "embeddings.npy" \
  --beit3-embeddings "../merged_beit3_large_numeric/embeddings.npy" \
  --beit3-checkpoint "../beit3_runtime/beit3_large_itc_patch16_224.pth" \
  --beit3-sentencepiece "../beit3_runtime/beit3.spm" \
  --beit3-runtime-python "../beit3_runtime/python" \
  --config "artifacts/current_index/index_config.json" \
  --asr-index "artifacts/asr_index/asr.sqlite" \
  --ocr-index "artifacts/current_index/monkey_ocr.sqlite" \
  --monkey-ocr-index "artifacts/current_index/monkey_ocr.sqlite" \
  --host 0.0.0.0 \
  --port 8036 \
  --storage-backend file \
  --backend torch-gpu \
  --device cuda \
  --gpu-dtype float16 \
  --model-name "facebook/metaclip-2-worldwide-b16-384" \
  --enable-temporal-search \
  --proctitle "aic_system"
```
*(Trên Windows PowerShell, thay dấu gạch chéo ngược `\` ở cuối dòng bằng dấu huyền `` ` ``).*

#### 🔹 Bước 2: Khởi động Frontend Server (Port 8080)
```bash
cd frontend

python -u serve_frontend.py \
  --host 0.0.0.0 \
  --port 8080 \
  --backend-url "http://127.0.0.1:8036" \
  --hls-server-url "http://127.0.0.1:8052" \
  --keyframes-dir "D:/keyframes_AIC_2026" \
  --deleted-manifest "../backend/artifacts/current_index/active_deleted_manifest.jsonl"
```

#### 🔹 Bước 3: Truy cập Web UI
* Mở trình duyệt web và truy cập: **`http://127.0.0.1:8080/`**
* Video stream HLS được định tuyến qua cổng: `8052`.
* Ảnh Keyframes nạp trực tiếp siêu tốc từ đường dẫn cấu hình.

---

## 🔄 Luồng Hoạt Động Của Hệ Thống (Data & Workflow)

1. **Truy vấn Đơn lẻ (Visual Search)**:
   - Người dùng nhập văn bản mô tả (Tiếng Anh/Tiếng Việt) $\rightarrow$ MetaCLIP-2 Text Encoder biến đổi thành vector 512D $\rightarrow$ GPU Index tính tích vô hướng với ma trận vector $\rightarrow$ Xếp hạng Top 100 frame có độ tương đồng cao nhất.
2. **Truy vấn Đa phương thức Kết hợp (Hybrid Search)**:
   - Kết hợp điểm số theo trọng số: $\text{Score} = w_{\text{visual}} \cdot S_{\text{visual}} + w_{\text{ocr}} \cdot S_{\text{ocr}} + w_{\text{asr}} \cdot S_{\text{asr}}$.
3. **Truy vấn Chuỗi Sự kiện (Temporal Search)**:
   - Người dùng tạo các Stage $E_1, E_2, \dots, E_k$ $\rightarrow$ Backend tìm các tập ứng viên cho từng Stage $\rightarrow$ Áp dụng thuật toán quy hoạch động và cửa sổ trượt (Sliding Window $\approx 10-60\text{s}$) $\rightarrow$ Trả về chuỗi frame chính xác theo đúng thứ tự thời gian xuất hiện trong video.
4. **Nộp bài & Đồng bộ Đội thi (Collaboration)**:
   - Thành viên bấm chọn frame tốt nhất $\rightarrow$ WebSocket thông báo cho toàn đội $\rightarrow$ Đội trưởng bấm nộp $\rightarrow$ DRES API nhận kết quả và phản hồi ngay lập tức trên thanh trạng thái.

---

## ⌨️ Bảng Phím Tắt Tiện Ích (Hotkeys)

| Phím tắt | Chức năng |
| :--- | :--- |
| `Enter` | Thực hiện tìm kiếm câu truy vấn đang nhập |
| `Esc` | Đóng Video Player Modal / Đóng cửa sổ popover |
| `Space` | Tạm dừng / Phát tiếp video trong Video Player |
| `←` / `→` | Lùi / Tiến 1 Keyframe hoặc tua video $\pm 5$ giây |
| `Ctrl + K` / `Cmd + K` | Focus nhanh vào ô nhập câu truy vấn |
| `Ctrl + S` | Mở bảng nộp bài DRES / Xác nhận nộp frame đang chọn |
| `1` - `9` | Chọn nhanh câu hỏi tương ứng trên thanh Query Strip |

---

## 📤 Hướng Dẫn Đẩy Mã Nguồn Lên GitHub

Do các file nặng đã được `.gitignore` xử lý triệt để, bạn có thể yên tâm thực hiện đẩy mã nguồn lên GitHub theo các bước:

```bash
# 1. Di chuyển vào thư mục system
cd system

# 2. Kiểm tra trạng thái các file (đảm bảo không còn file nặng >100MB)
git status

# 3. Thêm toàn bộ mã nguồn sạch
git add .

# 4. Tạo commit
git commit -m "feat: complete multi-modal video retrieval system for AI Challenge 2026"

# 5. Đặt nhánh chính và push lên GitHub
git branch -M main
git remote add origin <URL_REPOSITORY_GITHUB_CUA_BAN>
git push -u origin main
```

---

> 💡 **Ghi chú**: Nếu bạn chuyển sang máy thi đấu mới, chỉ cần clone repository này về, cài đặt `pip install -r requirements.txt`, sau đó sao chép các file dữ liệu nặng (`embeddings.npy`, các file `.sqlite`, và thư mục keyframes) vào đúng vị trí tương ứng theo cấu trúc trên là hệ thống có thể hoạt động ngay lập tức!
