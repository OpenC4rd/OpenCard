; OpenCard 安装器钩子：给 .ocpack 补一个专用文件图标。
;
; Tauri 的 fileAssociations 只能让所有扩展名共用应用图标（NSIS 模板把 DefaultIcon 写成
; "$INSTDIR\OpenCard.exe,0"），而资源包在资源管理器里应该有自己的图标。资源文件由
; tauri.conf.json 的 bundle.resources 装到 $INSTDIR\icons\ocpack.ico。
;
; 应用启动时也会按当前用户补写同一个值（见 src/file_type_icons.rs），两边写的是同一个路径，
; 因此这里只需要在安装完成后确认一次；卸载时只清掉我们自己写的那一个值。

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\OpenCard Resource Package\DefaultIcon" "" "$INSTDIR\icons\ocpack.ico,0"
  WriteRegStr SHCTX "Software\Classes\.ocpack\DefaultIcon" "" "$INSTDIR\icons\ocpack.ico,0"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; 关联类由安装器自己的 APP_UNASSOCIATE 删除，这里只管扩展名兜底值，而且只在它仍是我们的图标时删。
  ReadRegStr $0 SHCTX "Software\Classes\.ocpack\DefaultIcon" ""
  StrCmp $0 '$\"$INSTDIR\icons\ocpack.ico$\",0' 0 +2
    DeleteRegKey SHCTX "Software\Classes\.ocpack\DefaultIcon"
!macroend
