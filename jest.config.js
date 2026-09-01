/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/test'],
	testMatch: ['**/*.test.ts'],
	testPathIgnorePatterns: ['/node_modules/', '\\.e2e\\.test\\.ts$'],
	collectCoverageFrom: ['nodes/**/*.ts', 'credentials/**/*.ts'],
};
