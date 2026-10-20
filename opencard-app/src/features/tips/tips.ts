/**
 * 小贴士注册表：所有小贴士只在这里登记 key，文案写在语言文件的 `tips` 段里。
 * 新增一条 = 这里加一个 key，两种语言各补一句。
 */
export const tipKeys = [
  'fourRingLogo',
  'welcomeCoverWall',
  'customLanguagePack',
  'replayTutorial',
] as const

export type TipKey = (typeof tipKeys)[number]

/**
 * 伪随机取一条小贴士，并避开上一条：相邻两次内容相同看起来像卡住了。
 * `random` 可注入，测试里用它固定序列。
 */
export function pickTipKey(previous: TipKey | null, random: () => number = Math.random): TipKey {
  const remaining = tipKeys.filter(key => key !== previous)
  const pool = remaining.length > 0 ? remaining : tipKeys
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))
  return pool[index]!
}
