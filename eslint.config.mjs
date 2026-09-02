// This package uses the standard community-node lint tier (n8n Cloud support
// disabled; `n8n.strict: false` in package.json). The stricter n8n Cloud tier is
// not achievable today: it requires a credential test the gateway cannot support
// (backend gap E7) and bans all Node globals/built-ins package-wide (which the
// optional env-driven live E2E test needs). Re-enable with
// `npx n8n-node cloud-support enable` once ModelGate adds a lightweight
// authenticated GET endpoint for the credential test.
import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	...configWithoutCloudSupport,
	{
		// The ModelGate gateway currently exposes no safe, authenticated,
		// zero-cost endpoint suitable for an n8n credential test:
		//   - GET /health is unauthenticated (cannot validate a key),
		//   - there is no capability-discovery endpoint (GET /v1/models -> 404),
		//   - the only authenticated endpoints are paid inference endpoints.
		// We intentionally omit the credential `test` (see
		// credentials/ModelGateApi.credentials.ts) rather than ship a broken or
		// false-positive test, and disable the rule that would otherwise require
		// one. Revisit if ModelGate adds a lightweight authenticated GET endpoint.
		files: ['credentials/**/*.ts'],
		rules: {
			'@n8n/community-nodes/credential-test-required': 'off',
		},
	},
];
