# 内置包

这里放随应用一起发布的 `.ocpack` 包：放进这个目录就会被打包进 `resources/packages/`，并在「新建项目」页的「预装的包」里以**内置的包**分组列出，可以和软件存储里的包一样被选为预装。

- 文件名与包内清单无关，列表里的名称/版本/Key 都来自包内 `manifest`。
- 读取方式见 `opencard-app/src/features/workspace/services/builtinResourcePackageCatalog.ts`：扫描本目录下的 `*.ocpack`，它不依赖任何索引文件。
- 本文件只用来让空目录也能进版本库与安装包，删掉它不会影响内置包的加载。
