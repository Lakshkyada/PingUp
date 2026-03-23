const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.cjs');
const require_consts = require('../../helpers/consts.cjs');
const require_version = require('../../version.cjs');
const require_NonRetriableError = require('../NonRetriableError.cjs');
const require_errors = require('../../helpers/errors.cjs');
const require_types = require('../../types.cjs');
const require_InngestExecution = require('./InngestExecution.cjs');
const require_functions = require('../../helpers/functions.cjs');
const require_promises = require('../../helpers/promises.cjs');
const require_als = require('./als.cjs');
const require_temporal = require('../../helpers/temporal.cjs');
const require_InngestStepTools = require('../InngestStepTools.cjs');
const require_utils = require('../middleware/utils.cjs');
const require_manager = require('../middleware/manager.cjs');
const require_Inngest = require('../Inngest.cjs');
const require_InngestGroupTools = require('../InngestGroupTools.cjs');
const require_RetryAfterError = require('../RetryAfterError.cjs');
const require_StepError = require('../StepError.cjs');
const require_utils$1 = require('../triggers/utils.cjs');
const require_access = require('./otel/access.cjs');
let zod_v3 = require("zod/v3");
let hash_js = require("hash.js");
hash_js = require_rolldown_runtime.__toESM(hash_js);
let ms = require("ms");
ms = require_rolldown_runtime.__toESM(ms);
let __opentelemetry_api = require("@opentelemetry/api");

//#region src/components/execution/engine.ts
var engine_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	_internals: () => _internals,
	createExecutionEngine: () => createExecutionEngine
});
const { sha1 } = hash_js.default;
/**
* Retry configuration for checkpoint operations.
*
* Checkpoint calls use exponential backoff with jitter to handle transient
* network failures (e.g., dev server temporarily down, cloud hiccup). If
* retries exhaust, the error propagates up - for Sync mode this results in a
* 500 error, for AsyncCheckpointing the caller handles fallback.
*/
const CHECKPOINT_RETRY_OPTIONS = {
	maxAttempts: 5,
	baseDelay: 100
};
const STEP_NOT_FOUND_MAX_FOUND_STEPS = 25;
const createExecutionEngine = (options) => {
	return new InngestExecutionEngine(options);
};
var InngestExecutionEngine = class extends require_InngestExecution.InngestExecution {
	version = require_consts.ExecutionVersion.V2;
	state;
	fnArg;
	checkpointHandlers;
	timeoutDuration = 1e3 * 10;
	execution;
	userFnToRun;
	middlewareManager;
	/**
	* If we're supposed to run a particular step via `requestedRunStep`, this
	* will be a `Promise` that resolves after no steps have been found for
	* `timeoutDuration` milliseconds.
	*
	* If we're not supposed to run a particular step, this will be `undefined`.
	*/
	timeout;
	rootSpanId;
	/**
	* If we're checkpointing and have been given a maximum runtime, this will be
	* a `Promise` that resolves after that duration has elapsed, allowing us to
	* ensure that we end the execution in good time, especially in serverless
	* environments.
	*/
	checkpointingMaxRuntimeTimer;
	/**
	* If we're checkpointing and have been given a maximum buffer interval, this
	* will be a `Promise` that resolves after that duration has elapsed, allowing
	* us to periodically checkpoint even if the step buffer hasn't filled.
	*/
	checkpointingMaxBufferIntervalTimer;
	constructor(rawOptions) {
		const options = {
			...rawOptions,
			stepMode: rawOptions.stepMode ?? require_types.StepMode.Async
		};
		super(options);
		/**
		* Check we have everything we need for checkpointing
		*/
		if (this.options.stepMode === require_types.StepMode.Sync) {
			if (!this.options.createResponse) throw new Error("createResponse is required for sync step mode");
		}
		this.userFnToRun = this.getUserFnToRun();
		this.state = this.createExecutionState();
		this.fnArg = this.createFnArg();
		const mwInstances = this.options.middlewareInstances ?? (this.options.client.middleware || []).map((Cls) => {
			return new Cls({ client: this.options.client });
		});
		this.middlewareManager = new require_manager.MiddlewareManager(this.fnArg, () => this.state.stepState, mwInstances, this.options.fn, this.options.client[require_Inngest.internalLoggerSymbol]);
		this.checkpointHandlers = this.createCheckpointHandlers();
		this.initializeTimer(this.state);
		this.initializeCheckpointRuntimeTimer(this.state);
		this.devDebug("created new V1 execution for run;", this.options.requestedRunStep ? `wanting to run step "${this.options.requestedRunStep}"` : "discovering steps");
		this.devDebug("existing state keys:", Object.keys(this.state.stepState));
	}
	/**
	* Idempotently start the execution of the user's function.
	*/
	start() {
		if (!this.execution) {
			this.devDebug("starting V1 execution");
			const tracer = __opentelemetry_api.trace.getTracer("inngest", require_version.version);
			this.execution = require_als.getAsyncLocalStorage().then((als) => {
				return als.run({
					app: this.options.client,
					execution: {
						ctx: this.fnArg,
						instance: this
					}
				}, async () => {
					return tracer.startActiveSpan("inngest.execution", (span) => {
						this.rootSpanId = span.spanContext().spanId;
						require_access.clientProcessorMap.get(this.options.client)?.declareStartingSpan({
							span,
							runId: this.options.runId,
							traceparent: this.options.headers[require_consts.headerKeys.TraceParent],
							tracestate: this.options.headers[require_consts.headerKeys.TraceState]
						});
						return this._start().then((result) => {
							this.devDebug("result:", result);
							return result;
						}).finally(() => {
							span.end();
						});
					});
				});
			});
		}
		return this.execution;
	}
	addMetadata(stepId, kind, scope, op, values) {
		if (!this.state.metadata) this.state.metadata = /* @__PURE__ */ new Map();
		const updates = this.state.metadata.get(stepId) ?? [];
		updates.push({
			kind,
			scope,
			op,
			values
		});
		this.state.metadata.set(stepId, updates);
		return true;
	}
	/**
	* Starts execution of the user's function and the core loop.
	*/
	async _start() {
		try {
			const allCheckpointHandler = this.getCheckpointHandler("");
			await this.startExecution();
			let i = 0;
			for await (const checkpoint of this.state.loop) {
				await allCheckpointHandler(checkpoint, i);
				const result = await this.getCheckpointHandler(checkpoint.type)(checkpoint, i++);
				if (result) return result;
			}
		} catch (error) {
			return this.transformOutput({ error });
		} finally {
			this.state.loop.return();
		}
		/**
		* If we're here, the generator somehow finished without returning a value.
		* This should never happen.
		*/
		throw new Error("Core loop finished without returning a value");
	}
	async checkpoint(steps) {
		if (this.options.stepMode === require_types.StepMode.Sync) if (!this.state.checkpointedRun) {
			const res = await require_promises.retryWithBackoff(() => this.options.client["inngestApi"].checkpointNewRun({
				runId: this.fnArg.runId,
				event: this.fnArg.event,
				steps,
				executionVersion: this.version,
				retries: this.fnArg.maxAttempts ?? require_consts.defaultMaxRetries
			}), CHECKPOINT_RETRY_OPTIONS);
			this.state.checkpointedRun = {
				appId: res.data.app_id,
				fnId: res.data.fn_id,
				token: res.data.token
			};
		} else await require_promises.retryWithBackoff(() => this.options.client["inngestApi"].checkpointSteps({
			appId: this.state.checkpointedRun.appId,
			fnId: this.state.checkpointedRun.fnId,
			runId: this.fnArg.runId,
			steps
		}), CHECKPOINT_RETRY_OPTIONS);
		else if (this.options.stepMode === require_types.StepMode.AsyncCheckpointing) {
			if (!this.options.queueItemId) throw new Error("Missing queueItemId for async checkpointing. This is a bug in the Inngest SDK.");
			if (!this.options.internalFnId) throw new Error("Missing internalFnId for async checkpointing. This is a bug in the Inngest SDK.");
			await require_promises.retryWithBackoff(() => this.options.client["inngestApi"].checkpointStepsAsync({
				runId: this.fnArg.runId,
				fnId: this.options.internalFnId,
				queueItemId: this.options.queueItemId,
				steps
			}), CHECKPOINT_RETRY_OPTIONS);
		} else throw new Error("Checkpointing is only supported in Sync and AsyncCheckpointing step modes. This is a bug in the Inngest SDK.");
	}
	async checkpointAndSwitchToAsync(steps) {
		await this.checkpoint(steps);
		if (!this.state.checkpointedRun?.token) throw new Error("Failed to checkpoint and switch to async mode");
		return {
			type: "change-mode",
			ctx: this.fnArg,
			ops: this.ops,
			to: require_types.StepMode.Async,
			token: this.state.checkpointedRun?.token
		};
	}
	/**
	* Returns whether we're in the final attempt of execution, or `null` if we
	* can't determine this in the SDK.
	*/
	inFinalAttempt() {
		if (typeof this.fnArg.maxAttempts !== "number") return null;
		return this.fnArg.attempt + 1 >= this.fnArg.maxAttempts;
	}
	/**
	* Creates a handler for every checkpoint type, defining what to do when we
	* reach that checkpoint in the core loop.
	*/
	createCheckpointHandlers() {
		const commonCheckpointHandler = (checkpoint) => {
			this.devDebug(`${this.options.stepMode} checkpoint:`, checkpoint);
		};
		const stepRanHandler = async (stepResult) => {
			const transformResult = await this.transformOutput(stepResult);
			/**
			* Transforming output will always return either function rejection or
			* resolution. In most cases, this can be immediately returned, but in
			* this particular case we want to handle it differently.
			*/
			if (transformResult.type === "function-resolved") return {
				type: "step-ran",
				ctx: transformResult.ctx,
				ops: transformResult.ops,
				step: {
					...stepResult,
					data: transformResult.data
				}
			};
			else if (transformResult.type === "function-rejected") {
				const stepForResponse = {
					...stepResult,
					error: transformResult.error
				};
				if (stepResult.op === require_types.StepOpCode.StepFailed) {
					const ser = require_errors.serializeError(transformResult.error);
					stepForResponse.data = {
						__serialized: true,
						name: ser.name,
						message: ser.message,
						stack: ""
					};
				}
				return {
					type: "step-ran",
					ctx: transformResult.ctx,
					ops: transformResult.ops,
					retriable: transformResult.retriable,
					step: stepForResponse
				};
			}
			return transformResult;
		};
		const maybeReturnNewSteps = async () => {
			const newSteps = await this.filterNewSteps(Array.from(this.state.steps.values()));
			if (newSteps) return {
				type: "steps-found",
				ctx: this.fnArg,
				ops: this.ops,
				steps: newSteps
			};
		};
		const attemptCheckpointAndResume = async (stepResult, resume = true, force = false) => {
			if (stepResult) {
				const stepToResume = this.resumeStepWithResult(stepResult, resume);
				delete this.state.executingStep;
				this.state.checkpointingStepBuffer.push({
					...stepToResume,
					data: stepResult.data
				});
			}
			if (force || !this.options.checkpointingConfig?.bufferedSteps || this.state.checkpointingStepBuffer.length >= this.options.checkpointingConfig.bufferedSteps) {
				this.devDebug("checkpointing and resuming execution after step run");
				try {
					this.devDebug(`checkpointing all buffered steps:`, this.state.checkpointingStepBuffer.map((op) => op.displayName || op.id).join(", "));
					await this.checkpoint(this.state.checkpointingStepBuffer);
					return;
				} catch (err) {
					this.devDebug("error checkpointing after step run, so falling back to async", err);
					const buffered = this.state.checkpointingStepBuffer;
					if (buffered.length) return {
						type: "steps-found",
						ctx: this.fnArg,
						ops: this.ops,
						steps: buffered
					};
					return;
				} finally {
					this.state.checkpointingStepBuffer = [];
				}
			} else this.devDebug(`not checkpointing yet, continuing execution as we haven't reached buffered step limit of ${this.options.checkpointingConfig?.bufferedSteps}`);
		};
		const syncHandlers = {
			"": commonCheckpointHandler,
			"function-resolved": async (checkpoint, i) => {
				const transformedData = checkpoint.data;
				await this.checkpoint([{
					op: require_types.StepOpCode.RunComplete,
					id: _internals.hashId("complete"),
					data: await this.options.createResponse(transformedData)
				}]);
				return await this.transformOutput({ data: checkpoint.data });
			},
			"function-rejected": async (checkpoint) => {
				if (this.inFinalAttempt()) return await this.transformOutput({ error: checkpoint.error });
				return this.checkpointAndSwitchToAsync([{
					id: _internals.hashId("complete"),
					op: require_types.StepOpCode.StepError,
					error: checkpoint.error
				}]);
			},
			"step-not-found": () => {
				return {
					type: "function-rejected",
					ctx: this.fnArg,
					error: /* @__PURE__ */ new Error("Step not found when checkpointing; this should never happen"),
					ops: this.ops,
					retriable: false
				};
			},
			"steps-found": async ({ steps }) => {
				if (steps.length !== 1 || steps[0].mode !== require_types.StepMode.Sync) return this.checkpointAndSwitchToAsync(steps.map((step) => ({
					...step,
					id: step.hashedId
				})));
				const result = await this.executeStep(steps[0]);
				const transformed = await stepRanHandler(result);
				if (transformed.type !== "step-ran") throw new Error("Unexpected checkpoint handler result type after running step in sync mode");
				if (result.error) return this.checkpointAndSwitchToAsync([transformed.step]);
				const stepToResume = this.resumeStepWithResult(result);
				delete this.state.executingStep;
				const stepForCheckpoint = {
					...stepToResume,
					data: transformed.step.data
				};
				await this.checkpoint([stepForCheckpoint]);
			},
			"checkpointing-runtime-reached": () => {
				return this.checkpointAndSwitchToAsync([{
					op: require_types.StepOpCode.DiscoveryRequest,
					id: _internals.hashId(`discovery-request-${Date.now()}`)
				}]);
			},
			"checkpointing-buffer-interval-reached": () => {
				return attemptCheckpointAndResume(void 0, false, true);
			}
		};
		const asyncHandlers = {
			"": commonCheckpointHandler,
			"function-resolved": async ({ data }) => {
				const newStepsResult = await maybeReturnNewSteps();
				if (newStepsResult) return newStepsResult;
				if (this.options.createResponse) data = await this.options.createResponse(data);
				return await this.transformOutput({ data });
			},
			"function-rejected": async (checkpoint) => {
				return await this.transformOutput({ error: checkpoint.error });
			},
			"steps-found": async ({ steps }) => {
				const stepResult = await this.tryExecuteStep(steps);
				if (stepResult) return stepRanHandler(stepResult);
				return maybeReturnNewSteps();
			},
			"step-not-found": ({ step }) => {
				const { foundSteps, totalFoundSteps } = this.getStepNotFoundDetails();
				return {
					type: "step-not-found",
					ctx: this.fnArg,
					ops: this.ops,
					step,
					foundSteps,
					totalFoundSteps
				};
			},
			"checkpointing-runtime-reached": () => {
				throw new Error("Checkpointing maximum runtime reached, but this is not in a checkpointing step mode. This is a bug in the Inngest SDK.");
			},
			"checkpointing-buffer-interval-reached": () => {
				throw new Error("Checkpointing maximum buffer interval reached, but this is not in a checkpointing step mode. This is a bug in the Inngest SDK.");
			}
		};
		const asyncCheckpointingHandlers = {
			"": commonCheckpointHandler,
			"function-resolved": async (checkpoint, i) => {
				const output = await asyncHandlers["function-resolved"](checkpoint, i);
				if (output?.type === "function-resolved") {
					const steps = this.state.checkpointingStepBuffer.concat({
						op: require_types.StepOpCode.RunComplete,
						id: _internals.hashId("complete"),
						data: output.data
					});
					if (isNonEmpty(steps)) return {
						type: "steps-found",
						ctx: output.ctx,
						ops: output.ops,
						steps
					};
				}
			},
			"function-rejected": async (checkpoint) => {
				if (this.state.checkpointingStepBuffer.length) {
					const fallback = await attemptCheckpointAndResume(void 0, false, true);
					if (fallback) return fallback;
				}
				return await this.transformOutput({ error: checkpoint.error });
			},
			"step-not-found": asyncHandlers["step-not-found"],
			"steps-found": async ({ steps }) => {
				const { stepsToResume, newSteps } = steps.reduce((acc, step) => {
					if (!step.hasStepState) acc.newSteps.push(step);
					else if (!step.fulfilled) acc.stepsToResume.push(step);
					return acc;
				}, {
					stepsToResume: [],
					newSteps: []
				});
				this.devDebug("split found steps in to:", {
					stepsToResume: stepsToResume.length,
					newSteps: newSteps.length
				});
				if (!this.options.requestedRunStep && newSteps.length) {
					const stepResult = await this.tryExecuteStep(newSteps);
					if (stepResult) {
						this.devDebug(`executed step "${stepResult.id}" successfully`);
						if (stepResult.error) {
							if (this.state.checkpointingStepBuffer.length) {
								const fallback = await attemptCheckpointAndResume(void 0, false, true);
								if (fallback) return fallback;
							}
							return stepRanHandler(stepResult);
						}
						return await attemptCheckpointAndResume(stepResult);
					}
					if (this.state.checkpointingStepBuffer.length) {
						const fallback = await attemptCheckpointAndResume(void 0, false, true);
						if (fallback) return fallback;
					}
					return maybeReturnNewSteps();
				}
				if (stepsToResume.length) {
					this.devDebug(`resuming ${stepsToResume.length} steps`);
					for (const st of stepsToResume) this.resumeStepWithResult({
						...st,
						id: st.hashedId
					});
				}
			},
			"checkpointing-runtime-reached": async () => {
				return {
					type: "steps-found",
					ctx: this.fnArg,
					ops: this.ops,
					steps: [{
						op: require_types.StepOpCode.DiscoveryRequest,
						id: _internals.hashId(`discovery-request-${Date.now()}`)
					}]
				};
			},
			"checkpointing-buffer-interval-reached": () => {
				return attemptCheckpointAndResume(void 0, false, true);
			}
		};
		return {
			[require_types.StepMode.Async]: asyncHandlers,
			[require_types.StepMode.Sync]: syncHandlers,
			[require_types.StepMode.AsyncCheckpointing]: asyncCheckpointingHandlers
		};
	}
	getCheckpointHandler(type) {
		return this.checkpointHandlers[this.options.stepMode][type];
	}
	async tryExecuteStep(steps) {
		const hashedStepIdToRun = this.options.requestedRunStep || this.getEarlyExecRunStep(steps);
		if (!hashedStepIdToRun) return;
		const step = steps.find((step$1) => step$1.hashedId === hashedStepIdToRun && step$1.fn);
		if (step) return await this.executeStep(step);
		this.timeout?.reset();
	}
	/**
	* Given a list of outgoing ops, decide if we can execute an op early and
	* return the ID of the step to execute if we can.
	*/
	getEarlyExecRunStep(steps) {
		/**
		* We may have been disabled due to parallelism, in which case we can't
		* immediately execute unless explicitly requested.
		*/
		if (this.options.disableImmediateExecution) return;
		const unfulfilledSteps = steps.filter((step) => !step.fulfilled);
		if (unfulfilledSteps.length !== 1) return;
		const op = unfulfilledSteps[0];
		if (op && op.op === require_types.StepOpCode.StepPlanned) return op.hashedId;
	}
	async filterNewSteps(foundSteps) {
		if (this.options.requestedRunStep) return;
		const newSteps = foundSteps.reduce((acc, step) => {
			if (!step.hasStepState) acc.push(step);
			return acc;
		}, []);
		if (!newSteps.length) return;
		await this.middlewareManager.onMemoizationEnd();
		const stepList = newSteps.map((step) => {
			return {
				displayName: step.displayName,
				op: step.op,
				id: step.hashedId,
				name: step.name,
				opts: step.opts,
				userland: step.userland
			};
		});
		if (!isNonEmpty(stepList)) throw new require_utils.UnreachableError("stepList is empty");
		return stepList;
	}
	async executeStep(foundStep) {
		const { id, name, opts, fn, displayName, userland, hashedId } = foundStep;
		const { stepInfo, wrappedHandler, setActualHandler } = foundStep.middleware;
		this.devDebug(`preparing to execute step "${id}"`);
		this.timeout?.clear();
		const outgoingOp = {
			id: hashedId,
			op: require_types.StepOpCode.StepRun,
			name,
			opts,
			displayName,
			userland
		};
		this.state.executingStep = outgoingOp;
		const store = await require_als.getAsyncCtx();
		if (store?.execution) store.execution.executingStep = {
			id,
			name: displayName
		};
		this.devDebug(`executing step "${id}"`);
		if (this.rootSpanId && this.options.checkpointingConfig) require_access.clientProcessorMap.get(this.options.client)?.declareStepExecution(this.rootSpanId, hashedId, this.options.data?.attempt ?? 0);
		let interval;
		const actualHandler = () => require_promises.runAsPromise(fn);
		await this.middlewareManager.onMemoizationEnd();
		await this.middlewareManager.onStepStart(stepInfo);
		if (!foundStep.memoizationDeferred) {
			const deferred = require_promises.createDeferredPromise();
			foundStep.memoizationDeferred = deferred;
			setActualHandler(() => deferred.promise);
			foundStep.transformedResultPromise = wrappedHandler();
			foundStep.transformedResultPromise.catch(() => {});
		}
		const wrappedActualHandler = this.middlewareManager.buildWrapStepHandlerChain(actualHandler, stepInfo);
		return require_promises.goIntervalTiming(() => wrappedActualHandler()).finally(() => {
			this.devDebug(`finished executing step "${id}"`);
			this.state.executingStep = void 0;
			if (this.rootSpanId && this.options.checkpointingConfig) require_access.clientProcessorMap.get(this.options.client)?.clearStepExecution(this.rootSpanId);
			if (store?.execution) delete store.execution.executingStep;
		}).then(async ({ resultPromise, interval: _interval }) => {
			interval = _interval;
			const metadata = this.state.metadata?.get(id);
			const serverData = await resultPromise;
			await this.middlewareManager.onStepComplete(stepInfo, serverData);
			return {
				...outgoingOp,
				data: serverData,
				...metadata && metadata.length > 0 ? { metadata } : {}
			};
		}).catch((error) => {
			return this.buildStepErrorOp({
				error,
				id,
				outgoingOp,
				stepInfo
			});
		}).then((op) => ({
			...op,
			timing: interval
		}));
	}
	/**
	* Starts execution of the user's function, including triggering checkpoints
	* and middleware hooks where appropriate.
	*/
	async startExecution() {
		/**
		* Start the timer to time out the run if needed.
		*/
		this.timeout?.start();
		this.checkpointingMaxRuntimeTimer?.start();
		this.checkpointingMaxBufferIntervalTimer?.start();
		const fnInputResult = await this.middlewareManager.transformFunctionInput();
		this.applyFunctionInputMutations(fnInputResult);
		if (this.state.allStateUsed()) await this.middlewareManager.onMemoizationEnd();
		if (this.state.stepsToFulfill === 0 && this.fnArg.attempt === 0) await this.middlewareManager.onRunStart();
		const innerHandler = async () => {
			await this.validateEventSchemas();
			return this.userFnToRun(this.fnArg);
		};
		require_promises.runAsPromise(this.middlewareManager.wrapRunHandler(innerHandler)).then(async (data) => {
			await this.middlewareManager.onRunComplete(data);
			this.state.setCheckpoint({
				type: "function-resolved",
				data
			});
		}).catch(async (error) => {
			let err;
			if (error instanceof Error) err = error;
			else if (typeof error === "object") err = new Error(JSON.stringify(error));
			else err = new Error(String(error));
			await this.middlewareManager.onRunError(err, !this.retriability(err));
			this.state.setCheckpoint({
				type: "function-rejected",
				error: err
			});
		});
	}
	/**
	* Determine whether the given error is retriable. Returns `false` when the
	* run should not be retried, a duration string for `RetryAfterError`, or
	* `true` for normal retry behavior.
	*/
	retriability(error) {
		if (this.fnArg.maxAttempts && this.fnArg.maxAttempts - 1 === this.fnArg.attempt) return false;
		if (error instanceof require_NonRetriableError.NonRetriableError || error?.name === "NonRetriableError") return false;
		if (error instanceof require_StepError.StepError && error === this.state.recentlyRejectedStepError) return false;
		if (error instanceof require_RetryAfterError.RetryAfterError || error?.name === "RetryAfterError") return error.retryAfter;
		return true;
	}
	/**
	* Build the OutgoingOp for a failed step, notifying middleware and choosing
	* retriable vs non-retriable opcode.
	*/
	async buildStepErrorOp({ error, id, outgoingOp, stepInfo }) {
		const isFinal = !this.retriability(error);
		const metadata = this.state.metadata?.get(id);
		await this.middlewareManager.onStepError(stepInfo, error instanceof Error ? error : new Error(String(error)), isFinal);
		const serialized = require_errors.serializeError(error);
		return {
			...outgoingOp,
			error: serialized,
			op: isFinal ? require_types.StepOpCode.StepFailed : require_types.StepOpCode.StepError,
			...metadata && metadata.length > 0 ? { metadata } : {}
		};
	}
	/**
	* Validate event data against schemas defined in function triggers.
	*/
	async validateEventSchemas() {
		const triggers = this.options.fn.opts.triggers;
		if (!triggers || triggers.length === 0) return;
		const fnArgEvents = this.fnArg.events;
		if (!fnArgEvents || fnArgEvents.length === 0) return;
		await require_utils$1.validateEvents(fnArgEvents.map((event) => ({
			name: event.name,
			data: event.data
		})), triggers);
	}
	/**
	* Using middleware, transform output before returning.
	*/
	transformOutput(dataOrError) {
		const { data, error } = dataOrError;
		if (typeof error !== "undefined") {
			const retriable = this.retriability(error);
			const serializedError = require_errors.serializeError(error);
			return {
				type: "function-rejected",
				ctx: this.fnArg,
				ops: this.ops,
				error: serializedError,
				retriable
			};
		}
		return {
			type: "function-resolved",
			ctx: this.fnArg,
			ops: this.ops,
			data: require_functions.undefinedToNull(data)
		};
	}
	createExecutionState() {
		const d = require_promises.createDeferredPromiseWithStack();
		let checkpointResolve = d.deferred.resolve;
		const checkpointResults = d.results;
		const loop = (async function* (cleanUp) {
			try {
				while (true) {
					const res = (await checkpointResults.next()).value;
					if (res) yield res;
				}
			} finally {
				cleanUp?.();
			}
		})(() => {
			this.timeout?.clear();
			this.checkpointingMaxRuntimeTimer?.clear();
			this.checkpointingMaxBufferIntervalTimer?.clear();
			checkpointResults.return();
		});
		const stepsToFulfill = Object.keys(this.options.stepState).length;
		return {
			stepState: this.options.stepState,
			stepsToFulfill,
			steps: /* @__PURE__ */ new Map(),
			loop,
			hasSteps: Boolean(stepsToFulfill),
			stepCompletionOrder: [...this.options.stepCompletionOrder],
			remainingStepsToBeSeen: new Set(this.options.stepCompletionOrder),
			setCheckpoint: (checkpoint) => {
				this.devDebug("setting checkpoint:", checkpoint.type);
				({resolve: checkpointResolve} = checkpointResolve(checkpoint));
			},
			allStateUsed: () => {
				return this.state.remainingStepsToBeSeen.size === 0;
			},
			checkpointingStepBuffer: [],
			metadata: /* @__PURE__ */ new Map()
		};
	}
	get ops() {
		return Object.fromEntries(this.state.steps);
	}
	createFnArg() {
		const step = this.createStepTools();
		const experimentStepRun = step[require_InngestStepTools.experimentStepRunSymbol];
		let fnArg = {
			...this.options.data,
			step,
			group: require_InngestGroupTools.createGroupTools({ experimentStepRun })
		};
		/**
		* Handle use of the `onFailure` option by deserializing the error.
		*/
		if (this.options.isFailureHandler) {
			const eventData = zod_v3.z.object({ error: require_types.jsonErrorSchema }).parse(fnArg.event?.data);
			fnArg = {
				...fnArg,
				error: require_errors.deserializeError(eventData.error)
			};
		}
		return this.options.transformCtx?.(fnArg) ?? fnArg;
	}
	/**
	* Apply mutations from `transformFunctionInput` back to execution state.
	* Allows middleware to modify event data, step tools, memoized step data,
	* and inject custom fields into the handler context.
	*/
	applyFunctionInputMutations(result) {
		const { event, events, step, ...extensions } = result.ctx;
		if (event !== this.fnArg.event) this.fnArg.event = event;
		if (events !== this.fnArg.events) this.fnArg.events = events;
		if (step !== this.fnArg.step) this.fnArg.step = step;
		if (Object.keys(extensions).length > 0) Object.assign(this.fnArg, extensions);
		for (const [hashedId, stepData] of Object.entries(result.steps)) {
			const existing = this.state.stepState[hashedId];
			if (existing && stepData && stepData.type === "data" && stepData.data !== existing.data) this.state.stepState[hashedId] = {
				...existing,
				data: stepData.data
			};
		}
	}
	createStepTools() {
		/**
		* A list of steps that have been found and are being rolled up before being
		* reported to the core loop.
		*/
		const foundStepsToReport = /* @__PURE__ */ new Map();
		/**
		* A map of the subset of found steps to report that have not yet been
		* handled. Used for fast access to steps that need to be handled in order.
		*/
		const unhandledFoundStepsToReport = /* @__PURE__ */ new Map();
		/**
		* A map of the latest sequential step indexes found for each step ID. Used
		* to ensure that we don't index steps in parallel.
		*
		* Note that these must be sequential; if we've seen or assigned `a:1`,
		* `a:2` and `a:4`, the latest sequential step index is `2`.
		*
		*/
		const expectedNextStepIndexes = /* @__PURE__ */ new Map();
		/**
		* An ordered list of step IDs that have yet to be handled in this
		* execution. Used to ensure that we handle steps in the order they were
		* found and based on the `stepCompletionOrder` in this execution's state.
		*/
		const remainingStepCompletionOrder = this.state.stepCompletionOrder.slice();
		/**
		* A promise that's used to ensure that step reporting cannot be run more than
		* once in a given asynchronous time span.
		*/
		let foundStepsReportPromise;
		/**
		* A flag used to ensure that we only warn about parallel indexing once per
		* execution to avoid spamming the console.
		*/
		let warnOfParallelIndexing = false;
		/**
		* Counts the number of times we've extended this tick.
		*/
		let tickExtensionCount = 0;
		/**
		* Given a colliding step ID, maybe warn the user about parallel indexing.
		*/
		const maybeWarnOfParallelIndexing = (userlandCollisionId) => {
			if (warnOfParallelIndexing) return;
			const hashedCollisionId = _internals.hashId(userlandCollisionId);
			if (this.state.steps.has(hashedCollisionId)) {
				if (!foundStepsToReport.has(hashedCollisionId)) {
					warnOfParallelIndexing = true;
					this.options.client["warnMetadata"]({ run_id: this.fnArg.runId }, require_errors.ErrCode.AUTOMATIC_PARALLEL_INDEXING, {
						message: `Duplicate step ID "${userlandCollisionId}" detected across parallel chains`,
						explanation: "Using the same ID for steps in different parallel chains can cause unexpected behaviour. Your function is still running.",
						action: "Use a unique ID for each step, especially those in parallel.",
						code: require_errors.ErrCode.AUTOMATIC_PARALLEL_INDEXING
					});
				}
			}
		};
		/**
		* A helper used to report steps to the core loop. Used after adding an item
		* to `foundStepsToReport`.
		*/
		const reportNextTick = () => {
			if (foundStepsReportPromise) return;
			let extensionPromise;
			if (++tickExtensionCount >= 10) {
				tickExtensionCount = 0;
				extensionPromise = require_promises.resolveNextTick();
			} else extensionPromise = require_promises.resolveAfterPending();
			foundStepsReportPromise = extensionPromise.then(() => {
				foundStepsReportPromise = void 0;
				for (let i = 0; i < remainingStepCompletionOrder.length; i++) {
					const nextStepId = remainingStepCompletionOrder[i];
					if (!nextStepId) continue;
					if (unhandledFoundStepsToReport.get(nextStepId)?.handle()) {
						remainingStepCompletionOrder.splice(i, 1);
						unhandledFoundStepsToReport.delete(nextStepId);
						reportNextTick();
						return;
					}
				}
				const steps = [...foundStepsToReport.values()];
				foundStepsToReport.clear();
				unhandledFoundStepsToReport.clear();
				if (!isNonEmpty(steps)) return;
				this.state.setCheckpoint({
					type: "steps-found",
					steps
				});
			});
		};
		/**
		* A helper used to push a step to the list of steps to report.
		*/
		const pushStepToReport = (step) => {
			foundStepsToReport.set(step.hashedId, step);
			unhandledFoundStepsToReport.set(step.hashedId, step);
			reportNextTick();
		};
		const stepHandler = async ({ args, matchOp, opts }) => {
			const opId = matchOp(require_InngestStepTools.getStepOptions(args[0]), ...args.slice(1));
			if (this.state.executingStep)
 /**
			* If a step is found after asynchronous actions during another step's
			* execution, everything is fine. The problem here is if we've found
			* that a step nested inside another a step, which is something we don't
			* support at the time of writing.
			*
			* In this case, we could use something like Async Hooks to understand
			* how the step is being triggered, though this isn't available in all
			* environments.
			*
			* Therefore, we'll only show a warning here to indicate that this is
			* potentially an issue.
			*/
			this.options.client["warnMetadata"]({ run_id: this.fnArg.runId }, require_errors.ErrCode.NESTING_STEPS, {
				message: `Nested step tooling detected in "${opId.displayName ?? opId.id}"`,
				explanation: "Nesting step.* calls is not supported. This warning may also appear if steps are separated by regular async calls, which is fine.",
				action: "Avoid using step.* inside other step.* calls. Use a separate async function or promise chaining to compose steps.",
				code: require_errors.ErrCode.NESTING_STEPS
			});
			const { hashedId, isFulfilled, setActualHandler, stepInfo, stepState, wrappedHandler } = await this.applyMiddlewareToStep(opId, expectedNextStepIndexes, maybeWarnOfParallelIndexing);
			const { promise, resolve, reject } = require_promises.createDeferredPromise();
			let extraOpts;
			let fnArgs = [...args];
			if (typeof stepState?.input !== "undefined" && Array.isArray(stepState.input)) switch (opId.op) {
				case require_types.StepOpCode.StepPlanned:
					fnArgs = [...args.slice(0, 2), ...stepState.input];
					extraOpts = { input: [...stepState.input] };
					break;
				case require_types.StepOpCode.AiGateway:
					extraOpts = { body: {
						...typeof opId.opts?.body === "object" ? { ...opId.opts.body } : {},
						...stepState.input[0]
					} };
					break;
			}
			if (!extraOpts && Array.isArray(stepInfo.input)) fnArgs = [...args.slice(0, 2), ...stepInfo.input];
			const step = {
				...opId,
				opts: {
					...opId.opts,
					...extraOpts
				},
				rawArgs: fnArgs,
				hashedId,
				input: stepState?.input,
				fn: opts?.fn ? () => opts.fn?.(this.fnArg, ...fnArgs) : void 0,
				promise,
				fulfilled: isFulfilled,
				hasStepState: Boolean(stepState),
				displayName: opId.displayName ?? opId.id,
				handled: false,
				middleware: {
					wrappedHandler,
					stepInfo,
					setActualHandler
				},
				handle: () => {
					if (step.handled) return false;
					this.devDebug(`handling step "${hashedId}"`);
					step.handled = true;
					const result = this.state.stepState[hashedId];
					if (step.fulfilled && result) {
						result.fulfilled = true;
						Promise.all([
							result.data,
							result.error,
							result.input
						]).then(async () => {
							if (step.transformedResultPromise) {
								if (step.memoizationDeferred) if (typeof result.data !== "undefined") step.memoizationDeferred.resolve(await result.data);
								else {
									const stepError = new require_StepError.StepError(opId.id, result.error);
									this.state.recentlyRejectedStepError = stepError;
									step.memoizationDeferred.reject(stepError);
								}
								step.transformedResultPromise.then(resolve, reject);
								return;
							}
							step.middleware.stepInfo.memoized = true;
							if (typeof result.data !== "undefined") {
								if (opId.op === require_types.StepOpCode.WaitForEvent && result.data !== null) {
									const { event } = step.rawArgs?.[1] ?? {};
									if (!event) throw new Error("Missing event option in waitForEvent");
									try {
										await require_utils$1.validateEvents([result.data], [{ event }]);
									} catch (err) {
										this.state.recentlyRejectedStepError = new require_StepError.StepError(opId.id, err);
										reject(this.state.recentlyRejectedStepError);
										return;
									}
								}
								step.middleware.setActualHandler(() => Promise.resolve(result.data));
								step.middleware.wrappedHandler().then(resolve);
							} else {
								const stepError = new require_StepError.StepError(opId.id, result.error);
								this.state.recentlyRejectedStepError = stepError;
								step.middleware.setActualHandler(() => Promise.reject(stepError));
								step.middleware.wrappedHandler().catch(reject);
							}
						});
					}
					return true;
				}
			};
			this.state.steps.set(hashedId, step);
			this.state.hasSteps = true;
			if (!isFulfilled && !stepState && step.fn) {
				const deferred = require_promises.createDeferredPromise();
				step.memoizationDeferred = deferred;
				setActualHandler(() => {
					pushStepToReport(step);
					return deferred.promise;
				});
				step.transformedResultPromise = wrappedHandler();
				step.transformedResultPromise.catch((error) => {
					reject(error);
				});
			} else pushStepToReport(step);
			return promise;
		};
		return require_InngestStepTools.createStepTools(this.options.client, this, stepHandler);
	}
	/**
	* Applies middleware transformations to a step, resolves ID collisions,
	* and performs memoization lookup.
	*/
	async applyMiddlewareToStep(opId, expectedNextStepIndexes, maybeWarnOfParallelIndexing) {
		const initialCollision = resolveStepIdCollision({
			baseId: opId.id,
			expectedIndexes: expectedNextStepIndexes,
			stepsMap: this.state.steps
		});
		if (initialCollision.finalId !== opId.id) {
			maybeWarnOfParallelIndexing(opId.id);
			opId.id = initialCollision.finalId;
			if (initialCollision.index !== void 0) opId.userland.index = initialCollision.index;
		}
		const originalId = opId.userland.id;
		let hashedId = _internals.hashId(opId.id);
		const { entryPoint, opName, opOpts, setActualHandler, stepInfo } = await this.middlewareManager.applyToStep({
			displayName: opId.displayName ?? opId.userland.id,
			hashedId,
			memoized: Boolean(this.state.stepState[hashedId]) && typeof this.state.stepState[hashedId]?.input === "undefined",
			op: opId.op,
			opts: opId.opts,
			userlandId: opId.userland.id
		});
		if (opName !== void 0) opId.name = opName;
		if (opOpts !== void 0) opId.opts = opOpts;
		if (stepInfo.options.id !== originalId) {
			opId.id = stepInfo.options.id;
			opId.userland.id = stepInfo.options.id;
			const secondCollision = resolveStepIdCollision({
				baseId: stepInfo.options.id,
				expectedIndexes: expectedNextStepIndexes,
				stepsMap: this.state.steps
			});
			if (secondCollision.finalId !== stepInfo.options.id) {
				opId.id = secondCollision.finalId;
				opId.userland.id = secondCollision.finalId;
				stepInfo.options.id = secondCollision.finalId;
				if (secondCollision.index !== void 0) opId.userland.index = secondCollision.index;
			}
			hashedId = _internals.hashId(opId.id);
			stepInfo.hashedId = hashedId;
		}
		const stepState = this.state.stepState[hashedId];
		let isFulfilled = false;
		if (stepState) {
			stepState.seen = true;
			this.state.remainingStepsToBeSeen.delete(hashedId);
			if (this.state.allStateUsed()) await this.middlewareManager.onMemoizationEnd();
			if (typeof stepState.input === "undefined") isFulfilled = true;
			stepInfo.memoized = isFulfilled;
		} else stepInfo.memoized = false;
		const wrappedHandler = this.middlewareManager.buildWrapStepChain(entryPoint, stepInfo);
		return {
			hashedId,
			stepInfo,
			wrappedHandler,
			setActualHandler,
			stepState,
			isFulfilled
		};
	}
	resumeStepWithResult(resultOp, resume = true) {
		const userlandStep = this.state.steps.get(resultOp.id);
		if (!userlandStep) throw new Error("Step not found in memoization state during async checkpointing; this should never happen and is a bug in the Inngest SDK");
		userlandStep.data = require_functions.undefinedToNull(resultOp.data);
		userlandStep.timing = resultOp.timing;
		userlandStep.op = resultOp.op;
		userlandStep.id = resultOp.id;
		if (resume) {
			userlandStep.fulfilled = true;
			userlandStep.hasStepState = true;
			this.state.stepState[resultOp.id] = userlandStep;
			userlandStep.handle();
		}
		return userlandStep;
	}
	getUserFnToRun() {
		if (!this.options.isFailureHandler) return this.options.fn["fn"];
		if (!this.options.fn["onFailureFn"])
 /**
		* Somehow, we've ended up detecting that this is a failure handler but
		* doesn't have an `onFailure` function. This should never happen.
		*/
		throw new Error("Cannot find function `onFailure` handler");
		return this.options.fn["onFailureFn"];
	}
	initializeTimer(state) {
		if (!this.options.requestedRunStep) return;
		this.timeout = require_promises.createTimeoutPromise(this.timeoutDuration);
		this.timeout.then(async () => {
			await this.middlewareManager.onMemoizationEnd();
			const { foundSteps, totalFoundSteps } = this.getStepNotFoundDetails();
			state.setCheckpoint({
				type: "step-not-found",
				step: {
					id: this.options.requestedRunStep,
					op: require_types.StepOpCode.StepNotFound
				},
				foundSteps,
				totalFoundSteps
			});
		});
	}
	getStepNotFoundDetails() {
		const foundSteps = [...this.state.steps.values()].filter((step) => !step.hasStepState).map((step) => ({
			id: step.hashedId,
			name: step.name,
			displayName: step.displayName
		})).sort((a, b) => a.id.localeCompare(b.id));
		return {
			foundSteps: foundSteps.slice(0, STEP_NOT_FOUND_MAX_FOUND_STEPS),
			totalFoundSteps: foundSteps.length
		};
	}
	initializeCheckpointRuntimeTimer(state) {
		this.devDebug("initializing checkpointing runtime timers", this.options.checkpointingConfig);
		if (this.options.checkpointingConfig?.maxRuntime) {
			const maxRuntimeMs = require_temporal.isTemporalDuration(this.options.checkpointingConfig.maxRuntime) ? this.options.checkpointingConfig.maxRuntime.total({ unit: "milliseconds" }) : typeof this.options.checkpointingConfig.maxRuntime === "string" ? (0, ms.default)(this.options.checkpointingConfig.maxRuntime) : this.options.checkpointingConfig.maxRuntime;
			if (Number.isFinite(maxRuntimeMs) && maxRuntimeMs > 0) {
				this.checkpointingMaxRuntimeTimer = require_promises.createTimeoutPromise(maxRuntimeMs);
				this.checkpointingMaxRuntimeTimer.then(async () => {
					await this.middlewareManager.onMemoizationEnd();
					state.setCheckpoint({ type: "checkpointing-runtime-reached" });
				});
			}
		}
		if (this.options.checkpointingConfig?.maxInterval) {
			const maxIntervalMs = require_temporal.isTemporalDuration(this.options.checkpointingConfig.maxInterval) ? this.options.checkpointingConfig.maxInterval.total({ unit: "milliseconds" }) : typeof this.options.checkpointingConfig.maxInterval === "string" ? (0, ms.default)(this.options.checkpointingConfig.maxInterval) : this.options.checkpointingConfig.maxInterval;
			if (Number.isFinite(maxIntervalMs) && maxIntervalMs > 0) {
				this.checkpointingMaxBufferIntervalTimer = require_promises.createTimeoutPromise(maxIntervalMs);
				this.checkpointingMaxBufferIntervalTimer.then(async () => {
					state.setCheckpoint({ type: "checkpointing-buffer-interval-reached" });
					this.checkpointingMaxBufferIntervalTimer?.reset();
				});
			}
		}
	}
};
const hashId = (id) => {
	return sha1().update(id).digest("hex");
};
const hashOp = (op) => {
	return {
		...op,
		id: hashId(op.id)
	};
};
/**
* Resolves step ID collisions by appending an index suffix if needed.
* Consolidates the duplicated collision detection logic.
*
* @param baseId - The original step ID
* @param stepsMap - Map of existing steps (keyed by hashed ID)
* @param expectedIndexes - Map tracking expected next index for each base ID
* @returns The final ID to use and optional index
*/
function resolveStepIdCollision({ baseId, expectedIndexes, stepsMap }) {
	const hashedBaseId = hashId(baseId);
	if (!stepsMap.has(hashedBaseId) && !expectedIndexes.has(baseId)) {
		expectedIndexes.set(baseId, 1);
		return { finalId: baseId };
	}
	const expectedNextIndex = expectedIndexes.get(baseId) ?? 1;
	const maxIndex = expectedNextIndex + stepsMap.size + 1;
	for (let i = expectedNextIndex; i < maxIndex; i++) {
		const indexedId = baseId + require_InngestStepTools.STEP_INDEXING_SUFFIX + i;
		const hashedIndexedId = hashId(indexedId);
		if (!stepsMap.has(hashedIndexedId)) {
			expectedIndexes.set(baseId, i + 1);
			return {
				finalId: indexedId,
				index: i
			};
		}
	}
	throw new require_utils.UnreachableError(`Could not resolve step ID collision for "${baseId}" after ${stepsMap.size + 1} attempts`);
}
function isNonEmpty(arr) {
	return arr.length > 0;
}
/**
* Exported for testing.
*/
const _internals = {
	hashOp,
	hashId,
	resolveStepIdCollision
};

//#endregion
exports._internals = _internals;
exports.createExecutionEngine = createExecutionEngine;
Object.defineProperty(exports, 'engine_exports', {
  enumerable: true,
  get: function () {
    return engine_exports;
  }
});
//# sourceMappingURL=engine.cjs.map