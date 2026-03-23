import { headerKeys } from "../../../../helpers/consts.js";
import { version } from "../../../../version.js";
import { allProcessEnv, getPlatformName } from "../../../../helpers/env.js";
import { ConnectMessage, GatewayConnectionReadyData, GatewayMessageType, WorkerConnectRequestData, WorkerDisconnectReason, WorkerRequestAckData, WorkerRequestExtendLeaseAckData, WorkerRequestExtendLeaseData, gatewayMessageTypeToJSON, workerDisconnectReasonToJSON } from "../../../../proto/src/components/connect/protobuf/connect.js";
import { AuthError, ConnectionLimitError, ReconnectError, expBackoff, waitWithCancel } from "../../util.js";
import { getHostname, retrieveSystemAttributes } from "../../os.js";
import { ConnectionState } from "../../types.js";
import { resolveApiBaseUrl } from "../../../../helpers/url.js";
import { createStartRequest, parseConnectMessage, parseGatewayExecutorRequest, parseStartResponse, parseWorkerReplyAck } from "../../messages.js";
import ms from "ms";
import { WaitGroup } from "@jpwilliams/waitgroup";

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
		wg: new WaitGroup(),
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
		if (this.callbacks.getState() === ConnectionState.CLOSED) throw new Error("Connection already closed");
		this.callbacks.logger.debug({ attempt }, "Establishing connection");
		let useSigningKey = this.config.hashedSigningKey;
		while (true) {
			if (this.callbacks.getState() === ConnectionState.CLOSED) break;
			if (this.callbacks.beforeConnect) await this.callbacks.beforeConnect(useSigningKey);
			try {
				await this.prepareConnection(useSigningKey, attempt, [...path]);
				return;
			} catch (err) {
				this.callbacks.logger.warn({ err: toError(err) }, "Failed to connect");
				if (!(err instanceof ReconnectError)) throw err;
				attempt = err.attempt;
				if (err instanceof AuthError) {
					const switchToFallback = useSigningKey === this.config.hashedSigningKey;
					if (switchToFallback) this.callbacks.logger.debug("Switching to fallback signing key");
					useSigningKey = switchToFallback ? this.config.hashedFallbackKey : this.config.hashedSigningKey;
				}
				if (err instanceof ConnectionLimitError) this.callbacks.logger.error("You have reached the maximum number of concurrent connections. Please disconnect other active workers to continue.");
				const delay = expBackoff(attempt);
				this.callbacks.logger.debug({ delay }, "Reconnecting");
				if (await waitWithCancel(delay, () => {
					return this.callbacks.getState() === ConnectionState.CLOSED;
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
		const msg = createStartRequest(Array.from(this.excludeGateways));
		const headers = {
			"Content-Type": "application/protobuf",
			...hashedSigningKey ? { Authorization: `Bearer ${hashedSigningKey}` } : {}
		};
		if (this.config.envName) headers[headerKeys.Environment] = this.config.envName;
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
			throw new ReconnectError(`Failed initial API handshake request to ${targetUrl.toString()}, ${errMsg}`, attempt);
		}
		if (!resp.ok) {
			if (resp.status === 401) throw new AuthError(`Failed initial API handshake request to ${targetUrl.toString()}${this.config.envName ? ` (env: ${this.config.envName})` : ""}, ${await resp.text()}`, attempt);
			if (resp.status === 429) throw new ConnectionLimitError(attempt);
			throw new ReconnectError(`Failed initial API handshake request to ${targetUrl.toString()}, ${await resp.text()}`, attempt);
		}
		return await parseStartResponse(resp);
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
			rejectWebsocketConnected?.(new ReconnectError(`Connection ${connectionId} timed out`, attempt));
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
			ws.close(4001, workerDisconnectReasonToJSON(WorkerDisconnectReason.UNEXPECTED));
			rejectWebsocketConnected?.(new ReconnectError(`Error while connecting (${connectionId}): ${error instanceof Error ? error.message : "Unknown error"}`, attempt));
		};
		ws.onerror = (err) => onConnectionError(err);
		ws.onclose = (ev) => {
			onConnectionError(new ReconnectError(`Connection ${connectionId} closed: ${ev.reason}`, attempt));
		};
		const setupState = {
			receivedGatewayHello: false,
			sentWorkerConnect: false,
			receivedConnectionReady: false
		};
		let heartbeatIntervalMs;
		let extendLeaseIntervalMs;
		ws.onmessage = async (event) => {
			const connectMessage = parseConnectMessage(new Uint8Array(event.data));
			this.callbacks.logger.debug({
				kind: gatewayMessageTypeToJSON(connectMessage.kind),
				connectionId
			}, "Received message");
			if (!setupState.receivedGatewayHello) {
				if (connectMessage.kind !== GatewayMessageType.GATEWAY_HELLO) {
					onConnectionError(new ReconnectError(`Expected hello message, got ${gatewayMessageTypeToJSON(connectMessage.kind)}`, attempt));
					return;
				}
				setupState.receivedGatewayHello = true;
			}
			if (!setupState.sentWorkerConnect) {
				const workerConnectRequestMsg = WorkerConnectRequestData.create({
					connectionId: startResp.connectionId,
					environment: this.config.envName,
					platform: getPlatformName({ ...allProcessEnv() }),
					sdkVersion: `v${version}`,
					sdkLanguage: "typescript",
					framework: "connect",
					workerManualReadinessAck: this.config.connectionData.manualReadinessAck,
					systemAttributes: await retrieveSystemAttributes(),
					authData: {
						sessionToken: startResp.sessionToken,
						syncToken: startResp.syncToken
					},
					apps: this.config.connectionData.apps,
					capabilities: new TextEncoder().encode(this.config.connectionData.marshaledCapabilities),
					startedAt,
					instanceId: this.config.instanceId || await getHostname(),
					maxWorkerConcurrency: this.config.maxWorkerConcurrency
				});
				const workerConnectRequestMsgBytes = WorkerConnectRequestData.encode(workerConnectRequestMsg).finish();
				ws.send(ConnectMessage.encode(ConnectMessage.create({
					kind: GatewayMessageType.WORKER_CONNECT,
					payload: workerConnectRequestMsgBytes
				})).finish());
				setupState.sentWorkerConnect = true;
				return;
			}
			if (!setupState.receivedConnectionReady) {
				if (connectMessage.kind !== GatewayMessageType.GATEWAY_CONNECTION_READY) {
					onConnectionError(new ReconnectError(`Expected ready message, got ${gatewayMessageTypeToJSON(connectMessage.kind)}`, attempt));
					return;
				}
				const readyPayload = GatewayConnectionReadyData.decode(connectMessage.payload);
				setupState.receivedConnectionReady = true;
				heartbeatIntervalMs = readyPayload.heartbeatInterval.length > 0 ? ms(readyPayload.heartbeatInterval) : 1e4;
				extendLeaseIntervalMs = readyPayload.extendLeaseInterval.length > 0 ? ms(readyPayload.extendLeaseInterval) : 5e3;
				resolveWebsocketConnected?.();
				return;
			}
			this.callbacks.logger.warn({
				kind: gatewayMessageTypeToJSON(connectMessage.kind),
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
		this.callbacks.onStateChange(ConnectionState.ACTIVE);
		let isDraining = false;
		onConnectionError = async (error) => {
			if (closed) {
				this.callbacks.logger.debug({ connectionId }, "Connection error but already in closed state, skipping");
				return;
			}
			closed = true;
			await conn.cleanup();
			const currentState = this.callbacks.getState();
			if (currentState === ConnectionState.CLOSING || currentState === ConnectionState.CLOSED) {
				this.callbacks.logger.debug({ connectionId }, "Connection error but already closing or closed, skipping");
				return;
			}
			this.callbacks.onStateChange(ConnectionState.RECONNECTING);
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
			onConnectionError(new ReconnectError(`Connection closed: ${ev.reason}`, attempt));
		};
		ws.onmessage = async (event) => {
			const connectMessage = parseConnectMessage(new Uint8Array(event.data));
			if (connectMessage.kind === GatewayMessageType.GATEWAY_CLOSING) {
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
					onConnectionError(new ReconnectError(`Failed to reconnect after receiving draining message (${connectionId})`, attempt));
				}
				return;
			}
			if (connectMessage.kind === GatewayMessageType.GATEWAY_HEARTBEAT) {
				conn.pendingHeartbeats = 0;
				this.callbacks.logger.debug({ connectionId }, "Handled gateway heartbeat");
				return;
			}
			if (connectMessage.kind === GatewayMessageType.GATEWAY_EXECUTOR_REQUEST) {
				if (this.callbacks.getState() !== ConnectionState.ACTIVE) {
					this.callbacks.logger.warn({ connectionId }, "Received request while not active, skipping");
					return;
				}
				const gatewayExecutorRequest = parseGatewayExecutorRequest(connectMessage.payload);
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
				ws.send(ConnectMessage.encode(ConnectMessage.create({
					kind: GatewayMessageType.WORKER_REQUEST_ACK,
					payload: WorkerRequestAckData.encode(WorkerRequestAckData.create({
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
					latestConn.ws.send(ConnectMessage.encode(ConnectMessage.create({
						kind: GatewayMessageType.WORKER_REQUEST_EXTEND_LEASE,
						payload: WorkerRequestExtendLeaseData.encode(WorkerRequestExtendLeaseData.create({
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
					this.currentConnection.ws.send(ConnectMessage.encode(ConnectMessage.create({
						kind: GatewayMessageType.WORKER_REPLY,
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
			if (connectMessage.kind === GatewayMessageType.WORKER_REPLY_ACK) {
				const replyAck = parseWorkerReplyAck(connectMessage.payload);
				this.callbacks.logger.debug({
					connectionId,
					requestId: replyAck.requestId
				}, "Acknowledging reply ack");
				this.callbacks.onReplyAck?.(replyAck.requestId);
				return;
			}
			if (connectMessage.kind === GatewayMessageType.WORKER_REQUEST_EXTEND_LEASE_ACK) {
				const extendLeaseAck = WorkerRequestExtendLeaseAckData.decode(connectMessage.payload);
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
				kind: gatewayMessageTypeToJSON(connectMessage.kind),
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
				onConnectionError(new ReconnectError(`Consecutive gateway heartbeats missed (${connectionId})`, attempt));
				return;
			}
			this.callbacks.logger.debug({ connectionId }, "Sending worker heartbeat");
			conn.pendingHeartbeats++;
			ws.send(ConnectMessage.encode(ConnectMessage.create({ kind: GatewayMessageType.WORKER_HEARTBEAT })).finish());
		}, heartbeatIntervalMs);
		conn.cleanup = async () => {
			if (closed) return;
			closed = true;
			this.callbacks.logger.debug({ connectionId }, "Cleaning up connection");
			if (ws.readyState === WebSocket.OPEN) {
				this.callbacks.logger.debug({ connectionId }, "Sending pause message");
				ws.send(ConnectMessage.encode(ConnectMessage.create({ kind: GatewayMessageType.WORKER_PAUSE })).finish());
			}
			this.callbacks.logger.debug({ connectionId }, "Closing connection");
			ws.onerror = () => {};
			ws.onclose = () => {};
			await this.inProgressRequests.wg.wait();
			ws.close(1e3, workerDisconnectReasonToJSON(WorkerDisconnectReason.WORKER_SHUTDOWN));
			if (this.currentConnection?.id === connectionId) this.currentConnection = void 0;
			this.callbacks.logger.debug({ connectionId }, "Cleaning up worker heartbeat");
			clearInterval(heartbeatInterval);
		};
		return conn;
	}
	async getApiBaseUrl() {
		return resolveApiBaseUrl({
			apiBaseUrl: this.config.apiBaseUrl,
			mode: this.config.mode
		});
	}
};

//#endregion
export { ConnectionCore };
//# sourceMappingURL=connection.js.map