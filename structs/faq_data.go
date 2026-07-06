package structs

func DefaultFAQItems() []FAQItem {
	return []FAQItem{
		{
			Question: "Video của tôi có được lưu trên server không?",
			Answer:   "Có. File video hoặc audio được tải lên server để xử lý bằng FFmpeg. Sau khi xử lý xong, bạn có thể tải kết quả về máy.",
		},
		{
			Question: "File được giữ trên server bao lâu?",
			Answer:   "File input và output được tự động xóa sau 30 ngày kể từ khi job hoàn thành hoặc thất bại. Hãy tải kết quả về sớm để tránh mất dữ liệu.",
		},
		{
			Question: "Ai có thể xem file của tôi?",
			Answer:   "Chỉ trình duyệt có cookie định danh tương ứng mới truy cập được job của bạn. Video Tools không chia sẻ file công khai.",
		},
		{
			Question: "Có gửi file lên cloud hoặc dịch vụ bên thứ ba không?",
			Answer:   "Không. File được xử lý trên server và không chuyển sang dịch vụ cloud bên ngoài.",
		},
		{
			Question: "Có cần đăng ký tài khoản không?",
			Answer:   "Không. Bạn dùng ngay mà không cần đăng ký. Hệ thống gán một ID ẩn danh qua cookie trình duyệt.",
		},
		{
			Question: "Hỗ trợ những định dạng video nào?",
			Answer:   "Hầu hết định dạng phổ biến như MP4, MKV, MOV, AVI, WebM. FFmpeg sẽ tự nhận diện và xử lý.",
		},
		{
			Question: "Giới hạn dung lượng file là bao nhiêu?",
			Answer:   "Phụ thuộc cấu hình server và trình duyệt. Nên chia file rất lớn thành nhiều phần hoặc dùng kết nối ổn định.",
		},
		{
			Question: "Chia video theo dung lượng và theo thời gian khác nhau thế nào?",
			Answer:   "Chia theo dung lượng: mỗi phần không vượt quá MB/GB bạn chọn. Chia theo thời gian: cắt đều theo số giây, phút hoặc giờ.",
		},
		{
			Question: "Ghép video có giữ nguyên chất lượng không?",
			Answer:   "Bạn chọn độ phân giải đích và định dạng đầu ra. Có thể giữ chất lượng gốc hoặc nén lại khi ghép.",
		},
		{
			Question: "GIF, WebP và APNG khác nhau thế nào?",
			Answer:   "GIF tương thích rộng. WebP động nhẹ hơn GIF. APNG hỗ trợ trong suốt tốt hơn trên một số trình duyệt.",
		},
		{
			Question: "Tách audio hỗ trợ định dạng nào?",
			Answer:   "MP3, M4A, WAV, FLAC và OGG. Bạn có thể chọn bitrate và chỉnh âm lượng trước khi xuất.",
		},
		{
			Question: "Video Editor hoạt động như thế nào?",
			Answer:   "Tạo draft, thêm layer (video, ảnh, text), chỉnh timeline rồi xuất bản. Job render chạy nền và bạn tải file khi hoàn tất.",
		},
		{
			Question: "Job bị lỗi thì làm sao?",
			Answer:   "Xem thông báo lỗi trên dashboard hoặc bảng job, sau đó nhấn Retry để chạy lại. Kiểm tra định dạng file và dung lượng.",
		},
		{
			Question: "Có mất phí khi dùng Video Tools không?",
			Answer:   "Video Tools miễn phí. Bạn chỉ cần trình duyệt và kết nối internet ổn định.",
		},
	}
}
