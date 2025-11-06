module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.d.ts',
    '!tests/**',
    '!dist/**',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 10000, // 10s for integration tests
};

