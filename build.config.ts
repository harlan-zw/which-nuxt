import { defineBuildConfig } from 'obuild/config'

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: [
        './src/index.ts',
        './src/scanners.ts',
        './src/modules/index.ts',
        './src/modules/official.ts',
        './src/modules/community.ts',
        './src/cli-entry.ts',
      ],
    },
  ],
})
