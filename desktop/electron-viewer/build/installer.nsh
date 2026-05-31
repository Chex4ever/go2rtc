; Custom NSIS page: Manual / Autostart / Kiosk (electron-builder assisted installer)
!ifndef BUILD_UNINSTALLER

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var ElectronViewerMode
Var ViewerModeDialog
Var ViewerModeManual
Var ViewerModeAutostart
Var ViewerModeKiosk

!macro customPageAfterChangeDir
  Page custom ViewerModePageCreate ViewerModePageLeave
!macroend

Function ViewerModePageCreate
  nsDialogs::Create 1018
  Pop $ViewerModeDialog

  ${NSD_CreateLabel} 0 0 100% 32u "How should this PC run the camera wall after installation?"
  Pop $0

  ${NSD_CreateRadioButton} 0 40u 100% 16u "Manual — normal window; open from desktop shortcut"
  Pop $ViewerModeManual

  ${NSD_CreateRadioButton} 0 62u 100% 16u "Autostart — normal window; start at Windows sign-in"
  Pop $ViewerModeAutostart

  ${NSD_CreateRadioButton} 0 84u 100% 16u "Kiosk — fullscreen wall; start at Windows sign-in"
  Pop $ViewerModeKiosk

  ${NSD_SetState} $ViewerModeManual ${BST_CHECKED}
  StrCpy $ElectronViewerMode "manual"

  nsDialogs::Show
FunctionEnd

Function ViewerModePageLeave
  ${NSD_GetState} $ViewerModeManual $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $ElectronViewerMode "manual"
    Return
  ${EndIf}

  ${NSD_GetState} $ViewerModeAutostart $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $ElectronViewerMode "autostart"
    Return
  ${EndIf}

  StrCpy $ElectronViewerMode "kiosk"
FunctionEnd

!macro customInstall
  Call ClearViewerUpdateState
  ${ifNot} ${isUpdated}
    Call WriteViewerInstallConfig
  ${endIf}
  ; Silent in-place update: helper waits for app exit; relaunch here after files replaced.
  ${If} ${Silent}
    ${If} ${isUpdated}
      Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
    ${EndIf}
  ${EndIf}
!macroend

; Interactive installs — runAfterFinish in electron-builder handles the finish page.
!macro customFinish
!macroend

Function ClearViewerUpdateState
  ; Setup (manual or silent) replaces the app — clear in-app autoupdate state so the next
  ; launch does not re-run a cached installer or loop quit-on-start.
  Delete "$APPDATA\go2rtc-viewer\pending-update.json"
  Delete "$APPDATA\go2rtc-viewer\install-state.json"
FunctionEnd

Function WriteViewerInstallConfig
  CreateDirectory "$APPDATA\go2rtc-viewer"

  ${If} $ElectronViewerMode == "kiosk"
    FileOpen $0 "$APPDATA\go2rtc-viewer\config.json" w
    FileWrite $0 "{$\r$\n"
    FileWrite $0 '  "serverUrl": "http://127.0.0.1:1984",$\r$\n'
    FileWrite $0 '  "allowInsecureHttps": false,$\r$\n'
    FileWrite $0 '  "kiosk": true,$\r$\n'
    FileWrite $0 '  "autoStart": true,$\r$\n'
    FileWrite $0 '  "autoOpenLayout": true$\r$\n'
    FileWrite $0 "}$\r$\n"
    FileClose $0
    Return
  ${EndIf}

  ${If} $ElectronViewerMode == "autostart"
    FileOpen $0 "$APPDATA\go2rtc-viewer\config.json" w
    FileWrite $0 "{$\r$\n"
    FileWrite $0 '  "serverUrl": "http://127.0.0.1:1984",$\r$\n'
    FileWrite $0 '  "allowInsecureHttps": false,$\r$\n'
    FileWrite $0 '  "kiosk": false,$\r$\n'
    FileWrite $0 '  "autoStart": true,$\r$\n'
    FileWrite $0 '  "autoOpenLayout": true$\r$\n'
    FileWrite $0 "}$\r$\n"
    FileClose $0
    Return
  ${EndIf}

  ; manual
  FileOpen $0 "$APPDATA\go2rtc-viewer\config.json" w
  FileWrite $0 "{$\r$\n"
  FileWrite $0 '  "serverUrl": "http://127.0.0.1:1984",$\r$\n'
  FileWrite $0 '  "allowInsecureHttps": false,$\r$\n'
  FileWrite $0 '  "kiosk": false,$\r$\n'
  FileWrite $0 '  "autoStart": false,$\r$\n'
  FileWrite $0 '  "autoOpenLayout": true$\r$\n'
  FileWrite $0 "}$\r$\n"
  FileClose $0
FunctionEnd

!endif
