package viewer

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

const cookieName = "go2rtc_viewer"

type session struct {
	user      string
	expiresAt time.Time
}

type sessionTable struct {
	mu       sync.Mutex
	ttl      time.Duration
	sessions map[string]*session
}

func newSessionTable(ttl time.Duration) *sessionTable {
	return &sessionTable{
		ttl:      ttl,
		sessions: map[string]*session{},
	}
}

func (t *sessionTable) Create(user string) (token string, expires time.Time) {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	token = hex.EncodeToString(b)
	expires = time.Now().Add(t.ttl)

	t.mu.Lock()
	t.sessions[token] = &session{user: user, expiresAt: expires}
	t.mu.Unlock()
	return token, expires
}

func (t *sessionTable) Delete(token string) {
	t.mu.Lock()
	delete(t.sessions, token)
	t.mu.Unlock()
}

func (t *sessionTable) User(token string) (string, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()

	s, ok := t.sessions[token]
	if !ok || s == nil || time.Now().After(s.expiresAt) {
		if ok {
			delete(t.sessions, token)
		}
		return "", false
	}
	return s.user, true
}
