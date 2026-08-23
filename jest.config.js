export default {
  testEnvironment: 'node',
  // tsconfig は module: NodeNext（本番の ESM 出力用）だが、jest は CommonJS で読み込むため
  // テスト実行時だけ module を上書きする（isolatedModules: true との併用に必要）。
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS' } }],
    '^.+\\.js$': ['ts-jest', { tsconfig: { module: 'CommonJS' } }],
  },
  moduleFileExtensions: ['ts', 'js', 'mjs', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.test.js'],
  testTimeout: 30000,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
  ],
  coverageDirectory: 'coverage',
  transformIgnorePatterns: [
    'node_modules/(?!(tsx)/)',
  ],
};
