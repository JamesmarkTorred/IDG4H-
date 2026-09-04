module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      compiler: require.resolve('./node_modules/typescript'),
    }],
  },
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
};
