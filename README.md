# 🏆 AI Challenge 2026 - Video Retrieval System

Hệ thống truy vấn video tốc độ cao (Visual, OCR, ASR, Temporal Multi-modal Search) phục vụ cuộc thi AI Challenge 2026.

---

## 📂 Cấu Trúc Thư Mục Repository

```text
D:\Folder\AICHALLENGE2026\system/
├── backend/                        # Backend AI Retrieval Engine (PyTorch, MetaCLIP-2, SQLite)
│   ├── app/                        # Source code Backend
│   │   ├── asr.py                  # ASR transcript search & indexer
│   │   ├── config.py               # Đường dẫn data & model configs
│   │   ├── embedder.py             # MetaCLIP-2 & BEiT-3 Embedders
│   │   ├── index.py                # Torch-GPU vector search
│   │   ├── lazy_server.py          # HTTP server với Uvicorn-style logging
│   │   ├── ocr.py                  # OCR text search & fusion
│   │   └── temporal_search.py      # Temporal A->B->C search engine
│   ├── artifacts/                  # (Local) Chứa SQLite databases & indexes
│   │   ├── asr_index/              # asr.sqlite
│   │   └── current_index/          # records.sqlite, monkey_ocr.sqlite, video_ranges.json
│   ├── embeddings.npy              # (Local) MetaCLIP-2 precomputed vectors (738MB)
│   └── requirements-milvus.txt     # Dependencies cho Milvus backend
│
├── frontend/                       # Frontend Web UI (FastAPI, Vanilla JS, WebSockets)
│   ├── app.js                      # Logic giao diện, tìm kiếm, DRES toggle, team sync
│   ├── index.html                  # Giao diện chính người dùng
│   ├── styles.css                  # Toàn bộ CSS giao diện tối ưu (Dark Mode / Rich UI)
│   ├── serve_frontend.py           # FastAPI server phục vụ web, proxy & WebSocket
│   └── video_fps.json              # Metadata FPS từng video
│
├── .gitignore                      # Loại trừ các file nặng (>100MB) & log khi push GitHub
├── requirements.txt                # Danh sách thư viện Python cần cài đặt
├── start_backend.ps1               # Script 1-click khởi động Backend
├── start_frontend.ps1              # Script 1-click khởi động Frontend
└── README.md                       # Tài liệu hướng dẫn sử dụng
```

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Cài Đặt Thư Viện

```bash
pip install -r requirements.txt
```

---

### 2. Khởi Động Hệ Thống

#### Cách 1: Sử dụng Script 1-Click (Khuyên dùng)
* **Backend:** Chuột phải vào `start_backend.ps1` chọn **Run with PowerShell** (hoặc gõ `.\start_backend.ps1` trong PowerShell).
* **Frontend:** Chuột phải vào `start_frontend.ps1` chọn **Run with PowerShell** (hoặc gõ `.\start_frontend.ps1` trong PowerShell).

---

#### Cách 2: Khởi động bằng lệnh Terminal

##### 🔹 Terminal 1 - Backend (Port 8036)
```powershell
cd D:\Folder\AICHALLENGE2026\system\backend

python -u -m app.lazy_server `
  --records-db "artifacts/current_index/records.sqlite" `
  --video-ranges "artifacts/current_index/video_ranges.json" `
  --embeddings "embeddings.npy" `
  --config "artifacts/current_index/index_config.json" `
  --asr-index "artifacts/asr_index/asr.sqlite" `
  --ocr-index "artifacts/current_index/monkey_ocr.sqlite" `
  --monkey-ocr-index "artifacts/current_index/monkey_ocr.sqlite" `
  --host 127.0.0.1 `
  --port 8036 `
  --storage-backend file `
  --backend torch-gpu `
  --device cuda `
  --gpu-dtype float16 `
  --model-name "facebook/metaclip-2-worldwide-b16-384"
```

##### 🔹 Terminal 2 - Frontend (Port 8080)
```powershell
cd D:\Folder\AICHALLENGE2026\system\frontend

python -u serve_frontend.py `
  --host 127.0.0.1 `
  --port 8080 `
  --backend-url "http://127.0.0.1:8036" `
  --hls-server-url "http://127.0.0.1:8052"
```

---

## 🌐 Truy Cập Giao Diện
* Mở trình duyệt truy cập: **`http://127.0.0.1:8080/`**
* Video phát qua server HLS: `http://127.0.0.1:8052` (qua SSH tunnel).
* Ảnh Keyframe & Thumbnail tải trực tiếp từ ổ cục bộ: `D:\Folder\AICHALLENGE2026\keyframes_AIC_2026`.

---

## 📦 Hướng Dẫn Đẩy Lên GitHub
File `.gitignore` đã được cấu hình tự động bỏ qua các file dữ liệu nặng (>100MB như `embeddings.npy`, `*.sqlite`, `*.jsonl`, log files) để tránh lỗi giới hạn dung lượng của GitHub.

Để tạo repo và push lên GitHub:
```bash
cd D:\Folder\AICHALLENGE2026\system
git init
git add .
git commit -m "feat: initial commit AI Challenge 2026 video retrieval system"
git branch -M main
git remote add origin <URL_GITHUB_CUA_BAN>
git push -u origin main
```
