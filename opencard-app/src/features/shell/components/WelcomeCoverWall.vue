<!-- 业务 欢迎页封面墙：带透视的模糊瓦片网格朝右上角缓慢流动，只作背景、不参与任何交互。 -->
<template>
  <div
    ref="wallElement"
    class="welcome-cover-wall"
    :class="{ 'is-running': running }"
    aria-hidden="true"
  >
    <div class="welcome-cover-wall__view">
      <div class="welcome-cover-wall__plane" :style="planeStyle">
        <div v-for="(row, rowIndex) in rows" :key="rowIndex" class="welcome-cover-wall__row">
          <template v-for="copyIndex in copies" :key="copyIndex">
            <span
              v-for="tile in row"
              :key="`${copyIndex}-${tile.key}`"
              class="welcome-cover-wall__tile"
              :class="{
                'is-emphasized': isHighlighted(tile),
                'is-ready': artworkReady,
              }"
              :style="tile.coverDelay === undefined
                ? undefined
                : { '--welcome-cover-wall-cover-delay': String(tile.coverDelay) }"
            >
              <img
                class="welcome-cover-wall__tile-artwork"
                :src="tile.src"
                :style="tile.artworkStyle"
                alt=""
                decoding="async"
                draggable="false"
              />
              <img
                v-if="tile.coverSrc"
                class="welcome-cover-wall__tile-cover"
                :class="{ 'is-ready': isCoverReady(tile) }"
                :src="tile.coverSrc"
                alt=""
                loading="lazy"
                decoding="async"
                draggable="false"
                @load="markCoverReady(tile.coverSrc, $event)"
              />
            </span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type CSSProperties } from 'vue'
import { WELCOME_COVER_ARTWORK } from '../welcomeCoverArtwork'

export type WelcomeCoverWallCover = {
  /** 项目 Key，用于与侧栏选中项比对。 */
  readonly projectKey: string
  readonly src: string
}

type WelcomeCoverWallTile = {
  /** 同一行内唯一的瓦片键；它只由格子位置决定，因此图案不会因为封面变化而重排。 */
  readonly key: string
  /** 内置封面，始终作为瓦片的底图。 */
  readonly src: string
  /**
   * 底图的取景：同一张图在不同格子里露出的是不同的一块。
   * 每次打开应用重新取一次，所以整面墙不会次次长得一模一样。
   */
  readonly artworkStyle?: CSSProperties
  /** 占用这个格子的项目封面；就绪后淡入覆盖在底图之上。 */
  readonly coverSrc?: string
  /** 淡入的错峰序号，让封面依次浮现而不是十几格同时换掉。 */
  readonly coverDelay?: number
  readonly projectKey?: string
}

const props = withDefaults(defineProps<{
  /** 最近打开项目中有封面的项目；没有时全部使用内置桌游封面。 */
  covers?: readonly WelcomeCoverWallCover[]
  /** 侧栏“最近打开的项目”里选中的项目 Key；对应的封面会放大突出。 */
  highlightKeys?: readonly string[]
}>(), {
  covers: () => [],
  highlightKeys: () => [],
})

defineOptions({ name: 'WelcomeCoverWall' })

/**
 * 每行瓦片数与行样式的循环周期。
 * 行变体越多、每行越长，整面墙重复得越晚（横向周期 ≥ 一行宽度，纵向周期 = 行变体数行）。
 * 行数取偶数不是随便定的：封面格的行列都隔一格，行数为奇数时首尾两行在环绕处相邻
 * （第 4 行与第 0 行），两张封面就会挨在一起；偶数行让封面格在任何方向都不相邻。
 */
const TILES_PER_ROW = 10
const ROW_VARIANTS = 6
const MAX_ROW_COUNT = 20

/** 固定种子的伪随机数，保证同一批内容在任意次渲染中排布一致。 */
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let result = Math.imul(state ^ (state >>> 15), 1 | state)
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 这一次打开的种子。墙面是背景，次次同一个排布会显得像张静态壁纸；换一次打开换一次排布。
 * 一次打开期间它是常量：封面到齐、选中变化、窗口缩放都不该让墙重新排布。
 */
const launchSeed = createLaunchSeed()

function createLaunchSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0]!
  }
  return Math.floor(Math.random() * 0xffffffff)
}

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const wallElement = ref<HTMLElement | null>(null)
const wallWidth = ref(0)
const wallHeight = ref(0)
const tileAdvance = ref(0)
const rowPitch = ref(0)
const documentVisible = ref(true)
const inViewport = ref(true)
/**
 * 内置封面整批解码完成之前不显示瓦片：墙面一次性完整出现，不会一块块补上来。
 * 项目封面则要经资源协议异步读取，只有它就绪的那个格子才淡入。
 */
const artworkReady = ref(false)
const readyCoverSources = ref<ReadonlySet<string>>(new Set())
let resizeObserver: ResizeObserver | null = null
let intersectionObserver: IntersectionObserver | null = null

/**
 * 墙面图案只由内置封面决定。
 * 项目封面要经资源协议异步读取再解码，若把它们算进图案的取图池，封面一到齐整面墙就会重新排布。
 */
const artworkPool = computed<readonly WelcomeCoverWallTile[]>(() => (
  WELCOME_COVER_ARTWORK.map(artwork => ({
    key: `artwork:${artwork.key}`,
    src: artwork.src,
  }))
))

const highlightedKeys = computed(() => new Set(props.highlightKeys))

function wrapIndex(value: number, size: number): number {
  return ((value % size) + size) % size
}

/**
 * 一个周期的瓦片图案：逐格随机取图，并保证任何一格与它周围八格都不是同一张图。
 * 图案按 TILES_PER_ROW × ROW_VARIANTS 周期性铺满整面墙，因此也按环绕位置校验边界。
 */
function buildPattern(): readonly (readonly WelcomeCoverWallTile[])[] {
  const pool = artworkPool.value
  const random = createSeededRandom(launchSeed)
  const pattern: (WelcomeCoverWallTile | null)[][] = Array.from(
    { length: ROW_VARIANTS },
    () => Array.from({ length: TILES_PER_ROW }, () => null),
  )

  const sourceAt = (row: number, column: number): string | null => (
    pattern[wrapIndex(row, ROW_VARIANTS)]![wrapIndex(column, TILES_PER_ROW)]?.src ?? null
  )
  const neighbours = (row: number, column: number): (string | null)[] => {
    const sources: (string | null)[] = []
    for (const rowOffset of [-1, 0, 1]) {
      for (const columnOffset of [-1, 0, 1]) {
        if (rowOffset === 0 && columnOffset === 0) continue
        sources.push(sourceAt(row + rowOffset, column + columnOffset))
      }
    }
    return sources
  }
  const pick = (row: number, column: number): WelcomeCoverWallTile => {
    const taken = new Set(neighbours(row, column).filter((src): src is string => Boolean(src)))
    const allowed = pool.filter(entry => !taken.has(entry.src))
    const candidates = allowed.length > 0 ? allowed : pool
    const entry = candidates[Math.floor(random() * candidates.length)]!
    // 取景也随机：同一张封面在不同格子里露出不同的一块，整面墙就不会是一排重复的缩略图。
    return {
      key: `tile-${row}-${column}`,
      src: entry.src,
      artworkStyle: {
        objectPosition: `${Math.round(random() * 100)}% ${Math.round(random() * 100)}%`,
      },
    }
  }

  // 行优先填一遍：每格只避开已经放好的邻居。
  for (let row = 0; row < ROW_VARIANTS; row += 1) {
    for (let column = 0; column < TILES_PER_ROW; column += 1) {
      pattern[row]![column] = pick(row, column)
    }
  }
  // 再修补环绕处的冲突（行首/列首与上一行、上一列的相邻关系）。
  for (let pass = 0; pass < 4; pass += 1) {
    let repaired = false
    for (let row = 0; row < ROW_VARIANTS; row += 1) {
      for (let column = 0; column < TILES_PER_ROW; column += 1) {
        const current = pattern[row]![column]!
        if (!neighbours(row, column).includes(current.src)) continue
        pattern[row]![column] = pick(row, column)
        repaired = true
      }
    }
    if (!repaired) break
  }
  return pattern as readonly (readonly WelcomeCoverWallTile[])[]
}

/** 整面墙以这个图案为周期循环，横向每周 TILES_PER_ROW 格、纵向每周 ROW_VARIANTS 行。 */
const patternRows = computed(buildPattern)

/**
 * 项目封面只占用一批固定的“封面格”：行与列都隔一格，任何两个封面格都不相邻，
 * 因此把底图换成封面之后，“一格与周围八格不同图”的约定依然成立，而其余格子保持原样。
 * 具体位置用封面自身的 Key 做种子打乱，既有固定间隔又不显得是规则网格。
 */
const COVER_SLOT_STRIDE = 2
/** 封面淡入的错峰档数；实际间隔是 --oc-duration-fast 的若干分之一。 */
const COVER_FADE_STAGGER_STEPS = 8

const coverSlots = computed<ReadonlyMap<string, { cover: WelcomeCoverWallCover; fadeStep: number }>>(() => {
  const covers = props.covers
  if (covers.length === 0) return new Map()

  const lattice: string[] = []
  for (let row = 0; row < ROW_VARIANTS; row += COVER_SLOT_STRIDE) {
    for (let column = 0; column < TILES_PER_ROW; column += COVER_SLOT_STRIDE) {
      lattice.push(`tile-${row}-${column}`)
    }
  }

  // 与内置封面保持接近的混入比例：项目封面越多，占用的格子越多。
  const patternTileCount = ROW_VARIANTS * TILES_PER_ROW
  const wanted = Math.min(
    lattice.length,
    Math.max(
      covers.length,
      Math.round(patternTileCount * covers.length / (covers.length + WELCOME_COVER_ARTWORK.length)),
    ),
  )

  const random = createSeededRandom(hashText(covers.map(cover => cover.projectKey).join('|')) ^ launchSeed)
  for (let index = lattice.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    const held = lattice[index]!
    lattice[index] = lattice[swap]!
    lattice[swap] = held
  }

  // 打乱后的次序同时当作淡入的错峰序号：同一张封面在墙上的各格不会连成一片一起亮起来。
  return new Map(lattice.slice(0, wanted).map((key, index) => [key, {
    cover: covers[index % covers.length]!,
    fadeStep: index % COVER_FADE_STAGGER_STEPS,
  }]))
})

const rowCount = computed(() => {
  const pitch = rowPitch.value
  if (!pitch || wallHeight.value === 0) return ROW_VARIANTS * 2
  return Math.min(MAX_ROW_COUNT, Math.ceil(wallHeight.value / pitch) + ROW_VARIANTS)
})

const rows = computed(() => (
  Array.from({ length: rowCount.value }, (_, index) => (
    patternRows.value[index % ROW_VARIANTS]!.map(tile => {
      const slot = coverSlots.value.get(tile.key)
      if (!slot) return tile
      return {
        ...tile,
        coverSrc: slot.cover.src,
        projectKey: slot.cover.projectKey,
        coverDelay: slot.fadeStep,
      }
    })
  ))
))

const copies = computed(() => {
  const copyWidth = TILES_PER_ROW * tileAdvance.value
  if (!copyWidth || wallWidth.value === 0) return 2
  return Math.ceil(wallWidth.value / copyWidth) + 1
})

/** 平面从一个周期的左上方开始，向右上角流动一个周期后正好回到同样的图案。 */
const planeStyle = computed<CSSProperties>(() => {
  const copyWidth = TILES_PER_ROW * tileAdvance.value
  return {
    left: `-${copyWidth}px`,
    '--welcome-cover-wall-copy-width': `${copyWidth}px`,
    '--welcome-cover-wall-period-height': `${ROW_VARIANTS * rowPitch.value}px`,
  }
})

const running = computed(() => documentVisible.value && inViewport.value)

function isHighlighted(tile: WelcomeCoverWallTile): boolean {
  return Boolean(tile.projectKey) && highlightedKeys.value.has(tile.projectKey!)
}

function isCoverReady(tile: WelcomeCoverWallTile): boolean {
  return Boolean(tile.coverSrc) && readyCoverSources.value.has(tile.coverSrc!)
}

/** 预先解码整批内置封面，墙面第一次出现时就是完整的。 */
async function warmArtwork(): Promise<void> {
  await Promise.all(WELCOME_COVER_ARTWORK.map(async artwork => {
    const image = new Image()
    image.src = artwork.src
    try {
      await image.decode()
    } catch {
      // 个别内置封面解不出来也不该拖住整面墙。
    }
  }))
  artworkReady.value = true
}

/** 项目封面解码完成之后，它占用的格子才淡入显示。 */
async function markCoverReady(src: string, event: Event): Promise<void> {
  const image = event.target
  if (!(image instanceof HTMLImageElement) || readyCoverSources.value.has(src)) return
  if (typeof image.decode === 'function') {
    try {
      await image.decode()
    } catch {
      // 解码失败（损坏或不受支持的图片）交给浏览器决定怎么画，不让整块瓦片一直缺席。
    }
  }
  readyCoverSources.value = new Set([...readyCoverSources.value, src])
}

function handleVisibilityChange(): void {
  documentVisible.value = !document.hidden
}

/** 瓦片与行距都来自 foundation token，因此按已渲染尺寸测量而不是重复字面量。 */
function measure(): void {
  const wall = wallElement.value
  if (!wall) return
  wallWidth.value = wall.clientWidth
  wallHeight.value = wall.clientHeight
  const tile = wall.querySelector('.welcome-cover-wall__tile')
  const nextTile = tile?.nextElementSibling
  if (tile instanceof HTMLElement && nextTile instanceof HTMLElement) {
    const advance = nextTile.offsetLeft - tile.offsetLeft
    if (advance > 0) tileAdvance.value = advance
  }
  const row = wall.querySelector('.welcome-cover-wall__row')
  const nextRow = row?.nextElementSibling
  if (row instanceof HTMLElement && nextRow instanceof HTMLElement) {
    const pitch = nextRow.offsetTop - row.offsetTop
    if (pitch > 0) rowPitch.value = pitch
  }
}

onMounted(() => {
  handleVisibilityChange()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  void warmArtwork()
  if (typeof ResizeObserver !== 'undefined' && wallElement.value) {
    resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(wallElement.value)
  }
  if (typeof IntersectionObserver !== 'undefined' && wallElement.value) {
    intersectionObserver = new IntersectionObserver(entries => {
      inViewport.value = entries[0]?.isIntersecting ?? true
    })
    intersectionObserver.observe(wallElement.value)
  }
  measure()
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
})
</script>

<style scoped>
.welcome-cover-wall {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  perspective: var(--oc-welcome-cover-wall-perspective);
}

/* 整面墙做一点 3D 倾斜，形成向右上角收进去的透视。 */
.welcome-cover-wall__view {
  width: 100%;
  height: 100%;
  transform:
    rotateX(var(--oc-welcome-cover-wall-rotate-x))
    rotateY(var(--oc-welcome-cover-wall-rotate-y))
    scale(var(--oc-welcome-cover-wall-scale));
}

.welcome-cover-wall__plane {
  position: absolute;
  top: 0;
  display: grid;
  gap: var(--oc-welcome-cover-tile-gap);
}

.welcome-cover-wall.is-running .welcome-cover-wall__plane {
  animation: welcome-cover-wall-drift var(--oc-welcome-cover-wall-duration) linear infinite;
}

.welcome-cover-wall__row {
  display: flex;
  gap: var(--oc-welcome-cover-tile-gap);
}

.welcome-cover-wall__tile {
  position: relative;
  flex: 0 0 auto;
  width: var(--oc-welcome-cover-tile-width);
  aspect-ratio: var(--oc-welcome-cover-tile-aspect-ratio);
  overflow: hidden;
  /* 图片可以绘制之前不占画面：否则异步载入的封面会先闪出一块瓦片底色。 */
  visibility: hidden;
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-md);
  background: var(--oc-bg-surface);
  filter: blur(var(--oc-welcome-cover-wall-blur));
  opacity: var(--oc-welcome-cover-wall-opacity);
  transition:
    opacity var(--oc-duration-normal) var(--oc-ease),
    transform var(--oc-duration-normal) var(--oc-ease),
    box-shadow var(--oc-duration-normal) var(--oc-ease),
    filter var(--oc-duration-normal) var(--oc-ease);
}

.welcome-cover-wall__tile.is-ready {
  visibility: visible;
}

.welcome-cover-wall__tile img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 项目封面盖在内置封面之上：底图始终在场，封面解码完成后才淡入，因此不会出现空瓦片。 */
.welcome-cover-wall__tile-cover {
  position: absolute;
  inset: 0;
  opacity: 0;
}

/*
 * 用动画而不是过渡：图片常常在插进 DOM 的同一帧就已就绪，没有可过渡的起始画面，
 * 过渡会被整段跳过（封面就成了“瞬间换掉”）。动画在类生效的那一刻一定会跑。
 * 各格再按对角线错开一点，封面是依次浮现的。
 */
.welcome-cover-wall__tile-cover.is-ready {
  animation: welcome-cover-wall-cover-in var(--oc-duration-slow) var(--oc-ease) both;
  animation-delay: calc(var(--welcome-cover-wall-cover-delay, 0) * var(--oc-duration-fast) / 8);
}

@keyframes welcome-cover-wall-cover-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* 侧栏选中的项目封面：放大并去掉模糊，与其余瓦片形成对比。 */
.welcome-cover-wall__tile.is-emphasized {
  z-index: 1;
  filter: none;
  opacity: var(--oc-welcome-cover-tile-emphasis-opacity);
  box-shadow: var(--oc-shadow-lg);
  transform: scale(var(--oc-welcome-cover-tile-emphasis-scale));
}

@keyframes welcome-cover-wall-drift {
  from {
    transform: translate3d(0, 0, 0);
  }

  to {
    transform: translate3d(
      var(--welcome-cover-wall-copy-width),
      calc(var(--welcome-cover-wall-period-height) * -1),
      0
    );
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-cover-wall.is-running .welcome-cover-wall__plane {
    animation: none;
  }

  .welcome-cover-wall__tile {
    transition: none;
  }

  .welcome-cover-wall__tile-cover.is-ready {
    animation: none;
    opacity: 1;
  }
}
</style>
