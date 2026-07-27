export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'mjs', 'json'],
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
