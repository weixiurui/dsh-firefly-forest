window.__ModuleLoader__.load({
  id: 'dsh-firefly-forest',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const TAU = Math.PI * 2
    const STORAGE_KEY = 'dsh-firefly-forest.settings.v1'
    const DEFAULTS = Object.freeze({
      enabled: true,
      brightness: 1,
      density: 1,
      owl: 0.55,
      transparency: 0.62,
      overlay: false,
      season: 'auto',
      sound: false,
      volume: 0.35,
      followMouse: true
    })

    const settings = { ...DEFAULTS }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) Object.assign(settings, JSON.parse(stored))
    } catch {
      /* storage is optional */
    }
    settings.enabled = settings.enabled !== false
    settings.brightness = clamp(num(settings.brightness, 1), 0.5, 1.5)
    settings.density = clamp(num(settings.density, 1), 0.5, 2)
    settings.owl = clamp(num(settings.owl, 0.55), 0, 1)
    settings.transparency = clamp(num(settings.transparency, 0.62), 0.35, 0.9)
    settings.overlay = settings.overlay === true
    settings.season = ['auto', 'spring', 'summer', 'autumn', 'winter'].includes(settings.season) ? settings.season : 'auto'
    settings.sound = settings.sound === true
    settings.volume = clamp(num(settings.volume, 0.35), 0, 1)
    settings.followMouse = settings.followMouse !== false

    const listeners = new Set()
    let themeApi = null
    let themeDispose = null
    let styleEl = null
    let scene = null
    let sceneCanvas = null

    function clamp(value, min, max) {
      return value < min ? min : value > max ? max : value
    }

    function num(value, fallback) {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : fallback
    }

    function notify() {
      for (const listener of listeners) {
        try {
          listener()
        } catch (error) {
          console.warn('[firefly-forest] settings listener failed', error)
        }
      }
    }

    function persist() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      } catch {
        /* storage is optional */
      }
    }

    function applyCanvasLayer() {
      if (!sceneCanvas) return
      if (settings.overlay) {
        sceneCanvas.style.setProperty('z-index', '2147483646', 'important')
        sceneCanvas.style.setProperty('opacity', '0.55', 'important')
      } else {
        sceneCanvas.style.setProperty('z-index', '-1', 'important')
        sceneCanvas.style.setProperty('opacity', '1', 'important')
      }
    }

    function updateAlphaVars() {
      if (!document.body) return
      const alpha = clamp(num(settings.transparency, 0.62), 0.35, 0.9)
      document.body.style.setProperty('--dsff-light', Math.min(0.85, alpha + 0.06).toFixed(3))
      document.body.style.setProperty('--dsff-dark', clamp(alpha * 0.78, 0.26, 0.85).toFixed(3))
    }

    function injectStyle() {
      if (styleEl || !document.head) return
      styleEl = document.createElement('style')
      styleEl.setAttribute('data-dsh-firefly-forest', 'style')
      styleEl.textContent = [
        'html, body, #root { background-color: transparent !important; }',
        'html { background-color: #050807 !important; }',
        'body { --dsff-light: 0.68; --dsff-dark: 0.62; }',
        'body { --dsw-alias-bg-base: rgba(246, 245, 241, var(--dsff-light)) !important; --dsw-alias-bg-layer-1: rgba(252, 251, 248, var(--dsff-light)) !important; --dsw-alias-bg-layer-2: rgba(255, 255, 255, var(--dsff-light)) !important; --dsw-alias-bg-layer-3: rgba(255, 255, 255, var(--dsff-light)) !important; --dsw-alias-bg-module-platform: rgba(255, 255, 255, var(--dsff-light)) !important; --dsw-alias-bg-overlay: rgba(252, 251, 248, 0.94) !important; --dsw-specific-sidebar-fill: rgba(246, 245, 241, var(--dsff-light)) !important; }',
        'body[data-ds-dark-theme] { --dsw-alias-bg-base: rgba(7, 11, 9, var(--dsff-dark)) !important; --dsw-alias-bg-layer-1: rgba(11, 17, 13, var(--dsff-dark)) !important; --dsw-alias-bg-layer-2: rgba(15, 22, 17, var(--dsff-dark)) !important; --dsw-alias-bg-layer-3: rgba(15, 22, 17, var(--dsff-dark)) !important; --dsw-alias-bg-module-platform: rgba(13, 19, 15, var(--dsff-dark)) !important; --dsw-alias-bg-overlay: rgba(9, 13, 10, 0.94) !important; --dsw-specific-sidebar-fill: rgba(9, 14, 11, var(--dsff-dark)) !important; }',
        '#dsh-firefly-forest-canvas { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; z-index: -1 !important; pointer-events: none !important; display: block !important; }'
      ].join('\n')
      document.head.appendChild(styleEl)
    }

    function removeStyle() {
      if (styleEl) {
        styleEl.remove()
        styleEl = null
      }
    }

    function overrideLayer() {
      const alpha = clamp(num(settings.transparency, 0.62), 0.35, 0.9)
      const darkAlpha = clamp(alpha * 0.78, 0.26, 0.85)
      const dark = (r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
      const light = (r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
      return {
        '--dsw-alias-bg-base': {
          light: light(246, 245, 241, Math.min(0.82, alpha + 0.06)),
          dark: dark(7, 11, 9, darkAlpha)
        },
        '--dsw-alias-bg-layer-1': {
          light: light(252, 251, 248, Math.min(0.88, alpha + 0.1)),
          dark: dark(11, 17, 13, clamp(darkAlpha - 0.04, 0.22, 0.85))
        },
        '--dsw-alias-bg-layer-2': {
          light: light(255, 255, 255, Math.min(0.92, alpha + 0.14)),
          dark: dark(15, 22, 17, clamp(darkAlpha - 0.08, 0.2, 0.85))
        },
        '--dsw-alias-bg-overlay': {
          light: 'rgba(252, 251, 248, 0.94)',
          dark: 'rgba(9, 13, 10, 0.94)'
        },
        '--dsw-alias-bg-layer-3': {
          light: light(255, 255, 255, Math.min(0.94, alpha + 0.16)),
          dark: dark(15, 22, 17, clamp(darkAlpha - 0.1, 0.2, 0.85))
        },
        '--dsw-alias-bg-module-platform': {
          light: light(255, 255, 255, Math.min(0.86, alpha + 0.08)),
          dark: dark(13, 19, 15, clamp(darkAlpha - 0.05, 0.22, 0.85))
        },
        '--dsw-specific-sidebar-fill': {
          light: light(246, 245, 241, Math.min(0.85, alpha + 0.06)),
          dark: dark(9, 14, 11, clamp(darkAlpha - 0.02, 0.22, 0.85))
        }
      }
    }

    function applyOverrides() {
      if (!themeApi || typeof themeApi.overrideTokens !== 'function') return
      try {
        themeDispose = themeApi.overrideTokens('dsh-firefly-forest', overrideLayer())
      } catch (error) {
        console.warn('[firefly-forest] theme override failed', error)
      }
    }

    function clearOverrides() {
      if (themeDispose) {
        try {
          themeDispose()
        } catch {
          /* the layer may already be gone */
        }
        themeDispose = null
      }
    }

    function syncEffect() {
      if (settings.enabled) {
        injectStyle()
        updateAlphaVars()
        applyOverrides()
        if (!scene && document.body) scene = createScene()
        /* 预览页（preview/index.html）用它按名字点名一只小动物，正式环境里这个开关不存在 */
        if (scene && window.__dshFireflyPreview) window.__dshFireflyPreviewScene = scene
        applyCanvasLayer()
      } else {
        if (scene) {
          scene.dispose()
          scene = null
        }
        clearOverrides()
        removeStyle()
        stopAudio()
      }
    }

    function save(patch) {
      Object.assign(settings, patch)
      settings.brightness = clamp(num(settings.brightness, 1), 0.5, 1.5)
      settings.density = clamp(num(settings.density, 1), 0.5, 2)
      settings.owl = clamp(num(settings.owl, 0.55), 0, 1)
      settings.transparency = clamp(num(settings.transparency, 0.62), 0.35, 0.9)
      settings.enabled = settings.enabled !== false
      settings.overlay = settings.overlay === true
      settings.season = ['auto', 'spring', 'summer', 'autumn', 'winter'].includes(settings.season) ? settings.season : 'auto'
      settings.sound = settings.sound === true
      settings.volume = clamp(num(settings.volume, 0.35), 0, 1)
      settings.followMouse = settings.followMouse !== false
      persist()
      if (scene && Object.prototype.hasOwnProperty.call(patch, 'density')) scene.rebuildFireflies()
      if (scene && Object.prototype.hasOwnProperty.call(patch, 'season')) scene.refreshSeason()
      if (settings.enabled) {
        if (settings.sound) startAudio()
        else stopAudio()
      } else {
        stopAudio()
      }
      syncEffect()
      notify()
    }

    const NIGHT_KEY = 'dsh-firefly-forest.night.v1'
    const SEEN_KEY = 'dsh-firefly-forest.seen.v1'
    /* 一夜 = 45 分钟真实时间；相位写到 localStorage，关掉窗口再打开，森林继续变老。 */
    const NIGHT_MS = 45 * 60 * 1000
    /* 朔望月 29.53059 天；以 2000-01-06 18:14 UTC 的新月为基准。 */
    const SYNODIC_DAYS = 29.53059

    function moonPhaseOf(date = new Date()) {
      const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000
      return ((((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS) / SYNODIC_DAYS)
    }

    /* 0 = 新月（几乎没有月光），1 = 满月 */
    function moonlightOf(phase) {
      return (1 - Math.cos(phase * TAU)) / 2
    }

    function moonName(phase) {
      if (phase < 0.03 || phase > 0.97) return '新月'
      if (phase < 0.22) return '蛾眉月'
      if (phase < 0.28) return '上弦月'
      if (phase < 0.47) return '盈凸月'
      if (phase < 0.53) return '满月'
      if (phase < 0.72) return '亏凸月'
      if (phase < 0.78) return '下弦月'
      return '残月'
    }

    function todayKey() {
      const now = new Date()
      return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    }

    function isFirstOpenToday() {
      try {
        return window.localStorage.getItem(SEEN_KEY) !== todayKey()
      } catch {
        return false
      }
    }

    function rememberOpen() {
      try {
        window.localStorage.setItem(SEEN_KEY, todayKey())
      } catch {
        /* storage is optional */
      }
    }

    function loadNightPhase() {
      try {
        const raw = window.localStorage.getItem(NIGHT_KEY)
        if (raw) {
          const saved = JSON.parse(raw)
          if (saved && Number.isFinite(saved.phase)) {
            const elapsed = Date.now() - num(saved.at, Date.now())
            const next = saved.phase + elapsed / NIGHT_MS
            return ((next % 1) + 1) % 1
          }
        }
      } catch {
        /* storage is optional */
      }
      return 0.06 + Math.random() * 0.06
    }

    function persistNightPhase(phase) {
      try {
        window.localStorage.setItem(NIGHT_KEY, JSON.stringify({ phase, at: Date.now() }))
      } catch {
        /* storage is optional */
      }
    }

    function resolvedSeason(setting) {
      if (setting !== 'auto') return setting
      const month = new Date().getMonth()
      if (month >= 2 && month <= 4) return 'spring'
      if (month >= 5 && month <= 7) return 'summer'
      if (month >= 8 && month <= 10) return 'autumn'
      return 'winter'
    }

    /* 三只小动物的逐帧行走图：由 GIF 抽 6 帧、去底、拼成横表再压成 WebP，
       内联成 data URL（不依赖宿主的静态资源路由）。加载失败时退回矢量或跳过。 */
    const ANIMAL_SPRITES = {
      hedgehog: { frames: 6, height: 64, src: 'data:image/webp;base64,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' },
      redpanda: { frames: 6, height: 62, src: 'data:image/webp;base64,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' },
      raccoon: { frames: 6, height: 56, src: 'data:image/webp;base64,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' }
    }

    let audio = null

    function stopAudio() {
      if (!audio) return
      for (const timer of audio.timers) clearInterval(timer)
      try {
        audio.ctx.close()
      } catch {
        /* the context may already be closed */
      }
      audio = null
    }

    function setAudioVolume(value) {
      if (!audio) return
      audio.master.gain.setTargetAtTime(clamp(num(value, 0.35), 0, 1) * 0.35, audio.ctx.currentTime, 0.3)
    }

    function setAudioRain(value) {
      if (!audio) return
      audio.rainGain.gain.setTargetAtTime(clamp(value, 0, 1) * 0.2, audio.ctx.currentTime, 0.6)
    }

    function setAudioWind(value) {
      if (!audio) return
      audio.windGain.gain.setTargetAtTime(0.32 + clamp(value, 0, 1) * 0.3, audio.ctx.currentTime, 0.8)
    }

    function setAudioPan(value) {
      if (!audio || !audio.panner) return
      audio.panner.pan.setTargetAtTime(clamp(value, -1, 1), audio.ctx.currentTime, 0.8)
    }

    function startAudio() {
      if (audio) {
        setAudioVolume(settings.volume)
        return
      }
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      let ctx
      try {
        ctx = new Ctx()
      } catch {
        return
      }
      const master = ctx.createGain()
      master.gain.value = 0
      /* 声场跟着鼠标左右移动：StereoPanner 不可用时安静地退化成单声道 */
      const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null
      if (panner) master.connect(panner).connect(ctx.destination)
      else master.connect(ctx.destination)
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      let last = 0
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.5
      }
      const wind = ctx.createBufferSource()
      wind.buffer = buffer
      wind.loop = true
      const windFilter = ctx.createBiquadFilter()
      windFilter.type = 'lowpass'
      windFilter.frequency.value = 420
      const windGain = ctx.createGain()
      windGain.gain.value = 0.5
      wind.connect(windFilter).connect(windGain).connect(master)
      wind.start()
      const rain = ctx.createBufferSource()
      rain.buffer = buffer
      rain.loop = true
      const rainFilter = ctx.createBiquadFilter()
      rainFilter.type = 'highpass'
      rainFilter.frequency.value = 700
      const rainGain = ctx.createGain()
      rainGain.gain.value = 0
      rain.connect(rainFilter).connect(rainGain).connect(master)
      rain.start()
      const timers = []
      timers.push(setInterval(() => {
        if (!audio) return
        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = 3600 + Math.random() * 900
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.03, now + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
        osc.connect(gain).connect(master)
        osc.start(now)
        osc.stop(now + 0.15)
      }, 1100 + Math.random() * 400))
      timers.push(setInterval(() => {
        if (!audio) return
        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(420, now)
        osc.frequency.linearRampToValueAtTime(300, now + 0.7)
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.045, now + 0.15)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9)
        osc.connect(gain).connect(master)
        osc.start(now)
        osc.stop(now + 1)
      }, 22000 + Math.random() * 18000))
      audio = { ctx, master, panner, windGain, rainGain, timers }
      setAudioVolume(settings.volume)
    }

    function mulberry32(seed) {
      let state = seed >>> 0
      return function random() {
        state |= 0
        state = (state + 0x6d2b79f5) | 0
        let value = Math.imul(state ^ (state >>> 15), 1 | state)
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
      }
    }

    function createScene() {
      const canvas = document.createElement('canvas')
      canvas.id = 'dsh-firefly-forest-canvas'
      canvas.setAttribute('aria-hidden', 'true')
      document.body.appendChild(canvas)
      sceneCanvas = canvas
      const g = canvas.getContext('2d', { alpha: true })
      const layer = document.createElement('canvas')
      const lg = layer.getContext('2d', { alpha: true })
      const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

      let W = 1
      let H = 1
      let dpr = 1
      let raf = 0
      let lastDraw = 0
      let t = 0
      let alive = true
      let visible = document.visibilityState !== 'hidden'
      let resizeTimer = 0
      let moon = { x: 0, y: 0, r: 0 }
      let stars = []
      let trees = []
      let blades = []
      let tips = []
      let creatures = []
      let fireflies = []
      let nextVisit = 8
      let visitor = null
      let creature = null
      let nextVisitor = 18 + Math.random() * 22
      let season = resolvedSeason(settings.season)
      let seasonParticles = []
      let weather = { rain: 0, target: 0, next: 40 + Math.random() * 50 }
      let rainDrops = []
      let flash = 0
      let meteor = null
      let nextMeteor = 120 + Math.random() * 240
      let train = null
      let nextTrain = 900 + Math.random() * 900
      let soot = []
      let kodama = []
      let swarm = null
      let nextSwarm = 45 + Math.random() * 60
      let wind = 0
      let windY = 0
      let windDir = 1
      let gust = 0
      let nextGust = 14 + Math.random() * 22
      let vortices = []
      let pointer = { x: -1000, y: -1000, t: 0 }
      let nightPhase = loadNightPhase()
      let phaseBoost = 0
      let lastPaintBucket = -1
      let pairTimer = 0
      let lastPersist = 0
      let lastAudioWindAt = 0
      let lastAudioPanAt = 0
      let mouse = { x: -1000, y: -1000, active: false, time: 0 }
      let shrine = { x: 0, y: 0, scale: 1 }
      let camphor = { x: 0, y: 0, scale: 1, hollow: { x: 0, y: 0, r: 0 } }
      let lunarPhase = moonPhaseOf()
      let moonlight = moonlightOf(lunarPhase)
      let lightMode = false
      let lifted = []
      let webs = []
      let nextWeb = 120 + Math.random() * 240
      let pendingVisitorType = null
      let pendingVisitorX = null
      let lastVisitorType = null
      let lod = 0
      let frameAvg = 16
      let lodTimer = 0
      let recoverTimer = 0
      let intro = 1
      let introActive = false
      let introDone = false
      let stuckCheck = 0
      /* 三只小动物的行走精灵图：加载成功就用它；只有刺猬还留着矢量兜底 */
      const sprites = {}
      for (const [type, cfg] of Object.entries(ANIMAL_SPRITES)) {
        const image = new Image()
        image.decoding = 'async'
        image.src = cfg.src
        sprites[type] = { frames: cfg.frames, height: cfg.height, image, tinted: null, tintKey: '' }
      }

      function seasonDensity(value) {
        if (value === 'spring') return 0.9
        if (value === 'summer') return 1.15
        if (value === 'winter') return 0.5
        return 1
      }

      /* 夜之流：0 = 入夜，约 0.5 = 深夜，1 = 将明。三个系数都在 0..1 之间。 */
      function nightMood(p) {
        return {
          dusk: clamp(1 - p / 0.3, 0, 1),
          deep: clamp(1 - Math.abs(p - 0.52) / 0.42, 0, 1),
          dawn: clamp((p - 0.72) / 0.28, 0, 1)
        }
      }

      function nightDensity(p) {
        if (p < 0.28) return 0.72 + (p / 0.28) * 0.28
        if (p < 0.55) return 1
        if (p < 0.85) return 1 - ((p - 0.55) / 0.3) * 0.55
        return 0.45 - ((p - 0.85) / 0.15) * 0.3
      }

      function nightDew(p) {
        return clamp((p - 0.78) / 0.22, 0, 1)
      }

      function mixRgb(from, to, k) {
        const r = Math.round(from[0] + (to[0] - from[0]) * k)
        const g = Math.round(from[1] + (to[1] - from[1]) * k)
        const b = Math.round(from[2] + (to[2] - from[2]) * k)
        return [r, g, b]
      }

      function skyStops(p, light = false) {
        const { dusk, deep, dawn } = nightMood(p)
        if (light) {
          /* 浅色外观 = 晨雾森林：不是把夜色调淡，而是换成天亮前的灰蓝 */
          const top = mixRgb([22, 28, 32], [30, 38, 42], dawn * 0.6)
          const upper = mixRgb([30, 38, 38], [40, 49, 48], dawn * 0.6)
          const mid = mixRgb([38, 47, 44], [50, 58, 54], dawn * 0.5)
          const low = mixRgb([28, 35, 33], [36, 42, 39], dawn * 0.5)
          return { top, upper, mid, low, dusk, deep, dawn }
        }
        /* 天空保持“比树影亮一点”：深夜的暗靠逐帧整体压暗，而不是把天空压到树色以下，
           否则树干会比天空亮，剪影就反了。 */
        const top = mixRgb([5, 10, 12], [7, 13, 20], dawn * 0.55)
        const upper = mixRgb([8, 16, 13], [9, 17, 24], dawn * 0.55)
        const mid = mixRgb([10, 20, 16], [11, 20, 25], dawn * 0.5)
        const low = mixRgb([6, 12, 10], [7, 13, 17], dawn * 0.45)
        return { top, upper, mid, low, dusk, deep, dawn }
      }

      function hex(rgb) {
        const [r, g, b] = rgb
        return `rgb(${r}, ${g}, ${b})`
      }

      function readLightMode() {
        try {
          const theme = themeApi && typeof themeApi.getTheme === 'function' ? themeApi.getTheme() : null
          return !!(theme && theme.active && theme.active.colorScheme === 'light')
        } catch {
          return false
        }
      }

      function refreshLunar() {
        lunarPhase = moonPhaseOf()
        moonlight = moonlightOf(lunarPhase)
      }

      /* 蛛网：偶尔结在两根草叶之间，风里会轻轻晃 */
      function makeWebs() {
        webs = []
        const count = Math.random() < 0.55 ? 1 : 2
        for (let i = 0; i < count && blades.length > 6; i++) {
          const a = blades[Math.floor(Math.random() * blades.length)]
          const b = blades[Math.floor(Math.random() * blades.length)]
          if (!a || !b) continue
          const gap = Math.abs(a.x - b.x)
          if (gap < 40 || gap > 190) continue
          webs.push({
            x: (a.x + b.x) / 2,
            y: Math.min(a.top, b.top) - 12 - Math.random() * 26,
            r: 16 + Math.random() * 16,
            phase: Math.random() * TAU,
            catch: null
          })
        }
      }

      function drawWebs(ctx) {
        if (webs.length === 0 || lod >= 3) return
        const sway = wind * 7 + Math.sin(t * 0.9) * 1.2
        ctx.save()
        ctx.strokeStyle = 'rgba(205, 225, 215, 0.11)'
        ctx.lineWidth = 0.7
        for (const web of webs) {
          const cx = web.x + sway
          const cy = web.y
          for (let i = 0; i < 6; i++) {
            const angle = web.phase + (i / 6) * TAU
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.lineTo(cx + Math.cos(angle) * web.r, cy + Math.sin(angle) * web.r * 0.78)
            ctx.stroke()
          }
          for (const ring of [0.42, 0.74]) {
            ctx.beginPath()
            for (let i = 0; i <= 6; i++) {
              const angle = web.phase + (i / 6) * TAU
              const px = cx + Math.cos(angle) * web.r * ring
              const py = cy + Math.sin(angle) * web.r * 0.78 * ring
              if (i === 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            ctx.stroke()
          }
        }
        ctx.restore()
      }

      function build() {
        W = Math.max(320, window.innerWidth)
        H = Math.max(240, window.innerHeight)
        dpr = clamp(window.devicePixelRatio || 1, 1, 2)
        canvas.width = Math.round(W * dpr)
        canvas.height = Math.round(H * dpr)
        layer.width = canvas.width
        layer.height = canvas.height
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        lg.setTransform(dpr, 0, 0, dpr, 0, 0)
        const rand = mulberry32(0x51ee7f0d)

        moon = { x: W * 0.84, y: H * 0.13, r: Math.min(W, H) * 0.05 }

        stars = []
        const starCount = Math.round((W * H) / 22000)
        for (let i = 0; i < starCount; i++) {
          stars.push({
            x: rand() * W,
            y: rand() * H * 0.4,
            r: 0.3 + rand() * 1.0,
            a: 0.12 + rand() * 0.4
          })
        }

        trees = []
        for (let depth = 0; depth < 3; depth++) {
          const count = depth === 0 ? 9 : depth === 1 ? 6 : 3
          const color = depth === 0 ? '#0a110d' : depth === 1 ? '#070c08' : '#030604'
          for (let i = 0; i < count; i++) {
            const x = clamp((i + 0.5) / count + (rand() - 0.5) * 0.1, 0, 1) * W
            const baseY = H * (depth === 2 ? 1.06 : 1.0)
            const topY = depth === 0 ? H * (0.1 + rand() * 0.18) : depth === 1 ? H * (0.0 + rand() * 0.16) : H * (-0.08 + rand() * 0.1)
            const w = W * (depth === 0 ? 0.01 + rand() * 0.012 : depth === 1 ? 0.018 + rand() * 0.022 : 0.06 + rand() * 0.05)
            trees.push({
              depth,
              x,
              topY,
              baseY,
              w,
              lean: (rand() - 0.5) * 0.1,
              color,
              seed: Math.floor(rand() * 1e9)
            })
          }
        }

        blades = []
        tips = []
        const bladeCount = Math.max(60, Math.round(W / 5))
        for (let i = 0; i < bladeCount; i++) {
          const x = rand() * W
          const height = H * (0.025 + rand() * 0.11)
          const bend = (rand() - 0.5) * W * 0.02
          blades.push({
            x,
            top: H - height,
            bend,
            width: 0.8 + rand() * 1.8,
            phase: rand() * TAU,
            stiff: 0.6 + rand() * 0.9,
            color: `rgba(${Math.round(4 + rand() * 6)}, ${Math.round(10 + rand() * 8)}, ${Math.round(6 + rand() * 4)}, ${(0.45 + rand() * 0.45).toFixed(2)})`
          })
          tips.push({ x: x + bend, y: H - height })
        }

        creatures = []
        creatures.push({
          type: 'owl',
          x: W * 0.72,
          y: H * 0.34,
          radius: Math.min(W, H) * 0.2,
          reveal: 0,
          hold: 0,
          cooldown: 5 + rand() * 6,
          phase: rand() * TAU,
          scale: Math.max(0.9, Math.min(W, H) / 900)
        })
        for (const [mx, my] of [[0.22, 0.48], [0.46, 0.58], [0.86, 0.62], [0.6, 0.42]]) {
          creatures.push({
            type: 'moth',
            x: W * mx,
            y: H * my,
            radius: Math.min(W, H) * 0.11,
            reveal: 0,
            hold: 0,
            cooldown: 2 + rand() * 6,
            phase: rand() * TAU,
            scale: Math.max(0.7, Math.min(W, H) / 1100)
          })
        }

        season = resolvedSeason(settings.season)
        shrine = { x: W * 0.16, y: H * 0.66, scale: Math.max(0.8, Math.min(W, H) / 1000) }
        camphor = {
          x: W * 0.84,
          y: H,
          scale: Math.max(1, Math.min(W, H) / 800),
          hollow: { x: W * 0.84, y: H * 0.46, r: Math.min(W, H) * 0.03 }
        }
        makeSoot()
        makeKodama()
        makeSeasonParticles()
        makeWebs()
        makeFireflies(rand)
        lightMode = readLightMode()
        refreshLunar()
        paintLayer()
        lastPaintBucket = Math.floor(nightPhase * 12)
        /* 每天第一次打开：萤火虫从草里慢慢升起来，两秒内进入常态 */
        if (!introDone && !reduceMotion && nightPhase < 0.6 && isFirstOpenToday()) {
          intro = 0
          introActive = true
          rememberOpen()
        }
        visitor = null
      }

      function makeFireflies(rand = mulberry32(0x8badf00d)) {
        const count = Math.round(30 * clamp(settings.density, 0.5, 2) * seasonDensity(season))
        fireflies = []
        for (let i = 0; i < count; i++) {
          const startRest = rand() < 0.55 && tips.length > 0
          const tip = startRest ? tips[Math.floor(rand() * tips.length)] : null
          fireflies.push({
            mode: startRest ? 'rest' : 'fly',
            x: tip ? tip.x : rand() * W,
            y: tip ? tip.y : H * (0.2 + rand() * 0.7),
            vx: 0,
            vy: 0,
            phase: rand() * TAU,
            speed: 0.35 + rand() * 0.55,
            freq: 0.55 + rand() * 0.85,
            size: 1.05 + rand() * 1.35,
            temp: rand(),
            bright: 0,
            flash: 0,
            visit: 0,
            target: null,
            nextFlash: 5 + rand() * 12,
            restLeft: 5 + rand() * 15,
            flyLeft: 8 + rand() * 16,
            blinkCooldown: 6 + rand() * 22,
            home: tip ? { x: tip.x, y: tip.y } : null
          })
        }
        nextVisit = 7 + Math.random() * 8
      }

      function makeSoot() {
        soot = []
        for (let i = 0; i < 5; i++) {
          soot.push({
            x: 40 + Math.random() * Math.max(1, W - 80),
            y: H - 6 - Math.random() * 10,
            vx: (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10),
            size: 4 + Math.random() * 3,
            phase: Math.random() * TAU
          })
        }
      }

      function makeKodama() {
        const trunks = trees.filter((tree) => tree.depth >= 1)
        kodama = []
        for (let i = 0; i < 3 && trunks.length > 0; i++) {
          const tree = trunks[Math.floor(Math.random() * trunks.length)]
          kodama.push({
            x: tree.x + (Math.random() < 0.5 ? -1 : 1) * tree.w * 1.2,
            y: tree.topY + (tree.baseY - tree.topY) * (0.18 + Math.random() * 0.15),
            phase: Math.random() * TAU,
            visible: Math.random() < 0.5,
            timer: 4 + Math.random() * 8
          })
        }
      }

      function makeSeasonParticles() {
        season = resolvedSeason(settings.season)
        const count = season === 'winter' ? 70 : season === 'summer' ? 0 : 45
        seasonParticles = []
        for (let i = 0; i < count; i++) {
          seasonParticles.push({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: (Math.random() - 0.5) * 10,
            vy: season === 'winter' ? 8 + Math.random() * 12 : 6 + Math.random() * 10,
            size: 1 + Math.random() * 1.6,
            rot: Math.random() * TAU,
            phase: Math.random() * TAU
          })
        }
      }

      function paintLayer() {
        lg.clearRect(0, 0, W, H)
        const stops = skyStops(nightPhase, lightMode)
        const moonX = moon.x + (0.5 - nightPhase) * W * 0.05
        const moonY = moon.y - (0.5 - nightPhase) * H * 0.02

        const sky = lg.createLinearGradient(0, 0, 0, H)
        sky.addColorStop(0, hex(stops.top))
        sky.addColorStop(0.45, hex(stops.upper))
        sky.addColorStop(0.78, hex(stops.mid))
        sky.addColorStop(1, hex(stops.low))
        lg.fillStyle = sky
        lg.fillRect(0, 0, W, H)

        /* 月相：满月更亮，新月几乎没有月光；浅色外观下整体压淡 */
        const moonGlowAlpha = (0.06 + stops.deep * 0.06 + moonlight * 0.1 - stops.dawn * 0.04) * (lightMode ? 0.4 : 1)
        const moonGlow = lg.createRadialGradient(moonX, moonY, 0, moonX, moonY, moon.r * 7)
        moonGlow.addColorStop(0, `rgba(210, 235, 210, ${Math.max(0, moonGlowAlpha).toFixed(3)})`)
        moonGlow.addColorStop(0.3, `rgba(180, 220, 180, ${Math.max(0, moonGlowAlpha * 0.4).toFixed(3)})`)
        moonGlow.addColorStop(1, 'rgba(180, 220, 180, 0)')
        lg.fillStyle = moonGlow
        lg.beginPath()
        lg.arc(moonX, moonY, moon.r * 7, 0, TAU)
        lg.fill()
        lg.fillStyle = `rgba(225, 240, 220, ${((0.08 + stops.deep * 0.08 + moonlight * 0.16) * (lightMode ? 0.5 : 1)).toFixed(3)})`
        lg.beginPath()
        lg.arc(moonX, moonY, moon.r, 0, TAU)
        lg.fill()

        const starScale = (1 - stops.dusk * 0.55) * (1 - stops.dawn * 0.4) * (1 - moonlight * 0.25) * (lightMode ? 0.2 : 1)
        for (const star of stars) {
          lg.fillStyle = `rgba(220, 235, 215, ${(star.a * 0.7 * starScale).toFixed(2)})`
          lg.beginPath()
          lg.arc(star.x, star.y, star.r, 0, TAU)
          lg.fill()
        }

        for (const tree of trees.filter((entry) => entry.depth === 0)) drawTree(lg, tree)

        drawShrine(lg)
        drawCamphor(lg)
        drawDeer(lg)

        for (const tree of trees.filter((entry) => entry.depth === 1)) drawTree(lg, tree)

        drawOwlBranch(lg)

        for (const tree of trees.filter((entry) => entry.depth === 2)) drawTree(lg, tree)

        const ground = lg.createLinearGradient(0, H * 0.72, 0, H)
        ground.addColorStop(0, 'rgba(4, 8, 6, 0)')
        ground.addColorStop(0.55, 'rgba(4, 8, 6, 0.55)')
        ground.addColorStop(1, 'rgba(2, 4, 3, 0.92)')
        lg.fillStyle = ground
        lg.fillRect(0, H * 0.72, W, H * 0.28)

        drawMushrooms(lg)

        const vignette = lg.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.18, W * 0.5, H * 0.5, Math.max(W, H) * 0.78)
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)')
        vignette.addColorStop(0.62, 'rgba(0, 0, 0, 0.22)')
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.72)')
        lg.fillStyle = vignette
        lg.fillRect(0, 0, W, H)
      }

      function drawTree(ctx, tree) {
        const rand = mulberry32(tree.seed || 1)
        const topX = tree.x + tree.lean * (tree.baseY - tree.topY)
        const midY = tree.topY + (tree.baseY - tree.topY) * 0.55
        ctx.fillStyle = tree.color
        ctx.beginPath()
        ctx.moveTo(tree.x - tree.w * 0.5, tree.baseY)
        ctx.quadraticCurveTo(tree.x - tree.w * 0.35 + (topX - tree.x) * 0.3, midY, topX - tree.w * 0.12, tree.topY)
        ctx.lineTo(topX + tree.w * 0.12, tree.topY)
        ctx.quadraticCurveTo(tree.x + tree.w * 0.35 + (topX - tree.x) * 0.3, midY, tree.x + tree.w * 0.5, tree.baseY)
        ctx.closePath()
        ctx.fill()

        ctx.strokeStyle = tree.color
        ctx.lineCap = 'round'
        const branchCount = tree.depth === 2 ? 3 : 4
        for (let i = 0; i < branchCount; i++) {
          const by = tree.topY + (midY - tree.topY) * (0.38 + i * 0.16)
          const bx = tree.x + (topX - tree.x) * (0.38 + i * 0.16)
          const dir = i % 2 === 0 ? -1 : 1
          const ex = bx + dir * tree.w * (2.2 + rand() * 2.4)
          const ey = by - (tree.baseY - tree.topY) * (0.04 + rand() * 0.07)
          ctx.lineWidth = Math.max(1, tree.w * 0.07)
          ctx.beginPath()
          ctx.moveTo(bx, by)
          ctx.quadraticCurveTo(bx + dir * tree.w, by - (tree.baseY - tree.topY) * 0.02, ex, ey)
          ctx.stroke()
        }

        const blobCount = 5 + Math.floor(rand() * 4)
        for (let i = 0; i < blobCount; i++) {
          const cx = topX + (rand() - 0.5) * tree.w * 7
          const cy = tree.topY + (rand() - 0.3) * (tree.baseY - tree.topY) * 0.22
          const rx = tree.w * (1.6 + rand() * 2.2)
          const ry = tree.w * (1.0 + rand() * 1.6)
          ctx.fillStyle = tree.color
          ctx.beginPath()
          ctx.ellipse(cx, cy, rx, ry, (rand() - 0.5) * 0.6, 0, TAU)
          ctx.fill()
        }
      }

      function drawGrass(ctx) {
        const force = wind * 18 + gust * 16
        const stride = 1 + lod
        for (let i = 0; i < blades.length; i += stride) {
          const blade = blades[i]
          const wave = Math.sin(t * 1.05 + blade.phase) * 3.2
          const sway = (force + wave) * blade.stiff
          ctx.strokeStyle = blade.color
          ctx.lineWidth = blade.width
          ctx.beginPath()
          ctx.moveTo(blade.x, H)
          ctx.quadraticCurveTo(
            blade.x + blade.bend * 0.35 + sway * 0.4,
            blade.top + (H - blade.top) * 0.5,
            blade.x + blade.bend + sway,
            blade.top
          )
          ctx.stroke()
        }
      }

      function drawShrine(ctx) {
        const x = shrine.x
        const y = shrine.y
        const s = shrine.scale
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
        ctx.beginPath()
        ctx.ellipse(x, y + 2 * s, 84 * s, 10 * s, 0, 0, TAU)
        ctx.fill()
        ctx.fillStyle = '#2f1c18'
        ctx.fillRect(x - 34 * s, y - 34 * s, 6 * s, 42 * s)
        ctx.fillRect(x + 28 * s, y - 34 * s, 6 * s, 42 * s)
        ctx.fillRect(x - 44 * s, y - 38 * s, 88 * s, 5 * s)
        ctx.fillRect(x - 38 * s, y - 28 * s, 76 * s, 4 * s)
        ctx.beginPath()
        ctx.moveTo(x - 46 * s, y - 40 * s)
        ctx.quadraticCurveTo(x, y - 50 * s, x + 46 * s, y - 40 * s)
        ctx.lineTo(x + 44 * s, y - 36 * s)
        ctx.quadraticCurveTo(x, y - 46 * s, x - 44 * s, y - 36 * s)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#2a2c28'
        ctx.fillRect(x - 55 * s, y - 10 * s, 6 * s, 14 * s)
        ctx.fillRect(x - 59 * s, y - 14 * s, 14 * s, 4 * s)
        ctx.fillRect(x - 61 * s, y - 20 * s, 18 * s, 3 * s)
        for (const dx of [-72, 72]) {
          ctx.fillStyle = '#2a2c28'
          ctx.beginPath()
          ctx.ellipse(x + dx * s, y - 6 * s, 8 * s, 11 * s, 0, 0, TAU)
          ctx.fill()
          ctx.beginPath()
          ctx.arc(x + dx * s, y - 17 * s, 5.5 * s, 0, TAU)
          ctx.fill()
          ctx.beginPath()
          ctx.moveTo(x + (dx - 4) * s, y - 20 * s)
          ctx.lineTo(x + (dx - 6) * s, y - 26 * s)
          ctx.lineTo(x + (dx - 1) * s, y - 21 * s)
          ctx.closePath()
          ctx.fill()
          ctx.beginPath()
          ctx.moveTo(x + (dx + 4) * s, y - 20 * s)
          ctx.lineTo(x + (dx + 6) * s, y - 26 * s)
          ctx.lineTo(x + (dx + 1) * s, y - 21 * s)
          ctx.closePath()
          ctx.fill()
        }
      }

      function drawCamphor(ctx) {
        const x = camphor.x
        const y = camphor.y
        const s = camphor.scale
        ctx.fillStyle = '#040705'
        ctx.beginPath()
        ctx.ellipse(x, y - 8 * s, 76 * s, 18 * s, 0, 0, TAU)
        ctx.fill()
        const trunk = ctx.createLinearGradient(x - 42 * s, 0, x + 42 * s, 0)
        trunk.addColorStop(0, '#050906')
        trunk.addColorStop(0.5, '#0b110c')
        trunk.addColorStop(1, '#030604')
        ctx.fillStyle = trunk
        ctx.beginPath()
        ctx.moveTo(x - 42 * s, y)
        ctx.quadraticCurveTo(x - 34 * s, y - H * 0.35, x - 26 * s, H * 0.06)
        ctx.lineTo(x + 26 * s, H * 0.06)
        ctx.quadraticCurveTo(x + 34 * s, y - H * 0.35, x + 42 * s, y)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#050906'
        ctx.lineCap = 'round'
        for (const [dx, dy, w] of [[-80, -H * 0.26, 10], [80, -H * 0.24, 10], [-50, -H * 0.38, 7], [60, -H * 0.42, 7]]) {
          ctx.lineWidth = w * s
          ctx.beginPath()
          ctx.moveTo(x, y - H * 0.5)
          ctx.quadraticCurveTo(x + dx * 0.4 * s, y - H * 0.5 + dy * 0.5, x + dx * s, y - H * 0.5 + dy)
          ctx.stroke()
        }
        ctx.fillStyle = '#050a06'
        for (const [dx, dy, rx, ry] of [[-90, -H * 0.58, 90, 44], [90, -H * 0.56, 90, 44], [0, -H * 0.64, 120, 56]]) {
          ctx.beginPath()
          ctx.ellipse(x + dx * s, y + dy, rx * s, ry * s, 0, 0, TAU)
          ctx.fill()
        }
        ctx.fillStyle = '#020302'
        ctx.beginPath()
        ctx.ellipse(camphor.hollow.x, camphor.hollow.y, 14 * s, 22 * s, 0, 0, TAU)
        ctx.fill()
      }

      function drawDeer(ctx) {
        const x = W * 0.3
        const y = H * 0.58
        ctx.fillStyle = 'rgba(4, 8, 6, 0.75)'
        ctx.beginPath()
        ctx.ellipse(x, y, 28, 10, 0, 0, TAU)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(x + 20, y - 16, 8, 13, -0.3, 0, TAU)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x + 25, y - 32, 6, 0, TAU)
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(x + 20, y - 36)
        ctx.lineTo(x + 16, y - 42)
        ctx.lineTo(x + 24, y - 37)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(4, 8, 6, 0.75)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x + 23, y - 36)
        ctx.lineTo(x + 19, y - 48)
        ctx.moveTo(x + 23, y - 36)
        ctx.lineTo(x + 28, y - 48)
        ctx.stroke()
        for (const dx of [-16, -8, 12, 20]) {
          ctx.fillRect(x + dx, y + 8, 3, 16)
        }
      }

      function drawMushrooms(ctx) {
        const baseX = shrine.x + 64 * shrine.scale
        const baseY = shrine.y + 6 * shrine.scale
        for (const [dx, size] of [[-8, 1], [6, 0.8], [16, 0.6]]) {
          const x = baseX + dx * shrine.scale
          const y = baseY
          ctx.fillStyle = '#2a2a22'
          ctx.fillRect(x - 1.5 * size, y - 6 * size, 3 * size, 8 * size)
          ctx.fillStyle = 'rgba(120, 150, 110, 0.7)'
          ctx.beginPath()
          ctx.ellipse(x, y - 6 * size, 6 * size, 3 * size, 0, 0, TAU)
          ctx.fill()
        }
      }

      function drawOwlBranch(ctx) {
        const owl = creatures.find((entry) => entry.type === 'owl')
        if (!owl) return
        const y = owl.y + 15 * owl.scale
        ctx.strokeStyle = '#050a07'
        ctx.lineCap = 'round'
        ctx.lineWidth = Math.max(4, W * 0.0035)
        ctx.beginPath()
        ctx.moveTo(owl.x - W * 0.12, y + H * 0.02)
        ctx.quadraticCurveTo(owl.x - W * 0.02, y - 3, owl.x + W * 0.1, y - 1)
        ctx.stroke()
        ctx.lineWidth = Math.max(1.5, W * 0.0015)
        ctx.beginPath()
        ctx.moveTo(owl.x + W * 0.02, y)
        ctx.lineTo(owl.x + W * 0.05, y - H * 0.03)
        ctx.moveTo(owl.x + W * 0.06, y)
        ctx.lineTo(owl.x + W * 0.08, y + H * 0.03)
        ctx.stroke()
      }

      function update(dt) {
        nextVisitor -= dt
        if (!visitor && nextVisitor <= 0) {
          visitor = makeVisitorByType(pendingVisitorType)
          lastVisitorType = visitor.type
          if (pendingVisitorX !== null) {
            visitor.x = pendingVisitorX
            pendingVisitorX = null
          }
          pendingVisitorType = null
          nextVisitor = 70 + Math.random() * 110
        }
        if (visitor) {
          visitor.phase += dt
          visitor.x += visitor.vx * dt
          if (visitor.x > W + visitor.margin) visitor = null
        }

        weather.next -= dt
        if (weather.next <= 0) {
          weather.target = weather.target > 0.5 ? 0 : 1
          weather.next = weather.target > 0.5 ? 90 + Math.random() * 90 : 210 + Math.random() * 180
        }
        weather.rain += (weather.target - weather.rain) * Math.min(1, dt * 0.5)
        if (weather.rain < 0.01) weather.rain = 0
        setAudioRain(weather.rain)
        if (weather.rain > 0.01) {
          if (rainDrops.length === 0) {
            for (let i = 0; i < 220; i++) {
              rainDrops.push({ x: Math.random() * W, y: Math.random() * H, len: 8 + Math.random() * 18, speed: 500 + Math.random() * 400 })
            }
          }
          for (const drop of rainDrops) {
            drop.x += wind * 30 * dt
            drop.y += drop.speed * dt
            if (drop.y > H) {
              drop.y = -20
              drop.x = Math.random() * W
            }
          }
        } else if (rainDrops.length > 0) {
          rainDrops.length = 0
        }
        if (flash > 0) flash = Math.max(0, flash - dt * 4)
        if (weather.rain > 0.5 && Math.random() < dt * 0.02) flash = 0.6

        /* 夜之流：相位推进；每 1/12 夜重绘一次底层，天空与月亮跟着走 */
        nightPhase += dt / (NIGHT_MS / 1000)
        if (phaseBoost > 0) {
          const step = Math.min(phaseBoost, dt * 0.05)
          nightPhase += step
          phaseBoost -= step
        }
        if (nightPhase >= 1) nightPhase -= 1
        if (t - lastPersist > 20) {
          lastPersist = t
          persistNightPhase(nightPhase)
        }
        const paintBucket = Math.floor(nightPhase * 12)
        if (paintBucket !== lastPaintBucket) {
          lastPaintBucket = paintBucket
          paintLayer()
        }

        /* 风场：低频底噪 + 每 16–42 秒一阵风，草、雾、虫、雨共用同一个向量 */
        nextGust -= dt
        if (nextGust <= 0) {
          gust = 0.3 + Math.random() * 0.85
          windDir = Math.random() < 0.5 ? -1 : 1
          nextGust = 16 + Math.random() * 26
        }
        gust *= Math.exp(-dt / 3)
        wind = (0.05 + gust) * windDir
        windY = Math.sin(t * 0.31) * 0.12 + gust * 0.2
        if (t - lastAudioWindAt > 0.8) {
          lastAudioWindAt = t
          setAudioWind(0.25 + gust * 0.75)
        }
        if (t - lastAudioPanAt > 0.6) {
          lastAudioPanAt = t
          const pan = mouse.active ? clamp((mouse.x / W) * 1.6 - 0.8, -0.8, 0.8) : 0
          setAudioPan(pan)
        }

        /* 苏醒：每天第一次打开时，萤火虫从草里慢慢升起来 */
        if (introActive) {
          intro = Math.min(1, intro + dt / 1.8)
          if (intro >= 1) {
            introActive = false
            introDone = true
          }
        }

        /* 风的形状：阵风够大时偶尔卷起一片叶子或几颗种子 */
        if (!reduceMotion && gust > 0.55 && lifted.length < 6 && Math.random() < dt * 1.6) {
          lifted.push({
            x: Math.random() * W,
            y: H * (0.55 + Math.random() * 0.35),
            vx: (windDir > 0 ? 1 : -1) * (35 + Math.random() * 70),
            vy: -18 - Math.random() * 34,
            rot: Math.random() * TAU,
            spin: (Math.random() - 0.5) * 7,
            life: 1.3 + Math.random() * 1.3,
            maxLife: 2.6,
            size: 2.2 + Math.random() * 3,
            seed: Math.random() < 0.45
          })
        }
        if (lifted.length > 0) {
          lifted = lifted.filter((item) => {
            item.life -= dt
            item.vy += 26 * dt
            item.vx += wind * 30 * dt
            item.x += item.vx * dt
            item.y += item.vy * dt
            item.rot += item.spin * dt
            return item.life > 0 && item.y < H + 30
          })
        }

        /* 蛛网偶尔捕到一只路过的光点：暗下去又亮起来，然后挣脱 */
        stuckCheck -= dt
        if (stuckCheck <= 0) {
          stuckCheck = 4 + Math.random() * 6
          if (webs.length > 0 && webs.some((web) => !web.catch) && Math.random() < 0.35) {
            const web = webs.find((item) => !item.catch)
            const victim = fireflies.find((ff) => ff.mode === 'fly' && Math.abs(ff.x - web.x) < 160 && Math.abs(ff.y - web.y) < 120)
            if (victim) {
              web.catch = victim
              victim.stuck = 7 + Math.random() * 5
              victim.stuckWeb = web
              victim.mode = 'rest'
            }
          }
        }

        for (const vortex of vortices) vortex.life -= dt * 0.72
        if (vortices.length > 0) vortices = vortices.filter((vortex) => vortex.life > 0)
        if (mouse.active && t - mouse.time > 8) mouse.active = false

        nextSwarm -= dt
        if (!swarm && nextSwarm <= 0) {
          const targets = [{ x: shrine.x, y: shrine.y - 20 * shrine.scale }, { x: W * 0.72, y: H * 0.34 }]
          const target = targets[Math.floor(Math.random() * targets.length)]
          swarm = { x: target.x, y: target.y, until: t + 7, radius: Math.min(W, H) * 0.25 }
          nextSwarm = 60 + Math.random() * 90
        }
        if (swarm && t > swarm.until) swarm = null

        nextMeteor -= dt
        if (!meteor && nextMeteor <= 0) {
          meteor = {
            x: W * (0.1 + Math.random() * 0.6),
            y: H * (0.05 + Math.random() * 0.2),
            vx: 220 + Math.random() * 160,
            vy: 80 + Math.random() * 60,
            life: 1
          }
          nextMeteor = 240 + Math.random() * 360
        }
        if (meteor) {
          meteor.x += meteor.vx * dt
          meteor.y += meteor.vy * dt
          meteor.life -= dt * 0.6
          if (meteor.life <= 0) meteor = null
        }

        nextTrain -= dt
        if (!train && nextTrain <= 0) {
          train = { x: -W * 0.4, y: H * 0.56, vx: W * 0.02, windows: 6 }
          nextTrain = 1200 + Math.random() * 1200
        }
        if (train) {
          train.x += train.vx * dt
          if (train.x > W + W * 0.4) train = null
        }

        for (const sprite of soot) {
          sprite.phase += dt
          sprite.x += sprite.vx * dt
          if (sprite.x < 10 || sprite.x > W - 10) sprite.vx *= -1
          sprite.x = clamp(sprite.x, 10, W - 10)
        }
        for (const spirit of kodama) {
          spirit.phase += dt
          spirit.timer -= dt
          if (spirit.timer <= 0) {
            spirit.visible = !spirit.visible
            spirit.timer = spirit.visible ? 4 + Math.random() * 6 : 8 + Math.random() * 10
          }
        }
        for (const particle of seasonParticles) {
          particle.phase += dt
          particle.x += (particle.vx + wind * 30) * dt + Math.sin(t * 0.7 + particle.phase) * 4 * dt
          particle.y += particle.vy * dt
          if (particle.y > H + 10) {
            particle.y = -10
            particle.x = Math.random() * W
          }
          if (particle.x < -10) particle.x = W + 10
          if (particle.x > W + 10) particle.x = -10
        }

        nextVisit -= dt
        if (nextVisit <= 0) {
          const flying = fireflies.filter((ff) => ff.mode === 'fly' && ff.visit <= 0)
          if (flying.length > 0) {
            const owlFirst = Math.random() < 0.7
            const target = owlFirst ? creatures[0] : creatures[1 + Math.floor(Math.random() * Math.max(1, creatures.length - 1))]
            const ff = flying[Math.floor(Math.random() * flying.length)]
            ff.target = {
              x: target.x + (Math.random() - 0.5) * target.radius * 0.5,
              y: target.y + (Math.random() - 0.5) * target.radius * 0.4
            }
            ff.visit = 5.5
            ff.flash = 1.2
          }
          nextVisit = 9 + Math.random() * (16 - clamp(settings.owl, 0, 1) * 9)
        }

        /* 月光压虫：满月的夜晚萤火虫本来就少；浅色外观（晨雾森林）再少一半 */
        const lightFactor = (lightMode ? 0.55 : 1) * (1 - moonlight * 0.32)
        const restShare = nightDensity(nightPhase) * lightFactor
        const activeLimit = Math.max(6, Math.round(fireflies.length * restShare * (1 - lod * 0.12)))
        for (let index = 0; index < fireflies.length; index++) {
          const ff = fireflies[index]
          if (index >= activeLimit) {
            ff.bright = 0
            continue
          }
          ff.blinkCooldown = Math.max(0, ff.blinkCooldown - dt)
          ff.flash = Math.max(0, ff.flash - dt)
          if (ff.stuck > 0) {
            /* 被蛛网粘住的这一只：停在网心，光缓慢地暗下去又亮起来 */
            ff.stuck -= dt
            const web = ff.stuckWeb
            if (web) {
              ff.x += (web.x - ff.x) * Math.min(1, dt * 3)
              ff.y += (web.y - ff.y) * Math.min(1, dt * 3)
            }
            ff.bright = (0.1 + 0.1 * (0.5 + 0.5 * Math.sin(t * 1.4 + ff.phase))) * clamp(settings.brightness, 0.5, 1.5)
            if (ff.stuck <= 0) {
              if (web) web.catch = null
              ff.stuckWeb = null
              ff.flash = 1.2
              ff.mode = 'fly'
              ff.flyLeft = 8 + Math.random() * 10
              ff.vx = (Math.random() - 0.5) * 12
              ff.vy = -6
            }
            continue
          }
          if (ff.mode === 'fly') {
            if (!reduceMotion) {
              if (ff.visit > 0 && ff.target) {
                const dx = ff.target.x - ff.x
                const dy = ff.target.y - ff.y
                const distance = Math.hypot(dx, dy) || 1
                ff.vx += (dx / distance) * 22 * dt
                ff.vy += (dy / distance) * 22 * dt
                ff.visit -= dt
                if (distance < 26) ff.flash = Math.max(ff.flash, 1.4)
              } else {
                ff.vx += (Math.sin(t * 0.37 + ff.phase * 1.3) * 5 + Math.sin(t * 0.19 + ff.phase * 2.1) * 3) * dt
                ff.vy += (Math.cos(t * 0.29 + ff.phase * 0.9) * 4 + Math.cos(t * 0.13 + ff.phase * 1.7) * 2) * dt
              }
              if (swarm && Math.hypot(ff.x - swarm.x, ff.y - swarm.y) < swarm.radius) {
                const dx = swarm.x - ff.x
                const dy = swarm.y - ff.y
                const distance = Math.hypot(dx, dy) || 1
                ff.vx += (dx / distance) * 6 * dt
                ff.vy += (dy / distance) * 6 * dt
              }
              /* 被照亮的东西会吸引附近的虫：蛾子、猫头鹰、狐狸、龙猫的灯 */
              for (const creature of creatures) {
                if (creature.reveal < 0.35) continue
                const dx = creature.x - ff.x
                const dy = creature.y - ff.y
                const distance = Math.hypot(dx, dy)
                if (distance > 6 && distance < creature.radius * 1.3) {
                  ff.vx += (dx / distance) * 9 * dt
                  ff.vy += (dy / distance) * 9 * dt
                }
              }
              /* 鼠标不再是磁铁：快速划过会在风场里留下一个短命涡旋 */
              for (const vortex of vortices) {
                const dx = ff.x - vortex.x
                const dy = ff.y - vortex.y
                const distance = Math.hypot(dx, dy)
                const reach = 40 + 120 * vortex.life
                if (distance > 1 && distance < reach) {
                  const force = (1 - distance / reach) * 190 * vortex.life * dt
                  ff.vx += (-dy / distance) * force * vortex.dir
                  ff.vy += (dx / distance) * force * vortex.dir
                }
              }
              if (settings.followMouse && mouse.active) {
                const dx = mouse.x - ff.x
                const dy = mouse.y - ff.y
                const distance = Math.hypot(dx, dy)
                if (distance < 200 && distance > 46) {
                  ff.vx += (dx / distance) * 3.2 * dt
                  ff.vy += (dy / distance) * 3.2 * dt
                } else if (distance > 4 && distance <= 46) {
                  /* 太近就退开一点：看着你，但不贴上 */
                  ff.vx -= (dx / distance) * 2.4 * dt
                  ff.vy -= (dy / distance) * 2.4 * dt
                }
              }
              ff.vx += (wind * 14 + windY * 4) * dt
              ff.vy += windY * 9 * dt
              const speed = Math.hypot(ff.vx, ff.vy)
              const limit = 22
              if (speed > limit) {
                ff.vx = (ff.vx / speed) * limit
                ff.vy = (ff.vy / speed) * limit
              }
              ff.x = clamp(ff.x + ff.vx * dt, W * 0.02, W * 0.98)
              ff.y = clamp(ff.y + ff.vy * dt, H * 0.14, H * 0.94)
              if (ff.x === W * 0.02 || ff.x === W * 0.98) ff.vx *= -0.6
              if (ff.y === H * 0.14 || ff.y === H * 0.94) ff.vy *= -0.6
              if (ff.visit > 0 && ff.target && Math.hypot(ff.target.x - ff.x, ff.target.y - ff.y) < 16) {
                ff.visit = 0
                ff.target = null
              }
            }
            const pulse = 0.5 + 0.5 * Math.sin(t * ff.freq * 2.2 + ff.phase)
            ff.bright = 0.34 + 0.6 * pulse
            if (!reduceMotion) {
              ff.nextFlash -= dt
              if (ff.nextFlash <= 0) {
                ff.flash = 1.0 + Math.random() * 0.8
                ff.nextFlash = 7 + Math.random() * 14
              }
            }
            if (ff.flash > 0) ff.bright = Math.max(ff.bright, 1.2 + Math.min(1, ff.flash) * 0.8)

            /* 落-歇-飞：飞一阵子就挑最近的一根草叶尖歇下来 */
            ff.flyLeft -= dt
            if (ff.flyLeft <= 0 && tips.length > 0 && !ff.target) {
              let best = null
              let bestDistance = Infinity
              for (let i = 0; i < tips.length; i += 3) {
                const tip = tips[i]
                const distance = Math.abs(tip.x - ff.x) + Math.abs(tip.y - ff.y) * 0.6
                if (distance < bestDistance) {
                  bestDistance = distance
                  best = tip
                }
              }
              if (best && bestDistance < W * 0.5) {
                ff.mode = 'rest'
                ff.x = best.x
                ff.y = best.y
                ff.home = { x: best.x, y: best.y }
                ff.vx = 0
                ff.vy = 0
                ff.restLeft = 7 + Math.random() * 18
                ff.bright = Math.max(ff.bright, 0.5)
              } else {
                ff.flyLeft = 2 + Math.random() * 3
              }
            }
          } else {
            const pulse = 0.5 + 0.5 * Math.sin(t * ff.freq * 1.5 + ff.phase)
            ff.bright = 0.3 + 0.34 * pulse
            /* 落下来时慢慢贴到叶尖上，不瞬移；苏醒阶段从草里往上浮出来 */
            if (ff.home) {
              const targetY = ff.home.y + (introActive ? (1 - intro) * 12 : 0)
              const dx = ff.home.x - ff.x
              const dy = targetY - ff.y
              if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                const k = Math.min(1, dt * 5)
                ff.x += dx * k
                ff.y += dy * k
              } else {
                ff.x = ff.home.x
                ff.y = targetY
              }
            }
            ff.restLeft -= dt
            if (ff.restLeft <= 0 && !reduceMotion) {
              ff.mode = 'fly'
              ff.flyLeft = 7 + Math.random() * 14
              ff.vx = (Math.random() - 0.5) * 8
              ff.vy = -1.5 - Math.random() * 4
            }
          }
          ff.bright *= clamp(settings.brightness, 0.5, 1.5)
          ff.bright *= (1 - weather.rain * 0.45) * (0.78 + 0.22 * nightDensity(nightPhase))
          if (introActive) ff.bright *= intro
        }

        /* 对闪：离得近又相位接近的两只同步闪两下，然后各自飞开 */
        for (let i = 0; i < fireflies.length; i++) {
          const ff = fireflies[i]
          if (ff.mode !== 'fly' || ff.blinkCooldown > 0 || ff.flash > 0) continue
          if (Math.random() > dt * 0.4) continue
          for (let j = i + 1; j < fireflies.length; j++) {
            const other = fireflies[j]
            if (other.mode !== 'fly' || other.blinkCooldown > 0) continue
            const distance = Math.hypot(other.x - ff.x, other.y - ff.y)
            if (distance > 8 && distance < 70 && Math.abs(other.phase - ff.phase) < 0.55) {
              ff.flash = 1.25
              other.flash = 1.25
              ff.blinkCooldown = 18 + Math.random() * 22
              other.blinkCooldown = 18 + Math.random() * 22
              break
            }
          }
        }

        for (const creature of creatures) {
          let light = 0
          for (const ff of fireflies) {
            const dx = ff.x - creature.x
            const dy = ff.y - creature.y
            const distanceSquared = dx * dx + dy * dy
            if (distanceSquared > creature.radius * creature.radius) continue
            const distance = Math.sqrt(distanceSquared)
            const value = ff.bright * (1 - distance / creature.radius)
            if (value > light) light = value
          }
          const threshold = creature.type === 'owl' ? 0.55 - clamp(settings.owl, 0, 1) * 0.2 : 0.42
          if (light > threshold && creature.cooldown <= 0 && creature.hold <= 0) {
            creature.hold = creature.type === 'owl' ? 2.6 : 1.5
            creature.cooldown = creature.type === 'owl' ? 8 + (1 - clamp(settings.owl, 0, 1)) * 18 : 4 + Math.random() * 6
          }
          if (creature.hold > 0) {
            creature.reveal = Math.min(1, creature.reveal + dt * 1.7)
            creature.hold -= dt
          } else {
            creature.reveal = Math.max(0, creature.reveal - dt * 0.6)
          }
          creature.cooldown = Math.max(0, creature.cooldown - dt)
        }
      }

      function drawCreature(creature) {
        if (creature.reveal < 0.02) {
          return
        }
        if (creature.type === 'owl') drawOwl(creature)
        else drawMoth(creature)
      }

      function drawOwl(creature) {
        const x = creature.x
        const y = creature.y
        const s = creature.scale
        const a = creature.reveal
        const faint = 0
        const bodyAlpha = Math.max(clamp((a - 0.3) / 0.7, 0, 1), faint)
        if (bodyAlpha > 0.01) {
          g.fillStyle = `rgba(4, 7, 5, ${(0.95 * bodyAlpha).toFixed(3)})`
          g.beginPath()
          g.ellipse(x, y + 8 * s, 15 * s, 20 * s, 0, 0, TAU)
          g.fill()
          g.beginPath()
          g.ellipse(x, y - 7 * s, 12 * s, 11 * s, 0, 0, TAU)
          g.fill()
          g.beginPath()
          g.moveTo(x - 11 * s, y - 12 * s)
          g.lineTo(x - 5 * s, y - 21 * s)
          g.lineTo(x - 1 * s, y - 9 * s)
          g.closePath()
          g.fill()
          g.beginPath()
          g.moveTo(x + 11 * s, y - 12 * s)
          g.lineTo(x + 5 * s, y - 21 * s)
          g.lineTo(x + 1 * s, y - 9 * s)
          g.closePath()
          g.fill()
        }
        const eyeAlpha = Math.min(1, a * 1.9)
        const pulse = 0.72 + 0.28 * Math.sin(t * 1.6 + creature.phase)
        g.save()
        g.globalCompositeOperation = 'lighter'
        for (const side of [-1, 1]) {
          const ex = x + side * 5.5 * s
          const ey = y - 8 * s
          const glow = g.createRadialGradient(ex, ey, 0, ex, ey, 16 * s)
          glow.addColorStop(0, `rgba(255, 212, 120, ${(0.5 * eyeAlpha * pulse).toFixed(3)})`)
          glow.addColorStop(0.4, `rgba(255, 196, 96, ${(0.16 * eyeAlpha * pulse).toFixed(3)})`)
          glow.addColorStop(1, 'rgba(255, 196, 96, 0)')
          g.fillStyle = glow
          g.beginPath()
          g.arc(ex, ey, 16 * s, 0, TAU)
          g.fill()
          g.fillStyle = `rgba(255, 242, 196, ${(0.95 * eyeAlpha).toFixed(3)})`
          g.beginPath()
          g.arc(ex, ey, 2.2 * s, 0, TAU)
          g.fill()
          g.fillStyle = `rgba(18, 12, 6, ${(0.9 * eyeAlpha).toFixed(3)})`
          g.beginPath()
          g.arc(ex, ey, 1.0 * s, 0, TAU)
          g.fill()
        }
        g.restore()
      }

      function drawMoth(creature) {
        const x = creature.x
        const y = creature.y
        const s = creature.scale
        const a = creature.reveal
        const flap = Math.sin(t * 16 + creature.phase)
        g.save()
        g.translate(x, y)
        g.fillStyle = `rgba(9, 13, 10, ${(0.95 * a).toFixed(3)})`
        for (const side of [-1, 1]) {
          g.save()
          g.rotate(side * (0.35 + 0.25 * flap))
          g.beginPath()
          g.ellipse(side * 5 * s, 0, 7 * s, 4 * s, 0, 0, TAU)
          g.fill()
          g.restore()
        }
        g.beginPath()
        g.ellipse(0, s, 1.3 * s, 4 * s, 0, 0, TAU)
        g.fill()
        g.restore()
      }

      function makeVisitorByType(type) {
        const pool = [
          ['hedgehog', 0.4, makeHedgehog],
          ['redpanda', 0.3, makeRedPanda],
          ['raccoon', 0.3, makeRaccoon]
        ]
        /* 预览页会点名要某一只；正式环境走权重随机 */
        if (type) {
          const picked = pool.find(([kind]) => kind === type)
          if (picked) return picked[2]()
        }
        const candidates = pool.filter(([kind]) => kind !== lastVisitorType)
        const list = candidates.length > 0 ? candidates : pool
        let total = 0
        for (const [, weight] of list) total += weight
        let roll = Math.random() * total
        for (const [, weight, make] of list) {
          roll -= weight
          if (roll <= 0) return make()
        }
        return list[list.length - 1][2]()
      }

      function makeWalker(type, options) {
        const scale = Math.max(0.8, Math.min(W, H) / 850) * (options.scale || 1)
        const fireflies = []
        for (let i = 0; i < (options.fireflies || 0); i++) {
          fireflies.push({
            dx: -22 + Math.random() * 52,
            dy: -30 + Math.random() * 24,
            phase: Math.random() * TAU
          })
        }
        return {
          type,
          x: -100,
          y: H - (options.lift || 16) * scale,
          vx: options.speed,
          margin: 120,
          scale,
          phase: 0,
          fireflies
        }
      }

      function makeHedgehog() {
        return makeWalker('hedgehog', { speed: 15 + Math.random() * 6, fireflies: 3, scale: 1.12, lift: 10 })
      }

      function makeRedPanda() {
        return makeWalker('redpanda', { speed: 26 + Math.random() * 8, fireflies: 6, scale: 1.1, lift: 12 })
      }

      function makeRaccoon() {
        return makeWalker('raccoon', { speed: 23 + Math.random() * 8, fireflies: 5, scale: 1.05, lift: 12 })
      }

      function drawVisitor() {
        if (!visitor) return
        if (drawAnimalSprite(visitor)) return
        if (visitor.type === 'hedgehog') drawHedgehogVector(visitor)
      }

      function drawVisitorBase(v, glowColor) {
        const { x, y, scale: s } = v
        g.fillStyle = 'rgba(0, 0, 0, 0.32)'
        g.beginPath()
        g.ellipse(x + 2 * s, y + 14 * s, 28 * s, 4.5 * s, 0, 0, TAU)
        g.fill()
        g.save()
        g.globalCompositeOperation = 'lighter'
        const glow = g.createRadialGradient(x, y - 12 * s, 0, x, y - 12 * s, 88 * s)
        glow.addColorStop(0, glowColor)
        glow.addColorStop(1, 'rgba(255, 190, 110, 0)')
        g.fillStyle = glow
        g.beginPath()
        g.arc(x, y - 12 * s, 88 * s, 0, TAU)
        g.fill()
        g.restore()
      }

      function drawVisitorFireflies(v) {
        if (!v.fireflies || v.fireflies.length === 0) return
        const { x, y, scale: s } = v
        const bob = Math.sin(v.phase * 9) * 1.1 * s
        g.save()
        g.globalCompositeOperation = 'lighter'
        for (const ff of v.fireflies) {
          const fx = x + ff.dx * s + Math.sin(v.phase * 2 + ff.phase) * 2 * s
          const fy = y + ff.dy * s + bob + Math.cos(v.phase * 2 + ff.phase) * 2 * s
          const brightness = 0.5 + 0.5 * Math.sin(v.phase * 3 + ff.phase)
          const radius = 8 * s
          const fg = g.createRadialGradient(fx, fy, 0, fx, fy, radius)
          fg.addColorStop(0, `rgba(190, 255, 120, ${(0.5 * brightness).toFixed(3)})`)
          fg.addColorStop(1, 'rgba(190, 255, 120, 0)')
          g.fillStyle = fg
          g.beginPath()
          g.arc(fx, fy, radius, 0, TAU)
          g.fill()
          g.fillStyle = `rgba(245, 255, 205, ${(0.85 * brightness).toFixed(3)})`
          g.beginPath()
          g.arc(fx, fy, 1.4 * s, 0, TAU)
          g.fill()
        }
        g.restore()
      }

      function tintedSprite(type) {
        const sprite = sprites[type]
        if (!sprite) return null
        const key = `${Math.floor(nightPhase * 12)}:${lightMode ? 1 : 0}`
        if (sprite.tinted && sprite.tintKey === key) return sprite.tinted
        if (!sprite.tinted) sprite.tinted = document.createElement('canvas')
        sprite.tinted.width = sprite.image.naturalWidth
        sprite.tinted.height = sprite.image.naturalHeight
        const c = sprite.tinted.getContext('2d')
        c.clearRect(0, 0, sprite.tinted.width, sprite.tinted.height)
        c.drawImage(sprite.image, 0, 0)
        const mood = nightMood(nightPhase)
        const dark = clamp(0.14 + mood.deep * 0.3 + moonlight * 0.05 + (lightMode ? 0.1 : 0), 0, 0.6)
        c.globalCompositeOperation = 'source-atop'
        c.fillStyle = `rgba(10, 16, 22, ${dark.toFixed(3)})`
        c.fillRect(0, 0, sprite.tinted.width, sprite.tinted.height)
        c.globalCompositeOperation = 'source-over'
        sprite.tintKey = key
        return sprite.tinted
      }

      function drawAnimalSprite(v) {
        const sprite = sprites[v.type]
        if (!sprite) return false
        const image = sprite.image
        if (!image.complete || !image.naturalWidth) return false
        const sheet = tintedSprite(v.type)
        const s = v.scale
        const frameW = image.naturalWidth / sprite.frames
        const frameH = image.naturalHeight
        const height = sprite.height * s
        const width = (frameW / frameH) * height
        const bob = Math.sin(v.phase * 9) * 0.8 * s
        const frame = Math.floor(t * 9) % sprite.frames
        g.save()
        g.globalAlpha = 0.94
        g.drawImage(sheet, frame * frameW, 0, frameW, frameH, v.x - width / 2, v.y + 6 * s - height + bob, width, height)
        g.restore()
        drawVisitorFireflies(v)
        return true
      }

      function drawHedgehogVector(v) {
        const { x, y, scale: s } = v
        const walk = Math.sin(v.phase * 9)
        const bob = Math.abs(walk) * 1.2 * s
        drawVisitorBase(v, 'rgba(255, 185, 120, 0.09)')

        /* 脚 */
        for (const [dx, lift] of [[-6, Math.max(0, walk) * 2.5], [6, Math.max(0, -walk) * 2.5]]) {
          g.fillStyle = '#a9764f'
          g.beginPath()
          g.ellipse(x + dx * s, y + 6 * s - lift * s, 5.4 * s, 3.6 * s, 0, 0, TAU)
          g.fill()
        }

        /* 刺：先铺一层深色刺被，再放射出刺 */
        g.fillStyle = '#4a3118'
        g.beginPath()
        g.ellipse(x, y - 24 * s - bob, 15.5 * s, 13 * s, 0, 0, TAU)
        g.fill()
        for (let i = 0; i < 38; i++) {
          const angle = Math.PI * 0.82 + (i / 37) * Math.PI * 1.36
          const bx = x + Math.cos(angle) * 13 * s
          const by = y - 24 * s - bob + Math.sin(angle) * 11 * s
          g.strokeStyle = i % 3 === 0 ? '#8f6a41' : '#5a3d22'
          g.lineWidth = (1.5 + (i % 2) * 0.6) * s
          g.lineCap = 'round'
          g.beginPath()
          g.moveTo(bx, by)
          g.lineTo(bx + Math.cos(angle) * 7.5 * s, by + Math.sin(angle) * 7.5 * s)
          g.stroke()
        }

        /* 身体：米色 */
        const body = g.createLinearGradient(x, y - 36 * s, x, y + 4 * s)
        body.addColorStop(0, '#e4c9a2')
        body.addColorStop(1, '#c9a878')
        g.fillStyle = body
        g.beginPath()
        g.ellipse(x, y - 17 * s - bob, 13 * s, 15 * s, 0, 0, TAU)
        g.fill()

        /* 头 */
        g.fillStyle = '#f5e5ca'
        g.beginPath()
        g.arc(x + 1 * s, y - 40 * s - bob, 11.5 * s, 0, TAU)
        g.fill()

        /* 耳朵 */
        for (const side of [-1, 1]) {
          g.fillStyle = '#e3cba8'
          g.beginPath()
          g.arc(x + side * 9 * s, y - 49 * s - bob, 3.4 * s, 0, TAU)
          g.fill()
        }

        /* 大眼睛 */
        for (const side of [-1, 1]) {
          g.fillStyle = '#241a12'
          g.beginPath()
          g.arc(x + side * 4.6 * s, y - 42 * s - bob, 2.9 * s, 0, TAU)
          g.fill()
          g.fillStyle = 'rgba(255, 255, 255, 0.9)'
          g.beginPath()
          g.arc(x + side * 4.6 * s - 0.9 * s, y - 43.2 * s - bob, 0.9 * s, 0, TAU)
          g.fill()
        }

        /* 鼻子与微笑 */
        g.fillStyle = '#2c211a'
        g.beginPath()
        g.ellipse(x + 1 * s, y - 36 * s - bob, 2.6 * s, 2 * s, 0, 0, TAU)
        g.fill()
        g.strokeStyle = 'rgba(90, 68, 50, 0.7)'
        g.lineWidth = 1 * s
        g.beginPath()
        g.arc(x + 1 * s, y - 35 * s - bob, 3 * s, 0.2 * Math.PI, 0.8 * Math.PI)
        g.stroke()

        drawVisitorFireflies(v)
      }

      function draw() {
        g.clearRect(0, 0, W, H)
        g.drawImage(layer, 0, 0, W, H)

        const seasonTint = season === 'autumn' ? 'rgba(190, 120, 60, 0.05)' : season === 'winter' ? 'rgba(120, 160, 210, 0.06)' : season === 'spring' ? 'rgba(180, 120, 140, 0.04)' : 'rgba(80, 150, 100, 0.02)'
        g.fillStyle = seasonTint
        g.fillRect(0, 0, W, H)
        const mood = nightMood(nightPhase)
        if (mood.dusk > 0) {
          g.fillStyle = `rgba(70, 96, 78, ${(mood.dusk * 0.06).toFixed(3)})`
          g.fillRect(0, 0, W, H)
        }
        if (mood.deep > 0.02) {
          g.fillStyle = `rgba(0, 0, 0, ${(mood.deep * 0.16).toFixed(3)})`
          g.fillRect(0, 0, W, H)
        }
        if (mood.dawn > 0) {
          g.fillStyle = `rgba(74, 104, 132, ${(mood.dawn * 0.16).toFixed(3)})`
          g.fillRect(0, 0, W, H)
        }
        if (weather.rain > 0.02) {
          g.fillStyle = `rgba(40, 70, 90, ${(weather.rain * 0.14).toFixed(3)})`
          g.fillRect(0, 0, W, H)
        }
        if (lightMode) {
          /* 浅色外观：一层灰蓝的晨雾压在画面上 */
          g.fillStyle = 'rgba(176, 192, 196, 0.12)'
          g.fillRect(0, 0, W, H)
          g.fillStyle = `rgba(196, 210, 212, ${(0.05 + mood.dawn * 0.04).toFixed(3)})`
          g.fillRect(0, 0, W, H)
        }

        drawGrass(g)
        drawWebs(g)

        g.save()
        g.globalCompositeOperation = 'lighter'
        const shrineGlow = g.createRadialGradient(shrine.x - 52 * shrine.scale, shrine.y - 14 * shrine.scale, 0, shrine.x - 52 * shrine.scale, shrine.y - 14 * shrine.scale, 50 * shrine.scale)
        shrineGlow.addColorStop(0, 'rgba(255, 200, 120, 0.22)')
        shrineGlow.addColorStop(1, 'rgba(255, 200, 120, 0)')
        g.fillStyle = shrineGlow
        g.beginPath()
        g.arc(shrine.x - 52 * shrine.scale, shrine.y - 14 * shrine.scale, 50 * shrine.scale, 0, TAU)
        g.fill()
        const hollowGlow = g.createRadialGradient(camphor.hollow.x, camphor.hollow.y, 0, camphor.hollow.x, camphor.hollow.y, camphor.hollow.r * 3)
        hollowGlow.addColorStop(0, 'rgba(255, 210, 140, 0.18)')
        hollowGlow.addColorStop(1, 'rgba(255, 210, 140, 0)')
        g.fillStyle = hollowGlow
        g.beginPath()
        g.arc(camphor.hollow.x, camphor.hollow.y, camphor.hollow.r * 3, 0, TAU)
        g.fill()
        const mushroomGlow = g.createRadialGradient(shrine.x + 64 * shrine.scale, shrine.y, 0, shrine.x + 64 * shrine.scale, shrine.y, 26 * shrine.scale)
        mushroomGlow.addColorStop(0, 'rgba(150, 220, 160, 0.16)')
        mushroomGlow.addColorStop(1, 'rgba(150, 220, 160, 0)')
        g.fillStyle = mushroomGlow
        g.beginPath()
        g.arc(shrine.x + 64 * shrine.scale, shrine.y, 26 * shrine.scale, 0, TAU)
        g.fill()
        g.restore()

        if (meteor) {
          g.save()
          g.globalCompositeOperation = 'lighter'
          const meteorTail = g.createLinearGradient(meteor.x, meteor.y, meteor.x - meteor.vx * 0.12, meteor.y - meteor.vy * 0.12)
          meteorTail.addColorStop(0, `rgba(220, 240, 255, ${(0.8 * meteor.life).toFixed(3)})`)
          meteorTail.addColorStop(1, 'rgba(220, 240, 255, 0)')
          g.strokeStyle = meteorTail
          g.lineWidth = 2
          g.beginPath()
          g.moveTo(meteor.x, meteor.y)
          g.lineTo(meteor.x - meteor.vx * 0.12, meteor.y - meteor.vy * 0.12)
          g.stroke()
          g.restore()
        }

        if (train) {
          const tw = W * 0.34
          const th = H * 0.045
          g.save()
          g.globalAlpha = 0.45
          g.fillStyle = '#020403'
          g.fillRect(train.x, train.y, tw, th)
          for (let i = 0; i < 7; i++) {
            g.fillStyle = 'rgba(255, 210, 130, 0.55)'
            g.fillRect(train.x + tw * (0.08 + i * 0.12), train.y + th * 0.25, tw * 0.05, th * 0.3)
          }
          g.restore()
        }


        if (!reduceMotion) {
          const drift = 4 + gust * 26
          const fogAlpha = 0.035 + mood.deep * 0.045 + nightDew(nightPhase) * 0.03
          const fogLayers = Math.max(1, 3 - lod)
          for (let i = 0; i < fogLayers; i++) {
            const span = W + 620
            const x = (((t * drift * (1 + i * 0.35) + i * 340) % span) + span) % span - 310
            const y = H * (0.56 + i * 0.12) + windY * 20
            const fog = g.createRadialGradient(x, y, 0, x, y, W * 0.4)
            fog.addColorStop(0, `rgba(110, 150, 120, ${fogAlpha.toFixed(3)})`)
            fog.addColorStop(1, 'rgba(110, 150, 120, 0)')
            g.fillStyle = fog
            g.beginPath()
            g.ellipse(x, y, W * 0.4, H * 0.1, 0, 0, TAU)
            g.fill()
          }
        }

        for (const creature of creatures) drawCreature(creature)

        g.save()
        g.globalCompositeOperation = 'lighter'
        for (const ff of fireflies) {
          if (ff.bright <= 0.01) continue
          const b = Math.min(1.6, ff.bright)
          const radius = 6 + 18 * Math.min(1, b) * ff.size
          const tint = mixRgb([178, 255, 120], [255, 214, 130], ff.temp || 0)
          const rgb = `${tint[0]}, ${tint[1]}, ${tint[2]}`
          const glow = g.createRadialGradient(ff.x, ff.y, 0, ff.x, ff.y, radius)
          glow.addColorStop(0, `rgba(${rgb}, ${(0.42 * b).toFixed(3)})`)
          glow.addColorStop(0.35, `rgba(${rgb}, ${(0.16 * b).toFixed(3)})`)
          glow.addColorStop(1, `rgba(${rgb}, 0)`)
          g.fillStyle = glow
          g.beginPath()
          g.arc(ff.x, ff.y, radius, 0, TAU)
          g.fill()
          g.fillStyle = `rgba(245, 255, 205, ${(0.9 * Math.min(1, b)).toFixed(3)})`
          g.beginPath()
          g.arc(ff.x, ff.y, 1.2 + 1.6 * Math.min(1, b), 0, TAU)
          g.fill()
        }
        g.restore()

        /* 将明时分，草叶尖上开始有露水 */
        const dew = Math.max(nightDew(nightPhase), lightMode ? 0.45 : 0)
        if (dew > 0.02 && tips.length > 0) {
          g.save()
          g.globalCompositeOperation = 'lighter'
          const limit = Math.min(tips.length, 240)
          for (let i = 0; i < limit; i += 2) {
            const tip = tips[i]
            const alpha = dew * 0.16 * (0.55 + 0.45 * Math.sin(t * 1.6 + i))
            if (alpha <= 0.002) continue
            g.fillStyle = `rgba(190, 220, 235, ${alpha.toFixed(3)})`
            g.beginPath()
            g.arc(tip.x, tip.y - 0.5, 1.1, 0, TAU)
            g.fill()
          }
          g.restore()
        }

        if (visitor) drawVisitor()

        for (const sprite of soot) {
          g.fillStyle = 'rgba(4, 4, 4, 0.9)'
          g.beginPath()
          g.arc(sprite.x, sprite.y, sprite.size, 0, TAU)
          g.fill()
          g.beginPath()
          g.arc(sprite.x - sprite.size * 0.6, sprite.y - sprite.size * 0.4, sprite.size * 0.6, 0, TAU)
          g.fill()
          g.beginPath()
          g.arc(sprite.x + sprite.size * 0.6, sprite.y - sprite.size * 0.4, sprite.size * 0.6, 0, TAU)
          g.fill()
          g.fillStyle = 'rgba(240, 240, 230, 0.95)'
          g.beginPath()
          g.arc(sprite.x - sprite.size * 0.35, sprite.y - sprite.size * 0.15, sprite.size * 0.18, 0, TAU)
          g.fill()
          g.beginPath()
          g.arc(sprite.x + sprite.size * 0.35, sprite.y - sprite.size * 0.15, sprite.size * 0.18, 0, TAU)
          g.fill()
        }

        for (const spirit of kodama) {
          if (!spirit.visible) continue
          const kx = spirit.x
          const ky = spirit.y
          const bob = Math.sin(t * 1.2 + spirit.phase) * 2
          g.fillStyle = 'rgba(235, 235, 225, 0.85)'
          g.beginPath()
          g.ellipse(kx, ky + bob, 7, 9, 0, 0, TAU)
          g.fill()
          g.fillStyle = 'rgba(20, 20, 20, 0.9)'
          g.beginPath()
          g.arc(kx - 2.5, ky - 1 + bob, 1.3, 0, TAU)
          g.fill()
          g.beginPath()
          g.arc(kx + 2.5, ky - 1 + bob, 1.3, 0, TAU)
          g.fill()
          g.beginPath()
          g.arc(kx, ky + 4 + bob, 1, 0, TAU)
          g.fill()
        }

        for (const particle of seasonParticles) {
          if (season === 'winter') {
            g.fillStyle = 'rgba(230, 240, 255, 0.55)'
            g.beginPath()
            g.arc(particle.x, particle.y, particle.size, 0, TAU)
            g.fill()
          } else {
            g.fillStyle = season === 'spring' ? 'rgba(230, 170, 180, 0.45)' : 'rgba(210, 150, 80, 0.5)'
            g.save()
            g.translate(particle.x, particle.y)
            g.rotate(particle.rot + Math.sin(t + particle.phase) * 0.6)
            g.beginPath()
            g.ellipse(0, 0, particle.size * 1.8, particle.size * 0.8, 0, 0, TAU)
            g.fill()
            g.restore()
          }
        }

        /* 被风卷起来的叶子与种子 */
        for (const item of lifted) {
          const alpha = Math.min(1, item.life / item.maxLife) * (item.seed ? 0.35 : 0.45)
          if (alpha <= 0.01) continue
          g.save()
          g.translate(item.x, item.y)
          g.rotate(item.rot)
          if (item.seed) {
            g.fillStyle = `rgba(214, 206, 168, ${alpha.toFixed(3)})`
            g.beginPath()
            g.arc(0, 0, item.size * 0.45, 0, TAU)
            g.fill()
          } else {
            g.fillStyle = `rgba(150, 128, 74, ${alpha.toFixed(3)})`
            g.beginPath()
            g.ellipse(0, 0, item.size * 1.6, item.size * 0.7, 0, 0, TAU)
            g.fill()
          }
          g.restore()
        }

        if (weather.rain > 0.01) {
          g.save()
          g.strokeStyle = `rgba(170, 200, 220, ${(0.55 * weather.rain).toFixed(3)})`
          g.lineWidth = 1
          for (const drop of rainDrops) {
            g.beginPath()
            g.moveTo(drop.x, drop.y)
            g.lineTo(drop.x - wind * 6, drop.y + drop.len)
            g.stroke()
          }
          g.restore()
        }
        if (flash > 0) {
          g.fillStyle = `rgba(220, 235, 255, ${(flash * 0.16).toFixed(3)})`
          g.fillRect(0, 0, W, H)
        }
      }

      function frame(now) {
        if (!alive) return
        raf = requestAnimationFrame(frame)
        if (!visible) return
        if (!lastDraw) {
          lastDraw = now
          return
        }
        const elapsed = now - lastDraw
        if (elapsed < 33) return
        const dt = Math.min(0.06, elapsed / 1000)
        lastDraw = now
        t += dt

        /* 自适应 LOD：量的是「这一帧画了多久」，不是帧间隔——本设计本来就锁 30fps，
           用间隔判断会永远判成掉帧。预算 33ms，超过 14ms 就开始降级。 */
        try {
          const started = performance.now()
          update(dt)
          draw()
          const cost = performance.now() - started
          frameAvg = frameAvg * 0.9 + cost * 0.1
          if (frameAvg > 14) {
            recoverTimer = 0
            lodTimer += dt
            if (lodTimer > 2 && lod < 3) {
              lod += 1
              lodTimer = 0
            }
          } else if (frameAvg < 8) {
            lodTimer = 0
            recoverTimer += dt
            if (recoverTimer > 25 && lod > 0) {
              lod -= 1
              recoverTimer = 0
            }
          }
        } catch (error) {
          console.warn('[firefly-forest] frame failed', error)
          alive = false
          stop()
        }
      }

      function start() {
        if (raf) return
        lastDraw = 0
        raf = requestAnimationFrame(frame)
      }

      function stop() {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
      }

      function scheduleResize() {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          resizeTimer = 0
          if (alive) build()
        }, 180)
      }

      function onVisibility() {
        visible = document.visibilityState !== 'hidden'
        if (visible) start()
        else stop()
      }

      function onMouseMove(event) {
        const now = performance.now()
        if (pointer.t > 0 && now > pointer.t && now - pointer.t < 120) {
          const dx = event.clientX - pointer.x
          const dy = event.clientY - pointer.y
          const speed = Math.hypot(dx, dy) / ((now - pointer.t) / 1000)
          if (settings.followMouse && !reduceMotion && speed > 620) {
            vortices.push({ x: event.clientX, y: event.clientY, life: 1, dir: dx >= 0 ? 1 : -1 })
            if (vortices.length > 4) vortices.shift()
          }
        }
        pointer = { x: event.clientX, y: event.clientY, t: now }
        mouse.x = event.clientX
        mouse.y = event.clientY
        mouse.active = true
        mouse.time = t
      }

      build()
      start()
      window.addEventListener('resize', scheduleResize)
      window.addEventListener('mousemove', onMouseMove)
      document.addEventListener('visibilitychange', onVisibility)

      return {
        rebuildFireflies() {
          makeFireflies()
        },
        refreshSeason() {
          season = resolvedSeason(settings.season)
          makeSeasonParticles()
          makeFireflies()
        },
        summon(type, atX) {
          pendingVisitorType = type || null
          pendingVisitorX = typeof atX === 'number' ? atX : null
          /* 立刻把当前这只撤掉：以前只把倒计时清零，画面上的那只不会变，
             看着就像“每次召唤都一样” */
          visitor = null
          nextVisitor = 0
        },
        summonTrain() {
          train = { x: -W * 0.4, y: H * 0.56, vx: W * 0.02, windows: 6 }
        },
        summonRain() {
          weather.target = 1
          weather.rain = Math.max(weather.rain, 0.6)
          weather.next = 150
          flash = 0.9
        },
        night() {
          return nightPhase
        },
        visitor() {
          return visitor ? visitor.type : null
        },
        lunar() {
          return { phase: lunarPhase, moonlight }
        },
        refreshTheme() {
          lightMode = readLightMode()
          paintLayer()
          lastPaintBucket = Math.floor(nightPhase * 12)
        },
        skipNight() {
          phaseBoost = Math.min(0.45, phaseBoost + 0.2)
        },
        dispose() {
          alive = false
          stop()
          window.removeEventListener('resize', scheduleResize)
          window.removeEventListener('mousemove', onMouseMove)
          document.removeEventListener('visibilitychange', onVisibility)
          if (resizeTimer) clearTimeout(resizeTimer)
          canvas.remove()
          if (sceneCanvas === canvas) sceneCanvas = null
        }
      }
    }

    function nightLabel(phase, lunar) {
      const base = phase < 0.28
        ? '入夜 · 风还带着白天的暖'
        : phase < 0.72
          ? '深夜 · 雾压得最低'
          : phase < 0.9
            ? '将明 · 草叶上开始有露水'
            : '天快亮了 · 只剩零星几只'
      if (!lunar) return base
      const moon = moonName(lunar.phase)
      const detail = lunar.moonlight > 0.75 ? `${moon} · 月光太亮，虫会少` : `${moon} · 月光 ${Math.round(lunar.moonlight * 100)}%`
      return `${base}　${detail}`
    }

    function FireflyPanel() {
      const [, setTick] = React.useState(0)
      React.useEffect(() => {
        const listener = () => setTick((value) => value + 1)
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      }, [])
      React.useEffect(() => {
        const id = setInterval(() => setTick((value) => value + 1), 4000)
        return () => clearInterval(id)
      }, [])

      const labels = {
        brightness: '萤火虫亮度',
        density: '萤火虫密度',
        owl: '猫头鹰出现频率',
        transparency: '界面透明化'
      }
      const hints = {
        brightness: '整体光点的明暗',
        density: '同时在场的萤火虫数量',
        owl: '越频繁，飞近树枝的次数越多',
        transparency: '越低，森林越明显'
      }
      const formats = {
        brightness: (value) => `${Math.round(value * 100)}%`,
        density: (value) => `${value.toFixed(1)}×`,
        owl: (value) => `${Math.round(value * 100)}%`,
        transparency: (value) => `${Math.round(value * 100)}%`
      }

      const cardStyle = {
        width: 'min(560px, 100%)',
        margin: '0 auto',
        padding: '22px 24px 20px',
        borderRadius: '16px',
        border: '1px solid rgba(190, 230, 170, 0.16)',
        background: 'rgba(8, 14, 10, 0.62)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 24px 70px rgba(0, 0, 0, 0.45)',
        color: '#e6efe0'
      }
      const rowStyle = {
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: '14px',
        padding: '10px 0',
        borderBottom: '1px solid rgba(190, 230, 170, 0.10)'
      }
      const labelStyle = { fontSize: '13px', color: '#cfdfc4' }
      const hintStyle = { fontSize: '11px', color: '#8fa886', marginTop: '2px' }
      const valueStyle = { fontSize: '12px', color: '#9fb894', fontVariantNumeric: 'tabular-nums' }
      const buttonStyle = {
        appearance: 'none',
        border: '1px solid rgba(190, 230, 170, 0.28)',
        background: 'rgba(150, 210, 120, 0.10)',
        color: '#dcead2',
        padding: '7px 14px',
        borderRadius: '9px',
        fontSize: '12.5px',
        cursor: 'pointer'
      }

      const slider = (key) => h(
        'div',
        { key, style: rowStyle },
        h(
          'div',
          null,
          h('div', { style: labelStyle }, labels[key]),
          h('div', { style: hintStyle }, hints[key])
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          h('input', {
            type: 'range',
            min: key === 'brightness' ? 0.5 : key === 'density' ? 0.5 : key === 'owl' ? 0 : 0.35,
            max: key === 'brightness' ? 1.5 : key === 'density' ? 2 : key === 'owl' ? 1 : 0.9,
            step: key === 'transparency' ? 0.01 : 0.05,
            value: settings[key],
            onChange: (event) => save({ [key]: Number(event.target.value) }),
            style: { width: '150px', accentColor: '#b7f57a' }
          }),
          h('span', { style: valueStyle }, formats[key](settings[key]))
        )
      )

      const scheme = themeApi && typeof themeApi.getTheme === 'function'
        ? themeApi.getTheme().active.colorScheme
        : 'dark'
      const phase = scene && typeof scene.night === 'function' ? scene.night() : 0
      const lunar = scene && typeof scene.lunar === 'function' ? scene.lunar() : null
      const nightRow = h(
        'div',
        {
          style: { ...rowStyle, cursor: 'pointer' },
          title: '点一下，让森林往前走过一个时相',
          onClick: () => {
            if (scene && typeof scene.skipNight === 'function') scene.skipNight()
          }
        },
        h('div', null, h('div', { style: labelStyle }, '夜之流'), h('div', { style: hintStyle }, nightLabel(phase, lunar))),
        h(
          'div',
          {
            style: {
              width: '104px',
              height: '2px',
              borderRadius: '999px',
              background: 'rgba(190, 230, 170, 0.16)',
              overflow: 'hidden'
            }
          },
          h('div', {
            style: {
              width: `${Math.max(2, Math.round(phase * 100))}%`,
              height: '100%',
              background: '#b7f57a',
              transition: 'width 1.2s linear'
            }
          })
        )
      )

      return h(
        'div',
        { style: { height: '100%', minHeight: '100%', overflow: 'auto', padding: '28px 20px 40px', boxSizing: 'border-box' } },
        h(
          'div',
          { style: cardStyle },
          h(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' } },
            h('h2', { style: { margin: 0, fontSize: '18px', fontWeight: 500, letterSpacing: '0.02em' } }, '萤火森林'),
            h('span', { style: { fontSize: '11px', color: '#8fa886' } }, 'FIREFLY FOREST')
          ),
          h(
            'p',
            { style: { margin: '8px 0 14px', fontSize: '12.5px', lineHeight: 1.7, color: '#b9cbb0' } },
            '暗色灌木林、草丛里的萤火虫，偶尔照亮蛾子或树枝上的猫头鹰。'
          ),
          h(
            'label',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0 12px',
                borderBottom: '1px solid rgba(190, 230, 170, 0.10)',
                cursor: 'pointer'
              }
            },
            h('span', { style: { fontSize: '13px', color: '#dfead7' } }, '启用环境背景'),
            h('input', {
              type: 'checkbox',
              checked: !!settings.enabled,
              onChange: (event) => save({ enabled: event.target.checked }),
              style: { width: '18px', height: '18px', accentColor: '#b7f57a' }
            })
          ),
          h(
            'label',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: '1px solid rgba(190, 230, 170, 0.10)',
                cursor: 'pointer'
              }
            },
            h('span', { style: { fontSize: '13px', color: '#dfead7' } }, '叠加到界面上（看不到背景时用）'),
            h('input', {
              type: 'checkbox',
              checked: !!settings.overlay,
              onChange: (event) => save({ overlay: event.target.checked }),
              style: { width: '18px', height: '18px', accentColor: '#b7f57a' }
            })
          ),
          nightRow,
          slider('brightness'),
          slider('density'),
          slider('owl'),
          slider('transparency'),
          h(
            'label',
            { style: rowStyle },
            h('div', null, h('div', { style: labelStyle }, '季节'), h('div', { style: hintStyle }, '自动按月份，也可以手动选择')),
            h('select', {
              value: settings.season,
              onChange: (event) => save({ season: event.target.value }),
              style: { background: '#0d120e', color: '#dfead7', border: '1px solid rgba(190, 230, 170, 0.2)', borderRadius: '6px', padding: '6px 8px', fontSize: '12px' }
            },
              h('option', { value: 'auto' }, '自动'),
              h('option', { value: 'spring' }, '春 · 花'),
              h('option', { value: 'summer' }, '夏 · 萤'),
              h('option', { value: 'autumn' }, '秋 · 叶'),
              h('option', { value: 'winter' }, '冬 · 雪')
            )
          ),
          h(
            'label',
            { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(190, 230, 170, 0.10)', cursor: 'pointer' } },
            h('span', { style: labelStyle }, '允许扰动'),
            h('input', { type: 'checkbox', checked: settings.followMouse !== false, onChange: (event) => save({ followMouse: event.target.checked }), style: { width: '18px', height: '18px', accentColor: '#b7f57a' } })
          ),
          h(
            'div',
            { style: rowStyle },
            h('div', null, h('div', { style: labelStyle }, '环境音'), h('div', { style: hintStyle }, '蟋蟀、风、雨与远处的猫头鹰（默认关闭）')),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
              h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: settings.volume, onChange: (event) => save({ volume: Number(event.target.value) }), style: { width: '80px', accentColor: '#b7f57a' } }),
              h('input', { type: 'checkbox', checked: !!settings.sound, onChange: (event) => save({ sound: event.target.checked }), style: { width: '18px', height: '18px', accentColor: '#b7f57a' } })
            )
          ),
          h(
            'div',
            { style: { marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
            h('button', {
              type: 'button',
              style: buttonStyle,
              onClick: () => {
                if (scene && typeof scene.summon === 'function') scene.summon()
              }
            }, '现在召唤一只小动物'),
            h('button', {
              type: 'button',
              style: buttonStyle,
              onClick: () => {
                if (scene && typeof scene.summonTrain === 'function') scene.summonTrain()
              }
            }, '让远处的列车经过'),
            h('button', {
              type: 'button',
              style: buttonStyle,
              onClick: () => {
                if (scene && typeof scene.summonRain === 'function') scene.summonRain()
              }
            }, '下一场雨'),
            h('span', { style: { fontSize: '11.5px', color: '#8fa886' } }, '动物每 2–5 分钟路过；列车和雨都是彩蛋。')
          ),
          h(
            'div',
            { style: { marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
            h('button', {
              type: 'button',
              style: buttonStyle,
              onClick: () => {
                try {
                  if (themeApi && typeof themeApi.setTheme === 'function') themeApi.setTheme('dark')
                } catch {
                  /* the theme service may not be ready */
                }
              }
            }, '切换为深色外观'),
            h('span', { style: { fontSize: '11.5px', color: '#8fa886' } },
              scheme === 'light'
                ? '当前是浅色外观，森林会显得更淡；点左侧按钮切到深色效果最完整。'
                : '深色外观下效果最完整。'
            )
          ),
          h('p', { style: { margin: '14px 0 0', fontSize: '11px', color: '#7f9477' } },
            '设置保存在当前浏览器；关闭开关或卸载插件即可恢复原界面。'
          )
        )
      )
    }

    function apply(ctx) {
      themeApi = ctx.theme || null
      try {
        syncEffect()
      } catch (error) {
        console.error('[firefly-forest] failed to start', error)
        throw error
      }
      ctx.effect(() => {
        const onTheme = () => {
          try {
            if (scene && typeof scene.refreshTheme === 'function') scene.refreshTheme()
          } catch {
            /* the scene may already be gone */
          }
          notify()
        }
        const off = ctx.on ? ctx.on('theme/change', onTheme) : undefined
        return () => {
          if (typeof off === 'function') off()
        }
      })
      const registerPanel = (scope) => {
        try {
          return scope.effect(() => scope.desktopWorkbenches.register({
            title: '萤火森林',
            description: '暗色灌木林、萤火虫与夜行小动物的环境背景',
            customFrame: true
          }, FireflyPanel))
        } catch (error) {
          console.warn('[firefly-forest] workbench panel unavailable', error)
          return null
        }
      }
      /* Desktop 上 desktopWorkbenches 由注入给出；这里先试探一次，读不到就等它出现。
         读取本身包在 try 里：cordis 对未注入的服务可能直接抛错，不能让它带走整个插件。 */
      let hasWorkbenches = false
      try {
        hasWorkbenches = !!ctx.desktopWorkbenches
      } catch {
        hasWorkbenches = false
      }
      if (hasWorkbenches) {
        registerPanel(ctx)
      } else if (typeof ctx.inject === 'function') {
        ctx.inject(['desktopWorkbenches'], (scoped) => registerPanel(scoped))
      }
      ctx.effect(() => () => {
        if (scene) {
          scene.dispose()
          scene = null
        }
        clearOverrides()
        removeStyle()
        stopAudio()
      })
    }

    return { apply, inject: ['theme', 'desktopWorkbenches'] }
  }
})
