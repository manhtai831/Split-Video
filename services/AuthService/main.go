package AuthService

import (
	"app/common/Global"
	"app/entities"
	"app/middleware"
	"app/services/MailService"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	minPasswordLen   = 8
	sessionTTL       = 30 * 24 * time.Hour
	generatedPassLen = 14
	chunksRoot       = "uploads/tmp/chunks"
)

var (
	ErrInvalidEmail       = errors.New("email không hợp lệ")
	ErrWeakPassword       = errors.New("mật khẩu phải có ít nhất 8 ký tự")
	ErrEmailTaken         = errors.New("email đã được sử dụng")
	ErrInvalidCredentials = errors.New("email hoặc mật khẩu không đúng")
	ErrRateLimited        = errors.New("quá nhiều lần đăng nhập thất bại, vui lòng thử lại sau 15 phút")
	ErrWrongPassword      = errors.New("mật khẩu hiện tại không đúng")
	ErrUserNotFound       = errors.New("không tìm thấy người dùng")
	ErrMailFailed         = errors.New("không gửi được email, vui lòng thử lại sau")
)

type AuthResult struct {
	User      entities.User
	SessionID string
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func validateEmail(email string) error {
	if email == "" {
		return ErrInvalidEmail
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email {
		return ErrInvalidEmail
	}
	return nil
}

func hashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func generatePassword(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	// URL-safe base64 without padding, truncated to n chars
	s := base64.RawURLEncoding.EncodeToString(buf)
	if len(s) > n {
		s = s[:n]
	}
	return s, nil
}

func MigrateAnonymousData(fromAnonID, toUserID string) error {
	if fromAnonID == "" || toUserID == "" || fromAnonID == toUserID {
		return nil
	}
	db := Global.DB
	if err := db.Model(&entities.Job{}).Where("user_id = ?", fromAnonID).Update("user_id", toUserID).Error; err != nil {
		return err
	}
	if err := db.Model(&entities.YoutubePlaylistItem{}).Where("user_id = ?", fromAnonID).Update("user_id", toUserID).Error; err != nil {
		return err
	}
	if err := db.Model(&entities.YoutubePlaylistError{}).Where("user_id = ?", fromAnonID).Update("user_id", toUserID).Error; err != nil {
		return err
	}
	migrateChunkManifests(fromAnonID, toUserID)
	return nil
}

func migrateChunkManifests(fromAnonID, toUserID string) {
	entries, err := os.ReadDir(chunksRoot)
	if err != nil {
		return
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		manifestPath := filepath.Join(chunksRoot, e.Name(), "manifest.json")
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			continue
		}
		if !strings.Contains(string(data), `"user_id":"`+fromAnonID+`"`) &&
			!strings.Contains(string(data), `"user_id": "`+fromAnonID+`"`) {
			continue
		}
		updated := strings.ReplaceAll(string(data), `"user_id":"`+fromAnonID+`"`, `"user_id":"`+toUserID+`"`)
		updated = strings.ReplaceAll(updated, `"user_id": "`+fromAnonID+`"`, `"user_id": "`+toUserID+`"`)
		_ = os.WriteFile(manifestPath, []byte(updated), 0o644)
	}
}

func createSession(userID string) (string, error) {
	sessionID := uuid.New().String()
	s := entities.Session{
		ID:        sessionID,
		UserID:    userID,
		ExpiresAt: time.Now().UTC().Add(sessionTTL),
		CreatedAt: time.Now().UTC(),
	}
	if err := Global.DB.Create(&s).Error; err != nil {
		return "", err
	}
	return sessionID, nil
}

func Register(email, password, anonUserID string) (*AuthResult, error) {
	email = normalizeEmail(email)
	if err := validateEmail(email); err != nil {
		return nil, err
	}
	if len(password) < minPasswordLen {
		return nil, ErrWeakPassword
	}

	var existing entities.User
	err := Global.DB.Where("email = ?", email).First(&existing).Error
	if err == nil {
		return nil, ErrEmailTaken
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	hash, err := hashPassword(password)
	if err != nil {
		return nil, err
	}

	user := entities.User{
		ID:           uuid.New().String(),
		Email:        email,
		PasswordHash: hash,
	}
	if err := Global.DB.Create(&user).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return nil, ErrEmailTaken
		}
		return nil, err
	}

	_ = MigrateAnonymousData(anonUserID, user.ID)

	sessionID, err := createSession(user.ID)
	if err != nil {
		return nil, err
	}

	if err := MailService.SendWelcome(email); err != nil {
		log.Printf("AuthService.Register welcome mail: %v", err)
	}

	return &AuthResult{User: user, SessionID: sessionID}, nil
}

func Login(email, password, anonUserID, clientIP string) (*AuthResult, error) {
	email = normalizeEmail(email)
	if err := validateEmail(email); err != nil {
		return nil, ErrInvalidCredentials
	}
	if middleware.LoginRateLimited(clientIP, email) {
		return nil, ErrRateLimited
	}

	var user entities.User
	err := Global.DB.Where("email = ?", email).First(&user).Error
	if err != nil {
		middleware.RecordLoginFailure(clientIP, email)
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		middleware.RecordLoginFailure(clientIP, email)
		return nil, ErrInvalidCredentials
	}

	middleware.ClearLoginFailures(clientIP, email)
	_ = MigrateAnonymousData(anonUserID, user.ID)

	sessionID, err := createSession(user.ID)
	if err != nil {
		return nil, err
	}
	return &AuthResult{User: user, SessionID: sessionID}, nil
}

func ForgotPassword(email string) error {
	email = normalizeEmail(email)
	if err := validateEmail(email); err != nil {
		// Always return nil for privacy
		return nil
	}

	var user entities.User
	err := Global.DB.Where("email = ?", email).First(&user).Error
	if err != nil {
		return nil
	}

	newPass, err := generatePassword(generatedPassLen)
	if err != nil {
		return err
	}
	hash, err := hashPassword(newPass)
	if err != nil {
		return err
	}

	oldHash := user.PasswordHash
	if err := Global.DB.Model(&user).Update("password_hash", hash).Error; err != nil {
		return err
	}

	if err := MailService.SendNewPassword(email, newPass); err != nil {
		_ = Global.DB.Model(&user).Update("password_hash", oldHash).Error
		return ErrMailFailed
	}
	return nil
}

func ChangePassword(userID, oldPassword, newPassword string) error {
	if len(newPassword) < minPasswordLen {
		return ErrWeakPassword
	}

	var user entities.User
	if err := Global.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		return ErrUserNotFound
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(oldPassword)); err != nil {
		return ErrWrongPassword
	}

	hash, err := hashPassword(newPassword)
	if err != nil {
		return err
	}

	oldHash := user.PasswordHash
	if err := Global.DB.Model(&user).Update("password_hash", hash).Error; err != nil {
		return err
	}

	if err := MailService.SendPasswordChanged(user.Email); err != nil {
		_ = Global.DB.Model(&user).Update("password_hash", oldHash).Error
		return ErrMailFailed
	}
	return nil
}

func Logout(sessionID string) error {
	if sessionID == "" {
		return nil
	}
	return Global.DB.Where("id = ?", sessionID).Delete(&entities.Session{}).Error
}

func GetUserBySession(sessionID string) (*entities.User, error) {
	if sessionID == "" {
		return nil, fmt.Errorf("empty session")
	}
	var session entities.Session
	err := Global.DB.Where("id = ? AND expires_at > ?", sessionID, time.Now().UTC()).First(&session).Error
	if err != nil {
		return nil, err
	}
	var user entities.User
	if err := Global.DB.Where("id = ?", session.UserID).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func GetUserByID(userID string) (*entities.User, error) {
	var user entities.User
	if err := Global.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}
