package middleware

import (
	"net/http"
	"strings"
)

type Middleware func(http.Handler) http.Handler

func Chain(middlewares ...Middleware) Middleware {
	return func(final http.Handler) http.Handler {
		for i := len(middlewares) - 1; i >= 0; i-- {
			final = middlewares[i](final)
		}
		return final
	}
}

func APINoIndexMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		}
		next.ServeHTTP(w, r)
	})
}

func Apply(next http.Handler) http.Handler {
	wrapped := Chain(
		APINoIndexMiddleware,
		SessionMiddleware,
		AppendUserIDMiddleware,
	)(next)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/static/") {
			next.ServeHTTP(w, r)
			return
		}
		wrapped.ServeHTTP(w, r)
	})
}
