package middleware

import (
	"app/common/Global"
	"app/config"
	"app/entities"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const SessionCookieName = "vt_session"

type contextKey string

const userContextKey contextKey = "auth_user"
const sessionIDContextKey contextKey = "auth_session_id"

func signSessionID(sessionID string) string {
	mac := hmac.New(sha256.New, []byte(config.SessionSecret))
	mac.Write([]byte(sessionID))
	sig := hex.EncodeToString(mac.Sum(nil))
	return sessionID + "." + sig
}

func verifySessionCookie(value string) (sessionID string, ok bool) {
	if config.SessionSecret == "" || value == "" {
		return "", false
	}
	parts := strings.SplitN(value, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", false
	}
	mac := hmac.New(sha256.New, []byte(config.SessionSecret))
	mac.Write([]byte(parts[0]))
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(parts[1])) {
		return "", false
	}
	return parts[0], true
}

func cookieSecure() bool {
	return strings.HasPrefix(strings.ToLower(config.SiteURL), "https://")
}

func SetSessionCookie(w http.ResponseWriter, sessionID string) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    signSessionID(sessionID),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   cookieSecure(),
		MaxAge:   int((30 * 24 * time.Hour).Seconds()),
		Expires:  time.Now().Add(30 * 24 * time.Hour),
	})
}

func ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   cookieSecure(),
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func SessionIDFromRequest(r *http.Request) string {
	if id, ok := r.Context().Value(sessionIDContextKey).(string); ok {
		return id
	}
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil || cookie.Value == "" {
		return ""
	}
	sessionID, ok := verifySessionCookie(cookie.Value)
	if !ok {
		return ""
	}
	return sessionID
}

func UserFromContext(ctx context.Context) *entities.User {
	u, _ := ctx.Value(userContextKey).(*entities.User)
	return u
}

func SessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(SessionCookieName)
		if err != nil || cookie.Value == "" {
			next.ServeHTTP(w, r)
			return
		}
		sessionID, ok := verifySessionCookie(cookie.Value)
		if !ok {
			ClearSessionCookie(w)
			next.ServeHTTP(w, r)
			return
		}

		var session entities.Session
		dbErr := Global.DB.Where("id = ? AND expires_at > ?", sessionID, time.Now().UTC()).First(&session).Error
		if dbErr != nil {
			ClearSessionCookie(w)
			next.ServeHTTP(w, r)
			return
		}

		var user entities.User
		if err := Global.DB.Where("id = ?", session.UserID).First(&user).Error; err != nil {
			ClearSessionCookie(w)
			next.ServeHTTP(w, r)
			return
		}

		ctx := context.WithValue(r.Context(), userContextKey, &user)
		ctx = context.WithValue(ctx, sessionIDContextKey, sessionID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if UserFromContext(r.Context()) == nil {
			http.Redirect(w, r, "/login?error="+urlQuery("Vui lòng đăng nhập để tiếp tục"), http.StatusSeeOther)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func urlQuery(s string) string {
	return strings.ReplaceAll(url.QueryEscape(s), "+", "%20")
}

// ClientIP extracts a best-effort client IP for rate limiting.
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i >= 0 {
		return host[:i]
	}
	return host
}
