import type { Node, StringLiteral, TemplateLiteral } from '@babel/types'
import type { SFCScriptBlock, SFCTemplateBlock } from '@vue/compiler-sfc'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import _generate from '@babel/generator'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import { isStringLiteral, isTemplateLiteral } from '@babel/types'
import { parse as parseSFC } from '@vue/compiler-sfc'
import consola from 'consola'
import { globSync } from 'glob'
import { CHINESE_REGEX, COLLECT_TYPE, OUT_DIR, PARSER_OPTIONS, TEMPLATE_REGEX } from './constant'

// fallback
const traverse = (_traverse as any).default ?? _traverse
const generate = (_generate as any).default ?? _generate

/**
 * 收集源代码中的中文字符串和模板
 */
export async function collect(options: CollectOptions = {}) {
  const {
    collectFile = 'sourcemap.json',
    dirs = [],
  } = options

  if (dirs.length === 0) {
    consola.error('请指定要扫描的目录')
    process.exit(1)
  }
  consola.start(`Collect start`)

  const results = await Promise.all(dirs.map(staticAnalysisFile))
  const collect = results.flat().reduce((acc, cur) => Object.assign(acc, cur), {})

  await fsp.access(OUT_DIR).catch(() => fsp.mkdir(OUT_DIR))
  await fsp.writeFile(path.join(OUT_DIR, collectFile), `${JSON.stringify(collect, null, 2)}\n`, 'utf8')

  consola.success(`Collect completed; results saved  ${collectFile}\n`)
}

/**
 * 静态分析文件
 */
async function staticAnalysisFile(dirPath: string): Promise<Record<string, CollectResult[]>[]> {
  await fsp.access(dirPath).catch(() => {
    consola.error('please generate sourcemap first')
    process.exit(1)
  })

  const patterns = [`${dirPath}/**/*.{js,vue}`]
  const files = globSync(patterns, { ignore: ['**/node_modules/**'] })
  consola.info(`Scanning directory ${dirPath}, found ${files.length} files...`)

  return Promise.all(
    files.map(async (filePath) => {
      const code = await fsp.readFile(filePath, 'utf8')

      if (!CHINESE_REGEX.test(code)) {
        consola.debug(`no Chinese characters found in ${filePath}, skipping...`)
        return {}
      }

      const data = filePath.endsWith('.vue')
        ? collectFromVueFile(code)
        : collectFromScriptFile(code)

      return { [filePath]: data }
    }),
  )
}

/**
 * 分析 Vue 文件
 */
function collectFromVueFile(code: string): CollectResult[] {
  const collectResult: CollectResult[][] = []

  /**
   * 使用 compiler-sfc 拆分
   * @see https://github.com/vuejs/core/tree/main/packages/compiler-sfc#readme
   */
  const { descriptor } = parseSFC(code, { pad: 'line' })
  const { template, script, scriptSetup } = descriptor

  if (template && CHINESE_REGEX.test(template.content))
    collectResult.push(analyzeVueTempalte(template))

  if (script && CHINESE_REGEX.test(script.content))
    collectResult.push(analyzeVueScript(script))

  if (scriptSetup && CHINESE_REGEX.test(scriptSetup.content))
    collectResult.push(analyzeVueScript(scriptSetup))

  return collectResult.flat()
}

/**
 * 生成全局的行偏移表 O(n)
 */
function computeLineOffsets(text: string): number[] {
  const offsets = [0]
  let idx = text.indexOf('\n')
  while (idx !== -1) {
    offsets.push(idx + 1)
    idx = text.indexOf('\n', idx + 1)
  }
  return offsets
}

/**
 * 二分定位行号和该行起始偏移 O(log n)
 */
function locateLine(offsets: number[], pos: number): [lineIndex: number, lineStartOffset: number] {
  // 简单二分找出第一个大于 pos 的 offset
  let lo = 0
  let hi = offsets.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (offsets[mid] > pos)
      hi = mid
    else lo = mid + 1
  }
  // lo 是第一个 > pos 的行索引，真正所在行是 lo-1
  return [lo - 1, offsets[lo - 1]]
}

/**
 * 分析 Vue 模板
 */
function analyzeVueTempalte({ loc, content }: SFCTemplateBlock): CollectResult[] {
  const results: CollectResult[] = []

  // 原始字符串，可能包含三种注释：// …、/* … */、<!-- … -->，把注释替换为同长度的“空白”
  const uncommented = content.replace(
    /\/\/.*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g,
    match => match.replace(/[^\r\n]/g, ' '),
  )

  try {
    const lineOffsets = computeLineOffsets(uncommented)

    // 匹配汉字及其间的空白，后面再 trim，确保至少含一个汉字
    for (const match of uncommented.matchAll(TEMPLATE_REGEX)) {
      const raw = match[0]
      const text = raw.trim()

      if (!CHINESE_REGEX.test(text))
        continue

      const idx = match.index
      // raw 里可能有前导空白和换行，找到中文在 raw 中的相对偏移
      const rel = raw.indexOf(text)
      // 中文真正的全局起始位置：
      const absPos = idx + rel

      const [blockLine, lineStart] = locateLine(lineOffsets, absPos)
      const row = blockLine + loc.start.line // 1-based SFC 起始行
      const col = absPos - lineStart + 1 // 1-based 列号

      results.push({
        text,
        location: `line ${row}, column ${col}`,
        row,
        col,
        len: text.length,
        type: COLLECT_TYPE.VUE_TEMPLATE,
      })
    }
  }
  catch (e) {
    consola.error(`analyze template error:`, e)
  }

  return results
}

/**
 * 分析 Vue 脚本
 */
function analyzeVueScript(block: SFCScriptBlock): CollectResult[] {
  return analyze({
    content: block.content,
    startLineOffset: block.loc.start.line - 1, // SFC 的起始行
    types: {
      stringLiteral: COLLECT_TYPE.VUE_STRING_LITERAL,
      templateLiteral: COLLECT_TYPE.VUE_TEMPLATE_LITERAL,
    },
    errorContext: 'vue script',
  })
}

/**
 * js/ts 脚本文件分析
 */
function collectFromScriptFile(content: string): CollectResult[] {
  return analyze({
    content,
    startLineOffset: 0, // JS/TS 文件起始行通常为 0
    types: {
      stringLiteral: COLLECT_TYPE.STRING_LITERAL,
      templateLiteral: COLLECT_TYPE.TEMPLATE_LITERAL,
    },
    errorContext: 'script file',
  })
}

/**
 * 分析脚本内容
 */
function analyze({
  content,
  startLineOffset = 0,
  types: { stringLiteral, templateLiteral },
  errorContext,
}: CollectAnalyzeOptions): CollectResult[] {
  const results: CollectResult[] = []

  try {
    const ast = parse(content, PARSER_OPTIONS)

    traverse(ast, {
      enter({ node }: { node: Node }) {
        if (isStringLiteral(node)) {
          const res = getStringLiteral(node, startLineOffset)
          if (res) {
            res.type = stringLiteral
            results.push(res as CollectResult)
          }
        }
        else if (isTemplateLiteral(node)) {
          const res = getTemplateLiteral(node, startLineOffset)
          if (res) {
            res.type = templateLiteral
            results.push(res as CollectResult)
          }
        }
      },
    })
  }
  catch (e) {
    consola.error(`analyze ${errorContext} error:`, e)
  }

  return results
}

/**
 * script 字符串
 */
function getStringLiteral(node: StringLiteral, startLine = 0): PartialCollectResult | undefined {
  if (!CHINESE_REGEX.test(node.value))
    return

  const text = node.value
  const loc = node.loc && node.loc.start
  const location = loc ? `line ${loc.line}, column ${loc.column + 2}` : ''

  if (!loc?.line || !loc?.column)
    return

  return {
    text,
    location,
    row: loc.line + startLine,
    col: loc.column + 2,
    len: text.length,
  }
}

/**
 * script 模板字符串
 */
function getTemplateLiteral(node: TemplateLiteral, startLine = 0): PartialCollectResult | undefined {
  let full = ''
  const quasis = node.quasis
  const exprs = node.expressions
  quasis.forEach((quasi, i) => {
    full += quasi.value.raw
    if (i < exprs.length) {
      const code = generate(exprs[i], {}).code
      full += `\${${code}}`
    }
  })

  if (CHINESE_REGEX.test(full)) {
    const loc = node.loc && node.loc.start
    const location = loc ? `line ${loc.line}, column ${loc.column + 2}` : ''

    if (!loc?.line || !loc?.column)
      return

    return {
      text: full,
      location,
      row: loc.line + startLine,
      col: loc.column + 2,
      len: full.length,
    }
  }

  return undefined
}

// collect()
