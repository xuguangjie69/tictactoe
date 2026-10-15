/**
 * 双人模式（以及人机模式回归）的页面逻辑断言
 * 运行：node tools/duo_check.mjs
 *
 * 存在的意义：
 *   .ux 的 <script> 只能靠真机/模拟器跑，而「双人模式轮流落子、结算文案、不写战绩」
 *   这三件事恰恰是最容易写错、又最难在手表上逐条验证的。
 *   这里把 index.ux 的 <script> 原样抠出来，改掉 import 路径后在 Node 里 import，
 *   用普通对象当 this 直接驱动页面方法 —— 不用模拟器就能把页面逻辑钉死。
 *
 * ⚠️ 纪律（与 neg_check / neg_lint 一致）：
 *   1. 锚点取自 index.ux 的真实文本，命中不了就大声失败，绝不静默"通过"；
 *   2. import 改写必须字符串精确匹配，改不到会让整个 harness 起不来（会报错，不会假绿）；
 *   3. temp 文件用完即删。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const ux = path.resolve(dir, '../src/pages/Index/index.ux')

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

/* ---------------- 把 index.ux 的 script 抠出来，当作真模块跑 ---------------- */

const raw = fs.readFileSync(ux, 'utf8')
const m = raw.match(/<script>([\s\S]*?)<\/script>/)
if (!m) {
  console.log('✗ 锚点未命中：index.ux 里找不到 <script>...</script>')
  process.exit(1)
}

// import 路径从「页面相对」改成「tools/ 相对」。这两条字符串必须与 index.ux 逐字符一致。
const FROM_AI = "'../../systems/ai'"
const FROM_STORE = "'../../systems/store'"
if (!m[1].includes(FROM_AI) || !m[1].includes(FROM_STORE)) {
  console.log('✗ 锚点未命中：index.ux 的 import 路径变了，请先同步本文件的改写规则')
  process.exit(1)
}
const code = m[1]
  .split(FROM_AI).join("'../src/systems/ai.js'")
  .split(FROM_STORE).join("'../src/systems/store.js'")

const tmp = path.resolve(dir, '.duo_page.mjs')
fs.writeFileSync(tmp, code)
let Page
try {
  Page = (await import(pathToFileURL(tmp).href)).default
} finally {
  fs.unlinkSync(tmp)
}

/** 造一个页面实例：data 平铺到 this 上（对齐 BlueOS 把 data 合并进实例的行为） */
function mount() {
  const inst = {}
  Object.assign(inst, Page.data)
  for (const k of Object.keys(Page)) {
    if (k !== 'data' && typeof Page[k] === 'function') inst[k] = Page[k]
  }
  inst.onInit()
  return inst
}

/** 依次落子（走 playAt，不绕过页面方法），返回实例 */
function playSeq(inst, cells) {
  for (const c of cells) inst.playAt(c)
  return inst
}

/* ---------------- 断言 ---------------- */

console.log('\n[1] 默认是人机模式，切到双人模式后互斥标志正确')
{
  const p = mount()
  ok('默认 isSolo=true', p.isSolo === true)
  ok('默认 isDuo=false', p.isDuo === false)
  ok('默认 mring0=true（人机选中）', p.mring0 === true)
  ok('默认 mring1=false', p.mring1 === false)

  p.setModeTo(1)
  ok('切双人后 isDuo=true', p.isDuo === true)
  ok('切双人后 isSolo=false', p.isSolo === false)
  ok('切双人后 mring1=true', p.mring1 === true)
  ok('切双人后 mring0=false', p.mring0 === false)
  ok('显隐变量是真正的 boolean（不是字符串/数字）',
    typeof p.isDuo === 'boolean' && typeof p.isSolo === 'boolean')

  p.setModeTo(0)
  ok('切回人机后 isSolo=true', p.isSolo === true)
  ok('切回人机后 isDuo=false', p.isDuo === false)
}

console.log('\n[2] 双人模式：X 先手，轮流落子')
{
  const p = mount()
  p.setModeTo(1)
  p.onStart()

  ok('开局提示是 X 先手', p.turnText === '轮到 X 方落子', p.turnText)
  ok('状态行点明双人模式', p.statusText === '双人模式 · X 先手', p.statusText)

  p.playAt(0)
  ok('第一手落在 0 且是 X', p.board[0] === 1, 'board[0]=' + p.board[0])
  ok('落子后轮到 O 方', p.turnText === '轮到 O 方落子', p.turnText)

  p.playAt(4)
  ok('第二手落在 4 且是 O', p.board[4] === 2, 'board[4]=' + p.board[4])
  ok('再落一子后轮回到 X 方', p.turnText === '轮到 X 方落子', p.turnText)

  // 重复点同一格：必须被忽略，且不能把回合让出去
  const before = p.turnText
  p.playAt(4)
  ok('已占格重复点击被忽略（棋子不变）', p.board[4] === 2)
  ok('已占格重复点击不翻转回合', p.turnText === before, p.turnText)
}

console.log('\n[3] 双人模式：X 获胜结算')
{
  const p = mount()
  p.setModeTo(1)
  p.onStart()
  // X: 0,1,2 三连；O: 3,4 是干扰子
  playSeq(p, [0, 3, 1, 4, 2])

  ok('X 三连触发结算', p.overShow === true)
  ok('标题是 X 方胜', p.overTitle === 'X 方胜', p.overTitle)
  ok('胜利连线被高亮（0/1/2）', p.c0w && p.c1w && p.c2w)
  ok('未连成线的格子不高亮', p.c3w === false && p.c4w === false)
  ok('结算后清空回合提示', p.turnText === '')
}

console.log('\n[4] 双人模式：O 获胜结算（确认后手也能赢，不是写死判给 X）')
{
  const p = mount()
  p.setModeTo(1)
  p.onStart()
  // O: 3,4,5 三连；X: 0,1,6
  playSeq(p, [0, 3, 1, 4, 6, 5])

  ok('O 三连触发结算', p.overShow === true)
  ok('标题是 O 方胜', p.overTitle === 'O 方胜', p.overTitle)
  ok('胜利连线被高亮（3/4/5）', p.c3w && p.c4w && p.c5w)
}

console.log('\n[5] 双人模式：平局')
{
  const p = mount()
  p.setModeTo(1)
  p.onStart()
  // 9 手填满且双方都无三连
  playSeq(p, [0, 1, 2, 4, 3, 5, 7, 6, 8])

  ok('满盘触发结算', p.overShow === true)
  ok('标题是平局', p.overTitle === '平局', p.overTitle)
  ok('X 与 O 都不算胜', p.overTitle !== 'X 方胜' && p.overTitle !== 'O 方胜')
}

console.log('\n[6] 双人模式：结算后不再接受落子')
{
  const p = mount()
  p.setModeTo(1)
  p.onStart()
  playSeq(p, [0, 3, 1, 4, 2])
  const snapshot = p.board.slice()
  p.playAt(8)
  ok('已结算后点击棋盘无效', JSON.stringify(p.board) === JSON.stringify(snapshot))
}

console.log('\n[7] 双人模式：不计入个人战绩')
{
  // store 是模块单例，双人跑完一整局后 win/lose/draw 必须一个都不动
  const store = await import('../src/systems/store.js')
  const before = store.getSave()
  const w0 = before.win, l0 = before.lose, d0 = before.draw

  const p = mount()
  p.setModeTo(1)
  p.onStart()
  playSeq(p, [0, 3, 1, 4, 2])          // X 胜
  const s1 = store.getSave()
  ok('X 胜后 win 未增加', s1.win === w0, w0 + ' → ' + s1.win)
  ok('X 胜后 lose/draw 未增加', s1.lose === l0 && s1.draw === d0)

  const p2 = mount()
  p2.setModeTo(1)
  p2.onStart()
  playSeq(p2, [0, 1, 2, 4, 3, 5, 7, 6, 8])  // 平局
  const s2 = store.getSave()
  ok('平局后 draw 未增加', s2.draw === d0, d0 + ' → ' + s2.draw)
  ok('双人模式战绩行给出说明', p2.statText === '双人模式不计战绩', p2.statText)
}

console.log('\n[8] 人机模式回归：双人改动没弄坏原玩法')
{
  const p = mount()
  p.setModeTo(0)
  p.onStart()
  ok('人机开局提示是你的回合', p.turnText === '你的回合', p.turnText)
  ok('人机状态行含难度', /难度/.test(p.statusText), p.statusText)

  p.playAt(4)
  ok('玩家落子后电脑已应手（盘面 2 子）',
    p.board.filter(v => v !== 0).length === 2,
    'filled=' + p.board.filter(v => v !== 0).length)
  ok('电脑应手后回合还给玩家', p.turnText === '你的回合', p.turnText)
  ok('电脑不会去占玩家已落的格子', p.board[4] === 1)
  ok('人机模式显示战绩而非双人说明', p.statText !== '双人模式不计战绩', p.statText)
}

console.log('\n[9] 切换模式后重开一局：状态干净')
{
  const p = mount()
  p.setModeTo(1)
  p.onStart()
  playSeq(p, [0, 3, 1])          // 下到一半
  p.setModeTo(0)                 // 回菜单换成人机
  p.onStart()
  ok('重开后棋盘清空', p.board.every(v => v === 0))
  ok('重开后无棋子显隐残留',
    !p.c0x && !p.c0o && !p.c3x && !p.c3o && !p.c1x && !p.c1o)
  ok('重开后无胜利高亮残留', !p.c0w && !p.c1w && !p.c3w)
  ok('重开后结算层关闭', p.overShow === false)
  ok('重开后回合回到 X', p.turn === 1)
}

console.log('\n[10] 模式选择持久化到 store')
{
  const store = await import('../src/systems/store.js')
  store.setMode(1)
  const a = store.getSave().mode
  store.setMode(0)
  const b = store.getSave().mode
  ok('setMode(1) 生效', a === 1, 'mode=' + a)
  ok('setMode(0) 生效', b === 0, 'mode=' + b)
  store.setMode(2)
  ok('非法模式被拒绝（保持上一次合法值）', store.getSave().mode === 0)
}

console.log('\n————')
console.log('通过：' + pass + '  失败：' + fails.length)
if (fails.length) {
  console.log('失败项：')
  for (const f of fails) console.log('  - ' + f)
  process.exit(1)
}
console.log('双人模式逻辑全部通过 ✓')
