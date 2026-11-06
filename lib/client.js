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
