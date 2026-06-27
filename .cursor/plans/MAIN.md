Nếu mục tiêu là vừa học Go vừa có một project hữu ích thì Go + HTML + FFmpeg là một lựa chọn rất ổn. Go xử lý job nền, gọi FFmpeg và phục vụ web rất nhẹ.

Một số ý tưởng theo mức độ:

### 1. Video Toolkit (mình thấy hay nhất)

Một web app upload video rồi xử lý.

Các tính năng:

* ✅ Cắt video theo thời gian.
* ✅ Ghép nhiều video.
* ✅ Chuyển đổi định dạng (mp4, mkv, mov...).
* ✅ Resize (720p, 1080p...).
* ✅ Nén video theo bitrate hoặc CRF.
* ✅ Xoay/lật video.
* ✅ Đổi FPS.
* ✅ Tách audio.
* ✅ Thay audio.
* ✅ Chụp thumbnail.
* ✅ Tạo GIF từ đoạn video.

Sau này có thể thêm:

* Queue xử lý.
* Progress realtime.
* Download lịch sử.

---

### 2. Video Subtitle Tool

* Upload video.
* Upload SRT.
* Burn subtitle vào video.
* Delay subtitle ± ms.
* Đổi font, màu, viền.

---

### 3. Watermark Tool

* Thêm logo.
* Thêm text.
* Điều chỉnh opacity.
* Chọn vị trí.
* Scale watermark.

---

### 4. Batch Converter

Upload cả thư mục.

Ví dụ:

```
input/
    a.mov
    b.mov
    c.mov
```

Chọn:

* MP4
* H265
* CRF 24
* 720p

→ xử lý toàn bộ.

---

### 5. HLS Streaming Generator

Upload video

↓

Sinh:

```
index.m3u8
720p.ts
480p.ts
360p.ts
```

Rất hay nếu muốn học streaming.

---

### 6. Video Metadata

Hiển thị:

* Codec
* Bitrate
* Resolution
* FPS
* Duration
* Audio codec
* Rotation

Dùng `ffprobe`.

---

### 7. Video Compare

Upload 2 video.

So sánh:

* Resolution
* Codec
* Bitrate
* FPS
* Duration

---

### 8. Frame Extractor

Xuất:

* 1 frame
* 1 frame mỗi giây
* 1 frame mỗi 5 giây
* Xuất toàn bộ frame

---

### 9. Audio Tool

* MP3 → AAC
* WAV → MP3
* Normalize volume
* Remove silence
* Merge audio

---

### 10. Job Queue

Đây là phần rất đáng học với Go.

Ví dụ:

```
Upload

↓

Task Queue

↓

Worker 1
Worker 2
Worker 3

↓

FFmpeg

↓

Output
```

Có thể dùng goroutine + channel hoặc Redis nếu muốn mở rộng.

---

## Nếu là mình làm để học Go

Mình sẽ xây kiểu này:

```
Browser
      │
      ▼
Go HTTP Server
      │
      ├── HTML Template
      ├── Upload
      ├── Job Queue
      ├── Worker
      └── FFmpeg
               │
          output/
```

Các công nghệ:

* HTTP server: net/http
* HTML template: html/template
* Upload: multipart/form-data
* Queue: goroutine + channel
* Realtime progress: Server-Sent Events (SSE) hoặc WebSocket
* Metadata: ffprobe
* Log: zap hoặc slog

## Một số tính năng "xịn"

* Kéo-thả upload.
* Xem trước video.
* Thanh tiến trình realtime.
* Hàng đợi nhiều job.
* Hủy job đang chạy.
* Giới hạn số worker xử lý đồng thời.
* Tự động xóa file tạm sau X giờ.
* Lưu preset (ví dụ "Nén cho Discord", "Nén cho Zalo", "1080p H.265"...).
* Gọi trực tiếp FFmpeg bằng `exec.CommandContext()` để có thể hủy tiến trình khi cần.
