package middleware

import (
	"app/config"
	"crypto/subtle"
	"net/http"
)

func BasicAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if config.AdminUsername == "" || config.AdminPassword == "" {
			http.Error(w, "Admin credentials not configured", http.StatusServiceUnavailable)
			return
		}

		username, password, ok := r.BasicAuth()
		if !ok ||
			subtle.ConstantTimeCompare([]byte(username), []byte(config.AdminUsername)) != 1 ||
			subtle.ConstantTimeCompare([]byte(password), []byte(config.AdminPassword)) != 1 {
			w.Header().Set("WWW-Authenticate", `Basic realm="Admin"`)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
