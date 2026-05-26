package release

import "strconv"

// CompareSemver returns 1 if a>b, -1 if a<b, 0 if equal (numeric dot parts).
func CompareSemver(a, b string) int {
	pa := parseParts(a)
	pb := parseParts(b)
	n := len(pa)
	if len(pb) > n {
		n = len(pb)
	}
	for i := 0; i < n; i++ {
		var da, db int
		if i < len(pa) {
			da = pa[i]
		}
		if i < len(pb) {
			db = pb[i]
		}
		if da > db {
			return 1
		}
		if da < db {
			return -1
		}
	}
	return 0
}

func parseParts(v string) []int {
	parts := []int{}
	for _, s := range splitVersion(v) {
		n, _ := strconv.Atoi(s)
		parts = append(parts, n)
	}
	return parts
}

func splitVersion(v string) []string {
	out := []string{}
	cur := ""
	for _, r := range v {
		if r == '.' {
			if cur != "" {
				out = append(out, cur)
				cur = ""
			}
			continue
		}
		if r < '0' || r > '9' {
			break
		}
		cur += string(r)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}

// IsNewer reports whether remote is newer than current.
func IsNewer(remote, current string) bool {
	return CompareSemver(remote, current) > 0
}
