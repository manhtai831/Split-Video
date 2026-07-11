package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	releasesLatestURL = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest"
	assetName         = "yt-dlp"
	installPath       = "/usr/local/bin/yt-dlp"
	userAgent         = "split-video-ytdlp-updater@video.77.io.vn"
)

type releaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type release struct {
	TagName string         `json:"tag_name"`
	Assets  []releaseAsset `json:"assets"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "[ytdlp-updater] error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	latest, err := fetchLatestRelease()
	if err != nil {
		return err
	}

	downloadURL, err := assetURL(latest)
	if err != nil {
		return err
	}

	current, err := installedVersion()
	if err == nil && current == latest.TagName {
		fmt.Printf("[ytdlp-updater] skipped: already at %s\n", current)
		return nil
	}

	if err := downloadBinary(downloadURL, installPath); err != nil {
		return err
	}

	if current == "" {
		fmt.Printf("[ytdlp-updater] installed: %s\n", latest.TagName)
	} else {
		fmt.Printf("[ytdlp-updater] updated: %s -> %s\n", current, latest.TagName)
	}
	return nil
}

func fetchLatestRelease() (release, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest(http.MethodGet, releasesLatestURL, nil)
	if err != nil {
		return release{}, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return release{}, fmt.Errorf("fetch latest release: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return release{}, fmt.Errorf("fetch latest release: status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var rel release
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return release{}, fmt.Errorf("decode release json: %w", err)
	}
	if rel.TagName == "" {
		return release{}, fmt.Errorf("latest release missing tag_name")
	}
	return rel, nil
}

func assetURL(rel release) (string, error) {
	for _, a := range rel.Assets {
		if a.Name == assetName {
			if a.BrowserDownloadURL == "" {
				return "", fmt.Errorf("asset %q has empty download url", assetName)
			}
			return a.BrowserDownloadURL, nil
		}
	}
	return "", fmt.Errorf("asset %q not found in release %s", assetName, rel.TagName)
}

func installedVersion() (string, error) {
	out, err := exec.Command(installPath, "--version").Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func downloadBinary(url, dest string) error {
	client := &http.Client{Timeout: 2 * time.Minute}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("download %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("download %s: status %d: %s", url, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	dir := filepath.Dir(dest)
	tmp, err := os.CreateTemp(dir, "yt-dlp-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if _, err := io.Copy(tmp, resp.Body); err != nil {
		tmp.Close()
		return fmt.Errorf("write download: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, 0o755); err != nil {
		return fmt.Errorf("chmod: %w", err)
	}
	if err := os.Rename(tmpName, dest); err != nil {
		return fmt.Errorf("install to %s: %w", dest, err)
	}
	return nil
}
