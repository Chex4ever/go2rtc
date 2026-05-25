package api

import (
	"mime"
	"net/http"

	"github.com/AlexxIT/go2rtc/www"
)

func init() {
	// Windows often lacks built-in types for web assets (served as text/plain).
	_ = mime.AddExtensionType(".css", "text/css; charset=utf-8")
	_ = mime.AddExtensionType(".js", "application/javascript; charset=utf-8")
	_ = mime.AddExtensionType(".mjs", "application/javascript; charset=utf-8")
	_ = mime.AddExtensionType(".json", "application/json; charset=utf-8")
	_ = mime.AddExtensionType(".html", "text/html; charset=utf-8")
	_ = mime.AddExtensionType(".svg", "image/svg+xml")
	_ = mime.AddExtensionType(".wasm", "application/wasm")
}

func initStatic(staticDir string) {
	var root http.FileSystem
	if staticDir != "" {
		log.Info().Str("dir", staticDir).Msg("[api] serve static")
		root = http.Dir(staticDir)
	} else {
		root = http.FS(www.Static)
	}

	base := len(basePath)
	fileServer := http.FileServer(root)

	HandleFunc("", func(w http.ResponseWriter, r *http.Request) {
		if base > 0 {
			r.URL.Path = r.URL.Path[base:]
		}
		fileServer.ServeHTTP(w, r)
	})
}
