export type CardDimensionPreset = {
  id: string
  name: string
  width: number
  height: number
  category: 'standard' | 'mini' | 'large' | 'sheet'
}

export const CARD_DIMENSION_PRESETS: readonly CardDimensionPreset[] = [
  { id: 'standard-poker', name: '标准扑克 (TCG)', width: 63, height: 88, category: 'standard' },
  { id: 'bridge', name: '美式桥牌', width: 57, height: 89, category: 'standard' },
  { id: 'mini-european', name: '欧式小卡', width: 44, height: 68, category: 'mini' },
  { id: 'mini-american', name: '美式小卡', width: 41, height: 63, category: 'mini' },
  { id: 'tarot', name: '塔罗牌', width: 70, height: 120, category: 'large' },
  { id: 'square', name: '正方形卡', width: 70, height: 70, category: 'large' },
  { id: 'sheet-a4', name: 'A4 纸张', width: 210, height: 297, category: 'sheet' },
]

export function findMatchingPreset(width: number, height: number): CardDimensionPreset | null {
  return CARD_DIMENSION_PRESETS.find(
    (p) => Math.abs(p.width - width) < 0.1 && Math.abs(p.height - height) < 0.1,
  ) ?? null
}
