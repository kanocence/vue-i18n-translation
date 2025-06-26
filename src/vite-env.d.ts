/// <reference types="vite/client" />

declare module '@babel/generator' {
  const generator: any
  export default generator
}

declare module '@babel/traverse' {
  const traverse: any
  export default traverse
}

declare module 'cli-progress' {
  export const Presets: any
  export const SingleBar: any
}

interface CollectOptions {
  collectFile?: string
  dirs?: string[]
}

interface CollectResult {
  text: string
  location: string
  row: number
  col: number
  len: number
  type: number
}

type PartialCollectResult = Omit<CollectResult, 'type'> & { type?: number }

interface CollectAnalyzeOptions {
  content: string
  startLineOffset?: number // 起始行偏移，默认 0
  types: {
    stringLiteral: number
    templateLiteral: number
  }
  errorContext: string // 用于日志
}

interface TranslateOptions {
  sourcemap?: string
  resultFile?: string
  translateFn: (text: string) => Promise<string> // 翻译函数
}

interface TranslateResult extends CollectResult {
  key: string
  after: string
  alias: string
}

type WrapperFn = (before: string, afterRaw: string, entry: TranslateResult) => string

interface WrapEntry extends TranslateResult {
  wrapper: WrapperFn
}

interface WrapConfig {
  template: string // vue 模板的包裹方式
  import: string // i18n 导入语句
  script: string // JS/TS 脚本的包裹方式
}

interface WrapOptions {
  translationMapFile?: string // 翻译映射文件路径
  override?: boolean // 是否覆盖原文件
  outputDir?: string // 输出目录，override = false 时有效
  wrapConfig?: WrapConfig
}
