/**
 * OPTIONAL live integration test.
 *
 * This is NOT part of the normal `npm test` run and never runs in CI. It only
 * executes when a real ModelGate API key is provided via environment variables:
 *
 *   MODELGATE_E2E_API_KEY   (required)  your ModelGate key, e.g. mg_...
 *   MODELGATE_E2E_BASE_URL  (optional)  defaults to https://api.modelgatehq.com
 *   MODELGATE_E2E_MODEL     (optional)  defaults to gpt-5
 *
 * Run with:  npm run test:e2e
 *
 * It uses the SAME request builders the node uses (URL, messages, metadata) and
 * performs one minimal completion to verify the end-to-end flow:
 *   request builder -> ModelGate API -> response -> x-modelgate-request-id
 */
import {
	buildChatCompletionsUrl,
	buildMessagesFromPrompt,
	buildMetadata,
	extractRequestId,
	extractText,
	type ChatResponseBody,
} from '../nodes/ModelGate/GenericFunctions';

const apiKey = process.env.MODELGATE_E2E_API_KEY;
const baseUrl = process.env.MODELGATE_E2E_BASE_URL ?? 'https://api.modelgatehq.com';
const model = process.env.MODELGATE_E2E_MODEL ?? 'gpt-5';

// Skip the whole suite unless a key is present.
const maybe = apiKey ? describe : describe.skip;

maybe('ModelGate live E2E', () => {
	it('performs a real authenticated completion and returns a request id', async () => {
		const url = buildChatCompletionsUrl(baseUrl);
		const body = {
			model,
			messages: buildMessagesFromPrompt('Reply with the single word: pong'),
			stream: false,
			max_tokens: 16,
			metadata: buildMetadata(
				{
					workflowId: 'e2e',
					workflowName: 'n8n-nodes-modelgate e2e',
					nodeName: 'ModelGate',
					nodeType: 'n8n-nodes-modelgate.modelGate',
					nodeTypeVersion: 1,
				},
				[{ key: 'test', value: 'e2e' }],
			),
		};

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});

		expect(response.ok).toBe(true);

		const requestId = extractRequestId(
			Object.fromEntries(response.headers.entries()) as Record<string, unknown>,
		);
		// Expect the ModelGate correlation header (REQUEST_ID_HEADER) to be present.
		expect(requestId).toBeTruthy();

		const parsed = (await response.json()) as ChatResponseBody;
		expect(parsed.choices?.length).toBeGreaterThan(0);
		expect(typeof extractText(parsed)).toBe('string');
		// eslint-disable-next-line no-console
		console.log('ModelGate E2E ok:', { requestId, model: parsed.model, text: extractText(parsed) });
	});
});
