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
