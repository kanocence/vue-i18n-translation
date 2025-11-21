# vue-i18n-translation

[![code style](https://antfu.me/badge-code-style.svg)](https://github.com/antfu/eslint-config)

`vue-i18n-translation` 是一款针对 Vue 项目中中文文本的 CLI 自动化工具，基于 [vue-i18n](https://github.com/intlify/vue-i18n)。

实现上包含**提取**、**翻译**、**包裹**三部分：

1. **collect**：静态分析 `.js` 和 `.vue` 文件，抽取中文文本并生成源映射（sourcemap）。
2. **translate**：基于可配置的翻译函数（如彩云 API），带有重试和限流机制，将源映射中的文本翻译并输出 i18n JSON 映射文件。
3. **wrap**：将原始中文文本替换为 `$t` 或 `i18n.t` 调用，并输出包裹后的文件或直接覆盖源文件。

---

## 功能特性

- 🔍 **静态提取**：基于 Babel + Vue Compiler‑SFC。
- 🔁 **重试机制**：自动处理网络波动和偶发 API 错误。
- 📈 **限流控制**：自定义 QPS，避免触发翻译 API 限制。
- 📦 **批量进度条**：实时可视化进度反馈。
- ⚙️ **可配置输出**：灵活设置输出目录和文件命名。

---

## 适用范围

| 场景         | 支持 | 不支持 |
| ------------ | ---- | ------ |
| Vue template | ✅   |        |
| Vue script   | ✅   |        |
| Vue setup    | ✅   |        |
| Vue setup ts |      | ❌     |
| JS 文件      | ✅   |        |
| TS 文件      |      | ❌     |
| JSX 文件     | ✅   |        |
| TSX 文件     |      | ❌     |

---

## 安装与使用

1. 克隆或下载项目：

   ```bash
   git clone https://github.com/kanocence/vue-i18n-translation.git
   ```

2. 安装依赖：

   ```bash
   pnpm install
   # 或者 bun install
   ```

3. 新建工作目录，将需要翻译的源码复制到该目录（例如 `workspace/`）。

4. 格式化代码

   未格式化的代码可能会导致运行错误

   ```bash
   pnpm eslint --ext .js,.vue --fix ./workspace
   # 或者 bun eslint --ext .js,.vue --fix ./workspace
   ```

5. 实现 `translateFn` 函数

   `/src/translation-api.ts` 中提供了 彩云小译(提供 token 可直接使用) 和 google 的用例

   以下以彩云api为例

6. 执行翻译：

   ```bash
   pnpm i18n
   # 或者用 bun 替换 tsx, bun ./src/index.ts
   ```

   默认输出 `translation-map.json`。

7. 检查结果

   默认将生成内容写入 `./i18n-output/`，也可按需覆盖源文件。

---

### 在代码中调用示例

```ts
// src/index.ts

// 需要实现 api 函数
async function translationApi(text: string): Promise<string> {
  // 在此调用彩云、Google 等翻译 API，返回 Promise<string>
  return text
}

// 包装限流和重试
const translateFn = rateLimit(withRetry(translationApi, { retries: 4, baseDelay: 1000 }), 8)

async function runPipeline() {
  const collectFile = 'sourcemap.json'
  const translateFile = 'translation-map.json'

  await collect({ dirs: ['workspace/'], collectFile })
  await translate({ sourcemap: collectFile, resultFile: translateFile, translateFn })
  await wrap({ translationMapFile: translateFile, outputDir: 'wrap', override: false })
  process.exit(0)
}

runPipeline()
```

---

## 配置选项

所有命令都支持 CLI 参数或编程调用：

```ts
interface CollectOptions {
  collectFile?: string // 输出 sourcemap 文件名，默认 'sourcemap.json'
  dirs?: string[] // 待扫描的目录列表，默认 ['./src']
}

interface TranslateOptions {
  sourcemap?: string // 源映射文件，默认 'sourcemap.json'
  resultFile?: string // 翻译结果文件，默认 'translation-map.json'
  translateFn: (text: string) => Promise<string> // 用户自定义翻译函数，返回 Promise<string>
}

interface WrapConfig {
  template?: string // 模板文本的包裹格式，默认 "$t('<%= text %>')"
  script?: string // 脚本文本的包裹格式，默认 "i18n.t('<%= text %>')"
  import?: string // i18n 导入语句，默认 "import { useI18n } from 'vue-i18n'"
}

interface WrapOptions {
  translationMapFile?: string // 翻译映射文件路径，默认 'translation-map.json'
  override?: boolean // 是否覆盖源文件，默认 false
  outputDir?: string // 输出目录，override = false 时生效，默认 'i18n-output'
  wrapConfig?: WrapConfig // 自定义包裹方式
}
```

---

## 使用建议

- **版本管理**：可在输出目录命名时添加版本号或时间戳，方便对比。
- **多翻译源**：对接不同 API 会有差异，可实现多个 `translateFn` 以对比效果。
- **CI 集成**：可将 `collect` 作为校验步骤，保证无遗漏中文文本。

---

## 自定义构建

实现翻译函数后，也可以通过 vite 打包分发

1. 编辑配置文件 `vite.config.ts`

2. 构建

   ```bash
   pnpm build
   ```

## TODO

1. 从翻译文本改为翻译 i18n.json 或 i18n.js 文件
2. 引入智能体