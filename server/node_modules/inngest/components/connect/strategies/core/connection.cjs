const require_rolldown_runtime = require('../../../../_virtual/rolldown_runtime.cjs');
const require_consts = require('../../../../helpers/consts.cjs');
const require_version = require('../../../../version.cjs');
const require_env = require('../../../../helpers/env.cjs');
const require_connect = require('../../../../proto/src/components/connect/protobuf/connect.cjs');
const require_util = require('../../util.cjs');
const require_os = require('../../os.cjs');
const require_types = require('../../types.cjs');
const require_url = require('../../../../helpers/url.cjs');
const require_messages = require('../../messages.cjs');
let ms = require("ms");
ms = require_rolldown_runtime.__toESM(ms);
let __jpwilliams_waitgroup = require("@jpwilliams/waitgroup");

//#region src/components/connect/strategies/core/connection.ts
/**
* Shared connection core logic used by both SameThreadStrategy and
* WorkerThreadStrategy.
*
* This module extracts the common WebSocket connection management, handshake,
* heartbeat, lease extension, and reconnection logic.
*/
const ConnectWebSocketProtocol = "v0.connect.inngest.com";
function toError(value) {
	if (value instanceof Error) return value;
	return new Error(String(value));
}
/**
* Core connection manager that handles WebSocket connection lifecycle,
* handshake, heartbeat, lease extension, and reconnection.
*/
var ConnectionCore = class {
	config;
	callbacks;
	currentConnection;
	excludeGateways = /* @__PURE__ */ new Set();
	inProgressRequests = {
		wg: new __jpwilliams_waitgroup.WaitGroup(),
		requestLeases: {}
	};
	constructor(config, callbacks) {
		this.config = config;
		this.callbacks = callbacks;
	}
	get connection() {
		return this.currentConnection;
	}
	get connectionId() {
		return this.currentConnection?.id;
	}
	/**
	* Wait for all in-progress requests to complete.
	*/
	async waitForInProgress() {
		await this.inProgressRequests.wg.wait();
	}
	/**
	* Main connection loop with reconnection logic.
	*/
	async connect(attempt = 0, path = []) {
		if (typeof WebSocket === "undefined") throw new Error("WebSockets not supported in current environment");
		if (this.callbacks.getState() === require_types.ConnectionState.CLOSED) throw new Error("Connection already closed");
		this.callbacks.logger.debug({ attempt }, "Establishing connection");
		let useSigningKey = this.config.hashedSigningKey;
		while (true) {
			if (this.callbacks.getState() === require_types.ConnectionState.CLOSED) break;
			if (this.callbacks.beforeConnect) await this.callbacks.beforeConnect(useSigningKey);
			try {
				await this.prepareConnection(useSigningKey, attempt, [...path]);
				return;
			} catch (err) {
				this.callbacks.logger.warn({ err: toError(err) }, "Failed to connect");
				if (!(err instanceof require_util.ReconnectError)) throw err;
				attempt = err.attempt;
				if (err instanceof require_util.AuthError) {
					const switchToFallback = useSigningKey === this.config.hashedSigningKey;
					if (switchToFallback) this.callbacks.logger.debug("Switching to fallback signing key");
					useSigningKey = switchToFallback ? this.config.hashedFallbackKey : this.config.hashedSigningKey;
				}
				if (err instanceof require_util.ConnectionLimitError) this.callbacks.logger.error("You have reached the maximum number of concurrent connections. Please disconnect other active workers to continue.");
				const delay = require_util.expBackoff(attempt);
				this.callbacks.logger.debug({ delay }, "Reconnecting");
				if (await require_util.waitWithCancel(delay, () => {
					return this.callbacks.getState() === require_types.ConnectionState.CLOSED;
				})) {
					this.callbacks.logger.debug("Reconnect backoff cancelled");
					break;
				}
				attempt++;
			}
		}
		this.callbacks.logger.debug("Exiting connect loop");
	}
	/**
	* Clean up the current connection.
	*/
	async cleanup() {
		if (this.currentConnection) {
			await this.currentConnection.cleanup();
			this.currentConnection = void 0;
		}
	}
	async sendStartRequest(hashedSigningKey, attempt) {
		const msg = require_messages.createStartRequest(Array.from(this.excludeGateways));
		const headers = {
			"Content-Type": "application/protobuf",
			...hashedSigningKey ? { Authorization: `Bearer ${hashedSigningKey}` } : {}
		};
		if (this.config.envName) headers[require_consts.headerKeys.Environment] = this.config.envName;
		const targetUrl = new URL("/v0/connect/start", await this.getApiBaseUrl());
		let resp;
		try {
			resp = await fetch(targetUrl, {
				method: "POST",
				body: new Uint8Array(msg),
				headers
			});
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : "Unknown error";
			throw new require_util.ReconnectError(`Failed initial API handshake request to ${targetUrl.toString()}, ${errMsg}`, attempt);
		}
		if (!resp.ok) {
			if (resp.status === 401) throw new require_util.AuthError(`Failed initial API handshake request to ${targetUrl.toString()}${this.config.envName ? ` (env: ${this.config.envName})` : ""}, ${await resp.text()}`, attempt);
			if (resp.status === 429) throw new require_util.ConnectionLimitError(attempt);
			throw new require_util.ReconnectError(`Failed initial API handshake request to ${targetUrl.toString()}, ${await resp.text()}`, attempt);
		}
		return await require_messages.parseStartResponse(resp);
	}
	async prepareConnection(hashedSigningKey, attempt, path = []) {
		let closed = false;
		this.callbacks.logger.debug({
			attempt,
			path
		}, "Preparing connection");
		const startedAt = /* @__PURE__ */ new Date();
		const startResp = await this.sendStartRequest(hashedSigningKey, attempt);
		const connectionId = startResp.connectionId;
		path.push(connectionId);
		let resolveWebsocketConnected;
		let rejectWebsocketConnected;
		const websocketConnectedPromise = new Promise((resolve, reject) => {
			resolveWebsocketConnected = resolve;
			rejectWebsocketConnected = reject;
		});
		const connectTimeout = setTimeout(() => {
			this.excludeGateways.add(startResp.gatewayGroup);
			rejectWebsocketConnected?.(new require_util.ReconnectError(`Connection ${connectionId} timed out`, attempt));
		}, 1e4);
		const finalEndpoint = this.config.gatewayUrl || startResp.gatewayEndpoint;
		if (finalEndpoint !== startResp.gatewayEndpoint) this.callbacks.logger.debug({
			original: startResp.gatewayEndpoint,
			override: finalEndpoint
		}, "Overriding gateway endpoint");
		this.callbacks.logger.debug({
			endpoint: finalEndpoint,
			gatewayGroup: startResp.gatewayGroup,
			connectionId
		}, "Connecting to gateway");
		const ws = new WebSocket(finalEndpoint, [ConnectWebSocketProtocol]);
		ws.binaryType = "arraybuffer";
		let onConnectionError = (error) => {
			if (closed) {
				this.callbacks.logger.debug({ connectionId }, "Connection error while initializing but already in closed state, skipping");
				return;
			}
			closed = true;
			this.callbacks.logger.debug({ connectionId }, "Connection error in connecting state, rejecting promise");
			this.excludeGateways.add(startResp.gatewayGroup);
			clearTimeout(connectTimeout);
			ws.onerror = () => {};
			ws.onclose = () => {};
			ws.close(4001, require_connect.workerDisconnectReasonToJSON(require_connect.WorkerDisconnectReason.UNEXPECTED));
			rejectWebsocketConnected?.(new require_util.ReconnectError(`Error while connecting (${connectionId}): ${error instanceof Error ? error.message : "Unknown error"}`, attempt));
		};
		ws.onerror = (err) => onConnectionError(err);
		ws.onclose = (ev) => {
			onConnectionError(new require_util.ReconnectError(`Connection ${connectionId} closed: ${ev.reason}`, attempt));
		};
		const setupState = {
			receivedGatewayHello: false,
			sentWorkerConnect: false,
			receivedConnectionReady: false
		};
		let heartbeatIntervalMs;
		let extendLeaseIntervalMs;
		ws.onmessage = async (event) => {
			const connectMessage = require_messages.parseConnectMessage(new Uint8Array(event.data));
			this.callbacks.logger.debug({
				kind: require_connect.gatewayMessageTypeToJSON(connectMessage.kind),
				connectionId
			}, "Received message");
			if (!setupState.receivedGatewayHello) {
				if (connectMessage.kind !== require_connect.GatewayMessageType.GATEWAY_HELLO) {
					onConnectionError(new require_util.ReconnectError(`Expected hello message, got ${require_connect.gatewayMessageTypeToJSON(connectMessage.kind)}`, attempt));
					return;
				}
				setupState.receivedGatewayHello = true;
			}
			if (!setupState.sentWorkerConnect) {
				const workerConnectRequestMsg = require_connect.WorkerConnectRequestData.create({
					connectionId: startResp.connectionId,
					environment: this.config.envName,
					platform: require_env.getPlatformName({ ...require_env.allProcessEnv() }),
					sdkVersion: `v${require_version.version}`,
					sdkLanguage: "typescript",
					framework: "connect",
					workerManualReadinessAck: this.config.connectionData.manualReadinessAck,
					systemAttributes: await require_os.retrieveSystemAttributes(),
					authData: {
						sessionToken: startResp.sessionToken,
						syncToken: startResp.syncToken
					},
					apps: this.config.connectionData.apps,
					capabilities: new TextEncoder().encode(this.config.connectionData.marshaledCapabilities),
					startedAt,
					instanceId: this.config.instanceId || await require_os.getHostname(),
					maxWorkerConcurrency: this.config.maxWorkerConcurrency
				});
				const workerConnectRequestMsgBytes = require_connect.WorkerConnectRequestData.encode(workerConnectRequestMsg).finish();
				ws.send(require_connect.ConnectMessage.encode(require_connect.ConnectMessage.create({
					kind: require_connect.GatewayMessageType.WORKER_CONNECT,
					payload: workerConnectRequestMsgBytes
				})).finish());
				setupState.sentWorkerConnect = true;
				return;
			}
			if (!setupState.receivedConnectionReady) {
				if (connectMessage.kind !== require_connect.GatewayMessageType.GATEWAY_CONNECTION_READY) {
					onConnectionError(new require_util.ReconnectError(`Expected ready message, got ${require_connect.gatewayMessageTypeToJSON(connectMessage.kind)}`, attempt));
					return;
				}
				const readyPayload = require_connect.GatewayConnectionReadyData.decode(connectMessage.payload);
				setupState.receivedConnectionReady = true;
				heartbeatIntervalMs = readyPayload.heartbeatInterval.length > 0 ? (0, ms.default)(readyPayload.heartbeatInterval) : 1e4;
				extendLeaseIntervalMs = readyPayload.extendLeaseInterval.length > 0 ? (0, ms.default)(readyPayload.extendLeaseInterval) : 5e3;
				resolveWebsocketConnected?.();
				return;
			}
			this.callbacks.logger.warn({
				kind: require_connect.gatewayMessageTypeToJSON(connectMessage.kind),
				rawKind: connectMessage.kind,
				attempt,
				setupState,
				state: this.callbacks.getState(),
				connectionId
			}, "Unexpected message type during setup");
		};
		await websocketConnectedPromise;
		clearTimeout(connectTimeout);
		this.excludeGateways.delete(startResp.gatewayGroup);
		attempt = 0;
		const conn = {
			id: connectionId,
			ws,
			cleanup: () => {
				if (closed) return;
				closed = true;
				ws.onerror = () => {};
				ws.onclose = () => {};
				ws.close();
			},
			pendingHeartbeats: 0
		};
		this.currentConnection = conn;
		this.callbacks.onStateChange(require_types.ConnectionState.ACTIVE);
		let isDraining = false;
		onConnectionError = async (error) => {
			if (closed) {
				this.callbacks.logger.debug({ connectionId }, "Connection error but already in closed state, skipping");
				return;
			}
			closed = true;
			await conn.cleanup();
			const currentState = this.callbacks.getState();
			if (currentState === require_types.ConnectionState.CLOSING || currentState === require_types.ConnectionState.CLOSED) {
				this.callbacks.logger.debug({ connectionId }, "Connection error but already closing or closed, skipping");
				return;
			}
			this.callbacks.onStateChange(require_types.ConnectionState.RECONNECTING);
			this.excludeGateways.add(startResp.gatewayGroup);
			if (isDraining) {
				this.callbacks.logger.debug({ connectionId }, "Connection error but already draining, skipping");
				return;
			}
			this.callbacks.logger.warn({
				connectionId,
				err: toError(error)
			}, "Connection error");
			this.connect(attempt + 1, [...path, "onConnectionError"]);
		};
		ws.onerror = (err) => onConnectionError(err);
		ws.onclose = (ev) => {
			onConnectionError(new require_util.ReconnectError(`Connection closed: ${ev.reason}`, attempt));
		};
		ws.onmessage = async (event) => {
			const connectMessage = require_messages.parseConnectMessage(new Uint8Array(event.data));
			if (connectMessage.kind === require_connect.GatewayMessageType.GATEWAY_CLOSING) {
				isDraining = true;
				this.callbacks.logger.info({ connectionId }, "Received draining message");
				try {
					this.callbacks.logger.debug({ connectionId }, "Setting up new connection while keeping previous connection open");
					await this.connect(0, [...path]);
					await conn.cleanup();
				} catch (err) {
					this.callbacks.logger.warn({
						connectionId,
						err: toError(err)
					}, "Failed to reconnect after receiving draining message");
					await conn.cleanup();
					onConnectionError(new require_util.ReconnectError(`Failed to reconnect after receiving draining message (${connectionId})`, attempt));
				}
				return;
			}
			if (connectMessage.kind === require_connect.GatewayMessageType.GATEWAY_HEARTBEAT) {
				conn.pendingHeartbeats = 0;
				this.callbacks.logger.debug({ connectionId }, "Handled gateway heartbeat");
				return;
			}
			if (connectMessage.kind === require_connect.GatewayMessageType.GATEWAY_EXECUTOR_REQUEST) {
				if (this.callbacks.getState() !== require_types.ConnectionState.ACTIVE) {
					this.callbacks.logger.warn({ connectionId }, "Received request while not active, skipping");
					return;
				}
				const gatewayExecutorRequest = require_messages.parseGatewayExecutorRequest(connectMessage.payload);
				this.callbacks.logger.debug({
					requestId: gatewayExecutorRequest.requestId,
					appId: gatewayExecutorRequest.appId,
					appName: gatewayExecutorRequest.appName,
					functionSlug: gatewayExecutorRequest.functionSlug,
					stepId: gatewayExecutorRequest.stepId,
					connectionId
				}, "Received gateway executor request");
				if (typeof gatewayExecutorRequest.appName !== "string" || gatewayExecutorRequest.appName.length === 0) {
					this.callbacks.logger.warn({
						requestId: gatewayExecutorRequest.requestId,
						appId: gatewayExecutorRequest.appId,
						functionSlug: gatewayExecutorRequest.functionSlug,
						stepId: gatewayExecutorRequest.stepId,
						connectionId
					}, "No app name in request, skipping");
					return;
				}
				if (!this.config.appIds.includes(gatewayExecutorRequest.appName)) {
					this.callbacks.logger.warn({
						requestId: gatewayExecutorRequest.requestId,
						appId: gatewayExecutorRequest.appId,
						appName: gatewayExecutorRequest.appName,
						functionSlug: gatewayExecutorRequest.functionSlug,
						stepId: gatewayExecutorRequest.stepId,
						connectionId
					}, "No request handler found for app, skipping");
					return;
				}
				ws.send(require_connect.ConnectMessage.encode(require_connect.ConnectMessage.create({
					kind: require_connect.GatewayMessageType.WORKER_REQUEST_ACK,
					payload: require_connect.WorkerRequestAckData.encode(require_connect.WorkerRequestAckData.create({
						accountId: gatewayExecutorRequest.accountId,
						envId: gatewayExecutorRequest.envId,
						appId: gatewayExecutorRequest.appId,
						functionSlug: gatewayExecutorRequest.functionSlug,
						requestId: gatewayExecutorRequest.requestId,
						stepId: gatewayExecutorRequest.stepId,
						userTraceCtx: gatewayExecutorRequest.userTraceCtx,
						systemTraceCtx: gatewayExecutorRequest.systemTraceCtx,
						runId: gatewayExecutorRequest.runId
					})).finish()
				})).finish());
				this.inProgressRequests.wg.add(1);
				this.inProgressRequests.requestLeases[gatewayExecutorRequest.requestId] = gatewayExecutorRequest.leaseId;
				let extendLeaseInterval;
				extendLeaseInterval = setInterval(() => {
					if (extendLeaseIntervalMs === void 0) return;
					const currentLeaseId = this.inProgressRequests.requestLeases[gatewayExecutorRequest.requestId];
					if (!currentLeaseId) {
						clearInterval(extendLeaseInterval);
						return;
					}
					const latestConn = {
						ws: this.currentConnection?.ws ?? ws,
						id: this.currentConnection?.id ?? connectionId
					};
					this.callbacks.logger.debug({
						connectionId: latestConn.id,
						leaseId: currentLeaseId
					}, "Extending lease");
					if (latestConn.ws.readyState !== WebSocket.OPEN) {
						this.callbacks.logger.warn({
							connectionId: latestConn.id,
							requestId: gatewayExecutorRequest.requestId
						}, "Cannot extend lease, no open WebSocket available");
						return;
					}
					latestConn.ws.send(require_connect.ConnectMessage.encode(require_connect.ConnectMessage.create({
						kind: require_connect.GatewayMessageType.WORKER_REQUEST_EXTEND_LEASE,
						payload: require_connect.WorkerRequestExtendLeaseData.encode(require_connect.WorkerRequestExtendLeaseData.create({
							accountId: gatewayExecutorRequest.accountId,
							envId: gatewayExecutorRequest.envId,
							appId: gatewayExecutorRequest.appId,
							functionSlug: gatewayExecutorRequest.functionSlug,
							requestId: gatewayExecutorRequest.requestId,
							stepId: gatewayExecutorRequest.stepId,
							runId: gatewayExecutorRequest.runId,
							userTraceCtx: gatewayExecutorRequest.userTraceCtx,
							systemTraceCtx: gatewayExecutorRequest.systemTraceCtx,
							leaseId: currentLeaseId
						})).finish()
					})).finish());
				}, extendLeaseIntervalMs);
				try {
					const responseBytes = await this.callbacks.handleExecutionRequest(gatewayExecutorRequest);
					if (!this.currentConnection) {
						this.callbacks.logger.warn({ requestId: gatewayExecutorRequest.requestId }, "No current WebSocket, buffering response");
						if (this.callbacks.onBufferResponse) this.callbacks.onBufferResponse(gatewayExecutorRequest.requestId, responseBytes);
						return;
					}
					this.callbacks.logger.debug({
						connectionId: this.currentConnection.id,
						requestId: gatewayExecutorRequest.requestId
					}, "Sending worker reply");
					this.currentConnection.ws.send(require_connect.ConnectMessage.encode(require_connect.ConnectMessage.create({
						kind: require_connect.GatewayMessageType.WORKER_REPLY,
						payload: responseBytes
					})).finish());
				} catch (err) {
					this.callbacks.logger.debug({
						requestId: gatewayExecutorRequest.requestId,
						err: toError(err)
					}, "Execution error");
				} finally {
					this.inProgressRequests.wg.done();
					delete this.inProgressRequests.requestLeases[gatewayExecutorRequest.requestId];
					clearInterval(extendLeaseInterval);
				}
				return;
			}
			if (connectMessage.kind === require_connect.GatewayMessageType.WORKER_REPLY_ACK) {
				const replyAck = require_messages.parseWorkerReplyAck(connectMessage.payload);
				this.callbacks.logger.debug({
					connectionId,
					requestId: replyAck.requestId
				}, "Acknowledging reply ack");
				this.callbacks.onReplyAck?.(replyAck.requestId);
				return;
			}
			if (connectMessage.kind === require_connect.GatewayMessageType.WORKER_REQUEST_EXTEND_LEASE_ACK) {
				const extendLeaseAck = require_connect.WorkerRequestExtendLeaseAckData.decode(connectMessage.payload);
				this.callbacks.logger.debug({
					connectionId,
					newLeaseId: extendLeaseAck.newLeaseId
				}, "Received extend lease ack");
				if (extendLeaseAck.newLeaseId) this.inProgressRequests.requestLeases[extendLeaseAck.requestId] = extendLeaseAck.newLeaseId;
				else {
					this.callbacks.logger.warn({
						connectionId,
						requestId: extendLeaseAck.requestId
					}, "Unable to extend lease");
					delete this.inProgressRequests.requestLeases[extendLeaseAck.requestId];
				}
				return;
			}
			this.callbacks.logger.warn({
				kind: require_connect.gatewayMessageTypeToJSON(connectMessage.kind),
				rawKind: connectMessage.kind,
				attempt,
				setupState,
				state: this.callbacks.getState(),
				connectionId
			}, "Unexpected message type");
		};
		let heartbeatInterval;
		if (heartbeatIntervalMs !== void 0) heartbeatInterval = setInterval(() => {
			if (heartbeatIntervalMs === void 0) return;
			if (ws.readyState !== WebSocket.OPEN) return;
			if (conn.pendingHeartbeats >= 2) {
				this.callbacks.logger.warn({ connectionId }, "Gateway heartbeat missed");
				onConnectionError(new require_util.ReconnectError(`Consecutive gateway heartbeats missed (${connectionId})`, attempt));
				return;
			}
			this.callbacks.logger.debug({ connectionId }, "Sending worker heartbeat");
			conn.pendingHeartbeats++;
			ws.send(require_connect.ConnectMessage.encode(require_connect.ConnectMessage.create({ kind: require_connect.GatewayMessageType.WORKER_HEARTBEAT })).finish());
		}, heartbeatIntervalMs);
		conn.cleanup = async () => {
			if (closed) return;
			closed = true;
			this.callbacks.logger.debug({ connectionId }, "Cleaning up connection");
			if (ws.readyState === WebSocket.OPEN) {
				this.callbacks.logger.debug({ connectionId }, "Sending pause message");
				ws.send(require_connect.ConnectMessage.encode(require_connect.ConnectMessage.create({ kind: require_connect.GatewayMessageType.WORKER_PAUSE })).finish());
			}
			this.callbacks.logger.debug({ connectionId }, "Closing connection");
			ws.onerror = () => {};
			ws.onclose = () => {};
			await this.inProgressRequests.wg.wait();
			ws.close(1e3, require_connect.workerDisconnectReasonToJSON(require_connect.WorkerDisconnectReason.WORKER_SHUTDOWN));
			if (this.currentConnection?.id === connectionId) this.currentConnection = void 0;
			this.callbacks.logger.debug({ connectionId }, "Cleaning up worker heartbeat");
			clearInterval(heartbeatInterval);
		};
		return conn;
	}
	async getApiBaseUrl() {
		return require_url.resolveApiBaseUrl({
			apiBaseUrl: this.config.apiBaseUrl,
			mode: this.config.mode
		});
	}
};

//#endregion
exports.ConnectionCore = ConnectionCore;
//# sourceMappingURL=connection.cjs.map