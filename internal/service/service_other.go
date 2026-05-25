//go:build !windows

package service

func Supported() bool { return false }

func GetStatus() (Status, error) {
	return Status{Name: serviceName, Message: "OS service control is only supported on Windows"}, nil
}

func Install() error {
	return errUnsupported()
}

func Uninstall() error {
	return errUnsupported()
}

func Start() error {
	return errUnsupported()
}

func Stop() error {
	return errUnsupported()
}

func errUnsupported() error {
	return &Error{Msg: "Windows service control is not supported on this OS"}
}

type Error struct{ Msg string }

func (e *Error) Error() string { return e.Msg }
