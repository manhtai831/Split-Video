package MailService

import (
	"app/config"
	"fmt"
	"log"

	"github.com/resend/resend-go/v2"
)

func client() (*resend.Client, error) {
	if config.ResendAPIKey == "" {
		return nil, fmt.Errorf("RESEND_API_KEY is not configured")
	}
	if config.ResendFromEmail == "" {
		return nil, fmt.Errorf("RESEND_FROM_EMAIL is not configured")
	}
	return resend.NewClient(config.ResendAPIKey), nil
}

func send(to, subject, html string) error {
	c, err := client()
	if err != nil {
		return err
	}
	params := &resend.SendEmailRequest{
		From:    config.ResendFromEmail,
		To:      []string{to},
		Subject: subject,
		Html:    html,
	}
	_, err = c.Emails.Send(params)
	return err
}

func logoHTML() string {
	return fmt.Sprintf(
		`<img src="%s" alt="Video Tool" width="200" height="50" style="display:block;margin:0 0 24px;border:0;outline:none;text-decoration:none" />`,
		config.AbsURL("/static/logo_hoz.svg"),
	)
}

func SendWelcome(toEmail string) error {
	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="vi">
<body style="font-family:sans-serif;line-height:1.6;color:#1f2937">
  %s
  <h1 style="color:#4f46e5">Chào mừng đến Video Tools</h1>
  <p>Xin chào,</p>
  <p>Tài khoản của bạn (<strong>%s</strong>) đã được tạo thành công.</p>
  <p>Bạn có thể đăng nhập bất cứ lúc nào để theo dõi job và quản lý tài khoản.</p>
  <p style="color:#6b7280;font-size:14px">— Video Tools</p>
</body>
</html>`, logoHTML(), toEmail)

	if err := send(toEmail, "Chào mừng đến Video Tools", html); err != nil {
		log.Printf("MailService.SendWelcome: %v", err)
		return err
	}
	return nil
}

func SendNewPassword(toEmail, newPassword string) error {
	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="vi">
<body style="font-family:sans-serif;line-height:1.6;color:#1f2937">
  %s
  <h1 style="color:#4f46e5">Mật khẩu mới</h1>
  <p>Xin chào,</p>
  <p>Chúng tôi đã tạo mật khẩu mới cho tài khoản <strong>%s</strong> theo yêu cầu quên mật khẩu.</p>
  <p>Mật khẩu mới của bạn:</p>
  <p style="font-size:20px;font-weight:700;letter-spacing:1px;background:#f3f4f6;padding:12px 16px;border-radius:8px;display:inline-block">%s</p>
  <p>Hãy đăng nhập và đổi mật khẩu ngay sau khi vào hệ thống.</p>
  <p style="color:#6b7280;font-size:14px">Nếu bạn không yêu cầu, vui lòng đổi mật khẩu và liên hệ hỗ trợ.</p>
  <p style="color:#6b7280;font-size:14px">— Video Tools</p>
</body>
</html>`, logoHTML(), toEmail, newPassword)

	if err := send(toEmail, "Mật khẩu mới — Video Tools", html); err != nil {
		log.Printf("MailService.SendNewPassword: %v", err)
		return err
	}
	return nil
}

func SendPasswordChanged(toEmail string) error {
	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="vi">
<body style="font-family:sans-serif;line-height:1.6;color:#1f2937">
  %s
  <h1 style="color:#4f46e5">Mật khẩu đã được đổi</h1>
  <p>Xin chào,</p>
  <p>Mật khẩu tài khoản <strong>%s</strong> vừa được thay đổi thành công.</p>
  <p>Nếu bạn không thực hiện thao tác này, hãy dùng chức năng quên mật khẩu ngay và kiểm tra bảo mật tài khoản.</p>
  <p style="color:#6b7280;font-size:14px">— Video Tools</p>
</body>
</html>`, logoHTML(), toEmail)

	if err := send(toEmail, "Thông báo đổi mật khẩu — Video Tools", html); err != nil {
		log.Printf("MailService.SendPasswordChanged: %v", err)
		return err
	}
	return nil
}
