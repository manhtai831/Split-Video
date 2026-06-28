package middleware

import (
	"net/http"
	"time"

	"github.com/google/uuid"
)

const UserIDCookieName = "vt_user_id"

const cookieMaxAge = 2147483647 // ~68 years

func GetUserID(w http.ResponseWriter, r *http.Request) string {
	if cookie, err := r.Cookie(UserIDCookieName); err == nil && cookie.Value != "" {
		refreshUserIDCookie(w, cookie.Value)
		return cookie.Value
	}

	id := uuid.New().String()
	refreshUserIDCookie(w, id)
	return id
}

func refreshUserIDCookie(w http.ResponseWriter, value string) {
	http.SetCookie(w, &http.Cookie{
		Name:     UserIDCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   cookieMaxAge,
		Expires:  time.Now().Add(68 * 365 * 24 * time.Hour),
	})
}

func WithUserID(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		GetUserID(w, r)
		handler(w, r)
	}
}
