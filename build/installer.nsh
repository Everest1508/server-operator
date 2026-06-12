!macro customInstall
  ${ifNot} ${isUpdated}
    EnVar::AddValue "PATH" "$INSTDIR"
  ${endIf}
!macroend

!macro customUnInstall
  EnVar::DeleteValue "PATH" "$INSTDIR"
!macroend
