# OpenCard UI 铁律 — Agent 组件开发强制约束

> **核心原则：** 组件的使用者只关心"我写什么 props 得到什么效果"。
> Agent 必须保证：API 可预测、命名自解释、组合即声明、文档即代码。

---

## 第一章：API 设计铁律

### 铁律 1 — Props 即文档，看名字就知道效果

每个 prop 必须满足：**无需查看实现，仅凭名字 + 可选值就能预测视觉结果**。

```vue
<OcPanel tone="glass" border="default" radius="md" shadow="md" />
<OcButton variant="solid" size="lg" icon="action.save" />
<OcText tone="muted" size="sm" truncate />
```

命名规则：
- 视觉属性用名词：`tone`, `radius`, `shadow`, `border`
- 行为属性用形容词/动词：`disabled`, `truncate`, `collapsed`, `hoverable`
- 布局属性用物理方向：`direction`, `gap`, `padding`, `align`, `fill`, `grow`
- 可选值用自然语义词：`sm/md/lg`, `solid/soft/ghost/outline`, `base/surface/raised/glass`

**禁止** 出现需要猜测的 prop 名。如果名字不够自解释，说明 API 设计有问题。

### 铁律 2 — 可选值必须封闭枚举，禁止裸字符串

prop 的类型必须是字面量联合，而不是 `string`：

```ts
// 正确 — 用户在 IDE 里能看到所有可能值
variant?: 'solid' | 'soft' | 'ghost' | 'outline'
tone?: 'base' | 'surface' | 'raised' | 'glass' | 'accent' | 'transparent'

// 错误 — 用户不知道能写什么
variant?: string
tone?: string
```

唯一例外：`icon` prop 接受 `IconToken` 类型（本身也是有限注册集）。

`IconToken` 是稳定的语义名称，glyph 是图标注册模块的内置实现细节；`IconTone` 独立描述颜色语义。相同 glyph 不表示语义 token 必须合并。

### 铁律 3 — 组件签名稳定，新增 prop 只追加不修改

- 已有 prop 的名字和可选值 **永不改名**。
- 新增 prop 必须有默认值，不影响已有使用方式。
- 如需废弃 prop，保留一个 major 版本的兼容期。

### 铁律 4 — 每个组件 Props 上限

| 层级 | Props 上限 | 当前组件 |
|------|-----------|---------|
| base 原子组件 | ≤ 12 | `OcPanel` 12、`OcButton` 12、`OcText` 7、`OcIcon` 6 |
| standard 组合组件 | ≤ 18 | `OcTree` 15、`OcCard` 7、`OcRow` 2、`OcBar` |

超过上限必须拆分。

### 铁律 5 — Slot 即组合点，命名即用途

slot 命名必须是名词，表示"这个位置放什么"：

```vue
<OcCard title="面板" icon="action.settings" :actions="actions" @action="onAction">
  <OcFieldInput v-model="width" />
</OcCard>

<OcBar title="文件名">
  <template #icon>自定义图标</template>
  <template #append>右侧固定内容</template>
  <template #append-hover>悬停时才显示的操作</template>
</OcBar>
```

标准 slot 名词表（agent 必须从中选取）：
- `default` — 主内容
- `content` — 受控内容区（与 header 分离时用）
- `icon` — 图标位
- `title` — 标题位
- `subtitle` — 副文本位（标题下方的一行说明）
- `append` — 尾部追加
- `append-hover` — 悬停时尾部追加
- `leading` — 头部前置
- `footer` — 底部

**禁止** 生造 slot 名。如果标准名词表不够用，先在本文档中登记新名词。

### 铁律 6 — Emit 事件只传结构化 payload

```ts
// 正确 — 用户 @action="handler" 拿到的是有类型的结构体
emit('action', { key: 'delete' })
emit('update:checked', true)
emit('selection-change', selectionEvent)
```

规则的边界：交互结果用结构化 payload；只有纯透传的原生交互事件（如 `OcButton` 的 `click`）才可以传 `MouseEvent`。

---

## 第二章：Token 体系铁律

### 铁律 7 — 视觉效果只通过 Token 枚举表达

用户在 template 中写的 prop 值，全部来自组件声明的封闭枚举。Agent 内部负责将 token 映射到具体 CSS 值。

**枚举的定义位置就是唯一来源，本文档不再复制取值列表**（复制会过期；铁律 2 保证 IDE 能列出全部取值）：

| 维度 | 归属 prop | 定义位置 |
|------|-----------|----------|
| `tone`（背景） | `OcPanel.tone` | `components/base/OcPanel.vue` → `OC_PANEL_TONES` |
| `border` | `OcPanel.border` | `OC_PANEL_BORDERS` |
| `radius` | `OcPanel.radius`、`OcButton.radius`、`OcCard.radius` | `OC_PANEL_RADII` |
| `shadow` | `OcPanel.shadow` | `OC_PANEL_SHADOWS` |
| `gap` / `padding` / `align` / `direction` / `overflow` | `OcPanel` | `OC_PANEL_GAPS` 等同名常量 |
| `variant`（按钮） | `OcButton.variant` | `ButtonVariant` |
| `size`（控件） | `OcButton.size`、`OcFieldInput.size`、`OcIcon.size` | `ButtonSize`、`OcIconSize` |
| `tone`（文本） | `OcText.tone` | `OcTextTone` |
| `icon` / `icon-tone` | `OcIcon.name` / `OcIcon.tone` | `shared/ui/icon/iconRegistry.ts` → `IconToken`、`IconTone` |
| 主题色值 | — | `shared/ui/foundation/themes.ts` → `OC_THEME_REGISTRY`、`OC_SHARED_THEME_TOKENS` |

Agent 新增 token 时，必须在该组件的枚举常量中定义，并同步更新上表的「定义位置」列；**不得在本文档里另抄一份取值清单**。

### 铁律 8 — Token 值必须跨组件一致

同一个 token 名在不同组件中必须表达相同语义：
- `sm` 永远表示"紧凑"，`lg` 永远表示"宽松"
- `accent` 在 border = 主题色边框，在 tone = 主题色填充
- `variant` 在 `OcButton` 与 `OcActionButton` 中取值相同（`solid/soft/ghost/outline`）

**禁止** 同一 token 名在不同组件中含义不同。

---

## 第三章：组合模式铁律

### 铁律 9 — 嵌套即结构，组件自己决定自己的边界

用户通过嵌套表达层级，不需要手动管理间距和对齐：

```vue
<!-- 声明式组合：用户只关心"是什么"，不关心"怎么排" -->
<OcPanel direction="vertical" gap="2" padding="3" tone="surface" border="default">
  <OcBar title="Block Properties" icon="editor.properties" />
  <label>
    <span>Width</span>
    <OcFieldFrame>
      <OcFieldInput v-model="width" variant="plain" full-width mono />
    </OcFieldFrame>
  </label>
  <label>
    <span>Height</span>
    <OcFieldFrame>
      <OcFieldInput v-model="height" variant="plain" full-width mono />
    </OcFieldFrame>
  </label>
</OcPanel>
```

Agent 实现新组件时，内部布局对用户不可见。用户只需知道"这个组件里放什么"。

### 铁律 10 — 不暴露实现选择

```vue
<!-- 正确 — 用户不需要知道内部是 flex 还是 grid -->
<OcPanel direction="horizontal" gap="2">

<!-- 错误 — 暴露了 CSS 实现细节 -->
<OcPanel display="flex" flex-direction="row" css-gap="8px">
```

Prop 名表达"我想要什么效果"，不表达"用什么技术实现"。

调用方**不得**用 `:deep()` 覆写标准组件的内部样式。同一个控件在不同表面长得不一样时，差异一律在组件里用 prop 表达（`OcAlbum` 的 `strip`、`OcTree` 的 `virtualized` 就是这个形状）：组件内部只有一份实现，表面只选它的取值。调用方自己的内容可以带自己的内联样式（例如封面视觉的字号），但不得改容器的内部选择器。

### 铁律 11 — 组件组合深度 ≤ 3 层即可表达任何 UI 区域

如果用户需要嵌套超过 3 层基础组件才能实现一个常见 UI 模式，说明缺少一个 standard 层组件。Agent 应主动提议封装。

```
推荐深度：
Layer 1: 区域容器 (OcPanel / OcCard)
Layer 2: 内容结构 (OcBar / OcTree / OcActionRail)
Layer 3: 原子控件 (OcButton / OcFieldInput / OcText / OcIcon)
```

---

## 第四章：文件与命名铁律

### 铁律 12 — 组件命名规则

```
前缀:     Oc
层级:     base/ → 原子    standard/ → 组合    features/ → 业务
文件名:   PascalCase，与 defineOptions.name 一致
```

示例：`OcButton.vue` → `defineOptions({ name: 'OcButton' })`

### 铁律 13 — 每个组件必须有头部注释，一句话说明用途

```vue
<!-- Base 按钮组件：提供多变体、多尺寸的可点击操作触点。 -->
```

格式：`<!-- {层级} {职责}：{一句话使用场景} -->`

用户看到这句话就知道该组件解决什么问题。

### 铁律 14 — 公开组件与内部辅助组件分离

- 组件文件本身就是它的公开单位：调用方按路径直接 import，组件声明的 props / emits / slots 就是它的公开 API。
- 只有 `base/`、`standard/` 下的组件是全体调用方可以使用的共享组件。
- Agent 的内部辅助组件必须与被服务组件同目录、同前缀（如 `OcPanel` 的辅助件），**不得**被别的 feature 直接引用；发现跨 feature 引用内部件时应上移为共享组件或改为 props/slot 表达。
- 不得新增集中式 barrel（`index.ts`）来重新导出组件；共享组件的公开面由组件自身定义。

---

## 第五章：行为一致性铁律

### 铁律 15 — 相同 props 在任何上下文中效果相同

`<OcButton variant="solid" size="sm" />` 无论放在 OcCard header 里还是独立使用，视觉效果必须完全一致。

**禁止** 组件根据祖先上下文改变自身外观（除非通过显式的 CSS 变量覆盖机制）。

### 铁律 16 — disabled 的行为统一

所有支持 `disabled` 的组件：
- 视觉：opacity 降低 + 不响应 hover 样式
- 行为：不触发任何 emit
- 指针：cursor: default + pointer-events: none

### 铁律 17 — v-model 双向绑定遵循 Vue 约定

```vue
<OcFieldInput v-model="value" />
<OcCheckbox v-model:checked="isChecked" />
```

Agent 实现时必须使用 `update:modelValue` 或 `update:{propName}` 事件。

---

## 第六章：主题与外观铁律

### 铁律 18 — dark/light 自动适配，用户无需关心

用户写 `<OcPanel tone="surface">` 就会得到正确的深色/浅色外观。Agent 负责在 theme token 中为每个语义 token 提供两套值。

### 铁律 19 — 新增视觉变体时必须同时提供两套主题值

Agent 在 `shared/ui/foundation/themes.ts` 中新增语义 token 时，`OC_THEME_REGISTRY` 覆盖的每个 `OcThemeId`（当前 `dark` / `light`）都必须显式定义该 token，缺一不可。跨主题共用的值放在 `OC_SHARED_THEME_TOKENS`。

### 铁律 20 — 组件不接受原始颜色值

```vue
<!-- 正确 — 通过语义 token -->
<OcPanel tone="accent" />
<OcText tone="muted" />

<!-- 错误 — 传入具体颜色 -->
<OcPanel background="#1e1e1e" />
<div style="color: rgba(255,255,255,0.5)">
```

---

## 第七章：Agent 实现约束（用户无需关心但 agent 必须遵守）

### 铁律 21 — CSS 零硬编码

组件 `<style>` 中禁止出现：
- `#hex` 颜色字面量
- `px` 尺寸字面量（`0`, `1px` border, `100%` 除外）
- 裸数字 duration（如 `0.12s`）

全部引用 `--oc-*` CSS 变量，且不使用 `var(--oc-x, #hex)` 形式的颜色兜底。

把字面量改名成局部常量或 CSS 自定义属性**不算**设计 token。缺少所需语义值时，先把它加到 foundation/theme 体系、对所有适用主题显式定义，再由使用方引用该 token。

### 铁律 22 — Props interface 必须完整 JSDoc

每个 prop 注释格式：`/** 做什么。影响什么。 */`
- 错误: `/** 按钮变体 */`
- 正确: `/** 按钮视觉变体。决定背景色、边框色与 hover 效果。 */`

### 铁律 23 — 组件文件不超过 400 行

超过时拆分 composable 或子组件。用户不需要知道拆分细节。

### 铁律 24 — 新组件必须先定义接口

创建新组件的 Agent 工作流：
1. 先写 Props interface + Emits interface + Slot 清单
2. 输出给用户确认 API 设计
3. 确认后再实现

### 铁律 25 — 测试覆盖

每个 base/standard 组件对应一个 `.spec.ts`，最低覆盖：
- 默认渲染无报错
- 每个 variant/size/tone 正确产生对应 class
- emit 正确触发
- disabled 阻止交互

**jsdom 层的边界**：测试跑在 jsdom 上，它没有图片解码、canvas 与 WebGL 实现，也不做真实排版。以下行为在这一层**无法**被验证，只能在真实窗口里人工确认，提交信息和进度报告都不得把它们写成"已验证"：

- **光栅化输出本身**：`utils/exportCard.ts` 经 `dom-to-image-more` 生成 PNG/JPEG，测试必须 mock 该库，因此只覆盖选项映射与错误处理，不覆盖像素。
- **canvas / WebGL 画面**：`OcPhaseImage`、`WelcomeGravityField`、`AppearanceShaderPreview` 的实际渲染结果。
- **依赖真实排版的几何**：jsdom 不做布局，`getBoundingClientRect` 一律为 0，基于它测量出来的位置与尺寸都需要真实窗口复核。
- **`window.matchMedia`**：jsdom 不提供，读取前一律走 `shared/ui/foundation/prefersReducedMotion.ts`，不得直接读全局。

### 铁律 26 — 模态对话框一律使用 `OcDialog`

- 应用级模态对话框必须使用 `components/standard/OcDialog.vue`；feature 组件不得自行实现 Teleport、backdrop、`aria-modal`、焦点陷阱、容器几何、z-index 或进出动画。
- `OcDialog` 负责模态语义、初始焦点、Tab 收束、焦点恢复、关闭来源、表面几何与动效；调用方只负责业务状态、内容布局、校验与命令处理。
- 除非确实需要额外头部控件，使用默认的标题与描述头部；自定义头部必须把 slot 提供的 `titleId` 与 `descriptionId` 应用到可见标题与描述上。
- 锚定式非模态菜单与选择器仍用 `OcFloatingLayer`，不得迁移到 `OcDialog`，也不得标记 `aria-modal`。
- 对话框高度必须使用 `OcDialog` 的 `heightMode`、`height`、`minHeight`、`maxHeight` 语义预设：内容驱动保持 `content`，工作台与变量列表选择固定预设；feature CSS 不得设置对话框高度，也不得覆盖 header/body/footer 内边距。
- 新增的共享对话框尺寸与颜色必须加入 foundation theme token；feature 对话框只能选择共享尺寸与 padded/scrollable 模式。

### 铁律 27 — 共享几何只有一个来源，嵌入控件必须真正消除几何

- 相关 UI（表头、分组行、数据行、内嵌字段）必须消费同一套高度与盒模型契约，不得逐行或逐字段覆盖。
- 嵌入控件必须真正移除被吸收的表面几何，而不只是隐藏它：边框、内边距、圆角、背景与焦点效果都要由共享外观上下文控制；占据布局空间的透明边框不算消除。

#### 行契约：交互行与表单行

行分两族，每族只有一个几何来源，消费方不得再写行盒 CSS：

| 族 | 形态 | 来源 | 状态 |
|---|---|---|---|
| 交互行 | `leading + 标题(+副文本) + 尾部` | `components/standard/OcRow.vue` | `.is-active` 当前高亮、`.is-selected` 已选中、`.is-disabled` 不可用；悬浮与 `:focus-visible` 由行自己处理 |
| 表单行 | `标签列 + 控件列` | 属性编辑器的两套行组件（合并进行中） | 不设选中态；只有可定位的表单行才有悬浮高亮 |

- `OcRow` 只提供行盒几何与状态外观，**不携带 role、tabindex、键盘与事件**：这些由使用方透传到根元素（tree 行传 `role="treeitem"`，浮层选项传 `role="option"`）。需要原生按钮语义时传 `as="button"`。
- 行高、横向内边距、列间距、圆角、尾部动作间距、三态颜色与禁用不透明度只由 `OcRow` 定义。
- 以下结构各有独立的几何来源，**不适用行契约**，不要再往 `OcRow` 上靠：表格行（状态落在单元格）、相册卡片、按钮组、折叠分组头、装饰骨架行、leading 为输入控件的编辑型行。

### 铁律 28 — 浮层提示既不遮挡同级操作，也不重复已有信息

全局 tooltip 只由 `shared/ui/tooltip/globalTooltip.ts` 提供，方向由 `data-tooltip-placement` 声明：

| 方向 token | 含义 | 适用位置 |
|------------|------|----------|
| `top` | 锚点上方居中 | 纵向列表的行内操作（`OcTree` 节点尾部 action） |
| `bottom` | 锚点下方居中（**默认**） | 工具栏、标题栏、字段行、表头、卡片头等水平排列的控件 |
| `left` / `right` | 锚点左右侧垂直居中 | 只有纵向堆叠或纵向手柄才可用（侧边栏图标栏、纵向 resize handle） |

- 未声明方向时按 `bottom` 处理；首选方向放不下时先翻到对侧，再退到另一轴，最后夹在视口内，任何情况下都必须完整可见。
- 同一行内水平排列的操作（工具栏、列表行尾部 action、字段行、标题栏按钮）**禁止**使用 `left` / `right`：提示会盖住紧邻的同级操作。
- 声明在容器上时对容器内所有提示生效（就近声明优先），因此同一区域只需声明一次。
- 提示只在提供额外信息时存在：控件有常驻可见文字时不得用 tooltip 重复该文字；文字只在收起态或图标态出现时，tooltip 必须跟随该状态条件渲染。
- 能完整显示的文本不得挂 tooltip；只有可能被截断的文本才使用 `data-tooltip-overflow`（`OcText` 的 `tooltip-on-overflow`、`OcOverflowText` 已封装该行为）。
- 仅图标控件必须提供 `aria-label`；tooltip 只在能补充解释时添加（步进箭头、加减号这类含义自明的控件不必重复提示），添加时与 `aria-label` 使用同一文案。
- 带子菜单的 action 不挂 tooltip：它悬停即展开菜单，提示只会盖住自己的菜单。
- `scripts/lint-controls.mjs` 守卫方向枚举取值与“仅图标控件必须声明 `aria-label`”两条规则。

**同级连续查看（tooltip group）**：`data-tooltip-group` 标出一个交互区域，区域内相邻控件的提示共用同一个“热窗口”：

| 行为 | 规则 | 常量 |
|------|------|------|
| 首次进入区域 | 等待完整延迟后显示并淡入 | `TOOLTIP_POINTER_DELAY_MS = 350` |
| 同一区域内换到同级控件 | 立即换内容、不做淡入，并续上热窗口 | `TOOLTIP_WARM_WINDOW_MS = 400` |
| 在同一区域内跨过没有提示的间隙 | 提示先保留，离开区域才立即收起 | `TOOLTIP_GROUP_GAP_MS = 80` |
| 离开区域 / 点击 / Esc / 失焦 | 立即收起并结束热窗口，下次重新等待 | — |

- 声明在容器元素上（`OcActionRail`、`OcTree`/`OcAlbum` 的 tail、侧边栏图标栏、标题栏左侧操作组）；不声明时每个控件自成一区，行为与逐控件延迟一致。
- 一次热窗口内**冻结首个解析出的方向**（放不下时才让位给能放下的方向），否则同级切换时提示会左右跳动。
- 热窗口按“最近一次显示”计时，不是按驻留时长；停留超过热窗口后再悬停同级控件需要重新等待。

---

## 第八章：使用速查（用户随时翻阅）

### 布局容器

```vue
<!-- 垂直堆叠 -->
<OcPanel direction="vertical" gap="2" padding="3">
  ...
</OcPanel>

<!-- 水平排列，占满宽度 -->
<OcPanel direction="horizontal" gap="2" fill>
  ...
</OcPanel>

<!-- 毛玻璃浮层 -->
<OcPanel tone="glass" border="default" radius="md" shadow="md">
  ...
</OcPanel>
```

### 按钮

```vue
<OcButton variant="solid" size="md">保存</OcButton>
<OcButton variant="ghost" icon="action.close" icon-only />
<OcButton variant="outline" icon="action.add" icon-side="left">新增</OcButton>
<OcButton variant="soft" :active="isSelected">选项 A</OcButton>
```

### 文本

```vue
<OcText tone="default">正文</OcText>
<OcText tone="muted" size="sm" truncate>次要说明可能很长...</OcText>
```

### 卡片

内容走默认 slot；头部操作通过 `actions` + `@action`，payload 是 `{ key }`。

```vue
<OcCard title="属性" icon="editor.properties" variant="surface"
        :actions="[{ key: 'reset', icon: 'action.refresh', title: '重置' }]"
        @action="handleAction">
  <OcFieldInput v-model="width" full-width mono />
</OcCard>
```

### 树

`OcTree` 不接收标题，也不接收 `enable-*` 开关：重命名、拖放、操作按钮全部由上层的 Action definition 与事件编排（见 `docs/工程规则.md` 的 `OcTree` 契约）。

```vue
<OcTree :data="treeNodes" :selected-keys="[selectedId]" selection-mode="single"
        external-drop
        @selection-change="onSelectionChange" @action="onAction"
        @rename-commit="onRenameCommit" @move="onMove" />
```

### 输入

```vue
<OcFieldInput v-model="value" full-width />
<OcFieldInput v-model="text" as="textarea" resize="vertical" mono />
<OcFieldInput v-model="name" variant="plain" size="sm" />
```

### 复选

```vue
<OcCheckbox v-model:checked="enabled" label="启用自动保存" />
```

---

## 第九章：禁止清单

| 编号 | 禁止 | 原因 |
|------|------|------|
| X1 | 在 template 中写内联 style 的颜色/尺寸 | 绕过 token 体系 |
| X2 | 组件 prop 接受 `string` 类型而非枚举 | 用户无法预测可选值 |
| X3 | 同一个 token 名在不同组件中含义不同 | 破坏心智模型 |
| X4 | 组件根据祖先上下文隐式变形 | 不可预测 |
| X5 | Slot 使用动词命名 | 违反声明式原则 |
| X6 | 暴露 CSS 实现细节为 prop | 耦合实现 |
| X7 | 删除/重命名已有 prop 而不全局迁移 | Breaking change |
| X8 | 新增 prop 没有默认值 | 影响已有使用 |
| X9 | 组件文件超过 400 行 | 不可维护 |
| X10 | 缺少头部注释说明 | 用户无法快速理解用途 |
| X11 | 自建模态 Teleport / backdrop / 焦点陷阱 | 绕过 OcDialog 的统一模态契约 |
| X12 | 把字面量改名成常量或 CSS 变量就当作 token | 并未建立语义来源 |
| X13 | 用透明边框或隐藏来"消除"嵌入几何 | 仍占据布局空间 |
| X14 | 在本文档里复制组件枚举的取值清单 | 会与代码脱钩，枚举的唯一来源是组件自身 |

---

## 第十章：Agent 提交前检查

Agent 完成 UI 组件代码后，必须自检：

- [ ] Props 名字自解释？不查实现能猜到效果？
- [ ] 可选值是封闭枚举？IDE 有自动补全？
- [ ] 新 prop 有默认值？不影响已有使用方式？
- [ ] Slot 名是名词？在标准名词表内？
- [ ] 头部注释 `<!-- {层级} {职责}：{一句话} -->` 存在？
- [ ] 相同 props 任何上下文效果一致？
- [ ] dark/light 两套 token 值已提供？
- [ ] 文件行数 ≤ 400？
- [ ] 模态对话框走 `OcDialog`，没有自建 Teleport / backdrop / 焦点陷阱？
- [ ] 对话框高度用语义预设，没有在 feature CSS 里覆盖高度或 header/body/footer 内边距？
- [ ] 相关 UI 共用同一套高度与盒模型契约，嵌入控件真正移除了被吸收的几何？
- [ ] tooltip 方向没有遮挡同级操作（水平排列的操作没有用 `left` / `right`）？
- [ ] tooltip 都提供了新信息（没有重复常驻可见文字，没有给不会截断的文本加提示）？
- [ ] 仅图标控件具备 `aria-label`（含义自明的控件不必再加 tooltip）？
- [ ] 同级连续操作的区域声明了 `data-tooltip-group`，且热窗口内方向保持一致？
- [ ] 对应 .spec.ts 已更新？
- [ ] 如涉及新 token，组件枚举与本文档的「定义位置」列已更新？
