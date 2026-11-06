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
      let lod = 0
      let frameAvg = 16
      let lodTimer = 0
      let recoverTimer = 0
      let intro = 1
      let introActive = false
      let introDone = false
      let stuckCheck = 0

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
          visitor = Math.random() < 0.55 ? makeFox() : makeTotoro()
          nextVisitor = 120 + Math.random() * 180
        }
        if (visitor) {
          visitor.phase += dt
          visitor.x += visitor.vx * dt
          if (visitor.type === 'totoro') {
            visitor.lamp.x = visitor.x + 34 * visitor.scale
            visitor.lamp.y = visitor.y - 80 * visitor.scale
          }
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
          if (visitor && visitor.type === 'totoro') targets.push({ x: visitor.lamp.x, y: visitor.lamp.y })
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
          if (visitor && visitor.type === 'totoro') {
            const distance = Math.hypot(sprite.x - visitor.lamp.x, sprite.y - visitor.lamp.y)
            if (distance < 140) sprite.x += (sprite.x < visitor.lamp.x ? -1 : 1) * 60 * dt
          }
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
              if (visitor && visitor.type === 'totoro') {
                const dx = visitor.lamp.x - ff.x
                const dy = visitor.lamp.y - ff.y
                const distance = Math.hypot(dx, dy)
                if (distance > 8 && distance < 150) {
                  ff.vx += (dx / distance) * 7 * dt
                  ff.vy += (dy / distance) * 7 * dt
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
          if (creature.type !== 'owl' || lampLightAt(creature.x, creature.y) < 0.03) return
        }
        if (creature.type === 'owl') drawOwl(creature)
        else drawMoth(creature)
      }

      function drawOwl(creature) {
        const x = creature.x
        const y = creature.y
        const s = creature.scale
        const a = creature.reveal
        const lamp = lampLightAt(x, y)
        const faint = lamp * 0.8
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

      function makeFox() {
        const scale = Math.max(0.9, Math.min(W, H) / 850)
        const fireflies = []
        for (let i = 0; i < 16; i++) {
          fireflies.push({
            dx: -26 + Math.random() * 60,
            dy: -34 + Math.random() * 34,
            phase: Math.random() * TAU
          })
        }
        return {
          type: 'fox',
          x: -80,
          y: H - 16 * scale,
          vx: 34 + Math.random() * 12,
          margin: 100,
          scale,
          phase: 0,
          fireflies
        }
      }

      function makeTotoro() {
        const scale = Math.max(1.15, Math.min(W, H) / 780)
        return {
          type: 'totoro',
          x: -160,
          y: H - 18 * scale,
          vx: 17 + Math.random() * 6,
          margin: 180,
          scale,
          phase: 0,
          lamp: { x: 0, y: 0, r: Math.min(W, H) * 0.65 }
        }
      }

      function lampLightAt(x, y) {
        if (!visitor || visitor.type !== 'totoro') return 0
        const lamp = visitor.lamp
        const distance = Math.hypot(x - lamp.x, y - lamp.y)
        if (distance >= lamp.r) return 0
        return 1 - distance / lamp.r
      }

      function drawLanternLight(v) {
        const lamp = v.lamp
        const x = lamp.x
        const y = lamp.y
        const r = lamp.r
        g.save()
        g.beginPath()
        g.arc(x, y, r, 0, TAU)
        g.clip()
        g.globalCompositeOperation = 'lighter'
        const warm = g.createRadialGradient(x, y, 0, x, y, r)
        warm.addColorStop(0, 'rgba(255, 210, 140, 0.30)')
        warm.addColorStop(0.45, 'rgba(255, 195, 120, 0.12)')
        warm.addColorStop(1, 'rgba(255, 195, 120, 0)')
        g.fillStyle = warm
        g.fillRect(x - r, y - r, r * 2, r * 2)
        g.globalCompositeOperation = 'source-over'
        g.fillStyle = 'rgba(160, 125, 82, 0.18)'
        for (const tree of trees) {
          if (tree.x < x - r - tree.w * 4 || tree.x > x + r + tree.w * 4) continue
          const canopyY = tree.topY + (tree.baseY - tree.topY) * 0.3
          g.beginPath()
          g.ellipse(tree.x, canopyY, tree.w * 3.4, (tree.baseY - tree.topY) * 0.2, 0, 0, TAU)
          g.fill()
          g.fillRect(tree.x - tree.w * 0.5, tree.topY, tree.w, tree.baseY - tree.topY)
        }
        g.restore()
      }

      function drawVisitor() {
        if (!visitor) return
        if (visitor.type === 'fox') drawFox(visitor)
        else drawTotoro(visitor)
      }

      function drawFox(v) {
        const x = v.x
        const y = v.y
        const s = v.scale
        const walk = Math.sin(v.phase * 9)
        const bob = walk * 1.2 * s

        g.fillStyle = 'rgba(0, 0, 0, 0.35)'
        g.beginPath()
        g.ellipse(x + 2 * s, y + 17 * s, 34 * s, 5 * s, 0, 0, TAU)
        g.fill()

        g.save()
        g.globalCompositeOperation = 'lighter'
        const glow = g.createRadialGradient(x, y - 12 * s, 0, x, y - 12 * s, 100 * s)
        glow.addColorStop(0, 'rgba(255, 190, 110, 0.16)')
        glow.addColorStop(1, 'rgba(255, 190, 110, 0)')
        g.fillStyle = glow
        g.beginPath()
        g.arc(x, y - 12 * s, 100 * s, 0, TAU)
        g.fill()
        g.restore()

        g.save()
        g.translate(x - 26 * s, y - 14 * s + bob)
        g.rotate(-0.35 + Math.sin(v.phase * 7) * 0.3)
        const tail = g.createLinearGradient(-36 * s, 0, 4 * s, 0)
        tail.addColorStop(0, '#f3e6d2')
        tail.addColorStop(0.3, '#e08a4a')
        tail.addColorStop(1, '#c96a2e')
        g.fillStyle = tail
        g.beginPath()
        g.moveTo(4 * s, -2 * s)
        g.quadraticCurveTo(-16 * s, -26 * s, -38 * s, -10 * s)
        g.quadraticCurveTo(-30 * s, 8 * s, -10 * s, 8 * s)
        g.quadraticCurveTo(-2 * s, 6 * s, 4 * s, -2 * s)
        g.closePath()
        g.fill()
        g.restore()

        g.lineCap = 'round'
        for (const [dx, swing, shade] of [[-14, walk, '#b85f2c'], [-5, -walk, '#a95427'], [12, -walk, '#b85f2c'], [20, walk, '#a95427']]) {
          g.strokeStyle = shade
          g.lineWidth = 3.4 * s
          g.beginPath()
          g.moveTo(x + dx * s, y + 2 * s + bob)
          g.lineTo(x + dx * s + swing * 5 * s, y + 16 * s)
          g.stroke()
        }

        const body = g.createLinearGradient(x, y - 26 * s, x, y + 2 * s)
        body.addColorStop(0, '#e79a58')
        body.addColorStop(0.55, '#d97a3a')
        body.addColorStop(1, '#bf632a')
        g.fillStyle = body
        g.beginPath()
        g.ellipse(x, y - 12 * s + bob, 26 * s, 14 * s, -0.08, 0, TAU)
        g.fill()

        g.fillStyle = '#f3e6d2'
        g.beginPath()
        g.ellipse(x + 10 * s, y - 8 * s + bob, 7 * s, 9 * s, 0.15, 0, TAU)
        g.fill()

        g.fillStyle = '#e08a4a'
        g.beginPath()
        g.arc(x + 24 * s, y - 24 * s + bob, 11 * s, 0, TAU)
        g.fill()
        g.fillStyle = '#f3e6d2'
        g.beginPath()
        g.ellipse(x + 33 * s, y - 21 * s + bob, 7 * s, 4.6 * s, 0.1, 0, TAU)
        g.fill()
        g.fillStyle = '#1b120a'
        g.beginPath()
        g.ellipse(x + 38 * s, y - 22 * s + bob, 1.6 * s, 1.2 * s, 0, 0, TAU)
        g.fill()
        g.strokeStyle = '#1b120a'
        g.lineWidth = 1.3 * s
        g.beginPath()
        g.arc(x + 27 * s, y - 26 * s + bob, 1.8 * s, 0.15 * Math.PI, 0.85 * Math.PI)
        g.stroke()
        g.fillStyle = '#d97a3a'
        g.beginPath()
        g.moveTo(x + 17 * s, y - 31 * s + bob)
        g.lineTo(x + 14 * s, y - 43 * s + bob)
        g.lineTo(x + 24 * s, y - 33 * s + bob)
        g.closePath()
        g.fill()
        g.fillStyle = '#8a4520'
        g.beginPath()
        g.moveTo(x + 19 * s, y - 33 * s + bob)
        g.lineTo(x + 17 * s, y - 40 * s + bob)
        g.lineTo(x + 22 * s, y - 34 * s + bob)
        g.closePath()
        g.fill()

        g.save()
        g.globalCompositeOperation = 'lighter'
        for (const ff of v.fireflies) {
          const fx = x + ff.dx * s + Math.sin(v.phase * 2 + ff.phase) * 2 * s
          const fy = y + ff.dy * s + bob + Math.cos(v.phase * 2 + ff.phase) * 2 * s
          const brightness = 0.55 + 0.45 * Math.sin(v.phase * 3 + ff.phase)
          const radius = 9 * s
          const fg = g.createRadialGradient(fx, fy, 0, fx, fy, radius)
          fg.addColorStop(0, `rgba(190, 255, 120, ${(0.55 * brightness).toFixed(3)})`)
          fg.addColorStop(1, 'rgba(190, 255, 120, 0)')
          g.fillStyle = fg
          g.beginPath()
          g.arc(fx, fy, radius, 0, TAU)
          g.fill()
          g.fillStyle = `rgba(245, 255, 205, ${(0.9 * brightness).toFixed(3)})`
          g.beginPath()
          g.arc(fx, fy, 1.5 * s, 0, TAU)
          g.fill()
        }
        g.restore()
      }

      function drawTotoro(v) {
        const x = v.x
        const y = v.y
        const s = v.scale
        const walk = Math.sin(v.phase * 4)
        const bob = Math.abs(walk) * 1.2 * s
        const lamp = v.lamp

        g.fillStyle = 'rgba(0, 0, 0, 0.38)'
        g.beginPath()
        g.ellipse(x, y + 16 * s, 46 * s, 6 * s, 0, 0, TAU)
        g.fill()

        g.fillStyle = '#5c5c57'
        g.beginPath()
        g.ellipse(x - 18 * s, y + 12 * s + Math.abs(walk) * 2 * s, 12 * s, 6 * s, 0, 0, TAU)
        g.fill()
        g.beginPath()
        g.ellipse(x + 18 * s, y + 12 * s - Math.abs(walk) * 2 * s, 12 * s, 6 * s, 0, 0, TAU)
        g.fill()

        const body = g.createLinearGradient(x, y - 60 * s, x, y + 8 * s)
        body.addColorStop(0, '#8f8f88')
        body.addColorStop(0.55, '#767670')
        body.addColorStop(1, '#5f5f5a')
        g.fillStyle = body
        g.beginPath()
        g.ellipse(x, y - 30 * s - bob, 34 * s, 34 * s, 0, 0, TAU)
        g.fill()

        const head = g.createLinearGradient(x, y - 96 * s, x, y - 46 * s)
        head.addColorStop(0, '#9a9a92')
        head.addColorStop(1, '#7a7a74')
        g.fillStyle = head
        g.beginPath()
        g.arc(x, y - 64 * s - bob, 27 * s, 0, TAU)
        g.fill()

        g.fillStyle = '#7f7f79'
        g.beginPath()
        g.moveTo(x - 24 * s, y - 84 * s - bob)
        g.lineTo(x - 30 * s, y - 108 * s - bob)
        g.lineTo(x - 8 * s, y - 86 * s - bob)
        g.closePath()
        g.fill()
        g.beginPath()
        g.moveTo(x + 24 * s, y - 84 * s - bob)
        g.lineTo(x + 30 * s, y - 108 * s - bob)
        g.lineTo(x + 8 * s, y - 86 * s - bob)
        g.closePath()
        g.fill()
        g.fillStyle = '#565650'
        g.beginPath()
        g.moveTo(x - 21 * s, y - 87 * s - bob)
        g.lineTo(x - 26 * s, y - 103 * s - bob)
        g.lineTo(x - 12 * s, y - 88 * s - bob)
        g.closePath()
        g.fill()
        g.beginPath()
        g.moveTo(x + 21 * s, y - 87 * s - bob)
        g.lineTo(x + 26 * s, y - 103 * s - bob)
        g.lineTo(x + 12 * s, y - 88 * s - bob)
        g.closePath()
        g.fill()

        if (weather.rain > 0.2) {
          g.save()
          g.translate(x - 2 * s, y - 116 * s - bob)
          const leaf = g.createLinearGradient(0, -12 * s, 0, 12 * s)
          leaf.addColorStop(0, '#4e7a48')
          leaf.addColorStop(1, '#2f4a2c')
          g.fillStyle = leaf
          g.beginPath()
          g.ellipse(0, 0, 52 * s, 14 * s, 0, 0, TAU)
          g.fill()
          g.strokeStyle = '#2f4a2c'
          g.lineWidth = 1.2 * s
          for (let i = -2; i <= 2; i++) {
            g.beginPath()
            g.moveTo(0, 0)
            g.quadraticCurveTo(i * 16 * s, -6 * s, i * 24 * s, 0)
            g.stroke()
          }
          g.strokeStyle = '#3f5a32'
          g.lineWidth = 2 * s
          g.beginPath()
          g.moveTo(0, 10 * s)
          g.lineTo(0, 36 * s)
          g.stroke()
          g.restore()
        }

        g.fillStyle = '#d9d2c1'
        g.beginPath()
        g.ellipse(x, y - 24 * s - bob, 24 * s, 26 * s, 0, 0, TAU)
        g.fill()

        g.strokeStyle = '#8c8473'
        g.lineWidth = 1.8 * s
        for (let i = 0; i < 3; i++) {
          g.beginPath()
          g.arc(x, y - 38 * s + i * 9 * s - bob, 6 * s, 0.15 * Math.PI, 0.85 * Math.PI)
          g.stroke()
        }

        g.fillStyle = '#1c1a17'
        g.beginPath()
        g.arc(x - 10 * s, y - 68 * s - bob, 4.6 * s, 0, TAU)
        g.fill()
        g.beginPath()
        g.arc(x + 10 * s, y - 68 * s - bob, 4.6 * s, 0, TAU)
        g.fill()
        g.fillStyle = 'rgba(255, 255, 255, 0.9)'
        g.beginPath()
        g.arc(x - 11 * s, y - 69.5 * s - bob, 1.6 * s, 0, TAU)
        g.fill()
        g.beginPath()
        g.arc(x + 9 * s, y - 69.5 * s - bob, 1.6 * s, 0, TAU)
        g.fill()
        g.fillStyle = '#2a2622'
        g.beginPath()
        g.ellipse(x, y - 60 * s - bob, 3 * s, 2 * s, 0, 0, TAU)
        g.fill()
        g.strokeStyle = 'rgba(40, 36, 32, 0.8)'
        g.lineWidth = 1 * s
        for (const side of [-1, 1]) {
          g.beginPath()
          g.moveTo(x + side * 14 * s, y - 62 * s - bob)
          g.lineTo(x + side * 24 * s, y - 65 * s - bob)
          g.moveTo(x + side * 14 * s, y - 60 * s - bob)
          g.lineTo(x + side * 25 * s, y - 60 * s - bob)
          g.stroke()
        }
        g.fillStyle = 'rgba(220, 140, 130, 0.22)'
        g.beginPath()
        g.ellipse(x - 17 * s, y - 62 * s - bob, 4 * s, 2.4 * s, 0, 0, TAU)
        g.fill()
        g.beginPath()
        g.ellipse(x + 17 * s, y - 62 * s - bob, 4 * s, 2.4 * s, 0, 0, TAU)
        g.fill()

        g.fillStyle = '#5f7f4a'
        g.beginPath()
        g.ellipse(x + 2 * s, y - 92 * s - bob, 7 * s, 3.6 * s, -0.35, 0, TAU)
        g.fill()
        g.strokeStyle = '#3f5a32'
        g.lineWidth = 1 * s
        g.beginPath()
        g.moveTo(x + 2 * s, y - 91 * s - bob)
        g.lineTo(x - 2 * s, y - 86 * s - bob)
        g.stroke()

        g.strokeStyle = '#6f6f69'
        g.lineWidth = 6 * s
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(x + 24 * s, y - 44 * s - bob)
        g.quadraticCurveTo(x + 34 * s, y - 60 * s - bob, lamp.x - 4 * s, lamp.y + 14 * s)
        g.stroke()

        const lx = lamp.x
        const ly = lamp.y
        g.strokeStyle = '#3a2a18'
        g.lineWidth = 1.6 * s
        g.beginPath()
        g.arc(lx, ly - 4 * s, 7 * s, Math.PI, 2 * Math.PI)
        g.stroke()
        g.fillStyle = '#4a3520'
        g.beginPath()
        g.ellipse(lx, ly + 12 * s, 7 * s, 3 * s, 0, 0, TAU)
        g.fill()
        g.fillRect(lx - 5 * s, ly + 4 * s, 10 * s, 8 * s)
        const glass = g.createLinearGradient(lx - 5 * s, ly, lx + 5 * s, ly)
        glass.addColorStop(0, 'rgba(255, 214, 130, 0.85)')
        glass.addColorStop(0.5, 'rgba(255, 240, 190, 0.98)')
        glass.addColorStop(1, 'rgba(255, 214, 130, 0.85)')
        g.fillStyle = glass
        g.beginPath()
        g.moveTo(lx - 5 * s, ly + 5 * s)
        g.lineTo(lx - 3 * s, ly - 2 * s)
        g.lineTo(lx + 3 * s, ly - 2 * s)
        g.lineTo(lx + 5 * s, ly + 5 * s)
        g.closePath()
        g.fill()
        g.fillStyle = 'rgba(255, 236, 170, 0.95)'
        g.beginPath()
        g.ellipse(lx, ly + 1 * s, 2 * s, 3.6 * s, 0, 0, TAU)
        g.fill()
        g.save()
        g.globalCompositeOperation = 'lighter'
        const glow = g.createRadialGradient(lx, ly, 0, lx, ly, 38 * s)
        glow.addColorStop(0, 'rgba(255, 220, 140, 0.55)')
        glow.addColorStop(1, 'rgba(255, 220, 140, 0)')
        g.fillStyle = glow
        g.beginPath()
        g.arc(lx, ly, 38 * s, 0, TAU)
        g.fill()
        g.restore()
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

        if (visitor && visitor.type === 'totoro') drawLanternLight(visitor)

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
        summon() {
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
