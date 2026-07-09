package structs

import "app/config"

type BreadcrumbItem struct {
	Name string
	URL  string
}

type FAQItem struct {
	Question string
	Answer   string
}

type PageData struct {
	Title         string
	Description   string
	DescriptionEN string
	ActivePage    string
	Result        string
	UserID        string

	CanonicalPath string
	OGImage       string
	OGType        string
	NoIndex       bool
	Breadcrumbs   []BreadcrumbItem
	FAQItems      []FAQItem

	UploadChunkSizeBytes int
}

func (p *PageData) Finalize() {
	if p.CanonicalPath == "" {
		p.CanonicalPath = pageCanonicalPath(p.ActivePage)
	}
	if p.OGImage == "" {
		p.OGImage = config.DefaultOGImagePath
	}
	if p.OGType == "" {
		p.OGType = "website"
	}
}

func pageCanonicalPath(activePage string) string {
	switch activePage {
	case "home":
		return "/"
	case "split":
		return "/video/split"
	case "merge":
		return "/video/merge"
	case "gif":
		return "/video/gif"
	case "extract-audio":
		return "/video/extract-audio"
	case "editor":
		return "/video/editor"
	case "about":
		return "/about"
	case "faq":
		return "/faq"
	default:
		return "/"
	}
}

func ToolBreadcrumbs(toolName string, toolPath string) []BreadcrumbItem {
	return []BreadcrumbItem{
		{Name: "Home", URL: "/"},
		{Name: toolName, URL: toolPath},
	}
}
