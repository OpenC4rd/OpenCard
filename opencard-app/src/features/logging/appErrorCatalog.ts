import { publishAppOutput } from './appOutput'

export type AppErrorDefinition = {
  area: string
  meaning: Readonly<{
    'zh-CN': string
    'en-US': string
  }>
  solution: string
}

export const APP_ERROR_CATALOG = {
  'OC-E1002': {
    area: '应用',
    meaning: { 'zh-CN': '无法写入系统剪贴板', 'en-US': 'Could not write to the system clipboard' },
    solution: '确认系统允许 OpenCard 访问剪贴板，关闭占用剪贴板的安全软件后重试。',
  },
  'OC-E2001': {
    area: '工作区与文件',
    meaning: { 'zh-CN': '无法读取目录内容', 'en-US': 'Could not read the directory contents' },
    solution: '确认目录仍然存在且当前用户具有读取权限，然后刷新项目文件树。',
  },
  'OC-E2002': {
    area: '工作区与文件',
    meaning: { 'zh-CN': '无法处理外部文件打开请求', 'en-US': 'Could not process the external file-open request' },
    solution: '确认文件路径有效且文件类型受支持；重新从文件管理器或 OpenCard 的打开命令进入。',
  },
  'OC-E2003': {
    area: '工作区与文件',
    meaning: { 'zh-CN': '无法打开文件', 'en-US': 'Could not open the file' },
    solution: '检查文件是否存在、是否被其他程序独占以及当前用户是否具有读取权限。',
  },
  'OC-E2004': {
    area: '工作区与文件',
    meaning: { 'zh-CN': '无法在文件管理器中定位文件', 'en-US': 'Could not reveal the file in the file manager' },
    solution: '确认文件路径仍然有效，并检查系统文件管理器是否可以正常启动。',
  },
  'OC-E2005': {
    area: '工作区与文件',
    meaning: { 'zh-CN': '无法刷新项目目录索引', 'en-US': 'Could not refresh the project directory index' },
    solution: '检查项目目录访问权限，关闭后重新打开项目；若持续出现，请检查磁盘状态。',
  },
  'OC-E2006': {
    area: '工作区与文件',
    meaning: { 'zh-CN': '无法启动项目文件监听', 'en-US': 'Could not start watching project files' },
    solution: '重新打开项目；确认项目所在磁盘支持文件监听，且系统监听句柄未耗尽。',
  },
  'OC-E2007': {
    area: '工作区与文件',
    meaning: { 'zh-CN': '无法重命名文件或目录', 'en-US': 'Could not rename the file or directory' },
    solution: '确认目标名称合法、目标路径不存在同名项，并检查文件是否被占用或缺少写入权限。',
  },
  'OC-E2008': {
    area: '工作区与文件',
    meaning: { 'zh-CN': '无法移动文件或目录', 'en-US': 'Could not move the file or directory' },
    solution: '确认目标目录可写、没有同名项，并检查源文件是否被其他程序占用。',
  },
  'OC-E2009': {
    area: '工作区与文件',
    meaning: { 'zh-CN': '无法把外部文件复制到项目', 'en-US': 'Could not copy the external files into the project' },
    solution: '确认外部文件仍存在、目标文件夹可写且磁盘空间充足，然后重新拖入。',
  },
  'OC-E3001': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法激活项目', 'en-US': 'Could not activate the project' },
    solution: '确认项目目录完整且可访问；修复项目配置文件后重新打开项目。',
  },
  'OC-E3002': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法加载项目配置', 'en-US': 'Could not load the project profile' },
    solution: '检查项目配置文件的语法与编码；可从备份恢复有效配置后重试。',
  },
  'OC-E3003': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法加载项目字典', 'en-US': 'Could not load the project dictionary' },
    solution: '检查字典文件是否存在、内容是否为有效格式，并确认项目配置中的路径正确。',
  },
  'OC-E3004': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法将字体注册到项目', 'en-US': 'Could not register the font with the project' },
    solution: '确认字体文件有效且项目配置可写，然后重新执行“注册到项目”。',
  },
  'OC-E3005': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法加载项目字体', 'en-US': 'Could not load a project font' },
    solution: '检查字体文件路径、格式和访问权限；移除损坏的字体注册或替换字体文件。',
  },
  'OC-E3006': {
    area: '项目与资源',
    meaning: { 'zh-CN': '项目配置草稿无效', 'en-US': 'The project profile draft is invalid' },
    solution: '撤销最近的项目配置修改，检查必填字段和数据格式后再次保存。',
  },
  'OC-E3007': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法导入项目字体', 'en-US': 'Could not import the project font' },
    solution: '确认所选文件是受支持且未损坏的字体文件，并检查项目目录写入权限。',
  },
  'OC-E3008': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法打开项目字典', 'en-US': 'Could not open the project dictionary' },
    solution: '确认字典路径有效；若文件不存在，先在项目配置中重新创建或选择字典。',
  },
  'OC-E3009': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法加载项目字体注册表', 'en-US': 'Could not load the project font registry' },
    solution: '检查 fonts.json 的语法、字体 Key 与项目相对路径，然后重新打开项目。',
  },
  'OC-E3010': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法加载项目图标', 'en-US': 'Could not load the project icon registry' },
    solution: '检查 icons.json 的语法、图标 Key 与项目相对路径，然后重新打开项目。',
  },
  'OC-E3011': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法导入项目图标', 'en-US': 'Could not import the project icon' },
    solution: '确认所选图标文件受支持且未损坏，并检查项目目录写入权限。',
  },
  'OC-E3012': {
    area: '项目与资源',
    meaning: { 'zh-CN': '注册表草稿无效', 'en-US': 'The project registry draft is invalid' },
    solution: '在源码中修复注册表 JSON，确认内容有效后再次保存。',
  },
  'OC-E3013': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法导入图标包', 'en-US': 'Could not import the icon pack' },
    solution: '确认 .ociconpack 文件包含有效的 JSON 与所声明的图标文件，并检查项目目录写入权限。',
  },
  'OC-E3014': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法导出图标包', 'en-US': 'Could not export the icon pack' },
    solution: '确认项目图标文件可读取，并检查目标路径和磁盘写入权限。',
  },
  'OC-E3016': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法读取项目里的资源包', 'en-US': 'Could not read the project resource packages' },
    solution: '检查 .opencard/packages 下的 .ocpack 文件是否完整、项目目录是否可读，然后重新打开项目。',
  },
  'OC-E3017': {
    area: '项目与资源',
    meaning: { 'zh-CN': '无法解开资源包', 'en-US': 'Could not unpack the resource package' },
    solution: '确认归档完整、磁盘剩余空间足够且缓存目录可写；删掉 ~/.opencard/cache/packages 可以让程序重新解一次。',
  },
  'OC-E4001': {
    area: '编辑器与文档',
    meaning: { 'zh-CN': '无法在预览会话中打开文件', 'en-US': 'Could not open the file in a preview session' },
    solution: '确认文件仍然存在且可读取，然后重新点击文件；必要时固定或关闭旧预览会话。',
  },
  'OC-E4002': {
    area: '编辑器与文档',
    meaning: { 'zh-CN': '无法同步编辑器保存结果', 'en-US': 'Could not synchronize the editor save result' },
    solution: '保留当前编辑内容，检查目标文件写入权限后再次保存；不要在确认写入前关闭会话。',
  },
  'OC-E4003': {
    area: '编辑器与文档',
    meaning: { 'zh-CN': '无法读取卡牌文档', 'en-US': 'Could not read the card document' },
    solution: '检查 .ocdocument 文件是否为有效 JSON 和受支持的数据结构；从备份恢复损坏内容。',
  },
  'OC-E4004': {
    area: '编辑器与文档',
    meaning: { 'zh-CN': '无法保存卡牌文档', 'en-US': 'Could not save the card document' },
    solution: '检查文档内容、目标路径和磁盘写入权限，然后再次保存。',
  },
  'OC-E4005': {
    area: '编辑器与文档',
    meaning: { 'zh-CN': '无法加载文件路径补全', 'en-US': 'Could not load file-path completions' },
    solution: '刷新项目目录索引并确认相关目录可读取；仍失败时可直接输入有效相对路径。',
  },
  'OC-E5001': {
    area: '渲染与导出',
    meaning: { 'zh-CN': '没有可导出的活动文件', 'en-US': 'There is no active file to export' },
    solution: '先打开并激活一个 .ocdocument 文件，再执行导出。',
  },
  'OC-E5002': {
    area: '渲染与导出',
    meaning: { 'zh-CN': '活动文件不支持卡牌导出', 'en-US': 'The active file does not support card export' },
    solution: '切换到 .ocdocument 文件后重新执行导出。',
  },
  'OC-E5003': {
    area: '渲染与导出',
    meaning: { 'zh-CN': '活动卡牌文档内容为空', 'en-US': 'The active card document is empty' },
    solution: '先为当前 .ocdocument 文档添加有效内容并保存，再执行导出。',
  },
  'OC-E5004': {
    area: '渲染与导出',
    meaning: { 'zh-CN': '无法解析待导出的卡牌文档', 'en-US': 'Could not parse the card document for export' },
    solution: '修复文档中的语法或结构错误，确认编辑器不再报告问题后重新导出。',
  },
  'OC-E5005': {
    area: '渲染与导出',
    meaning: { 'zh-CN': '无法导出卡牌图片', 'en-US': 'Could not export the card image' },
    solution: '检查导出目录写入权限、磁盘空间和卡牌资源是否可加载，然后重试。',
  },
  'OC-E5006': {
    area: '渲染与导出',
    meaning: { 'zh-CN': '无法批量导出卡牌图片', 'en-US': 'Could not batch-export card images' },
    solution: '检查所有实例数据与资源是否有效，并确认导出目录可写且磁盘空间充足。',
  },
  'OC-E5007': {
    area: '渲染与导出',
    meaning: { 'zh-CN': '无法完成卡牌渲染', 'en-US': 'Could not complete card rendering' },
    solution: '检查图片、字体等资源能否加载，降低导出尺寸后重试；持续失败时提交错误详情。',
  },
  'OC-E6001': {
    area: '更新与安装',
    meaning: { 'zh-CN': '无法完成应用更新操作', 'en-US': 'Could not complete the application update operation' },
    solution: '确认网络与磁盘空间正常，退出可能占用 OpenCard 文件的进程后重新检查更新。',
  },
} as const satisfies Record<string, AppErrorDefinition>

export type AppErrorCode = keyof typeof APP_ERROR_CATALOG

const APP_ERROR_REPORT_TAG = Symbol.for('opencard.app-error-report')

export type AppErrorReport = Error & {
  readonly code: AppErrorCode
  readonly details?: unknown
  readonly [APP_ERROR_REPORT_TAG]: true
}

export function getAppErrorMeaning(code: AppErrorCode, locale: string): string {
  return APP_ERROR_CATALOG[code].meaning[locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US']
}

export function createAppErrorReport(code: AppErrorCode, details?: unknown): AppErrorReport {
  return Object.assign(new Error(`[${code}] ${APP_ERROR_CATALOG[code].meaning['zh-CN']}`), {
    name: 'OpenCardError',
    code,
    details,
    [APP_ERROR_REPORT_TAG]: true as const,
  })
}

export function isAppErrorReport(value: unknown): value is AppErrorReport {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AppErrorReport>
  return candidate[APP_ERROR_REPORT_TAG] === true
    && typeof candidate.code === 'string'
    && candidate.code in APP_ERROR_CATALOG
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'symbol' || typeof value === 'function') return String(value)
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`
  if (value === undefined) return 'undefined'

  try {
    const seen = new WeakSet<object>()
    const serialized = JSON.stringify(value, (_key, nestedValue: unknown) => {
      if (typeof nestedValue === 'bigint') return `${nestedValue}n`
      if (nestedValue instanceof Error) {
        return { name: nestedValue.name, message: nestedValue.message, stack: nestedValue.stack }
      }
      if (nestedValue && typeof nestedValue === 'object') {
        if (seen.has(nestedValue)) return '[Circular]'
        seen.add(nestedValue)
      }
      return nestedValue
    }, 2)
    return serialized ?? String(value)
  } catch {
    return String(value)
  }
}

/** 输出面板按行展示，明细折叠成单行。 */
function compactValue(value: unknown): string {
  return formatValue(value).replace(/\s*\n\s*/g, ' ')
}

export function reportAppError(code: AppErrorCode, details?: unknown): void {
  const report = createAppErrorReport(code, details)
  const diagnostic = report.stack || report.message
  publishAppOutput({
    severity: 'error',
    code,
    message: details === undefined ? diagnostic : `${formatValue(details)}\n${diagnostic}`,
    ...(details === undefined ? {} : { detail: compactValue(details) }),
  })
  console.error(report)
}
