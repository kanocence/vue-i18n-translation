export const COLLECT_TYPE = {
  /**
   * 字符串字面量
   */
  STRING_LITERAL: 0,
  /**
   * 模板字符串
   */
  TEMPLATE_LITERAL: 1,
  /**
   * vue 模板
   */
  VUE_TEMPLATE: 2,
  /**
   * vue 字符串字面量
   */
  VUE_STRING_LITERAL: 3,
  /**
   * vue 模板字符串
   */
  VUE_TEMPLATE_LITERAL: 4,
}

/**
 * 汉字正则( Unicode 属性) 匹配任何汉字字符
 */
// const CHINESE_REGEX = /\p{Script=Han}/u
export const CHINESE_REGEX = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/

/**
 * 同时匹配 汉字 & 拉丁字母 & 数字 & 半角/全角符号
 */
export const TEMPLATE_REGEX = /\s*[\u4E00-\u9FFF][\u4E00-\u9FFF\w();?:.,!*&^%$#@、（）；？：。，！—\u0020]+/g

/**
 * babel parser options
 */
export const PARSER_OPTIONS: import('@babel/parser').ParserOptions = {
  sourceType: 'module',
  plugins: ['jsx', 'typescript'],
}

export const CONTRACTIONS: Record<string, string> = {
  '\'t': ' not',
  '\'m': ' am',
  '\'re': ' are',
  '\'ve': ' have',
  '\'ll': ' will',
  '\'d': ' would',
  '\'s': ' is',
}

export const OUT_DIR = 'i18n-output'
