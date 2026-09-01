/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/test'],
	testMatch: ['**/*.e2e.test.ts'],
	// Live tests can be slow; allow a generous timeout.
	testTimeout: 60000,
};
