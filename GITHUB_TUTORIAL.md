# Hướng dẫn GitHub ngắn gọn

Repository chỉ nên chứa source code và cấu hình chung. Model, embedding, database, dataset, ZIP và cache phải được loại bằng `.gitignore`.

## 1. Clone repository

**Mục đích:** Tải source code cùng lịch sử thay đổi từ GitHub về máy.

```powershell
cd C:\duong-dan-lam-viec
git clone https://github.com/ORG/REPO.git
cd REPO
```

Nếu đây là lần đầu dùng Git trên máy:

```powershell
git config --global user.name "Tên của bạn"
git config --global user.email "email@example.com"
```

## 2. Cập nhật trước khi làm việc

**Mục đích:** Lấy code mới nhất của mọi người trước khi sửa, tránh làm trùng hoặc gây conflict.

```powershell
git switch main
git fetch origin
git status
git pull --ff-only origin main
```

`fetch` chỉ cập nhật thông tin từ GitHub. `pull` mới đưa commit mới vào code local. `git status` không tự kết nối GitHub, nên thông báo `up to date` có thể cũ nếu chưa chạy `fetch`.

## 3. Sửa code và tạo commit

**Mục đích:** Lưu một nhóm thay đổi thành phiên bản rõ ràng, dễ review và khôi phục.

Nên tạo branch riêng:

```powershell
git switch -c feat/ten-tinh-nang
```

Sau khi sửa, kiểm tra rồi chọn file:

```powershell
git status
git diff
git add duong-dan/file
```

`git add -A` chọn toàn bộ file mới, file đã sửa và file đã xóa. Luôn kiểm tra staging trước khi commit:

```powershell
git diff --cached --name-status
git commit -m "feat: mô tả ngắn gọn thay đổi"
git push -u origin feat/ten-tinh-nang
```

Sau đó tạo Pull Request trên GitHub để review và merge vào `main`. Không dùng `git push --force` trên `main`.

## 4. Nhận code được push từ máy khác

**Mục đích:** Phát hiện và tải commit mới do máy khác hoặc thành viên khác tạo.

```powershell
git fetch origin
git log --left-right --oneline HEAD...origin/main
git status
```

Nếu working tree sạch và local chỉ chậm hơn GitHub:

```powershell
git pull --ff-only origin main
```

So sánh các file đang khác nhau:

```powershell
git diff --name-status origin/main
git diff --stat origin/main
```

## 5. Pull khi đang sửa dở

**Mục đích:** Cất tạm phần đang làm để cập nhật code mà không mất thay đổi local.

```powershell
git stash push --include-untracked -m "before pull"
git pull --ff-only origin main
git stash pop
```

Nếu có conflict, mở file, chọn nội dung đúng và xóa các dòng `<<<<<<<`, `=======`, `>>>>>>>`, sau đó:

```powershell
git add duong-dan/file-da-sua
git commit
```

## 6. Hoàn tác an toàn

**Mục đích:** Sửa thao tác Git bị nhầm mà không vô tình xóa code.

Bỏ file khỏi staging nhưng giữ nội dung đã sửa:

```powershell
git restore --staged ten-file
```

Bỏ toàn bộ staging:

```powershell
git restore --staged .
```

Đảo ngược một commit đã push bằng commit mới:

```powershell
git revert MA_COMMIT
git push origin main
```

## 7. Kiểm tra trước khi push

**Mục đích:** Đảm bảo commit sạch và không đưa nhầm dữ liệu nặng hoặc bí mật lên GitHub.

- Chạy `git fetch origin`.
- Kiểm tra `git status` và `git diff --cached`.
- Không stage model, embedding, database, dataset, ZIP hoặc cache.
- Chạy test phù hợp.
- Viết commit message đúng nội dung.
- Không chạy `git clean -fdX` nếu chưa hiểu rõ; nó có thể xóa model và dữ liệu bị ignore.

Quy trình cần nhớ:

```text
fetch/pull → sửa code → kiểm tra → add → commit → push → Pull Request
```
