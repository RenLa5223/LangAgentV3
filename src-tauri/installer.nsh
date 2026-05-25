; ==============================================================================
; LangAgentV3 NSIS Installer Hooks (Tauri v2)
; ==============================================================================

; --- 安装前：强制终止残留进程，避免文件被占用 ---
!macro NSIS_HOOK_PREINSTALL
  DetailPrint "正在停止后台引擎..."
  nsExec::ExecToLog 'taskkill /F /IM core-engine.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM core-engine-x86_64-pc-windows-msvc.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM LangAgentV3.exe /T'
  Sleep 3000
!macroend

; --- 卸载最后一步：正确删除用户数据 ---
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState == 1
    SetShellVarContext current
    RmDir /r "$APPDATA\LangAgentV3"
  ${EndIf}
!macroend
