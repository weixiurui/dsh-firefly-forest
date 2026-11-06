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

    /* 小刺猬的六帧行走图：由 小刺猬.gif 抽 6 帧、去白底、拼成横表再压成 WebP。
       内联成 data URL，避免依赖宿主的静态资源路由；加载失败会自动退回矢量版。 */
    const HEDGEHOG_SPRITE_FRAMES = 6
    const HEDGEHOG_SPRITE = 'data:image/webp;base64,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'

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
      /* 小刺猬的行走精灵图：加载成功就用它，失败退回矢量版 */
      const hedgehogSheet = new Image()
      hedgehogSheet.decoding = 'async'
      hedgehogSheet.src = HEDGEHOG_SPRITE
      let hedgehogTinted = null
      let hedgehogTintKey = ''

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
        const eyeAlpha = Math.max(Math.min(1, a * 1.9), lamp * 1.1)
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
        /* 现在只有小刺猬一种，type 只用来做预览点名 */
        return makeHedgehog()
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

      function drawVisitor() {
        if (visitor) drawHedgehog(visitor)
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

      function tintedHedgehogSheet() {
        const key = `${Math.floor(nightPhase * 12)}:${lightMode ? 1 : 0}`
        if (hedgehogTinted && hedgehogTintKey === key) return hedgehogTinted
        if (!hedgehogTinted) hedgehogTinted = document.createElement('canvas')
        hedgehogTinted.width = hedgehogSheet.naturalWidth
        hedgehogTinted.height = hedgehogSheet.naturalHeight
        const c = hedgehogTinted.getContext('2d')
        c.clearRect(0, 0, hedgehogTinted.width, hedgehogTinted.height)
        c.drawImage(hedgehogSheet, 0, 0)
        const mood = nightMood(nightPhase)
        const dark = clamp(0.14 + mood.deep * 0.3 + moonlight * 0.05 + (lightMode ? 0.1 : 0), 0, 0.6)
        c.globalCompositeOperation = 'source-atop'
        c.fillStyle = `rgba(10, 16, 22, ${dark.toFixed(3)})`
        c.fillRect(0, 0, hedgehogTinted.width, hedgehogTinted.height)
        c.globalCompositeOperation = 'source-over'
        hedgehogTintKey = key
        return hedgehogTinted
      }

      function drawHedgehogSprite(v) {
        const { x, y, scale: s } = v
        const sheet = tintedHedgehogSheet()
        const frameW = hedgehogSheet.naturalWidth / HEDGEHOG_SPRITE_FRAMES
        const frameH = hedgehogSheet.naturalHeight
        const height = 64 * s
        const width = (frameW / frameH) * height
        const bob = Math.sin(v.phase * 9) * 0.8 * s
        const frame = Math.floor(t * 9) % HEDGEHOG_SPRITE_FRAMES
        g.save()
        g.globalAlpha = 0.94
        g.drawImage(sheet, frame * frameW, 0, frameW, frameH, x - width / 2, y + 6 * s - height + bob, width, height)
        g.restore()
        drawVisitorFireflies(v)
      }

      function drawHedgehog(v) {
        const sheetReady = hedgehogSheet.complete && hedgehogSheet.naturalWidth > 0
        if (sheetReady) {
          drawHedgehogSprite(v)
          return
        }
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
