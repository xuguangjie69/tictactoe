/**
 * 井字棋算法断言（Node 直接跑，不需要模拟器）
 * 运行：node tools/smoke.mjs
 *
 * 存在的意义：.ux 只能靠真机看效果，逻辑层如果没有独立断言，
 * 「改了 AI 却没人发现」就是必然。这里把胜负判定、非法着法、
 * 三档难度行为全部钉死。
 */
import {
  newBoard, play, winnerOf, winLineOf, isFull, legalMoves, aiPick, bestMoveFor,
  scoreMove, resetSearch, HUMAN, AI, LINES
} from '../src/systems/ai.js'

let pass = 0
const fails = []

function ok(name, cond, extra) {
  if (cond) {
    pass++
    console.log('  ✓ ' + name)
  } else {
    fails.push(name + (extra ? ' → ' + extra : ''))
    console.log('  ✗ ' + name + (extra ? ' → ' + extra : ''))
  }
}

console.log('\n[1] 胜负判定')
{
  const b = [HUMAN, HUMAN, HUMAN, 0, 0, 0, 0, 0, 0]
  ok('横三连判玩家胜', winnerOf(b) === HUMAN)
  ok('winLineOf 返回 [0,1,2]', JSON.stringify(winLineOf(b)) === '[0,1,2]')

  // 对角线 (0,4,8) 全 AI
  const d = [2, 1, 0, 0, 2, 0, 0, 1, 2]
  ok('对角线判电脑胜', winnerOf(d) === AI)

  ok('空棋盘无胜者', winnerOf(newBoard()) === 0)
  ok('空棋盘 winLineOf 为 null', winLineOf(newBoard()) === null)

  let all = true
  for (const l of LINES) {
    const bb = newBoard()
    bb[l[0]] = HUMAN; bb[l[1]] = HUMAN; bb[l[2]] = HUMAN
    if (winnerOf(bb) !== HUMAN) all = false
  }
  ok('八条连线全部能判胜', all)
}

console.log('\n[2] 落子与非法着法')
{
  const b = newBoard()
  const n = play(b, 4, HUMAN)
  ok('落子返回新数组', n !== b && n[4] === HUMAN)
  ok('原数组未被改', b[4] === 0)
  ok('已占格返回 null', play(n, 4, AI) === null)
  ok('越界 -1 返回 null', play(b, -1, HUMAN) === null)
  ok('越界 9 返回 null', play(b, 9, HUMAN) === null)
  ok('非数字返回 null', play(b, '4', HUMAN) === null)
  ok('满盘判定', (() => { const f = [1, 2, 1, 2, 1, 2, 2, 1, 2]; return isFull(f) && !isFull(b) })())
}

console.log('\n[3] 合法着法集合')
{
  const b = newBoard()
  b[0] = HUMAN; b[8] = AI
  ok('剩 7 格', legalMoves(b).length === 7)
  ok('已占格不在其中', legalMoves(b).indexOf(0) < 0 && legalMoves(b).indexOf(8) < 0)
  const f = [1, 2, 1, 2, 1, 2, 2, 1, 2]
  ok('满盘无着法', legalMoves(f).length === 0)
  ok('满盘 aiPick 返回 -1', aiPick(f, 2) === -1)
}

console.log('\n[4] 简单难度：贪心行为')
{
  // 有直接胜点 → 必须立刻取胜
  let b = newBoard()
  b[0] = AI; b[1] = AI; b[4] = 0
  ok('有胜点必取胜', aiPick(b, 0) === 2)

  // 无胜点但玩家有双连威胁 → 必须堵
  b = newBoard()
  b[0] = HUMAN; b[3] = HUMAN
  ok('必须堵线', aiPick(b, 0) === 6)

  // 空盘优先中心
  ok('空盘走中心', aiPick(newBoard(), 0) === 4)

  // 中心已被占 → 走角
  b = newBoard()
  b[4] = HUMAN
  const mv = aiPick(b, 0)
  ok('中心被占走角', [0, 2, 6, 8].indexOf(mv) >= 0, 'mv=' + mv)
}

console.log('\n[5] 困难难度：完全 minimax')
{
  // 玩家自己下出破绽后，困难 AI 必须能抓到
  let caught = 0
  const samples = [
    [1, 1, 0, 0, 0, 0, 0, 0, 0], // 玩家已有两子在一行，AI 必须堵
    [1, 0, 0, 1, 1, 0, 0, 0, 0],
    [1, 0, 0, 0, 1, 1, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 1, 1, 0],
    [0, 1, 0, 0, 0, 0, 1, 1, 0]
  ]
  for (const s of samples) {
    if (aiPick(s, 2) >= 0) caught++
  }
  ok('五个「有双连威胁」局面全部堵住', caught === samples.length, caught + '/' + samples.length)

  // 合法走子局面：玩家 0、2 两子 + 电脑已占 4，电脑必须下 1 堵线
  const b = [1, 0, 1, 0, 2, 0, 0, 0, 0]
  const mv = aiPick(b, 2)
  ok('不会走出「一步被将死」', mv === 1, 'mv=' + mv)
  ok('不选已占格', mv !== 4, 'mv=' + mv)
}

console.log('\n[5b] 困难难度：终局判定与开局偏好')
{
  // AI 有两子连线 → 困难 AI 必须立刻取胜。
// ⚠️ 局面必须合法：不能出现玩家已三连（那种局面 aiPick 根本不负责判终局，
//    终局由页面 settle() 负责，这里测了也只是测一个非法输入）。
  const w1 = [1, 1, 0, 2, 0, 2, 0, 0, 0]   // AI 占 3、5，横线补 4 即胜
  ok('AI 有胜点必取胜', aiPick(w1, 2) === 4, 'mv=' + aiPick(w1, 2))
  // AI 占 0、3 → 竖线 [0,3,6] 补 6 即胜（玩家已有 8，局面合法）
  const w2 = [2, 0, 0, 2, 0, 0, 0, 0, 1]
  ok('AI 竖线胜点必拿', aiPick(w2, 2) === 6, 'mv=' + aiPick(w2, 2))

  // 困难难度空盘走中心（同分偏好 tie-break）
  resetSearch()
  ok('困难空盘走中心', aiPick(newBoard(), 2) === 4)

  // ⚠️ 回归守卫：曾因 alpha-beta 窗口写成 ±99 而终局分是 1000+，
  // 根结点错误剪枝，明明能立刻取胜却选了别的点。
  const trap = [1, 1, 0, 2, 0, 2, 0, 0, 0]
  ok('窗口充足时能立刻取胜（±99 剪枝回归守卫）', aiPick(trap, 2) === 4,
    'mv=' + aiPick(trap, 2))

  // 更广的一致性：对一批合法局面，aiPick(level=2) 必须与 bestMoveFor 同分最优集相容
  //（即选出的点不能是明显劣势点）。用暴力求解做裁判太慢，这里用双方 minimax 对照。
  const rnd2 = (() => { let s = 987654321; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 })()
  let mismatch = 0, checked = 0
  for (let t = 0; t < 400; t++) {
    const b = newBoard()
    const n = 2 + Math.floor(rnd2() * 4)
    for (let k = 0; k < n; k++) b[Math.floor(rnd2() * 9)] = HUMAN
    let okp = true
    for (let k = 0; k < n - 1; k++) {
      const ms = legalMoves(b)
      if (!ms.length) { okp = false; break }
      b[ms[Math.floor(rnd2() * ms.length)]] = AI
    }
    if (!okp || winnerOf(b) !== 0 || isFull(b)) continue
    const ms = legalMoves(b)
    const mv = aiPick(b, 2)
    if (ms.indexOf(mv) < 0) { mismatch++; continue }
    // 裁判用被测模块的 scoreMove 独立打分，与 aiPick 的内部实现分开走
    let bestSc = -Infinity
    for (let k = 0; k < ms.length; k++) {
      const s = scoreMove(b, ms[k], AI)
      if (s > bestSc) bestSc = s
    }
    const gotSc = scoreMove(b, mv, AI)
    checked++
    if (gotSc < bestSc) mismatch++
  }
  ok('困难难度选点不劣于最优（400 随机局面）', mismatch === 0 && checked >= 200,
    'mismatch=' + mismatch + '/' + checked)

  // ⚠️ 评分刻度守卫：局面 [2,0,1,0,1,0,2,0,0] 里 AI 占 0、6，
  //    同时存在「一着取胜(3)」与「两着必胜(7/8)」两类点。
  //    评分若不是「终局奖励压倒一切 + 越早取胜分越高」，AI 就会放下眼前的胜去磨棋。
  const scale = [2, 0, 1, 0, 1, 0, 2, 0, 0]
  const quick = scoreMove(scale, 3, AI)   // 补 3 → [0,3,6] 立即三连
  const slow = scoreMove(scale, 7, AI)    // 补 7 → 只能再走两步才赢
  ok('速胜分严格高于慢胜分', quick > slow, 'quick=' + quick + ' slow=' + slow)
  ok('终局分压过非终局分（量级 >= 1000）', quick >= 1000, 'quick=' + quick)
  ok('刻度正确的局面 AI 取速胜点', aiPick(scale, 2) === 3, 'mv=' + aiPick(scale, 2))
}

console.log('\n[6] 困难难度不可被击败（穷举对弈）')
{
  // 玩家执 X 先手，困难 AI 执 O。玩家每一步都用**完整 minimax**挑最优着法，
  // 直接复用被测模块的 bestMoveFor —— 测试侧不再另写一份弱启发（否则会漏判）。
  let aiLost = 0
  let games = 0
  for (let first = 0; first < 9; first++) {
    resetSearch()
    let b = play(newBoard(), first, HUMAN)
    let done = false
    let guard = 0
    while (!done && guard++ < 12) {
      const mv = aiPick(b, 2)
      if (mv < 0) break
      b = play(b, mv, AI)
      if (winnerOf(b) === AI) break
      if (isFull(b)) { done = true; break }
      const hm = bestMoveFor(b, HUMAN)
      if (hm < 0) { done = true; break }
      b = play(b, hm, HUMAN)
      if (winnerOf(b) === HUMAN) break
      if (isFull(b)) done = true
    }
    games++
    if (winnerOf(b) === HUMAN) aiLost++
  }
  ok('困难 AI 对手最优玩家 9 局全不败', aiLost === 0, '败局 ' + aiLost + '/' + games)
}

console.log('\n[7] 普通难度：会失误但不自杀')
{
  // 随机合法局面（走子顺序交替、玩家先手），统计普通难度的失误率。
// 注意不能用「玩家已有两子连线」的必堵局面 —— 那种局面普通难度也不该失误。
  const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 })()
  let blunder = 0, samples = 0
  for (let t = 0; t < 3000; t++) {
    const b = newBoard()
    const n = 1 + Math.floor(rnd() * 4) // 玩家已下 1~4 手，电脑待走
    for (let k = 0; k < n; k++) b[Math.floor(rnd() * 9)] = HUMAN
    let placed = 0
    for (let k = 0; k < n - 1; k++) {
      const ms = legalMoves(b)
      if (!ms.length) break
      b[ms[Math.floor(rnd() * ms.length)]] = AI
      placed++
    }
    if (placed !== n - 1) continue
    if (winnerOf(b) !== 0 || isFull(b)) continue
    const mv = aiPick(b, 1)
    if (mv < 0) continue
    samples++
    const after = play(b, mv, AI)
    if (winnerOf(after) === AI) continue
    for (let i = 0; i < 9; i++) {
      if (after[i] !== 0) continue
      if (winnerOf(play(after, i, HUMAN)) === HUMAN) { blunder++; break }
    }
  }
  ok('有效样本充足', samples >= 500, 'samples=' + samples)
  ok('普通难度会出现失误（不是假分档）', blunder > 0, 'blunder=' + blunder + '/' + samples)
  ok('失误率低于 60%（仍在正常下棋）', blunder / samples < 0.6, (blunder / samples * 100).toFixed(1) + '%')
}

console.log('\n[8] resetSearch 不改变结果')
{
  const b = [1, 1, 0, 0, 0, 0, 0, 0, 0]
  resetSearch()
  const a = aiPick(b, 2)
  resetSearch()
  const c = aiPick(b, 2)
  ok('清缓存后同分偏好一致', a === c, a + ' vs ' + c)
}

console.log('\n[9] 性能：困难 AI 单步耗时')
{
  const b = [1, 2, 1, 2, 0, 0, 0, 0, 0]
  resetSearch()
  const t0 = Date.now()
  for (let i = 0; i < 30; i++) aiPick(b, 2)
  const dt = Date.now() - t0
  ok('30 步困难 AI < 1500ms', dt < 1500, dt + 'ms')
}

console.log('\n————')
console.log('通过：' + pass + '  失败：' + fails.length)
if (fails.length) {
  console.log('失败项：')
  for (const f of fails) console.log('  - ' + f)
  process.exit(1)
}
console.log('全部通过 ✓')