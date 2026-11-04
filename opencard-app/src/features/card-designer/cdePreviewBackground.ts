import { computed, ref } from 'vue'
import type { OcCardAction } from '../../components/standard/OcCard.vue'
import { alphaChecker } from '../../components/standard/colorModel'

/** 预览卡片的背景：纯白、纯黑看卡面在两种底色上的效果，棋盘格看透明区域。 */
const BACKGROUNDS = {
  white: { icon: 'mdiSquareOutline', next: 'black', label: 'cardDesigner.view.previewBackgroundWhite', css: '#fff' },
  black: { icon: 'mdiSquare', next: 'checker', label: 'cardDesigner.view.previewBackgroundBlack', css: '#000' },
  checker: { icon: 'mdiCheckerboard', next: 'white', label: 'cardDesigner.view.previewBackgroundChecker', css: `${alphaChecker(16)} var(--oc-bg-surface)` },
} as const

export type CdePreviewBackground = keyof typeof BACKGROUNDS

/** 一个按钮循环切换：图标是当前背景，提示是点下去会换成的背景。 */
export function useCdePreviewBackground(
  initial: CdePreviewBackground | undefined,
  translate: (key: string) => string,
  onChange: () => void,
) {
  const previewBackground = ref<CdePreviewBackground>(initial ?? 'checker')
  const current = computed(() => BACKGROUNDS[previewBackground.value])
  return {
    previewBackground,
    previewBackgroundStyle: computed(() => ({ background: current.value.css })),
    previewBackgroundActions: computed<OcCardAction[]>(() => [{
      key: 'cycle-preview-background',
      icon: current.value.icon,
      title: translate(BACKGROUNDS[current.value.next].label),
    }]),
    cyclePreviewBackground(): void {
      previewBackground.value = current.value.next
      onChange()
    },
  }
}
