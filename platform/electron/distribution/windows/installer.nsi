; Built by scripts/windows-installer.ts; all paths and identities are generated.
Unicode true
RequestExecutionLevel user
SetCompressor /SOLID lzma
; No whole-file CRC pass before .onInit: Builds 2750-2807 kill the update installer they start about a
; second after starting it, so its restart outside their process tree must come first (#1804). The
; in-app updater checks SHA-256 and release installers are Authenticode-signed.
CRCCheck off
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"
!include "${GENERATED}"
!define MUI_ICON "${PAYLOAD}\Worldlet.ico"
!define MUI_UNICON "${PAYLOAD}\Worldlet.ico"

Name "${PRODUCT}"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\${PRODUCT}"
ShowInstDetails hide
ShowUninstDetails hide
VIProductVersion "${FILE_VERSION}"
VIAddVersionKey "ProductName" "Worldlet"
VIAddVersionKey "FileDescription" "Worldlet Windows Setup"
VIAddVersionKey "FileVersion" "${FILE_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "LegalCopyright" "Worldlet"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\app\Worldlet.exe"
!insertmacro MUI_PAGE_FINISH
!define MUI_UNCONFIRMPAGE_TEXT_TOP "Worldlet's program files will be removed. Your personal world and model settings will stay on this computer."
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var Stage
Var Previous
Var SetupMutex
; An in-app update has no window to show why it stopped: its outcome is written beside the installer.
Var UpdateResult
; Set by the in-app Update click (`/RESTARTAPP`): reopen Worldlet when the silent update ends, whatever its outcome.
Var RestartApp

!macro UpdateResult TEXT
  ${If} $UpdateResult != ""
    FileOpen $9 "$UpdateResult" w
    FileWrite $9 "${TEXT}"
    FileClose $9
  ${EndIf}
!macroend

!macro RestartApp
  ${If} $RestartApp == 1
  ${AndIf} ${FileExists} "$INSTDIR\app\Worldlet.exe"
    Exec '"$INSTDIR\app\Worldlet.exe"'
  ${EndIf}
!macroend

!macro Fail MESSAGE
  MessageBox MB_OK|MB_ICONSTOP "${MESSAGE}" /SD IDOK
  !insertmacro UpdateResult "failed: ${MESSAGE}"
  ; A failed silent update reopens the version that is still installed.
  !insertmacro RestartApp
  SetErrorLevel 1
  Abort
!macroend

!macro AcquireSetupLock
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\${IDENTITY}.setup") p.r0 ?e'
  Pop $1
  StrCpy $SetupMutex $0
  ${If} $0 == 0
  ${OrIf} $1 == 183
    !insertmacro Fail "Another Worldlet setup or uninstall is already running. Close it and try again."
  ${EndIf}
  ; Keep the handle for this process's lifetime, including its finish page.
!macroend

!macro CheckDirectory DIRECTORY
  System::Call 'kernel32::GetFileAttributesW(w "${DIRECTORY}") i.r0'
  ${If} $0 != -1
    IntOp $0 $0 & 0x400
    ${If} $0 != 0
      !insertmacro Fail "The Worldlet program directory contains an unexpected directory link. No files were removed."
    ${EndIf}
  ${EndIf}
!macroend

!macro CheckClosed
  ${If} ${FileExists} "$INSTDIR\app\Worldlet.exe"
  ; OPEN_EXISTING with write access does not modify the file. A running image
  ; refuses this handle; never terminate a user's app from an installer.
  System::Call 'kernel32::CreateFileW(w "$INSTDIR\app\Worldlet.exe", i 0x40000000, i 0, p 0, i 3, i 0, p 0) p.r0'
  ${If} $0 == -1
    !insertmacro Fail "Close Worldlet before installing or uninstalling it, then try again."
  ${EndIf}
    System::Call 'kernel32::CloseHandle(p r0)'
  ${EndIf}
!macroend

Function .onInit
  ; An in-app update starts this installer as a child of the app it replaces,
  ; and Quit Completely ends every child the app still has (#1690, published
  ; in Build 2792). When the process to wait for is this installer's parent,
  ; restart outside its process tree first so the update survives that quit;
  ; the copy runs everything below.
  ${GetParameters} $0
  ClearErrors
  StrCpy $1 ""
  ${GetOptions} $0 "/WAITPID=" $1
  ${If} $1 != ""
    ClearErrors
    ${GetOptions} $0 "/RELAUNCHED" $2
    ${If} ${Errors}
      ; PROCESS_BASIC_INFORMATION of this 32-bit process; the last field is the parent's ID.
      System::Call '*(i,i,i,i,i,i) p.r3'
      System::Call 'ntdll::NtQueryInformationProcess(p -1, i 0, p r3, i 24, p 0) i.r4'
      System::Call '*$3(i,i,i,i,i,i.r5)'
      System::Free $3
      ${If} $4 == 0
      ${AndIf} $5 == $1
        ClearErrors
        Exec '"$EXEPATH" /RELAUNCHED $0'
        ${IfNot} ${Errors}
          Quit
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ${If} $1 != ""
    StrCpy $UpdateResult "$EXEDIR\setup-result.txt"
    ClearErrors
    ${GetOptions} $0 "/RESTARTAPP" $2
    ${IfNot} ${Errors}
      StrCpy $RestartApp 1
    ${EndIf}
  ${EndIf}
  ClearErrors
  !insertmacro AcquireSetupLock
  ; An in-app update closes normally. Wait for that exact process without
  ; terminating it; the ordinary locked-image check still runs afterward.
  ${GetParameters} $0
  ClearErrors
  StrCpy $1 ""
  ${GetOptions} $0 "/WAITPID=" $1
  ${If} $1 != ""
    System::Call 'kernel32::OpenProcess(i 0x100000, i 0, i r1) p.r2'
    ${If} $2 != 0
      System::Call 'kernel32::WaitForSingleObject(p r2, i 30000) i.r3'
      System::Call 'kernel32::CloseHandle(p r2)'
      ${If} $3 != 0
        !insertmacro Fail "Worldlet is still closing. Close it and run this installer again."
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ClearErrors
  ${IfNot} ${IsNativeAMD64}
    !insertmacro Fail "This Worldlet preview requires an x64 Windows computer."
  ${EndIf}
  ${IfNot} ${AtLeastBuild} 17763
    !insertmacro Fail "Worldlet requires Windows 10 version 1809 or later."
  ${EndIf}
  SetShellVarContext current
  ; Ignore /D: program installation and personal data must never overlap.
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT}"
  StrCpy $Stage "$INSTDIR\staging"
  !insertmacro CheckDirectory "$INSTDIR"
  !insertmacro CheckDirectory "$Stage"
  !insertmacro CheckInstalledDirectories
  !insertmacro CheckStagedDirectories
  ; The app's helper processes run the same image and can outlive its main
  ; process by a moment, longer on a busy computer: an in-app update gives
  ; them up to 30 seconds to exit before it reports Worldlet as open.
  ${If} $UpdateResult != ""
    StrCpy $8 0
    ${Do}
      System::Call 'kernel32::CreateFileW(w "$INSTDIR\app\Worldlet.exe", i 0x40000000, i 0, p 0, i 3, i 0, p 0) p.r0'
      ${If} $0 != -1
        System::Call 'kernel32::CloseHandle(p r0)'
        ${Break}
      ${EndIf}
      ${IfNot} ${FileExists} "$INSTDIR\app\Worldlet.exe"
        ${Break}
      ${EndIf}
      IntOp $8 $8 + 1
      ${If} $8 >= 120
        ${Break}
      ${EndIf}
      Sleep 250
    ${Loop}
  ${EndIf}
  !insertmacro CheckClosed
  StrCpy $Previous 0
  IfFileExists "$INSTDIR\install.id" existing no_existing
  existing:
    FileOpen $0 "$INSTDIR\install.id" r
    FileRead $0 $1
    FileClose $0
    ${If} $1 != "${IDENTITY}"
      !insertmacro Fail "This folder belongs to another installation. Worldlet did not change it."
    ${EndIf}
    IfFileExists "$INSTDIR\Uninstall.exe" 0 invalid_existing
    StrCpy $Previous 1
    Goto checked_existing
  invalid_existing:
    !insertmacro Fail "The existing Worldlet uninstaller is missing. Restore it before upgrading."
  no_existing:
    IfFileExists "$INSTDIR\installing.id" retry_existing
    IfFileExists "$INSTDIR\*.*" 0 checked_existing
    !insertmacro Fail "The Worldlet program folder already exists without an installation record. Move it before installing."
  retry_existing:
    FileOpen $0 "$INSTDIR\installing.id" r
    FileRead $0 $1
    FileClose $0
    ${If} $1 != "${IDENTITY}"
      !insertmacro Fail "The unfinished installation belongs to another product."
    ${EndIf}
  checked_existing:
FunctionEnd

Section "Worldlet"
  CreateDirectory "$INSTDIR"
  FileOpen $0 "$INSTDIR\installing.id" w
  FileWrite $0 "${IDENTITY}"
  FileClose $0
  ClearErrors
  SetOutPath "$Stage"
  IfErrors extraction_failed
  File /r "${PAYLOAD}\*.*"
  IfErrors extraction_failed
  ; Only after successful extraction ask the previous uninstaller to remove
  ; its own file inventory. Unknown files and the staged payload are retained.
  ${If} $Previous == 1
    ExecWait '"$INSTDIR\Uninstall.exe" /S /UPGRADE _?=$INSTDIR' $0
    ${If} $0 != 0
      !insertmacro Fail "The previous Worldlet version could not be removed. Your personal world has not changed."
    ${EndIf}
  ${EndIf}
  SetOutPath "$INSTDIR"
  !insertmacro MovePayload
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  FileOpen $0 "$INSTDIR\install.id" w
  FileWrite $0 "${IDENTITY}"
  FileClose $0
  Delete "$INSTDIR\installing.id"
  CreateDirectory "$SMPROGRAMS\${PRODUCT}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT}\Worldlet.lnk" "$INSTDIR\app\Worldlet.exe" "" "$INSTDIR\app\Worldlet.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "DisplayName" "${PRODUCT}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "DisplayVersion" "${APP_VERSION} (${BUILD})"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "Publisher" "Worldlet"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "DisplayIcon" "$INSTDIR\app\Worldlet.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "NoRepair" 1
  !insertmacro UpdateResult "installed ${APP_VERSION} build ${BUILD}"
  !insertmacro RestartApp
  Goto installed
  extraction_failed:
    !insertmacro Fail "Worldlet could not extract its files. Check available disk space and try again."
  installed:
SectionEnd

Function un.onInit
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/UPGRADE" $1
  ${If} ${Errors}
    !insertmacro AcquireSetupLock
  ${EndIf}
  SetShellVarContext current
  StrCpy $1 "$LOCALAPPDATA\Programs\${PRODUCT}"
  ${If} $INSTDIR != $1
    !insertmacro Fail "Run the uninstaller from its original Worldlet program directory."
  ${EndIf}
  !insertmacro CheckDirectory "$INSTDIR"
  !insertmacro CheckInstalledDirectories
  !insertmacro CheckClosed
FunctionEnd

Section "Uninstall"
  !insertmacro DeletePayload
  Delete "$SMPROGRAMS\${PRODUCT}\Worldlet.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT}"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}"
  Delete "$INSTDIR\install.id"
  Delete "$INSTDIR\Uninstall.exe"
  ; Non-recursive: retain unknown files. App data lives outside this directory.
  RMDir "$INSTDIR"
SectionEnd
