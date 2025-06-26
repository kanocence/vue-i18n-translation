import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    formatters: true,
  },
  {
    rules: {
      'eslint-comments/no-unlimited-disable': 'off',
      'vue/max-attributes-per-line': [
        'error',
        {
          singleline: { max: 3 },
          multiline: { max: 1 },
        },
      ],
    },
  },
)
