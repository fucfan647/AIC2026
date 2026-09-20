# CẨM NANG HƯỚNG DẪN KIỂM THỬ 2 OPTION ĐỒNG BỘ ĐỘI THI (AIC 2026)

Tài liệu này hướng dẫn chi tiết cách thiết lập và kiểm thử 2 mô hình chạy đội 5 người, đảm bảo:
- **Tốc độ đọc ảnh 0ms**: Từng thành viên đọc keyframes trực tiếp từ ổ cứng SSD máy mình.
- **Tìm kiếm độc lập**: Mỗi người tự gõ query, tự nhận kết quả riêng.
- **Thanh câu hỏi độc lập**: Mỗi người tự chọn câu của mình, có nhãn hiển thị ai đang xem câu nào (`[bin]`, `[qhuy]`).
- **Khay ghim chung thời gian thực**: Ghim/vote frame cập nhật ngay lập tức cho cả đội qua WebSocket.
- **Nộp bài tập trung**: Mọi file CSV được lưu về duy nhất một thư mục `submission/`.

---

## 💻 PHẦN 1: CHUẨN BỊ TRÊN MÁY CÁ NHÂN CỦA TỪNG THÀNH VIÊN (Làm 1 lần)

### Bước 1: Cài đặt Python và thư viện nhẹ (30 giây)
Mở cửa sổ Command Prompt (cmd) hoặc Terminal và chạy:
```bash
pip install fastapi uvicorn websockets httpx
```

### Bước 2: Tải mã nguồn về máy cá nhân
Chỉ cần tải file zip **`aic_client_member.zip`** (siêu nhẹ, chỉ **80 KB**) về máy và giải nén ra:
```
aic_client/
├── frontend/
│   ├── serve_frontend.py
│   ├── app.js
│   ├── index.html
│   ├── styles.css
│   └── video_fps.json
├── start_option1_member.bat
├── start_option2_member.bat
├── start_option1_host.bat
└── HUONG_DAN_TEST_2_OPTION.md
```

### Bước 3: Chép ảnh Keyframes vào ổ SSD máy mình
- Chép thư mục ảnh `synthetic_frames_webp` (nhẹ hơn rất nhiều so với ảnh gốc) từ Server NAS vào ổ SSD máy bạn.
- Ví dụ lưu tại: `D:\keyframes_AIC_2026`.

---

## 🧪 PHẦN 2: HƯỚNG DẪN KIỂM THỬ TỪNG OPTION

### 🅰️ OPTION 1: TEAM HUB TẠI MÁY ĐỘI TRƯỞNG (Khuyên dùng khi thi đấu)
*Toàn bộ dữ liệu khay ghim và file nộp bài CSV nằm trực tiếp trên máy Đội trưởng.*

1. **Trên máy Đội trưởng (Host)**:
   - Mở file `start_option1_host.bat` bằng Notepad, kiểm tra 2 dòng:
     ```bat
     set "KEYFRAMES_DIR=D:\keyframes_AIC_2026"
     set "BACKEND_URL=http://<IP_SERVER_GPU>:8036"
     ```
   - Nhấp đúp chuột chạy `start_option1_host.bat` (chạy tại cổng 8080).
   - Mở `cmd`, gõ `ipconfig` để lấy địa chỉ IP LAN của máy Đội trưởng (ví dụ: `192.168.1.15`). Gửi IP này cho các thành viên.
   - Mở trình duyệt: `http://127.0.0.1:8080`.

2. **Trên các máy thành viên (Edge Members)**:
   - Mở file `start_option1_member.bat` bằng Notepad, sửa IP máy Đội trưởng:
     ```bat
     set "KEYFRAMES_DIR=D:\keyframes_AIC_2026"
     set "TEAM_HUB_URL=http://192.168.1.15:8080"
     set "BACKEND_URL=http://<IP_SERVER_GPU>:8036"
     ```
   - Nhấp đúp chuột chạy `start_option1_member.bat` (chạy tại cổng 8081).
   - Mở trình duyệt: `http://127.0.0.1:8081`.
   - Nhập tên của bạn ở ô trên cùng và bắt đầu tìm kiếm!

---

### 🅱️ OPTION 2: TEAM HUB TẠI SERVER LINUX
*Server Linux vừa làm nhiệm vụ AI Vector Search, vừa làm Hub lưu file nộp bài CSV.*

1. **Trên Server Linux**:
   - Chạy Backend AI: `./run_backend.sh` (cổng 8036).
   - Chạy Team Hub Gateway: `./run_frontend.sh` (cổng 8080).
   - Xác định IP của Server (ví dụ: `192.168.1.50`).

2. **Trên tất cả 5 máy thành viên (Bao gồm cả Đội trưởng)**:
   - Mở file `start_option2_member.bat` bằng Notepad, điền IP Server:
     ```bat
     set "KEYFRAMES_DIR=D:\keyframes_AIC_2026"
     set "SERVER_IP=192.168.1.50"
     ```
   - Nhấp đúp chuột chạy `start_option2_member.bat` (chạy tại cổng 8081).
   - Mở trình duyệt: `http://127.0.0.1:8081`.
   - Nhập tên của bạn ở ô trên cùng và bắt đầu tìm kiếm!

---

## ✅ BẢNG KIỂM TRA TÍNH NĂNG (CHECKLIST)

Khi thử nghiệm với 2 người (hoặc 2 tab trình duyệt), hãy kiểm tra 4 điểm sau:

| STT | Hành động kiểm tra | Kết quả mong đợi |
| :--- | :--- | :--- |
| 1 | Mở ảnh kết quả tìm kiếm | Ảnh hiện ngay lập tức (0ms) từ SSD cá nhân, Network tab hiển thị `200 OK` từ `127.0.0.1`. |
| 2 | Người A chọn câu KIS 1, Người B chọn câu KIS 2 | Người A vẫn giữ câu 1, Người B vẫn giữ câu 2. Trên thanh câu hỏi, câu 1 hiện nhãn `[A]`, câu 2 hiện nhãn `[B]`. |
| 3 | Người A bấm Ghim/Vote một frame | Người B nhìn thấy frame đó lập tức nhảy lên Khay ghim chung (WebSocket sync). |
| 4 | Người B bấm nút Nộp bài / Ghi CSV | File CSV xuất hiện đúng trong thư mục `submission/` của Hub (máy Đội trưởng hoặc Server). |

---

## 🌿 QUẢN LÝ GIT (Dành cho Đội trưởng)
Toàn bộ mã nguồn và các file runner này nằm trên branch `run_local`. 
- Để xem trạng thái: `git status`
- Để quay lại bản gốc bất kỳ lúc nào: `git checkout main`
- Để trở lại bản chạy phân tán: `git checkout run_local`
