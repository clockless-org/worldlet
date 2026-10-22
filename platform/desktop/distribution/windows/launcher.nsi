; Built by scripts/windows-installer.ts around installer.nsi's output (#1804).
; Builds 2750-2807 kill the update installer they start about a second after starting it, sooner
; than the full installer can finish its CRC pass and reach its own restart. This small launcher has
; no CRC pass of its own: it restarts outside that process tree first, then runs the real installer,
; whose CRC check still guards every file. Exit code, silence and arguments pass through.
Unicode true
RequestExecutionLevel user
CRCCheck off
SetCompress off
SilentInstall silent
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "${GENERATED}"

Name "${PRODUCT}"
OutFile "${OUTPUT}"
Icon "${PAYLOAD}\Worldlet.ico"
VIProductVersion "${FILE_VERSION}"
VIAddVersionKey "ProductName" "Worldlet"
VIAddVersionKey "FileDescription" "Worldlet Windows Setup"
VIAddVersionKey "FileVersion" "${FILE_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "LegalCopyright" "Worldlet"

Function .onInit
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
FunctionEnd

Section
  ${GetParameters} $0
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  ClearErrors
  File "/oname=$PLUGINSDIR\setup.exe" "${INNER}"
  ${If} ${Errors}
    SetErrorLevel 1
    Abort
  ${EndIf}
  ; The real installer's parent is this launcher, never the /WAITPID process, so it waits for that
  ; process synchronously instead of restarting again.
  ClearErrors
  ExecWait '"$PLUGINSDIR\setup.exe" $0' $2
  ${If} ${Errors}
    StrCpy $2 1
  ${EndIf}
  ; An in-app update's outcome belongs beside the file the app started.
  ClearErrors
  ${GetOptions} $0 "/WAITPID=" $1
  ${IfNot} ${Errors}
  ${AndIf} ${FileExists} "$PLUGINSDIR\setup-result.txt"
    CopyFiles /SILENT "$PLUGINSDIR\setup-result.txt" "$EXEDIR\setup-result.txt"
  ${EndIf}
  SetOutPath "$TEMP"
  SetErrorLevel $2
SectionEnd
