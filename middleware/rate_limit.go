package middleware

import (
	"strings"
	"sync"
	"time"
)

const (
	loginRateLimitMax    = 5
	loginRateLimitWindow = 15 * time.Minute
)

type rateLimitEntry struct {
	count       int
	windowStart time.Time
}

var (
	loginAttempts   = make(map[string]*rateLimitEntry)
	loginAttemptsMu sync.Mutex
)

func loginRateKey(ip, email string) string {
	return strings.ToLower(strings.TrimSpace(ip)) + "|" + strings.ToLower(strings.TrimSpace(email))
}

// LoginRateLimited reports whether the IP+email pair has exceeded the login attempt limit.
func LoginRateLimited(ip, email string) bool {
	key := loginRateKey(ip, email)
	now := time.Now()

	loginAttemptsMu.Lock()
	defer loginAttemptsMu.Unlock()

	entry, ok := loginAttempts[key]
	if !ok {
		return false
	}
	if now.Sub(entry.windowStart) >= loginRateLimitWindow {
		delete(loginAttempts, key)
		return false
	}
	return entry.count >= loginRateLimitMax
}

// RecordLoginFailure increments the failed-login counter for IP+email.
func RecordLoginFailure(ip, email string) {
	key := loginRateKey(ip, email)
	now := time.Now()

	loginAttemptsMu.Lock()
	defer loginAttemptsMu.Unlock()

	entry, ok := loginAttempts[key]
	if !ok || now.Sub(entry.windowStart) >= loginRateLimitWindow {
		loginAttempts[key] = &rateLimitEntry{count: 1, windowStart: now}
		return
	}
	entry.count++
}

// ClearLoginFailures resets the counter after a successful login.
func ClearLoginFailures(ip, email string) {
	key := loginRateKey(ip, email)
	loginAttemptsMu.Lock()
	delete(loginAttempts, key)
	loginAttemptsMu.Unlock()
}
