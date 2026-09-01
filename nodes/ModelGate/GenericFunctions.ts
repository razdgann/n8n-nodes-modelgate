import type { IDataObject, JsonObject } from 'n8n-workflow';

/** Value sent in ModelGate metadata so every request is attributable to n8n. */
export const MODELGATE_SOURCE = 'n8n';

/** Header ModelGate returns on every response for request correlation. */
export const REQUEST_ID_HEADER = 'x-modelgate-request-id';

/** Chat path on the OpenAI-compatible ModelGate API. */
export const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';

/**
 * Metadata keys the node owns for attribution/correlation. User-supplied
 * metadata may never overwrite these, otherwise ModelGate analytics could no
 * longer be tied back to the exact n8n workflow/node/execution.
 */
export const RESERVED_METADATA_KEYS = [
	'source',
	'workflow_id',
	'workflow_name',
	'execution_id',
	'execution_mode',
	'node_name',
	'node_type',
	'node_type_version',
] as const;

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
	role: ChatRole;
	content: string;
}

export interface MetadataContext {
	workflowId?: string;
	workflowName?: string;
	executionId?: string;
	executionMode?: string;
	nodeName?: string;
	nodeType?: string;
	nodeTypeVersion?: number | string;
}

export interface UserMetadataEntry {
	key?: string;
	value?: string;
}

/**
 * Normalise the configured base URL to a bare origin without a trailing slash
 * so we can safely append a fixed API path. Never lets request data change the
 * host — only the credential-configured origin is used.
 */
export function normalizeBaseUrl(baseUrl: string): string {
	const trimmed = (baseUrl ?? '').trim();
	if (trimmed === '') {
		return 'https://api.modelgatehq.com';
	}
	return trimmed.replace(/\/+$/, '');
}

/** Build the full chat-completions URL from a (possibly messy) base URL. */
export function buildChatCompletionsUrl(baseUrl: string): string {
	return `${normalizeBaseUrl(baseUrl)}${CHAT_COMPLETIONS_PATH}`;
}

/** Turn a single free-form prompt into an OpenAI-style messages array. */
export function buildMessagesFromPrompt(prompt: string, systemPrompt?: string): ChatMessage[] {
	const messages: ChatMessage[] = [];
	if (systemPrompt && systemPrompt.trim() !== '') {
		messages.push({ role: 'system', content: systemPrompt });
	}
	messages.push({ role: 'user', content: prompt });
	return messages;
}

/** Validate and normalise a user-defined messages collection. */
export function normalizeMessages(raw: Array<{ role?: string; content?: string }>): ChatMessage[] {
	const allowed: ChatRole[] = ['system', 'user', 'assistant'];
	return raw
		.filter((m) => m && typeof m.content === 'string')
		.map((m) => {
			const role = (m.role ?? 'user') as ChatRole;
			return {
				role: allowed.includes(role) ? role : 'user',
				content: m.content as string,
			};
		});
}

/**
 * Merge node-generated attribution metadata with optional user metadata.
 * System keys always win so attribution can never be silently broken.
 */
export function buildMetadata(
	context: MetadataContext,
	userMetadata: UserMetadataEntry[] = [],
): IDataObject {
	const metadata: IDataObject = { source: MODELGATE_SOURCE };

	const assignIfPresent = (key: string, value: unknown) => {
		if (value !== undefined && value !== null && value !== '') {
			metadata[key] = value;
		}
	};

	assignIfPresent('workflow_id', context.workflowId);
	assignIfPresent('workflow_name', context.workflowName);
	assignIfPresent('execution_id', context.executionId);
	assignIfPresent('execution_mode', context.executionMode);
	assignIfPresent('node_name', context.nodeName);
	assignIfPresent('node_type', context.nodeType);
	assignIfPresent('node_type_version', context.nodeTypeVersion);

	const reserved = new Set<string>(RESERVED_METADATA_KEYS);
	for (const entry of userMetadata) {
		const key = entry?.key?.trim();
		if (!key || reserved.has(key)) {
			continue;
		}
		metadata[key] = entry.value ?? '';
	}

	return metadata;
}

/** Case-insensitive lookup of the ModelGate request id from response headers. */
export function extractRequestId(
	headers: Record<string, unknown> | undefined,
): string | undefined {
	if (!headers) {
		return undefined;
	}
	for (const [name, value] of Object.entries(headers)) {
		if (name.toLowerCase() === REQUEST_ID_HEADER) {
			return Array.isArray(value) ? String(value[0]) : String(value);
		}
	}
	return undefined;
}

export interface ParsedError {
	message: string;
	description?: string;
	httpCode?: string;
	requestId?: string;
	errorCode?: string;
}

const STATUS_MESSAGES: Record<number, string> = {
	400: 'ModelGate rejected the request as invalid (400)',
	401: 'ModelGate authentication failed — check your API key (401)',
	403: 'ModelGate denied the request — the key lacks permission or a limit was hit (403)',
	404: 'ModelGate endpoint or model not found (404)',
	422: 'ModelGate could not process the request parameters (422)',
	429: 'ModelGate rate limit or spend limit reached (429)',
	500: 'ModelGate encountered an internal error (500)',
	502: 'ModelGate could not reach the upstream provider (502)',
	503: 'ModelGate is temporarily unavailable (503)',
	504: 'ModelGate timed out talking to the upstream provider (504)',
};

/**
 * Extract safe, useful, machine-readable info from a failed request without
 * ever exposing the API key or request headers.
 */
export function parseModelGateError(error: unknown): ParsedError {
	const err = (error ?? {}) as JsonObject & {
		response?: { statusCode?: number; status?: number; headers?: Record<string, unknown>; body?: unknown };
		statusCode?: number;
		code?: string;
		message?: string;
	};

	const statusCode: number | undefined =
		err.response?.statusCode ?? err.response?.status ?? (err.statusCode as number | undefined);

	const requestId = extractRequestId(err.response?.headers as Record<string, unknown> | undefined);

	// ModelGate/OpenAI-compatible error bodies look like { error: { message, code, type } }.
	const body = err.response?.body as
		| { error?: { message?: string; code?: string; type?: string }; message?: string }
		| string
		| undefined;

	let providerMessage: string | undefined;
	let errorCode: string | undefined;
	if (typeof body === 'string') {
		providerMessage = body.slice(0, 500);
	} else if (body && typeof body === 'object') {
		providerMessage = body.error?.message ?? body.message;
		errorCode = body.error?.code ?? body.error?.type;
	}

	let message: string;
	if (statusCode && STATUS_MESSAGES[statusCode]) {
		message = STATUS_MESSAGES[statusCode];
	} else if (statusCode && statusCode >= 500) {
		message = `ModelGate returned a server error (${statusCode})`;
	} else if (statusCode) {
		message = `ModelGate request failed (${statusCode})`;
	} else if (typeof err.code === 'string') {
		message = `Could not reach ModelGate (${err.code})`;
	} else {
		message = err.message ? String(err.message) : 'ModelGate request failed';
	}

	const descriptionParts: string[] = [];
	if (providerMessage) {
		descriptionParts.push(providerMessage);
	}
	if (requestId) {
		descriptionParts.push(`ModelGate request id: ${requestId}`);
	}

	return {
		message,
		description: descriptionParts.length ? descriptionParts.join(' — ') : undefined,
		httpCode: statusCode !== undefined ? String(statusCode) : undefined,
		requestId,
		errorCode,
	};
}

export interface ChatResponseBody {
	id?: string;
	model?: string;
	choices?: Array<{
		index?: number;
		finish_reason?: string;
		message?: { role?: string; content?: string | null };
	}>;
	usage?: IDataObject;
	[key: string]: unknown;
}

/** Extract the assistant text from the first choice, if present. */
export function extractText(body: ChatResponseBody | undefined): string {
	const content = body?.choices?.[0]?.message?.content;
	return typeof content === 'string' ? content : '';
}
