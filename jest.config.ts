// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  preset: 'ts-jest',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
    }],
  },
};

export default config;

