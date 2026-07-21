package auth

import (
	"app/middleware"
	"app/services/AuthService"
	"app/structs"
	"app/templates"
	"net/http"
	"net/url"
)

func Bootstrap() {
	http.HandleFunc("/login", handleLogin)
	http.HandleFunc("/register", handleRegister)
	http.HandleFunc("/forgot-password", handleForgotPassword)
	http.Handle("/account/change-password", middleware.RequireAuth(http.HandlerFunc(handleChangePassword)))
	http.HandleFunc("/logout", handleLogout)
}

func flashFromQuery(r *http.Request) (errMsg, okMsg string) {
	errMsg = r.URL.Query().Get("error")
	okMsg = r.URL.Query().Get("success")
	return errMsg, okMsg
}

func redirectWith(w http.ResponseWriter, r *http.Request, path, key, msg string) {
	q := url.Values{}
	q.Set(key, msg)
	http.Redirect(w, r, path+"?"+q.Encode(), http.StatusSeeOther)
}

func anonID(r *http.Request) string {
	if id := middleware.PeekAnonUserID(r); id != "" {
		return id
	}
	return ""
}

func finishAuth(w http.ResponseWriter, r *http.Request, result *AuthService.AuthResult, redirectTo string) {
	middleware.SetSessionCookie(w, result.SessionID)
	middleware.SetUserIDCookie(w, result.User.ID)
	http.Redirect(w, r, redirectTo, http.StatusSeeOther)
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if u := middleware.UserFromContext(r.Context()); u != nil {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}

	switch r.Method {
	case http.MethodGet:
		errMsg, okMsg := flashFromQuery(r)
		data := structs.PageData{
			Title:        "Đăng nhập",
			Description:  "Đăng nhập vào Video Tools để theo dõi job trên nhiều thiết bị.",
			ActivePage:   "login",
			NoIndex:      true,
			FlashError:   errMsg,
			FlashSuccess: okMsg,
			UserID:       middleware.GetUserID(w, r),
		}
		data.Finalize()
		if err := templates.Render(w, r, "templates/pages/login.html", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	case http.MethodPost:
		if err := r.ParseForm(); err != nil {
			redirectWith(w, r, "/login", "error", "Yêu cầu không hợp lệ")
			return
		}
		email := r.FormValue("email")
		password := r.FormValue("password")
		result, err := AuthService.Login(email, password, anonID(r), middleware.ClientIP(r))
		if err != nil {
			redirectWith(w, r, "/login", "error", err.Error())
			return
		}
		finishAuth(w, r, result, "/")
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleRegister(w http.ResponseWriter, r *http.Request) {
	if u := middleware.UserFromContext(r.Context()); u != nil {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}

	switch r.Method {
	case http.MethodGet:
		errMsg, okMsg := flashFromQuery(r)
		data := structs.PageData{
			Title:        "Đăng ký",
			Description:  "Tạo tài khoản Video Tools miễn phí.",
			ActivePage:   "register",
			NoIndex:      true,
			FlashError:   errMsg,
			FlashSuccess: okMsg,
			UserID:       middleware.GetUserID(w, r),
		}
		data.Finalize()
		if err := templates.Render(w, r, "templates/pages/register.html", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	case http.MethodPost:
		if err := r.ParseForm(); err != nil {
			redirectWith(w, r, "/register", "error", "Yêu cầu không hợp lệ")
			return
		}
		email := r.FormValue("email")
		password := r.FormValue("password")
		confirm := r.FormValue("password_confirm")
		if password != confirm {
			redirectWith(w, r, "/register", "error", "Mật khẩu xác nhận không khớp")
			return
		}
		result, err := AuthService.Register(email, password, anonID(r))
		if err != nil {
			redirectWith(w, r, "/register", "error", err.Error())
			return
		}
		finishAuth(w, r, result, "/")
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		errMsg, okMsg := flashFromQuery(r)
		data := structs.PageData{
			Title:        "Quên mật khẩu",
			Description:  "Đặt lại mật khẩu Video Tools.",
			ActivePage:   "forgot-password",
			NoIndex:      true,
			FlashError:   errMsg,
			FlashSuccess: okMsg,
			UserID:       middleware.GetUserID(w, r),
		}
		data.Finalize()
		if err := templates.Render(w, r, "templates/pages/forgot-password.html", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	case http.MethodPost:
		if err := r.ParseForm(); err != nil {
			redirectWith(w, r, "/forgot-password", "error", "Yêu cầu không hợp lệ")
			return
		}
		email := r.FormValue("email")
		if err := AuthService.ForgotPassword(email); err != nil {
			redirectWith(w, r, "/forgot-password", "error", err.Error())
			return
		}
		redirectWith(w, r, "/forgot-password", "success", "Nếu email tồn tại, mật khẩu mới đã được gửi tới hộp thư của bạn.")
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleChangePassword(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	if user == nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	switch r.Method {
	case http.MethodGet:
		errMsg, okMsg := flashFromQuery(r)
		data := structs.PageData{
			Title:        "Đổi mật khẩu",
			Description:  "Đổi mật khẩu tài khoản Video Tools.",
			ActivePage:   "change-password",
			NoIndex:      true,
			FlashError:   errMsg,
			FlashSuccess: okMsg,
			UserID:       middleware.GetUserID(w, r),
		}
		data.Finalize()
		if err := templates.Render(w, r, "templates/pages/change-password.html", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	case http.MethodPost:
		if err := r.ParseForm(); err != nil {
			redirectWith(w, r, "/account/change-password", "error", "Yêu cầu không hợp lệ")
			return
		}
		oldPass := r.FormValue("old_password")
		newPass := r.FormValue("new_password")
		confirm := r.FormValue("password_confirm")
		if newPass != confirm {
			redirectWith(w, r, "/account/change-password", "error", "Mật khẩu xác nhận không khớp")
			return
		}
		if err := AuthService.ChangePassword(user.ID, oldPass, newPass); err != nil {
			redirectWith(w, r, "/account/change-password", "error", err.Error())
			return
		}
		redirectWith(w, r, "/account/change-password", "success", "Đổi mật khẩu thành công. Email thông báo đã được gửi.")
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sessionID := middleware.SessionIDFromRequest(r)
	_ = AuthService.Logout(sessionID)
	middleware.ClearSessionCookie(w)
	http.Redirect(w, r, "/", http.StatusSeeOther)
}
