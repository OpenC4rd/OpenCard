# 项目资源环境中的自定义块

项目 `.opencard/blocks/blocks.json` 与包 manifest 的 `public.blocks` 都被合并为同一个 custom block registry。直接 `.ocblock` 路径与 `block:key` 在 catalog 中解析到同一份已解析源；相对引用沿当前项目或包作用域解析，宿主项目和明确包坐标仍可跳出当前作用域。

资源失效由统一的项目资源环境刷新入口处理：watcher 和本地文件操作只负责调度刷新，不在文件操作层为某一种资源写特判。局部 catalog 只是环境的派生快照，不能让各个调用方自行维护删除、重命名或回收站后的失效逻辑。
