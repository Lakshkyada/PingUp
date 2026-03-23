const require_rolldown_runtime = require('../../../_virtual/rolldown_runtime.cjs');
const require_version = require('../../../version.cjs');
const require_middleware = require('../../middleware/middleware.cjs');
const require_access = require('./access.cjs');
const require_consts = require('./consts.cjs');
const require_util = require('./util.cjs');
let debug = require("debug");
debug = require_rolldown_runtime.__toESM(debug);
let __opentelemetry_api = require("@opentelemetry/api");

//#region src/components/execution/otel/middleware.ts
const devDebug = (0, debug.default)(`${require_consts.debugPrefix}:middleware`);
var InngestTracesLogger = class {
	#logger = (0, debug.default)(`${require_consts.debugPrefix}:diag`);
	debug = this.#logger;
	error = this.#logger;
	info = this.#logger;
	verbose = this.#logger;
	warn = this.#logger;
};
/**
* Middleware the captures and exports spans relevant to Inngest runs using
* OTel.
*
* This can be used to attach additional spans and data to the existing traces
* in your Inngest dashboard (or Dev Server).
*/
const extendedTracesMiddleware = ({ behaviour = "auto", instrumentations, logLevel = __opentelemetry_api.DiagLogLevel.ERROR } = {}) => {
	devDebug("behaviour:", behaviour);
	let processor;
	switch (behaviour) {
		case "auto": {
			const extended = require_util.extendProvider(behaviour);
			if (extended.success) {
				devDebug("extended existing provider");
				processor = extended.processor;
				break;
			}
			const created = require_util.createProvider(behaviour, instrumentations);
			if (created.success) {
				devDebug("created new provider");
				processor = created.processor;
				break;
			}
			console.warn("no provider found to extend and unable to create one");
			break;
		}
		case "createProvider": {
			const created = require_util.createProvider(behaviour, instrumentations);
			if (created.success) {
				devDebug("created new provider");
				processor = created.processor;
				break;
			}
			console.warn("unable to create provider, Extended Traces middleware will not work");
			break;
		}
		case "extendProvider": {
			const extended = require_util.extendProvider(behaviour);
			if (extended.success) {
				devDebug("extended existing provider");
				processor = extended.processor;
				break;
			}
			console.warn("unable to extend provider, Extended Traces middleware will not work. Either allow the middleware to create a provider by setting `behaviour: \"createProvider\"` or `behaviour: \"auto\"`, or make sure that the provider is created and imported before the middleware is used.");
			break;
		}
		case "off": break;
		default: console.warn(`unknown behaviour ${JSON.stringify(behaviour)}, defaulting to "off"`);
	}
	class ExtendedTracesMiddleware extends require_middleware.Middleware.BaseMiddleware {
		id = "inngest:extended-traces";
		/**
		* Called by the Inngest constructor to associate the processor with the
		* client.
		*/
		static onRegister({ client }) {
			devDebug("set otel diagLogger:", __opentelemetry_api.diag.setLogger(new InngestTracesLogger(), logLevel));
			if (processor) require_access.clientProcessorMap.set(client, processor);
		}
		transformFunctionInput(arg) {
			return {
				...arg,
				ctx: {
					...arg.ctx,
					tracer: __opentelemetry_api.trace.getTracer("inngest", require_version.version)
				}
			};
		}
		wrapRequest({ next }) {
			return next().finally(() => processor?.forceFlush());
		}
	}
	return ExtendedTracesMiddleware;
};

//#endregion
exports.extendedTracesMiddleware = extendedTracesMiddleware;
//# sourceMappingURL=middleware.cjs.map