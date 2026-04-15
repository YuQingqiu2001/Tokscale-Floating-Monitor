!include "LogicLib.nsh"
!include "WinMessages.nsh"

!macro customInstall
  ; 创建 tokscale.cmd 包装脚本
  FileOpen $0 "$INSTDIR\tokscale.cmd" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 "$\"%~dp0resources\tokscale.exe$\" %*$\r$\n"
  FileClose $0
  
  ; 添加安装目录到用户 PATH
  ReadRegStr $1 HKCU "Environment" "Path"
  ${If} $1 == ""
    StrCpy $4 "$INSTDIR"
  ${Else}
    StrCpy $4 "$INSTDIR;$1"
  ${EndIf}
  
  WriteRegExpandStr HKCU "Environment" "Path" "$4"
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  
  ; 创建开机启动项
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "TokscaleFloatingMonitor" "$\"$INSTDIR\Tokscale Floating Monitor.exe$\""
!macroend

!macro customUnInstall
  ; 删除 tokscale.cmd
  Delete "$INSTDIR\tokscale.cmd"
  
  ; 删除开机启动项
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "TokscaleFloatingMonitor"
!macroend