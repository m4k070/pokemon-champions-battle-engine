// @ts-check
// 型情報を使うルール (recommendedTypeChecked) で src/ を検査する。
// any の伝播 (no-unsafe-*) を止めるのが主目的。外部入力は zod で検証してから型を付ける。
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'docs/'] },
  {
    files: ['src/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // BattleAgent は LLM 呼び出しを想定した async インターフェース。
      // 同期で決まる実装 (RandomBattleAgent 等) も async のまま揃えるので、await の有無は問わない。
      '@typescript-eslint/require-await': 'off',
    },
  },
);
