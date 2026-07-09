// ESLint flat config — required from the first commit (V2_HANDOFF.md §2.3).
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'android/', 'node_modules/'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The core must stay deterministic — Math.random is forbidden (V2_HANDOFF.md §2.1).
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded PRNG from src/core/rng.ts — Math.random breaks replays.',
        },
      ],
      'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 5],
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // src/viewmodel/ must stay pure TypeScript — zero Phaser, zero src/view/** except
    // textureKeys.ts (pure icon-key lookups) and palette.ts (pure numeric color
    // constants, verified zero-Phaser) — so it stays testable without Phaser.
    files: ['src/viewmodel/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['phaser', 'phaser3*'], message: 'src/viewmodel/** must not import Phaser.' },
          { group: ['../view/*', '!../view/textureKeys', '!../view/palette'], message: 'src/viewmodel/** may only import src/view/textureKeys or src/view/palette.' },
        ],
      }],
    },
  },
);
