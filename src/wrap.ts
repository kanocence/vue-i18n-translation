import { promises as fsp } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import consola from 'consola'
import { COLLECT_TYPE, OUT_DIR } from './constant'

export async function wrap(options: WrapOptions = {}): Promise<void> {
  const {
    translationMapFile = 'translation-map.json',
    override = false,
    outputDir,
    wrapConfig = {
      template: 'this.$t', // vue 模板的包裹方式
      import: `import i18n from '@/i18n'`, // i18n 导入语句
      script: 'i18n.t', // JS/TS 脚本的包裹方式
    },
  } = options

  try {
    await fsp.access(path.join(OUT_DIR, translationMapFile))
  }
  catch {
    consola.error(`文件 ${translationMapFile} 不存在`)
    process.exit(1)
  }

  consola.start(`Wrap start, translationMap: ${translationMapFile}`)
  consola.debug(`cwd: ${process.cwd()}`)

  const raw = await fsp.readFile(path.join(OUT_DIR, translationMapFile), 'utf8')
  const translationMap = JSON.parse(raw) as Record<string, TranslateResult[]>

  await Promise.all(
    Object.entries(translationMap).map(async ([filePath, entries]) => {
      await wrapFile(wrapConfig, filePath, entries, override, outputDir)
    }),
  )

  consola.success('Wrap complete\n')
}

async function wrapFile(
  wrapConfig: WrapConfig,
  filePath: string,
  entries: TranslateResult[],
  override: boolean,
  outputDir?: string,
) {
  try {
    await fsp.access(filePath)
  }
  catch {
    consola.warn(`source file does not exist, skipping: ${filePath}`)
    return
  }

  const raw = await fsp.readFile(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)

  const wrapEntries: WrapEntry[] = entries.map(e => ({
    ...e,
    wrapper: getWrapper(e.type, wrapConfig),
  }))

  if (wrapEntries.length === 0) {
    consola.info(`skip ${filePath}, no entries`)
    return
  }

  applyWrappers(wrapEntries, lines, filePath)

  // 添加 i18n 引用
  if (entries.some(e => e.type === COLLECT_TYPE.STRING_LITERAL) || lines.some(l => l.includes(`${wrapConfig.script}(`))) {
    // 区分 vue 和 js 文件
    if (filePath.endsWith('.vue')) {
      const startLine = lines.findIndex(l => l.includes('<script'))
      if (startLine !== -1) {
        lines.splice(startLine + 1, 0, wrapConfig.import)
      }
    }
    else if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
      lines.unshift(wrapConfig.import)
    }
  }

  const output = lines.join('\n')
  const target = resolveTargetPath(filePath, override, outputDir)

  await fsp.mkdir(path.dirname(target), { recursive: true })
  await fsp.writeFile(target, output, 'utf8')
  consola.info(`${override ? 'Overriding' : 'Writing'}: ${target}`)
}

function getWrapper(type: number, wrapConfig: WrapConfig): WrapperFn {
  switch (type) {
    case COLLECT_TYPE.VUE_TEMPLATE:
      return (before, afterRaw, e) => {
        const m = before.match(/([\w-]+)=['"]$/)
        if (m) {
          const attr = m[1]
          const prefix = before.slice(0, before.length - (attr.length + 2))
          const rest = afterRaw.startsWith(`"`) || afterRaw.startsWith(`'`) ? afterRaw.slice(1) : afterRaw
          return `${prefix}:${attr}="$t('${e.alias}.${e.key}')"${rest}`
        }
        return `${before}{{ $t('${e.alias}.${e.key}') }}${afterRaw}`
      }

    case COLLECT_TYPE.STRING_LITERAL:
      return (before, afterRaw, e) => {
        // 去掉前后引号
        const prefix = before.endsWith(`"`) || before.endsWith(`'`)
          ? before.slice(0, -1)
          : before
        const rest = afterRaw.startsWith(`"`) || afterRaw.startsWith(`'`)
          ? afterRaw.slice(1)
          : afterRaw
        return `${prefix}${wrapConfig.script}('${e.alias}.${e.key}')${rest}`
      }

    case COLLECT_TYPE.VUE_STRING_LITERAL:
      return (before, afterRaw, e) => {
        // 是否在 export default 中
        if (before.includes('export default')) {
          const prefix = before.endsWith(`"`) || before.endsWith(`'`)
            ? before.slice(0, -1)
            : before
          const rest = afterRaw.startsWith(`"`) || afterRaw.startsWith(`'`)
            ? afterRaw.slice(1)
            : afterRaw
          return `${prefix}${wrapConfig.template}('${e.alias}.${e.key}')${rest}`
        }

        const prefix = before.endsWith(`"`) || before.endsWith(`'`)
          ? before.slice(0, -1)
          : before
        const rest = afterRaw.startsWith(`"`) || afterRaw.startsWith(`'`)
          ? afterRaw.slice(1)
          : afterRaw
        return `${prefix}${wrapConfig.script}('${e.alias}.${e.key}')${rest}`
      }

    default:
      return (before, afterRaw) => before + afterRaw
  }
}

function applyWrappers(entries: WrapEntry[], lines: string[], filePath: string) {
  // 倒序按位置替换，避免后续索引失效
  entries.sort((a, b) => b.row - a.row || b.col - a.col)

  for (const e of entries) {
    const idx = e.row - 1
    if (idx < 0 || idx >= lines.length) {
      consola.warn(`越界位置: ${filePath} row=${e.row}, col=${e.col}`)
      continue
    }

    const line = lines[idx]
    const before = line.slice(0, e.col - 1)
    const afterRaw = line.slice(e.col - 1 + e.len)
    const orig = line.slice(e.col - 1, e.col - 1 + e.len)

    if (orig !== e.text) {
      consola.warn(`原文与 sourcemap 不符: "${orig}" vs "${e.text}" at ${filePath}:${e.row}`)
    }

    lines[idx] = e.wrapper(before, afterRaw, e)
  }
}

function resolveTargetPath(
  src: string,
  override: boolean,
  outputDir?: string,
): string {
  // 直接覆盖原文件
  if (override)
    return src

  // 输出到指定目录
  if (outputDir)
    return path.join(OUT_DIR, outputDir, src)

  // 输出到同级目录，文件名后缀为 .i18n
  const parsed = path.parse(src)
  return path.join(parsed.dir, `${parsed.name}.i18n${parsed.ext}`)
}

// wrap()
