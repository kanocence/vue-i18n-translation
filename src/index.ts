import process from 'node:process'
import consola from 'consola'
import { collect } from './collect'
import { translate } from './translate'
import { translateCaiyun } from './translation-api'
import { rateLimit, withRetry } from './utils'
import { wrap } from './wrap'

const translateFn = rateLimit(withRetry(translateCaiyun, { retries: 4, baseDelay: 1000 }), 8)

async function runPipeline() {
  const collectFile = 'sourcemap.json'
  const translateFile = 'translation-map.json'

  await collect({ dirs: ['workspace/'], collectFile })
  await translate({ sourcemap: collectFile, resultFile: translateFile, translateFn })
  await wrap({ translationMapFile: translateFile, outputDir: 'wrap', override: false })
  consola.success('All done')
  process.exit(0)
}

runPipeline()
