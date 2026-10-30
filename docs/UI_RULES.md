# OpenCard UI 规则

API 要对 agent 可预测：只看 props 名字与取值就知道会画出什么。本文只写代码里看不出来的约束，取值以枚举定义处为准。

## API

- Props 即文档：名字和取值自解释，取值是封闭字面量联合（`icon` 例外，直接是 `@mdi/js` 导出名）。需要猜的名字就是设计问题。
- 签名稳定：已有 prop 名与取值不改；新增 prop 必须有默认值。
- Props 上限：base ≤ 12、standard ≤ 18，超了拆。
- Slot 用名词，从 `default`/`content`/`icon`/`title`/`subtitle`/`leading`/`append`/`append-hover`/`footer` 里选，新造先在本文登记。
- Emit 传结构化 payload（`{ key: 'delete' }`）；只有纯透传的原生交互才传 `MouseEvent`。
- 每个 prop 写 JSDoc，说清影响什么。

## Token

- 视觉效果只通过枚举表达，枚举定义处是唯一来源。同一个 token 名在不同组件语义相同（`sm` 紧凑、`lg` 宽松）。
- 组件不接受原始颜色值；dark/light 两套值在 foundation 里都有，调用方不关心。
- 新增语义 token 必须给 `OC_THEME_REGISTRY` 覆盖的每个主题显式定义。

## 组合

- 嵌套即结构，间距对齐归组件管；prop 说"要什么效果"，不说"用什么技术"（没有 `display="flex"`）。
- 调用方不得用 `:deep()` 改标准组件内部。同一控件在不同表面长得不同时，用 prop 在组件内表达，表面只选取值。
- 常见 UI 区域 ≤ 3 层基础组件；超过说明缺一个 standard 组件。

## 文件与命名

- `Oc` 前缀；`base/` 原子、`standard/` 组合、`features/` 业务；文件名与 `defineOptions.name` 一致。
- 每个组件头一行 `<!-- {层级} {职责}：{场景} -->`。
- 只有 `base/`、`standard/` 是共享组件；跨 feature 引用就上移。不新增 barrel。

## 行为

- 相同 props 在任何上下文效果一致，不按祖先上下文隐式变形。
- `disabled`：降 opacity、不响应 hover、不 emit、`cursor: default` + `pointer-events: none`。
- `v-model` 用 `update:modelValue` / `update:{propName}`。

## 实现约束

- **CSS 零硬编码**：不出现 `#hex`、px 尺寸字面量（`0`、`1px`、`100%` 除外）、裸 duration，全部走 `--oc-*`，且不写兜底值。改名成局部常量不算 token。
- 组件文件 ≤ 400 行。
- 新组件先给 Props / Emits / Slot 清单确认 API。
- 每个 base/standard 组件配 `.spec.ts`：默认渲染、每个 variant/size/tone、emit、disabled。
- **jsdom 边界**：没有图片解码、canvas/WebGL 和真实排版，以下只能在真实窗口确认，提交信息里不得写"已验证"：光栅化像素、`OcPhaseImage`/`WelcomeGravityField`/`AppearanceShaderPreview` 画面、`getBoundingClientRect` 几何、`matchMedia`（走 `prefersReducedMotion.ts`）。

## 模态与层叠

- 应用级模态一律 `OcDialog`，feature 不自建 Teleport、backdrop、`aria-modal`、焦点陷阱、z-index 或进出动画；高度用 `heightMode`/`height`/`minHeight`/`maxHeight`，不在 feature CSS 里设高度或覆盖内部内边距。自定义头部要把 slot 的 `titleId`/`descriptionId` 应用到标题与描述。
- 层叠按所有权隔离。顺序：页面内容 → 壳层浮动控件(10) → 拖动预览(20) → 浮层(100) → 文件拖放(200) → 模态(1000+) → 文字提示(2000)，值只在 foundation 定义。
- `OcFloatingLayer` 按锚点挂到所属模态的 backdrop，否则挂 body。锚定式非模态菜单仍用它，不标 `aria-modal`。

## 行契约

- 表头、分组行、数据行、内嵌字段共用同一套高度与盒模型，不逐行覆盖。
- 交互行用 `OcRow`：只给几何与状态（`.is-active`/`.is-selected`/`.is-disabled`），role/tabindex/键盘/事件由使用方透传到根元素（tree 行 `role="treeitem"`，浮层选项 `role="option"`）。
- 嵌入控件必须真正移除被吸收的边框、内边距、圆角、背景、焦点效果——只隐藏或改用透明边框仍占位，不算消除。
- 表格行、相册卡片、按钮组、折叠分组头、骨架行、leading 为输入控件的编辑型行各有独立几何，不适用行契约。

## 浮层提示

- 只用 `shared/ui/tooltip/globalTooltip.ts`，方向用 `data-tooltip-placement` 声明；未声明按 `bottom`，放不下先翻对侧、再退另一轴，始终完整可见。方向枚举与"仅图标必须有 `aria-label`"由 `scripts/lint-controls.mjs` 守卫。
- 水平排列的操作不用 `left`/`right`（会盖住同级），只有纵向堆叠或纵向手柄可用。
- 默认贴鼠标并跟随；需要跟随控件时声明 `data-tooltip-anchor="target"`；键盘聚焦始终用控件锚点。
- 只在提供额外信息时用：有常驻可见文字的控件不重复提示，可能被截断的文本用 `data-tooltip-overflow`。
- 相邻控件共用热窗口（`data-tooltip-group`，声明在容器上）：首次进入等延迟淡入，区域内换控件立即换内容不淡入，离开区域立即收起。常量与实现见 `globalTooltip.ts`。
