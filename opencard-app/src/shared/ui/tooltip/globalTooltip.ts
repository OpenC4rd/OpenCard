import { h, render } from 'vue';
import OcInlineMarkup from '../../../components/standard/OcInlineMarkup.vue';

const TOOLTIP_SELECTOR = '[data-tooltip]';
const TOOLTIP_LAYER_ID = 'oc-tooltip-layer';
const TOOLTIP_GAP = 10;
const TOOLTIP_EDGE_PADDING = 8;
/** 盒子比裁剪它的祖先宽出这么多像素才算被切掉，避免边框与取整在这儿误判。 */
const TOOLTIP_CLIP_TOLERANCE = 1;
const TOOLTIP_POINTER_DELAY_MS = 350;
/**
 * How long one group stays warm after its last tooltip was shown. Inside that window the next
 * sibling tooltip appears immediately; it also keeps the warm state from outliving a pause.
 */
const TOOLTIP_WARM_WINDOW_MS = 400;
/**
 * Gap tolerance while the pointer crosses a non-tooltip area inside a warm group, so the tooltip
 * bridges the gap instead of blinking out and back in.
 */
const TOOLTIP_GROUP_GAP_MS = 80;
const TOOLTIP_INIT_FLAG = '__oc_tooltip_initialized__';

/** Attribute declaring the preferred side of the anchor; nearest declaring element wins. */
export const TOOLTIP_PLACEMENT_ATTRIBUTE = 'data-tooltip-placement';

/**
 * Attribute marking one interaction region. Controls sharing a declaring element share the warm
 * window, so moving between them (toolbar buttons, node tail actions) swaps instantly. Without a
 * declaration each control is its own group, which keeps the plain per-control delay.
 */
export const TOOLTIP_GROUP_ATTRIBUTE = 'data-tooltip-group';

/** Side of the anchor the tooltip is drawn on. */
export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

const TOOLTIP_PLACEMENTS: readonly TooltipPlacement[] = ['top', 'bottom', 'left', 'right'];

/**
 * Vertical placement is the default: horizontally adjacent controls (toolbars, list rows, node tail
 * actions, field rows) are the ones a tooltip would otherwise cover.
 */
const DEFAULT_TOOLTIP_PLACEMENT: TooltipPlacement = 'bottom';

/** Sides to try in order; the opposite side comes first, the remaining axis last. */
const TOOLTIP_PLACEMENT_FALLBACKS: Record<TooltipPlacement, readonly TooltipPlacement[]> = {
  top: ['top', 'bottom', 'right', 'left'],
  bottom: ['bottom', 'top', 'right', 'left'],
  left: ['left', 'right', 'top', 'bottom'],
  right: ['right', 'left', 'top', 'bottom'],
};

type TooltipBox = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;
type TooltipSize = Pick<DOMRect, 'width' | 'height'>;
type TooltipAnchor = { left: number; top: number };

/**
 * 一次命中调查的结果。最里面声明提示的那个元素优先，但"文字其实放得下"的那个是透明的：
 * 它不该挡住外面那层的提示；而它也确实声明过提示，所以还得告诉调用方"这段文字不需要提示"，
 * 好把已经亮着的收起来 —— 与从未声明提示的普通元素区别开。
 */
type TooltipHit = { target: HTMLElement | null; declared: boolean };

function resolveTooltipHit(target: EventTarget | null): TooltipHit {
  if (!(target instanceof Element)) {
    return { target: null, declared: false };
  }

  let candidate = target.closest<HTMLElement>(TOOLTIP_SELECTOR);
  const declared = candidate !== null;
  while (candidate) {
    if (getTooltipText(candidate)) return { target: candidate, declared };
    candidate = candidate.parentElement?.closest<HTMLElement>(TOOLTIP_SELECTOR) ?? null;
  }

  return { target: null, declared };
}

function isTooltipPlacement(value: string | null | undefined): value is TooltipPlacement {
  return typeof value === 'string' && (TOOLTIP_PLACEMENTS as readonly string[]).includes(value);
}

function getTooltipPlacement(target: HTMLElement): TooltipPlacement {
  const declared = target.closest(`[${TOOLTIP_PLACEMENT_ATTRIBUTE}]`)
    ?.getAttribute(TOOLTIP_PLACEMENT_ATTRIBUTE);
  return isTooltipPlacement(declared) ? declared : DEFAULT_TOOLTIP_PLACEMENT;
}

function resolvePlacementAnchor(
  placement: TooltipPlacement,
  target: TooltipBox,
  size: TooltipSize,
): TooltipAnchor {
  const centeredLeft = target.left + (target.right - target.left - size.width) / 2;
  const centeredTop = target.top + (target.bottom - target.top - size.height) / 2;

  if (placement === 'top') {
    return { left: centeredLeft, top: target.top - TOOLTIP_GAP - size.height };
  }
  if (placement === 'bottom') {
    return { left: centeredLeft, top: target.bottom + TOOLTIP_GAP };
  }
  if (placement === 'left') {
    return { left: target.left - TOOLTIP_GAP - size.width, top: centeredTop };
  }
  return { left: target.right + TOOLTIP_GAP, top: centeredTop };
}

function fitsOnPlacement(
  placement: TooltipPlacement,
  anchor: TooltipAnchor,
  size: TooltipSize,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  if (placement === 'top') return anchor.top >= TOOLTIP_EDGE_PADDING;
  if (placement === 'bottom') {
    return anchor.top + size.height <= viewportHeight - TOOLTIP_EDGE_PADDING;
  }
  if (placement === 'left') return anchor.left >= TOOLTIP_EDGE_PADDING;
  return anchor.left + size.width <= viewportWidth - TOOLTIP_EDGE_PADDING;
}

function clampToViewport(value: number, size: number, viewportSize: number): number {
  return Math.max(
    TOOLTIP_EDGE_PADDING,
    Math.min(value, viewportSize - size - TOOLTIP_EDGE_PADDING),
  );
}

/**
 * 文字是不是真的被切掉了。自己滚不下是最常见的一种；省略号也可以做在容器上
 * （行标题、菜单项、下拉值），这时文字自己的盒子一个像素都没超出，得看它有没有
 * 探出最近一个会裁剪的祖先 —— 拿第一个 overflow 不是 visible 的祖先当裁剪盒。
 */
function isTextClipped(target: HTMLElement): boolean {
  if (target.scrollWidth > target.clientWidth) return true;

  const box = target.getBoundingClientRect();
  let ancestor: HTMLElement | null = target.parentElement;
  while (ancestor) {
    const style = getComputedStyle(ancestor);
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      const clip = ancestor.getBoundingClientRect();
      return box.right > clip.right + TOOLTIP_CLIP_TOLERANCE
        || box.left < clip.left - TOOLTIP_CLIP_TOLERANCE;
    }
    ancestor = ancestor.parentElement;
  }

  return false;
}

function getTooltipText(target: HTMLElement): string {
  if (target.hasAttribute('data-tooltip-overflow') && !isTextClipped(target)) return '';
  return target.getAttribute('data-tooltip')?.trim() ?? '';
}

function renderTooltipContent(layer: HTMLDivElement, text: string): void {
  render(h(OcInlineMarkup, { source: text }), layer);
}

export function setupGlobalTooltip(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const globalState = window as unknown as Record<string, unknown>;
  if (globalState[TOOLTIP_INIT_FLAG]) {
    return;
  }
  globalState[TOOLTIP_INIT_FLAG] = true;

  const existingLayer = document.getElementById(TOOLTIP_LAYER_ID);
  const layer =
    existingLayer instanceof HTMLDivElement ? existingLayer : document.createElement('div');
  layer.id = TOOLTIP_LAYER_ID;
  layer.className = 'app-tooltip-layer';
  layer.setAttribute('role', 'tooltip');
  layer.setAttribute('aria-hidden', 'true');
  layer.hidden = true;
  if (!layer.isConnected) {
    document.body.appendChild(layer);
  }

  let activeTarget: HTMLElement | null = null;
  let pendingTarget: HTMLElement | null = null;
  let showTimer: number | null = null;
  let hideTimer: number | null = null;
  let warmGroupElement: HTMLElement | null = null;
  let warmUntil = 0;
  let warmPlacement: TooltipPlacement | null = null;

  const resolveGroupElement = (target: HTMLElement): HTMLElement =>
    target.closest<HTMLElement>(`[${TOOLTIP_GROUP_ATTRIBUTE}]`) ?? target;

  const isWarmTarget = (target: HTMLElement): boolean =>
    warmGroupElement !== null
    && Date.now() <= warmUntil
    && warmGroupElement === resolveGroupElement(target);

  const clearWarmth = (): void => {
    warmGroupElement = null;
    warmPlacement = null;
    warmUntil = 0;
  };

  const cancelPendingTooltip = (): void => {
    pendingTarget = null;
    if (showTimer === null) return;
    window.clearTimeout(showTimer);
    showTimer = null;
  };

  const cancelHideTimer = (): void => {
    if (hideTimer === null) return;
    window.clearTimeout(hideTimer);
    hideTimer = null;
  };

  /** Hide the layer but keep the warm episode alive: the pointer is still inside the group. */
  const hideTooltip = (): void => {
    cancelPendingTooltip();
    cancelHideTimer();
    activeTarget = null;
    layer.classList.remove('open');
    layer.classList.remove('instant');
    layer.setAttribute('aria-hidden', 'true');
  };

  /** Hide the layer and end the warm episode: the pointer left the group or the interaction ended. */
  const dismissTooltip = (): void => {
    hideTooltip();
    clearWarmth();
  };

  const placeTooltip = (): void => {
    if (!activeTarget || layer.hidden) {
      return;
    }

    const targetRect = activeTarget.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const size: TooltipSize = { width: layerRect.width, height: layerRect.height };
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const declared = TOOLTIP_PLACEMENT_FALLBACKS[getTooltipPlacement(activeTarget)];
    /**
     * One warm sweep keeps one side: reusing the side already on screen stops the tooltip from
     * jumping when it swaps between siblings. The frozen side still yields to one that fits.
     */
    const fallbacks = warmPlacement === null || !declared.includes(warmPlacement)
      ? declared
      : [warmPlacement, ...declared.filter((candidate) => candidate !== warmPlacement)];
    const placement = fallbacks.find((candidate) => fitsOnPlacement(
      candidate,
      resolvePlacementAnchor(candidate, targetRect, size),
      size,
      viewportWidth,
      viewportHeight,
    )) ?? fallbacks[fallbacks.length - 1];
    const anchor = resolvePlacementAnchor(placement, targetRect, size);

    if (warmPlacement === null) warmPlacement = placement;
    layer.dataset.placement = placement;
    layer.style.left = `${Math.round(clampToViewport(anchor.left, size.width, viewportWidth))}px`;
    layer.style.top = `${Math.round(clampToViewport(anchor.top, size.height, viewportHeight))}px`;
  };

  const showTooltip = (target: HTMLElement, instant: boolean): void => {
    cancelPendingTooltip();
    cancelHideTimer();
    const text = getTooltipText(target);
    if (!text || !target.isConnected) {
      dismissTooltip();
      return;
    }

    activeTarget = target;
    warmGroupElement = resolveGroupElement(target);
    warmUntil = Date.now() + TOOLTIP_WARM_WINDOW_MS;
    renderTooltipContent(layer, text);
    if (instant) {
      // A swap inside one warm group keeps the layer open: no fade, no blink.
      layer.classList.add('instant');
    } else {
      layer.classList.remove('open');
      layer.classList.remove('instant');
      warmPlacement = null;
    }
    layer.hidden = false;
    layer.setAttribute('aria-hidden', 'false');
    placeTooltip();
    layer.classList.add('open');
  };

  const scheduleTooltip = (target: HTMLElement): void => {
    if (target === activeTarget || target === pendingTarget) return;

    if (isWarmTarget(target)) {
      showTooltip(target, true);
      return;
    }

    dismissTooltip();
    pendingTarget = target;
    showTimer = window.setTimeout(() => {
      showTimer = null;
      pendingTarget = null;
      showTooltip(target, false);
    }, TOOLTIP_POINTER_DELAY_MS);
  };

  document.addEventListener(
    'mouseover',
    (event) => {
      const hit = resolveTooltipHit(event.target);
      if (hit.target) {
        scheduleTooltip(hit.target);
        return;
      }
      // 声明了提示但这段文字放得下：把它当作"这里没有提示"，收起已经亮着的那个。
      // 完全没声明提示的普通元素不在此列 —— 那由 mouseout 负责，免得打断同一组的连续提示。
      if (hit.declared) dismissTooltip();
    },
    true
  );

  document.addEventListener(
    'mouseout',
    (event) => {
      const trackedTarget = activeTarget ?? pendingTarget;
      if (!trackedTarget) {
        return;
      }

      const from = event.target;
      if (!(from instanceof Node) || !trackedTarget.contains(from)) {
        return;
      }

      const related = event.relatedTarget;
      if (related instanceof Node && trackedTarget.contains(related)) {
        return;
      }

      // A visible tooltip whose pointer stays inside the same group only crosses a gap between
      // siblings: bridge the hide so it does not blink, and let the sibling swap into it instantly.
      const isVisible = activeTarget !== null && !layer.hidden;
      if (isVisible && warmGroupElement !== null
        && related instanceof Node && warmGroupElement.contains(related)) {
        cancelHideTimer();
        hideTimer = window.setTimeout(() => {
          hideTimer = null;
          hideTooltip();
        }, TOOLTIP_GROUP_GAP_MS);
        return;
      }

      dismissTooltip();
    },
    true
  );

  document.addEventListener('pointerdown', dismissTooltip, true);

  document.addEventListener(
    'focusin',
    (event) => {
      const hit = resolveTooltipHit(event.target);
      if (hit.target) {
        showTooltip(hit.target, false);
        return;
      }
      if (hit.declared) dismissTooltip();
    },
    true
  );

  document.addEventListener(
    'focusout',
    () => {
      queueMicrotask(() => {
        const trackedTarget = activeTarget ?? pendingTarget;
        if (!trackedTarget) {
          return;
        }

        const focusedElement = document.activeElement;
        if (focusedElement instanceof Node && trackedTarget.contains(focusedElement)) {
          return;
        }

        dismissTooltip();
      });
    },
    true
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        dismissTooltip();
      }
    },
    true
  );

  const onViewportChanged = (): void => {
    if (activeTarget && !layer.hidden) {
      if (!activeTarget.isConnected) {
        dismissTooltip();
        return;
      }
      placeTooltip();
    }
  };

  window.addEventListener('resize', onViewportChanged);
  window.addEventListener('scroll', onViewportChanged, true);
}
