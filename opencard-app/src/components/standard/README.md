# Standard Components

`components/standard` 保存由 base primitive 组合出的通用交互协议。

- `OcActionButton`：定义式 action 渲染与意图输出。
- `OcBar`、`OcCard`：结构化 section；`OcCard` 直接绘制表面，不嵌套 Surface/Stack。
- `OcColorField`：复用 `OcColorPicker` 的完整颜色字段变体，统一色值输入、取色弹层与提交语义，并按领域需要选择是否开放 Alpha。
- `OcOptionGroup`：互斥选择、radiogroup 语义与 roving tabindex。
- `OcTree`：key-only tree view model 与统一 intent；可选择接收外部文件拖放并上报落点。
- `OcNodeTail`：节点视图共用的尾部行（文本、状态徽标、命令）；命令只在交互时显示。
- `OcJsonEditor`：结构化 JSON 编辑协议。
- `OcPhaseImage`：将透明灰度相位图映射为可配置的循环色彩动画，支持 `contain / cover / fill` 纹理适配，首帧就绪后自行淡入。

Standard 组件不读取领域 model，也不直接执行领域写回。
