/**
 * 反向验证：给 index.ux 副本注入各类模板违规，看 lint_ux 是否会红。
 * 用法：node tools/neg_lint.mjs
 *
 * ⚠️ 纪律（都是踩过的坑）：
 *  1. 锚点必须取自 index.ux 的**真实文本**，不能凭印象写；
 *  2. 锚点没命中必须大声失败并 exit 1——静默跳过 = "看起来验证通过"；
 *  3. 用 split().join() 而不是 replace()（公式在多处出现时 replace 只改一半）；
 *  4. .ux 用文件真实换行符拼锚点；
 *  5. 跑完逐字节校验源码已还原。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const ux = path.resolve(dir, '../src/pages/Index/index.ux')
const orig = fs.readFileSync(ux, 'utf8')
const NL = orig.includes('\r\n') ? '\r\n' : '\n'

console.log('\n反向验证：注入模板违规后 lint_ux 必须变红\n')

const cases = [
  // ── ① 最致命：抽掉 @tailwind，整页布局失效 ──
  ['style 缺 @tailwind components',
    '@tailwind components;', ''],
  ['style 缺 @tailwind utilities',
    '@tailwind utilities;', ''],

  // ── ② 按钮缺 value → 无字空块（截图现象） ──
  ['<input type="button"> 缺 value',
    'type="button" value="简单"', 'type="button"'],

  // ── ④ 绝对定位摆位 ──
  ['template 里出现 position:absolute',
    '<div class="row-btm mt-[12px]">',
    '<div class="row-btm mt-[12px]" style="position:absolute;left:100px;top:300px;">'],

  // ── ⑤ {{}} 塞表达式 ──
  ['{{}} 里塞表达式',
    '{{statText}}', '{{statText + 1}}'],

  // ── ⑥ text 带定位类 → 整个 style 块被丢弃 ──
  ['<text> 带定位类',
    'class="mark-x"', 'class="mark-x absolute left-[10px] top-[10px]"'],

  // ── ⑦ 平台不支持的 CSS 属性 ──
  ['用了 box-shadow',
    'background-color: #0E1524;', 'background-color: #0E1524;\n  box-shadow: 0 0 4px #000;'],

  // ── ⑧ background 与 background-color 并存 ──
  ['background 与 background-color 并存',
    'background-color: #1B2740;', 'background-color: #1B2740; background: #000;'],

  // ── ⑨ 渐变 stop 用 rgba()（注入到没有 background-color 的 .col-center，避免同时触发⑧） ──
  ['渐变 stop 用 rgba()',
    '.col-center { width: 100%;',
    '.col-center {\n  background-image: linear-gradient(to bottom, #0E1524, rgba(0,0,0,1));'],

  // ── ⑩ 可点元素无任何尺寸（style 块里也查不到） ──
  ['可点元素缺确定宽高',
    '<div class="cell" onclick="onCell4">', '<div class="cell-nosize" onclick="onCell4">'],

  // ── ⑪ 用了未在 data 声明的变量 ──
  ['模板变量未在 data 声明',
    '{{overSub}}', '{{overSubTypo}}'],

  // ── ⑫ 删掉长方形屏适配 ──
  ['缺 @media watch-square 适配',
    '@media screen and (device: watch-square) {', '@media screen and (device: watch-nope) {'],

  // ── ⑯ 容器显隐语法边界（第三次真机返工：编译期 no type） ──
  ['<scroll> 带 show（编译期 no type）',
    '<scroll class="sc-menu" scroll-y="true" style="height:{{pageH}}px">',
    '<scroll class="sc-menu" scroll-y="true" style="height:{{pageH}}px" show="{{menuShow}}">'],
  ['<scroll> 带 if',
    '<div class="page-wrap" if="{{menuShow}}">',
    '<div class="page-wrap" if="{{menuShow}}"><scroll if="{{menuShow}}" class="sc-menu">'],
  ['<div> 用 show（编译期 no type）',
    '<div class="ring-diff" if="{{ring0}}"></div>',
    '<div class="ring-diff" show="{{ring0}}"></div>'],
  ['<text> 用 if（if 只对 div 有效）',
    '<text class="mark-x" show="{{c0x}}">X</text>',
    '<text class="mark-x" if="{{c0x}}">X</text>'],

  // ── ⑬ show/if 变量用字符串（第二次真机返工的真凶） ──
  ['show 变量初始值用空字符串',
    'c0x: false,', "c0x: '',"],
  ['show 变量初始值用 \'1\' 字符串',
    'ring1: true,', "ring1: '1',"],
  ['if 变量初始值用字符串',
    'menuShow: true,', "menuShow: '1',"],
  // 动态 key + 三元：本项目真实用过的写法，之前的正则守卫对它 100% 漏检（假绿）
  ['动态 key 赋值用三元字符串（正则版守卫漏检过）',
    "this[k[i] + 'x'] = b[i] === HUMAN",
    "this[k[i] + 'x'] = b[i] === HUMAN ? '1' : ''"],
  ['动态 key 赋值用嵌套方括号（三元守卫）',
    "this[k[i] + 'o'] = b[i] === AI",
    "this[k[i] + 'o'] = b[i] === AI ? '1' : ''"]
]

let missed = 0
for (const [label, from, to] of cases) {
  const anchor = from.split('\n').join(NL)
  if (!orig.includes(anchor)) {
    console.log('  ✗ 锚点未命中：' + label + '（等于没注入，守卫有效性未知）')
    missed++
    continue
  }
  const mutated = orig.split(anchor).join(to.split('\n').join(NL))
  fs.writeFileSync(ux, mutated)
  let red = false
  let out = ''
  try {
    out = execFileSync(process.execPath, [path.resolve(dir, 'lint_ux.mjs')], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (e) {
    red = true
    out = (e.stdout || '') + (e.stderr || '')
  } finally {
    fs.writeFileSync(ux, orig)
  }
  if (fs.readFileSync(ux, 'utf8') !== orig) {
    console.log('  ✗ 源码还原失败！')
    process.exit(2)
  }
  const n = out.split(/\r?\n/).filter(l => l.includes('ERROR')).length
  // 判据 = 有没有 ERROR 行，**不能只看退出码**。
  // 踩过的坑：某条注入确实被 lint 报了 1 条 ERROR，但那次 lint 没走到末尾的 process.exit(1)
  // ⇒ red=false，被误判成"仍然全绿（守卫无效）"。以 ERROR 计数为准才准。
  const ok = n > 0
  if (ok && !red) {
    console.log('  ! 有 ERROR 但退出码为 0，检查 lint 是否漏了 process.exit(1)')
  }
  console.log('  ' + (ok ? '✓ 会红' : '✗ 仍然全绿（守卫无效）') + ' — ' + label +
    (n ? '：' + n + ' 条 ERROR' : ''))
}

console.log('')
if (missed) {
  console.log('有 ' + missed + ' 条注入未命中，必须先修锚点')
  process.exit(1)
}
console.log('反向验证结束（源码已还原）')
