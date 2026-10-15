/**
 * 井字棋核心逻辑（纯逻辑，零 BlueOS 依赖）
 * —— 这样 tools/smoke.mjs 能在 Node 里直接 import 跑断言，不需要模拟器。
 *
 * 约定：board 是长度 9 的数组，取值 0=空 / 1=玩家(执 X) / 2=电脑(执 O)
 */

export const EMPTY = 0
export const HUMAN = 1
export const AI = 2

/** 八条胜利连线（下标索引） */
export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
]

export function newBoard() {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0]
}

/** 返回 0=未分胜负 1=玩家胜 2=电脑胜 */
export function winnerOf(b) {
  for (let i = 0; i < 8; i++) {
    const l = LINES[i]
    const v = b[l[0]]
    if (v !== 0 && v === b[l[1]] && v === b[l[2]]) return v
  }
  return 0
}

/** 返回获胜连线的下标数组，没胜则 null */
export function winLineOf(b) {
  for (let i = 0; i < 8; i++) {
    const l = LINES[i]
    const v = b[l[0]]
    if (v !== 0 && v === b[l[1]] && v === b[l[2]]) return l
  }
  return null
}

export function isFull(b) {
  for (let i = 0; i < 9; i++) if (b[i] === 0) return false
  return true
}

export function legalMoves(b) {
  const out = []
  for (let i = 0; i < 9; i++) if (b[i] === 0) out.push(i)
  return out
}

/**
 * 下棋。返回新的 board 数组（不改原数组）。
 * 非法下法（格子已被占 / 越界）返回 null。
 */
export function play(b, i, who) {
  if (typeof i !== 'number' || i < 0 || i > 8) return null
  if (b[i] !== 0) return null
  const next = b.slice()
  next[i] = who
  return next
}

/* ------------------------------------------------------------------ *
 * 极小化极大搜索（negamax + alpha-beta）
 * 井字棋只有 9! = 362880 种局面，全量搜索在手表上也毫无压力。
 *
 * ⚠️ 评分刻度（踩过的坑，勿改）：
 * 终局奖励必须**压过任何非终局分数**（WIN_BASE=1000），
 * 并且**越早取胜分越高**（+ (9 - depth)，depth 是已走子数）。
 * 两个反例都真踩过：
 * ① 刻度只有 10 分时，「三步后必胜」盖过「立即三连」——AI 放着眼前的胜不拿；
 * ② 用 `+ 剩余空位` 当速胜偏好，方向正好反了（空位越少=胜得越晚=分越高），
 *    同样让 AI 放弃眼前的胜。
 * ------------------------------------------------------------------ */

const WIN_BASE = 1000

/**
 * 搜索入口。
 *
 * ⚠️ 两个必守的约定（都踩过）：
 * 1) 窗口必须用 ±Infinity，**不能**用 ±99 之类的常数。
 *    WIN_BASE=1000 的终局分一旦超出窗口，根结点会在 `alpha >= beta` 处
 *    错误剪枝，明明能立即取胜（分 1004）却被判成劣势（分 99）。
 * 2) **不要**给 negamax 加记忆化缓存。alpha-beta 返回的是「窗口内的界」，
 *    不是精确值；把它按 (局面,行棋方) 存下来，别的窗口命中时就会当成精确分用，
 *    结果是错的。井字棋只有 9! 种局面，不缓存也完全够快。
 */
const INF = 1e9

/**
 * 从当前视角（turn 方）评估局面。
 * 返回 { score, move }：score 为正 = turn 方占优。
 */
function negamax(b, turn, alpha, beta) {
  const w = winnerOf(b)
  // 步数直接从盘面算（countFilled），不靠 depth 入参：不同调用方的起始 depth 不同，
  // 靠入参会算错刻度。ply 越小 = 胜得越早 → 奖励越高。
  // ⚠️ 这里绝不能用「剩余空位」当速胜项：空位越少恰恰说明胜得越晚。
  const ply = countFilled(b)
  if (w === turn) return { score: WIN_BASE + (9 - ply), move: -1 }
  if (w === (3 - turn)) return { score: -(WIN_BASE + (9 - ply)), move: -1 }
  if (isFull(b)) return { score: 0, move: -1 }

  let best = -INF
  let bestMove = -1
  for (let i = 0; i < 9; i++) {
    if (b[i] !== 0) continue
    b[i] = turn
    // negamax 的核心约定：子结点从「对方视角」评估，取负后才是当前方视角
    const r = negamax(b, 3 - turn, -beta, -alpha)
    b[i] = 0
    const sc = -r.score
    if (sc > best) {
      best = sc
      bestMove = i
    }
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return { score: best, move: bestMove }
}

function countFilled(b) {
  let n = 0
  for (let i = 0; i < 9; i++) if (b[i] !== 0) n++
  return n
}

/**
 * 兼容旧调用：早前版本有模块级记忆化缓存，现已移除（alpha-beta 的返回值是
 * 「窗口内的界」，存下来当精确分用会算错）。保留空实现，
 * 让页面层的「重开一局」调用不必改。
 */
export function resetSearch() {
}

/**
 * 指定一方在该局面下的最优着法（完整 minimax）。
 * 游戏逻辑用不到，导出给 tools/smoke.mjs 当「尽力而为的玩家」做对弈穷举，
 * 避免测试侧再写一份弱启发而漏判。
 */
export function bestMoveFor(b, who) {
  const moves = legalMoves(b)
  if (!moves.length) return -1
  let best = -INF
  let bestMove = -1
  for (let i = 0; i < moves.length; i++) {
    const trial = b.slice()
    trial[moves[i]] = who
    const s = -negamax(trial, 3 - who, -INF, INF).score
    if (s > best) {
      best = s
      bestMove = moves[i]
    }
  }
  return bestMove
}

/**
 * 给「who 走下标 cell 这一手」打分（who 视角，越大越好）。cell 非法返回 -INF。
 * 游戏逻辑用不到，导出给 tools/smoke.mjs 当独立裁判 ——
 * 测试侧绝不复制一份 negamax（复制出来的两份会各自漂移，比不出真 bug）。
 */
export function scoreMove(b, cell, who) {
  if (typeof cell !== 'number' || cell < 0 || cell > 8 || b[cell] !== 0) return -INF
  const trial = b.slice()
  trial[cell] = who
  return -negamax(trial, 3 - who, -INF, INF).score
}

/**
 * AI 选棋。
 * level: 0=简单 1=普通 2=困难
 * 返回下标；无合法着法返回 -1。
 *
 * 设计意图：
 * - 简单：优先赢，否则堵住玩家的下一步必胜点，再随机。
 * - 普通：minimax 的最优着里随机挑（仍不会主动送棋，但偶尔不堵最佳点）。
 * - 困难：完全 minimax，玩家只要自己失误就赢不了。
 */
export function aiPick(b, level) {
  const moves = legalMoves(b)
  if (!moves.length) return -1

  // ---- 简单：不搜索，走「先赢 > 堵线 > 中心 > 随机」
  if (level === 0) {
    for (let i = 0; i < moves.length; i++) {
      b[moves[i]] = AI
      const w = winnerOf(b)
      b[moves[i]] = 0
      if (w === AI) return moves[i]
    }
    // 堵住玩家能立刻连成三格的位置
    for (let i = 0; i < moves.length; i++) {
      b[moves[i]] = HUMAN
      const w = winnerOf(b)
      b[moves[i]] = 0
      if (w === HUMAN) return moves[i]
    }
    const center = 4
    if (b[center] === 0) return center
    const corners = [0, 2, 6, 8]
    for (let i = 0; i < corners.length; i++) if (b[corners[i]] === 0) return corners[i]
    return moves[Math.floor(Math.random() * moves.length)]
  }

  // ---- 普通：大概率最优，但有一定概率走一步非最优（真人感更强）
  if (level === 1 && Math.random() < 0.28) {
    // 即便失误，也绝不主动送掉一个「玩家下完就赢」的点
    let safe = []
    for (let i = 0; i < moves.length; i++) {
      const t1 = b.slice(); t1[moves[i]] = AI
      if (winnerOf(t1) === AI) continue
      const t2 = b.slice(); t2[moves[i]] = HUMAN
      if (winnerOf(t2) === HUMAN) continue
      safe.push(moves[i])
    }
    const pool = safe.length ? safe : moves
    return pool[Math.floor(Math.random() * pool.length)]
  }

  // ---- 困难：完全 minimax，玩家只要自己失误就赢不了。
  // 逐着法算精确分，再收集所有同分局（同分说明都最优），按偏好挑好看的那个。
  let bestScore = -INF
  const best = []
  for (let i = 0; i < moves.length; i++) {
    const s = scoreMove(b, moves[i], AI)
    if (s > bestScore) {
      bestScore = s
      best.length = 0
      best.push(moves[i])
    } else if (s === bestScore) {
      best.push(moves[i])
    }
  }
  // 同分时偏好中心/角，棋形更好看
  const pref = [4, 0, 2, 6, 8, 1, 3, 5, 7]
  for (let i = 0; i < pref.length; i++) if (best.indexOf(pref[i]) >= 0) return pref[i]
  return best.length ? best[0] : moves[0]
}
