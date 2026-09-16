// This package uses the standard community-node lint tier (n8n Cloud support
// disabled; `n8n.strict: false` in package.json). The credential is verified by
// a programmatic `credentialTest` method on the node (see
// nodes/ModelGate/ModelGate.node.ts, wired via `testedBy`), so the
// `credential-test-required` rule is satisfied without any rule overrides.
import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [...configWithoutCloudSupport];
