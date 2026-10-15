/**
 * 反向验证脚手架：把 ai.js 拷一份注入 bug，跑断言看是否变红，然后自动还原真源码。
 * 用法：node tools/neg_check.mjs
 * ⚠️ 必须用文件真实换行符拼锚点；锚点没命中要大声失败，不能静默"通过"。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const dir = path.dirname(fileURLToPath(import.meta.url))
const aiPath = path.resolve(dir, '../src/systems/ai.js')
const orig = fs.readFileSync(aiPath, 'utf8')
const NL = orig.includes('\r\n') ? '\r\n' : '\n'

function injectAndRun(label, from, to) {
  const anchor = from.split('\n').join(NL)
  if (!orig.includes(anchor)) {
    console.log('  ✗ 锚点未命中：' + label + ' —— 注入根本没发生，守卫有效性未知（假绿）')
    return { red: false, missed: true }
  }
  const mutated = orig.split(anchor).join(to.split('\n').join(NL))
  if (mutated === orig) {
    console.log('  ✗ 注入后内容不变：' + label)
    return { red: false, missed: true }
  }
  const bak = aiPath + '.negbak'
  fs.writeFileSync(bak, orig)
  fs.writeFileSync(aiPath, mutated)
  let red = false
  let detail = ''
  try {
    const out = execFileSync(process.execPath, [path.resolve(dir, 'smoke.mjs')], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    })
    detail = out
  } catch (e) {
    red = true
    detail = (e.stdout || '') + (e.stderr || '')
  } finally {
    fs.writeFileSync(aiPath, orig)
    fs.unlinkSync(bak)
  }
  // 还原后必须与原文件逐字节一致
  if (fs.readFileSync(aiPath, 'utf8') !== orig) {
    console.log('  ✗ 源码还原失败！请检查 ai.js')
    process.exit(2)
  }
  const bad = detail.split(/\r?\n/).filter(l => l.includes('✗'))
  console.log('  ' + (red ? '✓ 会红' : '✗ 仍然全绿（守卫无效）') + ' — ' + label +
    (bad.length ? '：' + bad.length + ' 条断言失败' : ''))
  return { red, missed: false }
}

console.log('\n反向验证：注入 bug 后断言必须变红\n')

const cases = [
  ['negamax 递归漏取负（AI 按对手最优走自己的棋）',
    'const sc = -r.score', 'const sc = r.score'],
  ['终局奖励不压过非终局分（AI 会放弃眼前胜去磨棋）',
    'const WIN_BASE = 1000', 'const WIN_BASE = 10'],
  ['让对手胜当自己胜（符号反了）',
    'return { score: -(WIN_BASE + (9 - ply)), move: -1 }',
    'return { score: WIN_BASE + (9 - ply), move: -1 }'],
  ['速胜偏好方向反了（用剩余空位当奖励项）',
    'WIN_BASE + (9 - ply)', 'WIN_BASE + ply'],
  ['速胜偏好完全去掉（只剩胜负，不分快慢）',
    'WIN_BASE + (9 - ply)', 'WIN_BASE'],
  ['困难难度同分偏好被去掉（退回随便走）',
    'const pref = [4, 0, 2, 6, 8, 1, 3, 5, 7]', 'const pref = [0, 1, 2, 3, 4, 5, 6, 7, 8]'],
  ['简单难度不堵线',
    'if (w === HUMAN) return moves[i]', 'if (w === HUMAN) continue'],
  ['play() 允许覆盖已占格',
    "if (b[i] !== 0) return null", "if (false) return null"],
  ['LINES 少一条对角线',
    '[0, 4, 8], [2, 4, 6]', '[2, 4, 6]'],
  ['简单难度不再优先取胜',
    'if (w === AI) return moves[i]', 'if (w === AI) continue']
]

let missed = 0
for (const [label, from, to] of cases) {
  const r = injectAndRun(label, from, to)
  if (r.missed) missed++
}

console.log('')
if (missed) {
  console.log('有 ' + missed + ' 条注入因锚点未命中而没跑起来 —— 必须先修锚点')
  process.exit(1)
}
console.log('反向验证结束（源码已还原）')