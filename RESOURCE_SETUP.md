# Cài tài nguyên sau khi clone system

Repository chỉ chứa mã nguồn và [`system.config.json`](system.config.json). File config này **đã được Git track**; các ZIP, model, SQLite, embedding và ảnh không được đưa lên GitHub. Không cần sửa đường dẫn trong mã Python khi chạy bằng `start_*.ps1` hoặc `start_*.bat` trên Windows.

## 1. Giải nén đúng chỗ

Giải nén **giữ nguyên cấu trúc thư mục bên trong ZIP**. Với các gói `01`–`13`, chọn thư mục đích là thư mục gốc `system/` (nơi có `system.config.json`):

| ZIP | File/thư mục sau khi giải nén trong `system/` | Key trong `system.config.json` |
| --- | --- | --- |
| `01_records_db.zip` | `backend/artifacts/current_index/records.sqlite` | `paths.records_db` |
| `02_video_ranges.zip` | `backend/artifacts/current_index/video_ranges.json` | `paths.video_ranges` |
| `03_index_config.zip` | `backend/artifacts/current_index/index_config.json` | `paths.index_config` |
| `04_metaclip_embeddings.zip` | `backend/embeddings.npy` | `paths.metaclip_embeddings` |
| `05_beit3_embeddings.zip` | `merged_beit3_large_numeric/embeddings.npy` | `paths.beit3_embeddings` |
| `06_beit3_checkpoint.zip` | `beit3_runtime/beit3_large_itc_patch16_224.pth` | `paths.beit3_checkpoint` |
| `07_beit3_sentencepiece.zip` | `beit3_runtime/beit3.spm` | `paths.beit3_sentencepiece` |
| `08_beit3_runtime_python.zip` | `beit3_runtime/python/` | `paths.beit3_runtime_python` |
| `09_monkey_ocr_index.zip` | `backend/artifacts/current_index/monkey_ocr.sqlite` | `paths.monkey_ocr_index` |
| `10_asr_index.zip` | `backend/artifacts/asr_index/asr.sqlite` | `paths.asr_index` |
| `11_deleted_manifest.zip` | `backend/artifacts/current_index/active_deleted_manifest.jsonl` | `paths.deleted_manifest` |
| `12_queries.zip` | `backend/query_BTC/` | `paths.query_root` |
| `13_music.zip` | `backend/music/` | `paths.music_root` |

`14_metaclip_model_files.zip`: giải nén vào `system/metaclip_model/`. Sau đó đặt:

```json
"metaclip_model_dir": "metaclip_model/snapshots/cdc8beacec0e738ed20961f1695dcec6704351ca"
```

trong phần `paths` của `system.config.json`, và đặt `backend.local_files_only` thành `true`. Thư mục cuối cùng phải chứa `config.json`, `model.safetensors` và `preprocessor_config.json`. Nếu không dùng ZIP model, để `paths.metaclip_model_dir` là chuỗi rỗng `""`; `backend.model_name` là model ID tải qua Hugging Face.

`15_ppocr_raw_output.zip`: chỉ là **output OCR thô**, không phải SQLite index dùng để tìm kiếm. Nếu cần lưu/khai thác output này, giải nén vào thư mục `OCR_preprocess/` bên cạnh `system/`. Giữ `features.ppocr: false`; không bật lên chỉ vì đã giải nén gói này.

Nếu gói `09` và `10` được tạo **trước bản BM25 giữ dấu**, chạy một lần tại thư mục `system/` sau khi giải nén:

```powershell
python backend/reindex_accent_bm25.py --monkey-index backend/artifacts/current_index/monkey_ocr.sqlite --asr-index backend/artifacts/asr_index/asr.sqlite
```

Script đổi index MonkeyOCR và Chunkformer sang BM25 phân biệt dấu, giữ các bản SQLite cũ dưới đuôi `.before_accent.bak`. Không cần chạy với PaddleOCR: index Paddle vẫn tìm theo kiểu bỏ dấu. Nếu dùng index cũ mà chưa reindex, backend sẽ báo lỗi rõ ràng khi tải index.

## 2. Sửa cấu hình theo máy

Mở `system.config.json` và sửa các giá trị sau nếu vị trí tài nguyên khác bảng trên. Mọi `paths.*` tương đối đều tính từ thư mục `system/`; cũng có thể dùng đường dẫn tuyệt đối. Nên giữ đường dẫn tương đối khi cùng chia sẻ config qua Git.

- `paths.keyframes_root`: thư mục chứa các thư mục video như `L23_V012/`. **Ảnh không nằm trong bộ ZIP**.
- `paths.thumbnails_root`: thư mục thumbnail; có thể trỏ cùng chỗ với keyframes nếu chưa có thumbnail riêng.
- `runtime.python_executable`: Python đã cài dependencies từ `requirements.txt` (ví dụ `python` hoặc `.venv/Scripts/python.exe`). `beit3_runtime/python/` là mã runtime BEiT-3, **không phải** Python executable.
- `frontend.backend_url`: URL backend mà máy chạy frontend truy cập được. Nếu kết nối qua SSH tunnel, dùng `http://127.0.0.1:8036`; nếu qua LAN, dùng IP/tên máy server tương ứng. Tương tự cho `frontend.hls_server_url` nếu dùng HLS.
- `features.beit3`, `features.monkey_ocr`, `features.asr`: chỉ bật khi đã giải nén đủ tài nguyên tương ứng. `features.ppocr` hiện để `false` vì chưa có `paddle_ocr.sqlite`.

`paths.excluded_rows` hiện chỉ là tài nguyên tùy chọn và chưa có trong bộ ZIP. Thiếu file này không chặn khởi động, nhưng backend sẽ không loại trừ các row đã xóa ngay trong index; frontend vẫn dùng `paths.deleted_manifest` để lọc kết quả.

## 3. Kiểm tra và chạy (Windows)

Tại thư mục `system/` trong PowerShell:

```powershell
.\check_system.ps1 -Scope All
.\start_system.ps1
```

Hoặc chạy riêng `.\start_backend.ps1` và `.\start_frontend.ps1`. Hai file `.bat` cùng tên gọi các script PowerShell này nên cũng đọc `system.config.json`. Script kiểm tra chỉ báo thiếu tài nguyên; **không tự tải, giải nén hay build SQLite**.

> `run_backend.sh` và `run_frontend.sh` trên Linux là các launcher cũ có biến/đường dẫn riêng, **chưa đọc `system.config.json`**. Nếu dùng chúng, cần sửa đường dẫn trực tiếp trong hai script đó; không giả định thay đổi trong config sẽ có hiệu lực.
