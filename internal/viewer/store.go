package viewer

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"

	"github.com/AlexxIT/go2rtc/pkg/yaml"
)

// Grid presets supported by the viewer UI.
var ValidGrids = []int{6, 7, 25, 36}

type TileView struct {
	Fit        string  `json:"fit,omitempty" yaml:"fit,omitempty"`
	Scale      float64 `json:"scale,omitempty" yaml:"scale,omitempty"`
	Tx         float64 `json:"tx,omitempty" yaml:"tx,omitempty"`
	Ty         float64 `json:"ty,omitempty" yaml:"ty,omitempty"`
	WidthScale float64 `json:"widthScale,omitempty" yaml:"widthScale,omitempty"`
}

type Tile struct {
	Stream string    `json:"stream" yaml:"stream"`
	X      int       `json:"x" yaml:"x"`
	Y      int       `json:"y" yaml:"y"`
	W      int       `json:"w" yaml:"w"`
	H      int       `json:"h" yaml:"h"`
	View   *TileView `json:"view,omitempty" yaml:"view,omitempty"`
}

type User struct {
	Password string   `json:"-" yaml:"password"`
	Layouts  []string `json:"layouts" yaml:"layouts"`
}

type Layout struct {
	Grid    int               `json:"grid" yaml:"grid"`
	Cameras []string          `json:"cameras" yaml:"cameras"`
	Preview map[string]string `json:"preview,omitempty" yaml:"preview,omitempty"`
}

type LayoutState struct {
	Tiles []Tile `json:"tiles" yaml:"tiles"`
}

type TrustedIP struct {
	User    string    `json:"user" yaml:"user"`
	Expires time.Time `json:"expires" yaml:"expires"`
}

type Config struct {
	Users           map[string]*User                    `yaml:"users"`
	Layouts         map[string]*Layout                  `yaml:"layouts"`
	UserLayoutState map[string]map[string]*LayoutState  `yaml:"user_layout_state"`
	TrustedIPs      map[string]*TrustedIP               `yaml:"trusted_ips"`
}

type Store struct {
	path string
	mu   sync.RWMutex
	Config
}

func NewStore(path string) *Store {
	s := &Store{path: path}
	s.Users = map[string]*User{}
	s.Layouts = map[string]*Layout{}
	s.UserLayoutState = map[string]map[string]*LayoutState{}
	s.TrustedIPs = map[string]*TrustedIP{}
	return s
}

func (s *Store) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var cfg Config
	if err = yaml.Unmarshal(data, &cfg); err != nil {
		return err
	}

	normalizeConfig(&cfg)
	s.Config = cfg
	return nil
}

func (s *Store) Save() error {
	s.mu.RLock()
	cfg := s.Config
	s.mu.RUnlock()

	normalizeConfig(&cfg)

	data, err := yaml.Encode(&cfg, 2)
	if err != nil {
		return err
	}

	dir := filepath.Dir(s.path)
	if err = os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(s.path, data, 0644)
}

func normalizeConfig(cfg *Config) {
	if cfg.Users == nil {
		cfg.Users = map[string]*User{}
	}
	if cfg.Layouts == nil {
		cfg.Layouts = map[string]*Layout{}
	}
	if cfg.UserLayoutState == nil {
		cfg.UserLayoutState = map[string]map[string]*LayoutState{}
	}
	if cfg.TrustedIPs == nil {
		cfg.TrustedIPs = map[string]*TrustedIP{}
	}
	for _, l := range cfg.Layouts {
		if l == nil || len(l.Preview) == 0 {
			continue
		}
		for k, v := range l.Preview {
			if v == "" || k == v {
				delete(l.Preview, k)
			}
		}
		if len(l.Preview) == 0 {
			l.Preview = nil
		}
	}
}

func ValidGrid(grid int) bool {
	return slices.Contains(ValidGrids, grid)
}

func (s *Store) User(name string) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.Users[name]
	return u, ok
}

func (s *Store) CheckPassword(name, password string) bool {
	u, ok := s.User(name)
	if !ok || u == nil {
		return false
	}
	return u.Password == password
}

func (s *Store) LayoutsForUser(name string) []string {
	u, ok := s.User(name)
	if !ok || u == nil {
		return nil
	}
	return slices.Clone(u.Layouts)
}

func (s *Store) Layout(id string) (*Layout, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	l, ok := s.Layouts[id]
	return l, ok
}

func (s *Store) UserCanAccessLayout(user, layoutID string) bool {
	u, ok := s.User(user)
	if !ok || u == nil {
		return false
	}
	return slices.Contains(u.Layouts, layoutID)
}

func (s *Store) LayoutState(user, layoutID string) *LayoutState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if byUser := s.UserLayoutState[user]; byUser != nil {
		if st := byUser[layoutID]; st != nil {
			return &LayoutState{Tiles: slices.Clone(st.Tiles)}
		}
	}
	return &LayoutState{}
}

func (s *Store) SetLayoutState(user, layoutID string, state *LayoutState) error {
	if !s.UserCanAccessLayout(user, layoutID) {
		return errors.New("layout not allowed")
	}
	if _, ok := s.Layout(layoutID); !ok {
		return errors.New("layout not found")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.UserLayoutState[user] == nil {
		s.UserLayoutState[user] = map[string]*LayoutState{}
	}
	if state == nil {
		state = &LayoutState{}
	}
	s.UserLayoutState[user][layoutID] = &LayoutState{Tiles: slices.Clone(state.Tiles)}
	return nil
}

func (s *Store) UserCanAccessStream(user, stream string) bool {
	if stream == "" {
		return false
	}
	u, ok := s.User(user)
	if !ok || u == nil {
		return false
	}
	for _, layoutID := range u.Layouts {
		l, ok := s.Layout(layoutID)
		if !ok || l == nil {
			continue
		}
		for _, c := range l.Cameras {
			if c == stream {
				return true
			}
		}
		for main, preview := range l.Preview {
			if main == stream || preview == stream {
				return true
			}
		}
	}
	return false
}

func (s *Store) TrustIP(ip, user string, expires time.Time) error {
	if _, ok := s.User(user); !ok {
		return errors.New("user not found")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.TrustedIPs[ip] = &TrustedIP{User: user, Expires: expires}
	return nil
}

func (s *Store) UntrustIP(ip string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.TrustedIPs, ip)
}

func (s *Store) UserForTrustedIP(ip string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.TrustedIPs[ip]
	if !ok || t == nil {
		return "", false
	}
	if time.Now().After(t.Expires) {
		return "", false
	}
	if _, ok = s.Users[t.User]; !ok {
		return "", false
	}
	return t.User, true
}

func (s *Store) PruneExpiredTrust() {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for ip, t := range s.TrustedIPs {
		if t == nil || now.After(t.Expires) {
			delete(s.TrustedIPs, ip)
		}
	}
}
