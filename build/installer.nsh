!macro customInstall
  ${ifNot} ${isUpdated}
    ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PATH"
    ${If} $0 != ""
      StrCpy $0 "$0;$INSTDIR"
    ${Else}
      StrCpy $0 "$INSTDIR"
    ${EndIf}
    WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PATH" "$0"
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${endIf}
!macroend
