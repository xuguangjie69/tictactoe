/**
 * 战绩存储（唯一碰 Feature API 的模块）
 * 页面里不要直接 import storage，统一从这里走，方便失败降级。
 */

const KEY = 'TTT_SAVE_V1'

// 内存镜像：预渲染 / storage 不可用时仍能正常玩，只是关掉进程后战绩不保留。
// mode: 0=人机对战 1=双人模式（同桌轮流落子，无 AI 参与）。
const mem = {
  level: 1,
  mode: 0,
  win: 0,
  lose: 0,
  draw: 0,
  streak: 0
}

let ready = false

function now() {
  return Date.now()
}

/** 应用启动时调用（app.ux onCreate）。同步读，读到就写进内存镜像。 */
export function loadSave() {
  try {
    const storage = $feature('blueos.storage.storage')
    const raw = storage.getItemSync(KEY)
    if (raw) {
      const o = JSON.parse(raw)
      if (o && typeof o === 'object') {
        mem.level = o.level === 0 || o.level === 2 ? o.level : 1
        // 模式只认 0/1 两个合法值，任何脏数据（缺失/越界/旧存档）都回落成人机对战。
        mem.mode = o.mode === 1 ? 1 : 0
        mem.win = o.win | 0
        mem.lose = o.lose | 0
        mem.draw = o.draw | 0
        mem.streak = o.streak | 0
      }
    }
  } catch (e) {
    console.info('[井字棋] 读取存档失败：' + e)
  }
  ready = true
  return mem
}

export function getSave() {
  if (!ready) loadSave()
  return mem
}

/** 写入磁盘。静默失败：手表上存储异常不应该打断游戏。 */
export function saveNow() {
  try {
    const storage = $feature('blueos.storage.storage')
    storage.setItemSync(KEY, JSON.stringify({
      level: mem.level,
      mode: mem.mode,
      win: mem.win,
      lose: mem.lose,
      draw: mem.draw,
      streak: mem.streak,
      t: now()
    }))
  } catch (e) {
    console.info('[井字棋] 写存档失败：' + e)
  }
}

export function setLevel(level) {
  if (level === 0 || level === 1 || level === 2) {
    mem.level = level
    saveNow()
  }
}

/** 切换模式：0=人机对战 1=双人模式 */
export function setMode(mode) {
  if (mode === 0 || mode === 1) {
    mem.mode = mode
    saveNow()
  }
}

/**
 * 记录一局结果：'win' | 'lose' | 'draw'
 *
 * ⚠️ 只在人机对战里调用。双人模式是同桌两个人轮流下，把胜负记进
 *    「胜/负/平」战绩会让本来的个人战绩失去意义（赢了也可能算你赢不了）。
 *    页面层 finish() 已按 isDuo 拦掉，这里不重复拦——保持单一职责。
 */
export function record(result) {
  if (result === 'win') {
    mem.win++
    mem.streak++
  } else if (result === 'lose') {
    mem.lose++
    mem.streak = 0
  } else {
    mem.draw++
  }
  saveNow()
}

export function getStreak() {
  return mem.streak
}