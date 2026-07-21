package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
)

const UserIDCookieName = "vt_user_id"

const cookieMaxAge = 2147483647 // ~68 years

const resolvedUserIDKey contextKey = "resolved_user_id"

func GetUserID(w http.ResponseWriter, r *http.Request) string {
	if id, ok := r.Context().Value(resolvedUserIDKey).(string); ok && id != "" {
		return id
	}

	if user := UserFromContext(r.Context()); user != nil {
		refreshUserIDCookie(w, user.ID)
		return user.ID
	}

	if cookie, err := r.Cookie(UserIDCookieName); err == nil && cookie.Value != "" {
		refreshUserIDCookie(w, cookie.Value)
		return cookie.Value
	}

	id := uuid.New().String()
	refreshUserIDCookie(w, id)
	return id
}

// PeekAnonUserID returns the browser identity used before login (cookie or middleware-resolved).
func PeekAnonUserID(r *http.Request) string {
	if id, ok := r.Context().Value(resolvedUserIDKey).(string); ok && id != "" {
		if user := UserFromContext(r.Context()); user != nil && user.ID == id {
			// Already logged in — try raw cookie for migration source
			if cookie, err := r.Cookie(UserIDCookieName); err == nil && cookie.Value != "" && cookie.Value != user.ID {
				return cookie.Value
			}
			return ""
		}
		return id
	}
	if cookie, err := r.Cookie(UserIDCookieName); err == nil && cookie.Value != "" {
		return cookie.Value
	}
	return ""
}

func SetUserIDCookie(w http.ResponseWriter, userID string) {
	refreshUserIDCookie(w, userID)
}

func refreshUserIDCookie(w http.ResponseWriter, value string) {
	http.SetCookie(w, &http.Cookie{
		Name:     UserIDCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   cookieSecure(),
		MaxAge:   cookieMaxAge,
		Expires:  time.Now().Add(68 * 365 * 24 * time.Hour),
	})
}

func AppendUserIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := GetUserID(w, r)
		ctx := context.WithValue(r.Context(), resolvedUserIDKey, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
