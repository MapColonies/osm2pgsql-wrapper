const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('../../../tsconfig.json');

/** @type {import('jest').Config} */
module.exports = {
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest'],
  },
  transformIgnorePatterns: ['node_modules/(?!(@turf|kdbush|supercluster|geokdbush)/)'],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
  testMatch: ['<rootDir>/tests/unit/**/*.spec.ts'],
  coverageReporters: ['text', 'html'],
  collectCoverage: true,
  collectCoverageFrom: ['!**/node_modules/**', '!**/vendor/**', '**/expireTilesParser.ts', '**/expireTilesFilters.ts'],
  coverageDirectory: '<rootDir>/coverage',
  reporters: [
    'default',
    ['jest-html-reporters', { multipleReportsUnitePath: './reports', pageTitle: 'unit', publicPath: './reports', filename: 'unit.html' }],
  ],
  rootDir: '../../../.',
  setupFiles: ['<rootDir>/tests/configurations/jest.setup.ts'],
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: -10,
    },
  },
};
