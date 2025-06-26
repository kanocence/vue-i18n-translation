import { promises as fsp } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import consola from 'consola'
import { COLLECT_TYPE, CONTRACTIONS, OUT_DIR } from './constant'

export async function translate(options: TranslateOptions) {
  const {
    sourcemap = 'sourcemap.json',
    resultFile = 'translation-map.json',
    translateFn,
  } = options

  await fsp.access(path.join(OUT_DIR, sourcemap), fsp.constants.F_OK).catch(() => {
    consola.error('please generate sourcemap first')
    process.exit(1)
  })

  const dataRaw = await fsp.readFile(path.join(OUT_DIR, sourcemap), 'utf8')
  const sourcemapData = JSON.parse(dataRaw) as Record<string, CollectResult[]>

  const result: Record<string, TranslateResult[]> = {}
  const zhFilePathSet = new Set<string>()
  const enFilePathSet = new Set<string>()

  const ignore: Record<string, CollectResult[]> = {}

  const translateWithCache = useCachedTranslate(translateFn)

  const promise = Promise.all(
    Object.entries(sourcemapData).flatMap(
      ([filePath, items]) => {
        const parsed = path.parse(filePath)

        const total = items.length
        consola.debug(`add to queue: ${filePath}, total: ${total}`)

        return items.map(async (i) => {
          // ignore template literals
          if ([COLLECT_TYPE.VUE_TEMPLATE_LITERAL, COLLECT_TYPE.TEMPLATE_LITERAL].includes(i.type)) {
            ignore[filePath] = ignore[filePath] || []
            ignore[filePath].push(i)
            return
          }

          const afterText = await translateWithCache(i.text)
            // add to ignore list if translation failed
            .catch((err) => {
              consola.error(`translate error: ${i.text}`, err)
              ignore[filePath] = ignore[filePath] || []
              ignore[filePath].push(i)
            })

          if (!afterText)
            return
          // consola.info(`translate: ${i.text} → ${afterText}`)

          if (!result[filePath])
            result[filePath] = []

          result[filePath].push({
            ...i,
            key: getTranslateKey(afterText),
            after: afterText,
            alias: getAliasName(parsed),
          })
        })
      },
    ),
  )

  await promise.then(async () => {
    // 保存翻译结果
    await fsp.writeFile(path.join(OUT_DIR, resultFile), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    consola.success(`Translation map saved to ${resultFile}`)

    // 生成 i18n 文件 返回文件路径
    const filePathMap = await Promise.all(Object.entries(result).map(saveToI18n))

    // 生成目录文件
    filePathMap.forEach(({ zhFilePath, enFilePath }) => {
      zhFilePathSet.add(zhFilePath)
      enFilePathSet.add(enFilePath)
    })
    await addExportFile(zhFilePathSet, 'zh')
    await addExportFile(enFilePathSet, 'en')

    // 生成 ignore 文件
    if (Object.keys(ignore).length > 0) {
      await fsp.writeFile(path.join(OUT_DIR, 'translation-ignore.json'), `${JSON.stringify(ignore, null, 2)}\n`, 'utf8')
      consola.success('Translation-ignore list saved to translation-ignore.json')
    }

    consola.success('Translation completed\n')
  }).catch((err) => {
    consola.error('保存过程中发生错误:', err)
  })

  return promise
}

/**
 * 使用缓存的翻译函数
 */
function useCachedTranslate(fn: (text: string) => Promise<string>) {
  const cache = new Map<string, Promise<string>>()

  // 包装一个带缓存的 translate 函数
  return (text: string) => {
    if (cache.has(text))
      return cache.get(text)! // cache hit

    // new request
    const p = fn(text)
      .then(expandContractions)
      .catch((err) => {
        cache.delete(text) // 出错时清除缓存
        throw err
      })
    cache.set(text, p)
    return p
  }
}

/**
 * 扩展英语常见缩写，把 don't → do not，it's → it is 等，同时去掉单引号。
 */
function expandContractions(input: string) {
  if (!input.includes('\''))
    return input
  return Object.entries(CONTRACTIONS).reduce(
    (str, [k, v]) => str.replaceAll(k, v),
    input,
  ).replaceAll('\'', ' ')
}

/**
 * 生成 i18n 文件
 */
async function saveToI18n([filePath, data]: [string, TranslateResult[]]) {
  const parsed = path.parse(filePath)
  const dirSegments = parsed.dir.split(path.sep).slice(1) // 去掉第一个元素(根目录)
  const fileName = parsed.name

  const zhDir = path.join(OUT_DIR, `./i18n/zh/${dirSegments.join(path.sep)}`)
  const enDir = path.join(OUT_DIR, `./i18n/en/${dirSegments.join(path.sep)}`)

  await fsp.access(zhDir).catch(() => fsp.mkdir(zhDir, { recursive: true }))
  await fsp.access(enDir).catch(() => fsp.mkdir(enDir, { recursive: true }))

  // export
  const zh: Record<string, string> = {}
  const en: Record<string, string> = {}
  data.forEach((i) => {
    zh[i.key] = i.text
    en[i.key] = i.after
  })

  const zhFilePath = await addI18nFile(zhDir, fileName, zh)
  const enFilePath = await addI18nFile(enDir, fileName, en)

  return {
    zhFilePath,
    enFilePath,
  }
}

/**
 * 添加 i18n 文件并返回文件路径
 */
async function addI18nFile(dir: string, fileName: string, content: Record<string, string>) {
  const contentStr = `export const ${getExportName(fileName)} = ${JSON.stringify(content, null, 2)}`
  const filePath = path.join(dir, `${fileName}.js`)
  await fsp.writeFile(filePath, contentStr, 'utf8')
  consola.success(`I18n file created: ${filePath}`)

  return filePath
}

/**
 * 添加导出文件
 */
async function addExportFile(set: Set<string>, type: string) {
  const objRefArr: string[] = []

  const pathArr = Array.from(set)
  const contentArr = pathArr.map((p) => {
    const parsed = path.parse(p)
    const relativePath = getAliasName(parsed, 2)
    const dirSegments = parsed.dir.split(path.sep).slice(1) // 去掉第一个元素(根目录)

    objRefArr.push(relativePath)

    return `import { ${getExportName(parsed.name)} as ${relativePath} } from './${dirSegments.join('/')}/${parsed.base}'`
  })

  contentArr.push(`\nexport const ${type} = {\n  ${objRefArr.join(',\n  ')},\n}\n`)

  await fsp.writeFile(path.join(OUT_DIR, `./i18n/${type}.js`), contentArr.join('\n'), 'utf8')
  consola.success(`Export file created: i18n/${type}.js`)
}

function getAliasName(parsed: path.ParsedPath, slice = 1) {
  const dirSegments = parsed.dir.split(path.sep).slice(slice) // 去掉第一个元素(根目录)
  const fileName = parsed.name
  if (dirSegments.length === 0)
    return fileName

  // 文件名
  const fileNameCamelCase = fileName.charAt(0).toUpperCase() + fileName.slice(1).toLowerCase()
  // as 别名(小驼峰)
  const alias = dirSegments
    .map((seg, i) => toCamel(seg, /* upperFirst= */ i > 0))
    .join('') + fileNameCamelCase

  return alias
}

function getTranslateKey(text: string) {
  return text.toLocaleLowerCase().replaceAll(' ', '-').replaceAll('.', '')
}

/**
 * 生成导出名称
 */
function getExportName(name: string) {
  let exportItem = name.replaceAll('.', '')
  if (/[1-9]\d*|0/.test(exportItem.charAt(0))) {
    exportItem = `js${exportItem}`
  }
  return exportItem
}

function toCamel(str: string, upperFirst = false) {
  const parts = str.split(/[-_]/)
  return parts
    .map((word, i) => {
      const w = word.toLowerCase()
      if (i === 0 && !upperFirst)
        return w
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join('')
}

// translate()
