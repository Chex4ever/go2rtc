package winsvc

import "testing"

func TestIsAccessDenied(t *testing.T) {
	t.Parallel()
	cases := []struct {
		text string
		want bool
	}{
		{"[SC] OpenSCManager FAILED 5: Access is denied.", true},
		{"[SC] OpenSCManager: ошибка: 5: Отказано в доступе.", true},
		{"[SC] OpenService FAILED 1060: The specified service does not exist.", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := IsAccessDenied(tc.text); got != tc.want {
			t.Errorf("IsAccessDenied(%q) = %v, want %v", tc.text, got, tc.want)
		}
	}
}
