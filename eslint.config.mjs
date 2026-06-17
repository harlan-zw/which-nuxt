import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  rules: {
    'node/prefer-global/process': 'off',
    'ts/explicit-function-return-type': 'off',
    'e18e/prefer-static-regex': 'warn',
  },
}, {
  files: ['test/**/*.ts'],
  rules: {
    'e18e/prefer-static-regex': 'off',
  },
}, {
  files: ['scripts/smoke-nuxt-fyi.mjs'],
  rules: {
    'antfu/no-import-dist': 'off',
  },
})
