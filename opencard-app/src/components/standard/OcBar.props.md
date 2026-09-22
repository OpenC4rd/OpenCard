# OcBar Props 变更清单（V3 申请稿）

- [x] 口径说明：只列 `OcBar` 自有 props，不展开继承/透传字段。

## 新增 Props（V3）

- [x] 本版无新增自有 props。

## 保留 Props（V3，自有）

- [x] `icon?: string`：左侧图标 token key，可由 `#icon` slot 覆盖。
- [x] `title?: string`：左侧标题文本，可由 `#title` slot 覆盖。

## 更改 Props（V3，自有）

- [x] `kind`：删除（由调用方 class/token 决定高度与视觉）。
- [x] `kind=top`：旧语义为顶栏，不再由 `OcBar` 内建分支负责。
- [x] `kind=status`：旧语义为状态栏，不再由 `OcBar` 内建分支负责。
- [x] `kind=section`：旧语义为分节栏，不再由 `OcBar` 内建分支负责。

- [x] `spacing`：删除（间距改为调用方样式或 token 变量控制）。
- [x] `spacing=compact`：旧语义为紧凑项间距，迁移到调用方。
- [x] `spacing=default`：旧语义为默认项间距，迁移到调用方。
- [x] `spacing=spacious`：旧语义为宽松项间距，迁移到调用方。

- [x] `inset`：删除（水平内边距改为调用方样式或 token 变量控制）。
- [x] `inset=none`：旧语义为无水平内边距，迁移到调用方。
- [x] `inset=compact`：旧语义为紧凑水平内边距，迁移到调用方。
- [x] `inset=default`：旧语义为默认水平内边距，迁移到调用方。
- [x] `inset=spacious`：旧语义为宽松水平内边距，迁移到调用方。

- [x] `divider`：删除（上下分隔线改由调用方样式表达）。
- [x] `divider=none`：旧语义为无分隔线，迁移到调用方样式。
- [x] `divider=top`：旧语义为上分隔线，迁移到调用方上边框样式。
- [x] `divider=bottom`：旧语义为下分隔线，迁移到调用方下边框样式。

## 迁移备注

- [x] `OcBar` 只保留结构语义：`leading(icon/title)`、`append`、`append-hover`。
- [x] 顶栏/状态栏/分节栏差异统一迁移到调用方样式层。
