package staticfiles

import (
	"io/fs"
	"net/http"
	"os"
	"regexp"
)

var hashedAssetPattern = regexp.MustCompile(`\.[0-9a-f]{8}\.(css|js)$`)

func Bootstrap() {
	root := noDirListing{http.Dir(staticDir())}
	http.Handle("/static/", cacheControl(http.StripPrefix("/static/", http.FileServer(root))))
}

type noDirListing struct {
	http.FileSystem
}

func (n noDirListing) Open(name string) (http.File, error) {
	f, err := n.FileSystem.Open(name)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if info.IsDir() {
		f.Close()
		return nil, fs.ErrNotExist
	}
	return f, nil
}

func staticDir() string {
	if info, err := os.Stat("dist/static"); err == nil && info.IsDir() {
		return "dist/static"
	}
	return "public/static"
}

func cacheControl(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if hashedAssetPattern.MatchString(r.URL.Path) {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		next.ServeHTTP(w, r)
	})
}
