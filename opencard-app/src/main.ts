import { createApp, watch } from "vue";
import App from "./App.vue";
import { i18n, applyAppLocalePreference, reloadUserLocales } from "./i18n";
import { setupGlobalTooltip } from "./shared/ui/tooltip/globalTooltip";
import {
  setOcGlassIntensity,
  setOcMicaBackdrop,
  setOcPhaseImageSpeedMultiplier,
  setOcTheme,
} from "./shared/ui/foundation";
import { useAppSettingsStore } from "./features/settings/store/appSettingsStore";
import { addTitleBarNotice, notifyWarning } from "./features/notifications/titlebarNotices";
import {
  applyMicaBackdrop,
  clearMicaBackdrop,
  isMicaBackdropAvailable,
} from "./features/shell/services/windowBackdropMaterial";
import { warmCodeEditorOnIdle } from "./features/editor-runtime/services/warmCodeEditor";
import { runStorageMaintenance } from "./features/shell/services/storageMaintenance";
import { CACHE_GIB_BYTES } from "./shared/storage/appCache";
import "./features/shell/shell.css";
import "./styles.css";

const startupStartedAt = performance.getEntriesByName("opencard:startup:html")[0]?.startTime
  ?? performance.now();
let startupPreviousAt = startupStartedAt;

function recordStartupTiming(label: string): void {
  const now = performance.now();
  const segmentMs = now - startupPreviousAt;
  const totalMs = now - startupStartedAt;
  console.info(
    `[OpenCard/Startup] ${label}: +${segmentMs.toFixed(1)}ms (${totalMs.toFixed(1)}ms total)`,
  );
  startupPreviousAt = now;
}

recordStartupTiming("main module ready");

/*
 * 开发期探针：只报告"主线程被占住多久"，不涉及任何 await 等待。
 * 目录遍历那条计时量的是墙上时间，主线程被占用时会把等待算成慢 IO，这里用来区分两者。
 */
if (import.meta.env.DEV && typeof PerformanceObserver !== "undefined") {
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < 120) continue;
        console.warn(`[OpenCard/LongTask] ${Math.round(entry.duration)}ms at ${Math.round(entry.startTime)}ms`);
      }
    }).observe({ entryTypes: ["longtask"] });
  } catch {
    // 不支持 longtask 的环境（例如部分 webview 版本）忽略即可。
  }
}

function dismissStartupCover(): void {
  const cover = document.getElementById("oc-startup-cover");
  if (!cover) return;

  cover.classList.add("is-leaving");
  cover.getBoundingClientRect();
  const animations = cover.getAnimations();
  if (animations.length === 0) {
    cover.remove();
    return;
  }
  void Promise.allSettled(animations.map(animation => animation.finished))
    .then(() => cover.remove());
}

async function bootstrap(): Promise<void> {
  const settingsStore = useAppSettingsStore();
  recordStartupTiming("settings load started");
  await settingsStore.initialize();
  recordStartupTiming("settings ready");
  // 用户语言文件要在首帧之前读完，否则界面会先用内置语言画一遍再切过去。
  await reloadUserLocales(settingsStore.settings.value.appearance.locale);
  recordStartupTiming("locales ready");
  const micaBackdropAvailable = await isMicaBackdropAvailable();
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let lastAppliedTheme: "dark" | "light" | null = null;

  const resolveTheme = () => {
    const appearance = settingsStore.settings.value.appearance;
    return appearance.theme === "system"
      ? (systemTheme.matches ? "dark" : "light")
      : appearance.theme;
  };

  const applyThemeAppearance = () => {
    const appearance = settingsStore.settings.value.appearance;
    const theme = resolveTheme();
    setOcTheme(theme, appearance.themeOverrides[theme], appearance.accentNeighborAngles[theme], {
      fontFamily: appearance.fontFamilies[theme],
      baseFontSize: appearance.baseFontSize,
    });
    setOcGlassIntensity(appearance.glassIntensity);
    if (lastAppliedTheme !== null && lastAppliedTheme !== theme) {
      const themeName = i18n.global.t(`settings.values.${theme}`);
      addTitleBarNotice({
        message: i18n.global.t("app.notifications.themeChanged", { theme: themeName }),
        icon: "data.symbol-color",
      });
    }
    lastAppliedTheme = theme;
  };

  // 云母只由系统绘制，应用失败或平台不支持时窗口底必须保持不透明。
  let backdropGeneration = 0;
  let micaUnsupportedNotified = false;

  const applyBackdropMaterial = async (): Promise<void> => {
    const generation = ++backdropGeneration;
    const enabled = settingsStore.settings.value.appearance.micaBackground;

    if (!enabled || !micaBackdropAvailable) {
      await clearMicaBackdrop();
      if (generation !== backdropGeneration) return;
      setOcMicaBackdrop(false);
      if (enabled && !micaUnsupportedNotified) {
        micaUnsupportedNotified = true;
        notifyWarning(i18n.global.t("app.notifications.micaUnsupported"));
      }
      return;
    }

    const applied = await applyMicaBackdrop(resolveTheme());
    if (generation !== backdropGeneration) return;
    setOcMicaBackdrop(applied);
  };

  // Windows 在窗口重新显示时（切换虚拟桌面、最小化恢复）会重算窗口材质，
  // 明暗变体会退回系统设置；窗口重新可见或获得焦点时重新声明一次。
  const reassertBackdropMaterial = (): void => {
    if (document.visibilityState !== "visible") return;
    if (!settingsStore.settings.value.appearance.micaBackground) return;
    void applyBackdropMaterial();
  };
  document.addEventListener("visibilitychange", reassertBackdropMaterial);
  window.addEventListener("focus", reassertBackdropMaterial);

  watch(
    () => [
      settingsStore.settings.value.appearance.micaBackground,
      resolveTheme(),
    ] as const,
    () => {
      void applyBackdropMaterial();
    },
    { immediate: true },
  );

  watch(
    () => {
      const appearance = settingsStore.settings.value.appearance;
      const theme = resolveTheme();
      const overrides = appearance.themeOverrides[theme];
      return [
        theme,
        overrides["--oc-accent"] ?? null,
        overrides["--oc-bg-base"] ?? null,
        overrides["--oc-fg-default"] ?? null,
        appearance.accentNeighborAngles[theme],
        appearance.fontFamilies[theme],
        appearance.baseFontSize,
      ] as const;
    },
    applyThemeAppearance,
    { immediate: true },
  );
  watch(
    () => settingsStore.settings.value.appearance.glassIntensity,
    setOcGlassIntensity,
    { immediate: true },
  );
  watch(
    () => settingsStore.settings.value.appearance.phaseImageSpeed,
    (speed) => setOcPhaseImageSpeedMultiplier(speed / 100),
    { immediate: true },
  );
  systemTheme.addEventListener("change", () => {
    if (settingsStore.settings.value.appearance.theme !== "system") return;
    applyThemeAppearance();
    // 系统明暗不是响应式数据，跟随系统时云母的明暗变体要在这里一并重设。
    void applyBackdropMaterial();
  });
  watch(
    () => settingsStore.settings.value.appearance.locale,
    (locale) => applyAppLocalePreference(locale),
    { immediate: true },
  );

  setupGlobalTooltip();
  window.addEventListener("contextmenu", (event) => {
    if (!event.defaultPrevented) event.preventDefault();
  });
  createApp(App).use(i18n).mount("#app");
  recordStartupTiming("Vue mounted");
  // 启动维护不占启动路径：清暂存与缓存淘汰都是后台的事，失败也不该拦住首帧。
  // 两个上限来自设置（上面已经加载过），所以维护不用自己去读设置文档。
  void runStorageMaintenance({
    packageCacheBytes: settingsStore.settings.value.cache.packageLimitGb * CACHE_GIB_BYTES,
    networkCacheBytes: settingsStore.settings.value.cache.networkLimitGb * CACHE_GIB_BYTES,
  });
  window.requestAnimationFrame(() => {
    dismissStartupCover();
    // 首帧之后再预热代码编辑器，既不占用启动路径，又能让首次打开文件时已经就绪。
    warmCodeEditorOnIdle();
    window.setTimeout(() => recordStartupTiming("first frame painted"), 0);
  });
}

void bootstrap();
