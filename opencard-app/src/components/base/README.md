# Base Components

`components/base` 只保存可跨产品场景复用的叶子 primitive，以及唯一通用容器 `OcPanel`。

## 边界

- Base 不理解 action definition、级联菜单、卡片 section、树、Tab 或 IDE shell。
- Base 组件必须把 `class/style` 合并到根节点；表单 attrs 应落到原生控件。
- 简单局部 flex/grid 使用所属组件 CSS，不创建一次性布局控件。
- `OcPanel` 是唯一通用“布局 + 表面”容器；不得恢复 `OcStack` 或 `OcSurface`。
- `OcSwitch` 表达立即生效的二元状态；`OcCheckbox` 只表达集合选择、批量勾选或确认项。
- 依赖多个 base primitive 的组合控件归入 `components/standard`。

## 当前组件

- `OcButton`：按钮 primitive。
- `OcCheckbox`：原生 checkbox 语义与统一视觉。
- `OcEmpty`：空状态文本。
- `OcFieldFrame`：复合字段的边框、圆角、focus 与前后缀槽。
- `OcFieldInput`：原生 input/select/textarea 包装。
- `OcIcon`：语义 icon token 渲染。
- `OcPanel`：token 化布局与表面。
- `OcSwitch`：原生 switch 语义与统一视觉。
- `OcText`：语义文本与截断。

## 组合规则

- 普通输入直接使用 `OcFieldInput variant="filled"`。
- 颜色、数字步进、自动补全等复合输入使用 `OcFieldFrame`，内部输入使用 `variant="plain"`。
- 表格 Cell 等宿主通过 Field appearance context 覆盖 `--oc-field-*` / `--oc-control-*` 变量吸收输入表面；该 context 必须同时控制边框宽度、颜色、圆角、背景、padding 与 focus shadow，基础控件不得反向依赖具体表格组件。
- title/actions 属于 `standard/OcCard`，不能加入 `OcPanel`。
- 菜单、树、选项组等交互协议属于 standard。
