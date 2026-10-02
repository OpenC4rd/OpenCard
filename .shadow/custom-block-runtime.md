# 自定义块运行时投影

`customBlockRuntime.ts` 是 custom-block 的唯一展开边界：文档只保存 source 和公开字段值，渲染前复制源容器、覆盖声明字段，再把结果交给普通容器流程。递归不做循环报错，只受设置中的深度与节点上限约束，默认值为 32 和 10,000；生成的后代 ID 只用于本次投影、选中与诊断，不能写回文档。

`.ocblock` 的 publicFields 必须经过根容器现有 property schema 过滤，身份和 children 永远不能公开。资源环境先同步建立项目与包的源目录和 registry，渲染阶段只做同步查表，避免 CustomBlockRenderer 形成第二套资源读取或布局系统。
