import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: 'dot',
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
    ],
  },
})
