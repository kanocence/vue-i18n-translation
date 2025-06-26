import consola from 'consola'

/**
 * 彩云小译
 *
 * @see https://platform.caiyunapp.com/
 */
export async function translateCaiyun(text: string, token = ''): Promise<string> {
  return fetch('https://api.interpreter.caiyunai.com/v1/translator', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Authorization': `token ${token}`,
    },
    body: JSON.stringify({
      source: [text],
      trans_type: 'zh2en',
      media: 'text',
    }),
  })
    .then((response) => {
      if (!response.ok) {
        consola.error(`translate: ${text} HTTP error! status: ${response}`)
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return response.json()
    })
    .then((data) => {
      if (data.target && data.target.length > 0) {
        consola.debug(`Translation successful: ${text} => ${data.target[0]}`)
        return data.target[0]
      }
      else {
        consola.error('Translation failed or no target text found in response:', data)
        throw new Error('Translation failed or no target text found')
      }
    })
    .catch((error) => {
      consola.error('Error during translation:', error)
      throw error
    })
}

// Imports the Google Cloud client library
// const { Translate } = require('@google-cloud/translate').v2

// Creates a client
// const translate = new Translate()

/**
 * TODO(developer): Uncomment the following lines before running the sample.
 */
// const text = 'The text to translate, e.g. Hello, world!';
// const target = 'The target language, e.g. ru';
// const model = 'The model to use, e.g. nmt';

// async function translateTextWithModel() {
//   const options = {
//     // The target language, e.g. "ru"
//     to: target,
//     // Make sure your project is on the allow list.
//     // Possible values are "base" and "nmt"
//     model,
//   }

//   // Translates the text into the target language. "text" can be a string for
//   // translating a single piece of text, or an array of strings for translating
//   // multiple texts.
//   let [translations] = await translate.translate(text, options)
//   translations = Array.isArray(translations) ? translations : [translations]
//   console.log('Translations:')
//   translations.forEach((translation, i) => {
//     console.log(`${text[i]} => (${target}) ${translation}`)
//   })
// }

/**
 * @see https://console.cloud.google.com/marketplace/product/google/translate.googleapis.com
 * @see https://cloud.google.com/translate/docs/samples/translate-text-with-model
 */
// translateTextWithModel()
