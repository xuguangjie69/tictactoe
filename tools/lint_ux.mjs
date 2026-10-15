/**
 * .ux 模板静态合规自检（不依赖真机/Studio）
 * 用法：node tools/lint_ux.mjs
 *
 * ⚠️ 每条规则的依据都来自 gudao 真机跑通的 13 个页面 + 本项目实机返工截图，
 *    不是凭印象。改动前先想清楚它在防哪个真机现象。
 *    反向验证：node tools/neg_lint.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const uxRoot = path.resolve(dir, '../src/pages')

let bad = 0
let warn = 0
function err(f, msg) { console.log('  ERROR ' + path.basename(f) + ' — ' + msg); bad++ }
function wrn(f, msg) { console.log('  WARN  ' + path.basename(f) + ' — ' + msg); warn++ }

function walk(d) {
  const out = []
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith('.ux')) out.push(p)
  }
  return out
}

/**
 * 扫描 `this[...] = rhs`，返回 [{ key, rhs }]。
 * 必须方括号配平：`this[k[i] + 'x'] = ...` 里内层 k[i] 的 ] 会让 `this\[[^\]]+\]` 提前闭合。
 * （踩坑记录：正则版守卫看着存在，实际对动态 key 100% 漏检。）
 */
function scanBracketAssign(src) {
  const out = []
  const re = /this\s*\[/g
  let m
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length - 1 // 指向 '['
    let depth = 0
    for (; i < src.length; i++) {
      if (src[i] === '[') depth++
      else if (src[i] === ']') { depth--; if (depth === 0) break }
    }
    if (depth !== 0) continue
    const key = src.slice(m.index + m[0].length, i)
    const rest = src.slice(i + 1)
    const eq = rest.match(/^\s*=\s*([^\n;]+)/)
    if (eq) out.push({ key: key.trim(), rhs: eq[1].trim() })
  }
  return out
}

const files = walk(uxRoot)
console.log('\n[ux 静态合规] 共 ' + files.length + ' 个页面\n')

for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8')
  const styleBlock = (raw.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1]
  const tplRaw = (raw.match(/<template>([\s\S]*?)<\/template>/) || [, ''])[1]
  // 注释必须先剥掉，否则注释里的示例 {{xxxLabel}} / {{}} 会被当成真变量（假红）
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
  const src = strip(raw)
  const tpl = strip(tplRaw)
  // style 块里每个 class 定义了什么属性（用于「可点击元素尺寸」检查）
  const classProps = new Map()
  for (const m of styleBlock.matchAll(/([.\w][\w\-]*)\s*\{([^}]*)\}/g)) {
    classProps.set(m[1].replace(/^\./, ''), m[2])
  }
  const hasSize = (name) => {
    const body = classProps.get(name)
    if (!body) return false
    return /width\s*:/.test(body) && /height\s*:/.test(body)
  }

  // ── ① 【最致命，实机验证过】必须声明 tailwind 指令 ──
  // 漏掉 ⇒ 所有 w-[Npx] / flex / items-center / rounded-* / mt-* 工具类失效
  //      ⇒ 元素全部塌成默认块级流。真机表现就是「整页散架、元素重叠」。
  if (!/@tailwind\s+components/.test(styleBlock)) {
    err(f, 'style 缺 @tailwind components（工具类会全部失效，整页布局塌陷）')
  }
  if (!/@tailwind\s+utilities/.test(styleBlock)) {
    err(f, 'style 缺 @tailwind utilities（w-[Npx] 等尺寸类会全部失效）')
  }

  // ── ② 按钮：必须用 <input type="button">
  // ⚠️ 曾有一条规则「可点击 div 里不能放 text」是**错的**，已被 gudao 真机代码证伪：
  //    gudao/src/pages/Main/index.ux:123 就是 <div class="..." onclick="goEvent"> 内含 3 个 <text>，
  //    真机正常显示。第一版按钮变空圆块的真正原因是 ①（缺 @tailwind），不是 text 不渲染。
  //    保留的价值：input 必须有 value，否则是个无字空块。
  for (const m of src.matchAll(/<input[^>]*type="button"[^>]*>/g)) {
    if (!/value="/.test(m[0])) err(f, '<input type="button"> 缺 value（会显示成无字空块）：' + m[0].slice(0, 60))
  }

  // ── ③ 显隐：<div show> 里不能有子节点 ──
  // gudao validate.mjs §8 明确禁止 <div show>：整块不显示且无报错。
  // 本项目只允许「无内容的装饰 div」（金环/胜负圈）用 show。
  for (const m of tpl.matchAll(/<div([^>]*\bshow=[^>]*)>([\s\S]*?)<\/div>/g)) {
    if (m[2].trim() !== '') {
      err(f, '<div show> 里有子节点（真机整块不显示且无报错），改用 <text show> 或 <input show>')
    }
  }

  // ── ④ 绝对定位摆位 ──
  // gudao 13 个页面里只有 .bgfill 用绝对定位；其余全 flex 流式。
  // 实测本项目第一版把 position:absolute 当定位用，真机不按 left/top 生效。
  const absInTpl = (tpl.match(/position\s*:\s*absolute/g) || []).length
  if (absInTpl > 0) {
    err(f, 'template 里出现 position:absolute（' + absInTpl +
      '处）——实测不按 left/top 生效，请改用 flex + margin 流式布局')
  }

  // ── ⑤ {{}} 内只能是简单变量名 ──
  for (const m of src.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const e = m[1].trim()
    if (!/^[A-Za-z_$][\w$]*$/.test(e)) {
      err(f, '{{}} 里不是简单变量名（三元/算术/表达式都会失效）：' + e)
    }
  }

  // ── ⑥ text 上不放定位相关 class ──
  for (const m of tpl.matchAll(/<text[^>]*class="([^"]*)"/g)) {
    if (/absolute|relative|fixed|top-|left-/.test(m[1])) {
      err(f, '<text> 的 class 含定位类（整个 style 块会被丢弃）：' + m[1])
    }
  }

  // ── ⑦ CSS 不支持的属性 ──
  for (const p of ['box-shadow', 'text-shadow', 'letter-spacing']) {
    if (new RegExp('(^|[;{\\s])' + p + '\\s*:').test(styleBlock)) {
      err(f, '平台不支持的 CSS 属性：' + p)
    }
  }

  // ── ⑧ background 不能与 background-color/image 并存 ──
  // 按**元素的声明集合**判定（不能拿声明串去找值相同的另一个，值不同就永远漏判）
  const chk = (body, where) => {
    const hasBg = /(^|;)\s*background\s*:/.test(body)
    const hasBgC = /(^|;)\s*background-color\s*:/.test(body)
    const hasBgI = /(^|;)\s*background-image\s*:/.test(body)
    if (hasBg && (hasBgC || hasBgI)) err(f, where + ' 同时用了 background 与 background-color/image')
  }
  for (const m of tpl.matchAll(/style="([^"]*)"/g)) chk(m[1], 'style 属性')
  for (const m of styleBlock.matchAll(/([\w.\-#\[\]]+)\s*\{([^}]*)\}/g)) chk(m[2], '规则 ' + m[1])

  // ── ⑨ 渐变：stop 只支持 #hex；方向只支持单轴 ──
  for (const m of src.matchAll(/linear-gradient\(([^)]*)\)/g)) {
    if (/rgba?\(/.test(m[1])) err(f, '渐变 stop 用了 rgba()，只支持 #hex')
    const dir = m[1].split(',')[0].trim()
    if (!/^to\s+(top|bottom|left|right)$/.test(dir)) {
      wrn(f, '渐变方向非单轴 to top/bottom/left/right：' + dir)
    }
  }

  // ── ⑩ 长方形屏适配 ──
  if (/\.page\s*\{/.test(styleBlock) && !/watch-square/.test(src)) {
    err(f, '.page 缺少 @media screen and (device: watch-square) 适配（长方形屏会显示不全）')
  }

  // ── ⑪ 可点击元素：必须有确定尺寸 ──
  // 尺寸可以写在标签 class（w-[72px]）上，也可以写在 style 块对应 .class 里——
  // 两种都算合法。之前只查标签，把 style 块里定义齐全的 .cell 全判成"缺尺寸"（假红）。
  for (const m of tpl.matchAll(/<(div|input|image|text)([^>]*\bonclick=[^>]*)>/g)) {
    const s = m[0]
    const inline = /w-\[/.test(s) || /width\s*:/.test(s)
    const inlineH = /h-\[/.test(s) || /height\s*:/.test(s)
    const fromClass = m[2].match(/class="([^"]*)"/)
    const cls = fromClass ? fromClass[1].split(/\s+/) : []
    const okW = inline || cls.some(hasSize)
    const okH = inlineH || cls.some(hasSize)
    if (!okW || !okH) {
      err(f, '可点击元素缺确定宽/高（标签 class 或 style 块 .class 里都要有）：' + s.slice(0, 70))
    }
  }

  // ── ⑫ 文件结构三段齐全 ──
  for (const t of ['<script>', '</script>', '<style>', '</style>', '<template>', '</template>']) {
    if (!src.includes(t)) err(f, '缺少 ' + t)
  }

  // ── ⑬ 模板变量必须在 data 里声明 ──
  // data 块用「配对大括号计数」截取（正则匹配到第一个 \n} 会被嵌套/多行截断）；
  // 声明提取按整块全局匹配 key，而不是行首锚点，否则 `c0x: '', c0o: ''` 一行多声明只抓到第一个。
  const di = src.indexOf('data:')
  let dataBlock = ''
  if (di >= 0) {
    let depth = 0, started = false
    const open = src.indexOf('{', di)
    for (let i = open; i < src.length; i++) {
      const ch = src[i]
      if (ch === '{') { depth++; started = true }
      else if (ch === '}') { depth--; if (started && depth === 0) { dataBlock = src.slice(open, i + 1); break } }
    }
  }
  const declared = new Set()
  for (const m of dataBlock.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) declared.add(m[1])
  const used = new Set()
  for (const m of src.matchAll(/\{\{([\s\S]*?)\}\}/g)) used.add(m[1].trim())
  // show="{{x}}" 也要算使用（gudao 大量用 show 做显隐）
  for (const m of tpl.matchAll(/\bshow="\{\{([\w$]+)\}\}"/g)) used.add(m[1])
  // if="{{x}}" 同样算使用
  for (const m of tpl.matchAll(/\bif="\{\{([\w$]+)\}\}"/g)) used.add(m[1])
  for (const u of used) if (u && !declared.has(u)) err(f, '模板用了未在 data 声明的变量：' + u)

  // ── ⑬-bis 🔴【实机验证过】show 绑定的变量必须是 boolean ──
  // 实机现象：data 里 c0x: ''，show="{{c0x}}" ⇒ 9 格棋子全部显示，一个 O 都没有
  //   （平台把非空字符串当真值，'' 也一样）。同页 menuShow 用 boolean 完全正常。
  // 对照证据：gudao 13 个真机跑通页面，所有 show 变量清一色 boolean，无一用字符串。
  // 检查方式：对每个 show="{{x}}"，取 x 在 data 里的**初始字面量**，必须是 true/false。
  const initOf = new Map()
  for (const m of dataBlock.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(true|false|'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?|null|undefined)\s*[,}]/g)) {
    initOf.set(m[1], m[2])
  }
  const showIfVars = []
  for (const m of tpl.matchAll(/\b(?:show|if)="\{\{([\w$]+)\}\}"/g)) showIfVars.push(m[1])
  for (const v of showIfVars) {
    const lit = initOf.get(v)
    if (lit === undefined) continue
    if (lit !== 'true' && lit !== 'false') {
      err(f, 'show/if 变量 ' + v + ' 初始值是 ' + lit +
        '，必须是 boolean true/false——实机非空字符串/数字全被当真值，显隐会全错')
    }
  }

  // ── ⑯ 容器显隐语法边界【编译期 no type 的根因，实机验证过】 ──
  // 依据 = gudao 13 个真机跑通页面全量统计：
  //   · `if` 只出现在 <div>（15 处，可带子节点）；
  //   · <scroll> 用 show/if 的 0 处；
  //   · `show` 只出现在 <text>/<input>/<image> 等叶子元素。
  // 实机现象：<scroll show="{{x}}"> 与 <div show="{{y}}"> ⇒ 编译期
  //   parseDomElement「parse json error: no type」，整页跑不起来。
  for (const m of tpl.matchAll(/<scroll([^>]*)>/g)) {
    if (/\bshow=/.test(m[1])) err(f, '<scroll> 不能带 show（编译期报 no type），改用外层 <div if="{{...}}">')
    if (/\bif=/.test(m[1])) err(f, '<scroll> 不能带 if（编译期报 no type），改用外层 <div if="{{...}}">')
  }
  for (const m of tpl.matchAll(/<div([^>]*\bshow=[^>]*)>/g)) {
    err(f, '<div> 不能用 show（编译期报 no type），改用 if="..."：' + m[0].slice(0, 60))
  }
  // 叶子元素用 if 也不行（if 只对 div 有效）
  for (const m of tpl.matchAll(/<(text|input|image|scroll)([^>]*\bif=[^>]*)>/g)) {
    err(f, '<' + m[1] + '> 不能用 if（if 只对 <div> 有效），叶子元素请用 show：' + m[0].slice(0, 60))
  }

  // ── ⑬-ter 赋值守卫：给 show 变量赋的非 boolean 字面量 ──
  // `this.c0x = ''` / `= '1'` 在渲染路径上一样会炸，必须一起拦。
  // 🔴 关键：棋盘用**动态 key** 赋值 `this[k[i] + 'x'] = ...`，正则只匹配 `this.<字面名>`
  //    会完全漏掉它（本项目就中过一次：规则存在但 0 ERROR，注入赋值 bug 也是全绿）。
  //    所以对动态 key 单独拦：凡是 `this[...] = <字面量>` 一律可疑。
  const showVars = new Set()
  for (const m of tpl.matchAll(/\bshow="\{\{([\w$]+)\}\}"/g)) showVars.add(m[1])
  const isBadRhs = (rhs) => {
    const s = rhs.trim()
    if (s === "''" || s === '""' || /^'1'$/.test(s) || /^\d+$/.test(s)) return true
    // 三元里带 show 语义的字符串也算：b[i] === HUMAN ? '1' : ''
    // （踩坑：只判纯字面量会漏掉三元形式，而三元恰恰是本项目真实用过的写法）
    if (/\?/.test(s) && /'1'|"1"/.test(s)) return true
    return false
  }
  for (const v of showVars) {
    for (const m of src.matchAll(new RegExp('this\\.' + v + '\\s*=\\s*([^\\n;]+)', 'g'))) {
      if (isBadRhs(m[1].trim())) {
        err(f, 'show 变量 ' + v + ' 被赋非 boolean 值 ' + m[1].trim() + '（应用 === 判断或 true/false）')
      }
    }
  }
  // 动态 key：this[...] = <非 boolean 字面量>
  // 🔴 正则 `this\s*\[[^\]]+\]` 匹配不了 `this[k[i] + 'x']` —— 内层 `k[i]` 的 `]` 会提前闭合，
  //    守卫看着存在、实则全程漏检（本项目连中两次：规则在、注入 bug、lint 仍 0 ERROR）。
  //    必须做**方括号配平**扫描。
  for (const m of scanBracketAssign(src)) {
    if (isBadRhs(m.rhs)) {
      err(f, '动态 key 赋值 this[...] = ' + m.rhs +
        ' 是非 boolean 字面量——若该 key 对应 show 变量（c*x/c*o/c*w/ring*），显隐会全错')
    }
  }
}

// ── ⑭ manifest 与页面文件一致 ──
const mf = JSON.parse(fs.readFileSync(path.resolve(dir, '../src/manifest.json'), 'utf8'))
const pages = Object.keys(mf.router.pages)
if (!pages.includes(mf.router.entry)) err('manifest.json', 'router.entry 未登记进 pages')
for (const p of pages) {
  if (!fs.existsSync(path.resolve(dir, '../src', p, 'index.ux'))) {
    err('manifest.json', 'pages 登记了不存在的页面：' + p)
  }
}
console.log('  manifest 登记 ' + pages.length + ' 个页面，入口 ' + mf.router.entry)

// ── ⑮ app.ux 必须有 /**manifest**/ 标识 ──
const a = fs.readFileSync(path.resolve(dir, '../src/app.ux'), 'utf8')
if (!a.includes('/**manifest**/')) err('app.ux', '缺少 /**manifest**/ 标识')

console.log('\n————')
console.log('ERROR：' + bad + '  WARN：' + warn)
if (bad) process.exit(1)
console.log('模板合规 ✓')