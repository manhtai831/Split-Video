package seo

import (
	"app/config"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type sitemapEntry struct {
	Path     string
	Priority string
}

var sitemapPages = []sitemapEntry{
	{Path: "/", Priority: "1.0"},
	{Path: "/video/split", Priority: "0.8"},
	{Path: "/video/merge", Priority: "0.8"},
	{Path: "/video/gif", Priority: "0.8"},
	{Path: "/video/extract-audio", Priority: "0.8"},
	{Path: "/video/editor", Priority: "0.8"},
	{Path: "/about", Priority: "0.6"},
	{Path: "/faq", Priority: "0.6"},
}

func Bootstrap() {
	http.HandleFunc("/robots.txt", handleRobots)
	http.HandleFunc("/sitemap.xml", handleSitemap)
}

func handleRobots(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sitemapURL := config.AbsURL("/sitemap.xml")
	body := strings.Join([]string{
		"User-agent: *",
		"Allow: /",
		"Allow: /video/",
		"Disallow: /api/",
		"Disallow: /job/",
		"",
		"Sitemap: " + sitemapURL,
		"",
	}, "\n")

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Write([]byte(body))
}

func handleSitemap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	lastmod := time.Now().Format("2006-01-02")
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)

	for _, page := range sitemapPages {
		loc := config.AbsURL(page.Path)
		fmt.Fprintf(&b, `<url><loc>%s</loc><lastmod>%s</lastmod><changefreq>weekly</changefreq><priority>%s</priority></url>`, loc, lastmod, page.Priority)
	}

	b.WriteString(`</urlset>`)

	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Write([]byte(b.String()))
}
