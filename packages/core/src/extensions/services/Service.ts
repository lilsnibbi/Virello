import { Module } from "../../core/modules/index";

/** Base class for shared services. Use inherited onLoad/onUnload hooks to acquire and release resources. */
export abstract class Service<
	Options extends Service.Options = Service.Options,
> extends Module<Options, "services"> {}

/** Types and helpers for {@link Service}. */
export declare namespace Service {
	/** Shorthand for {@link Module.Context}. */
	export type Context = Module.Context<"services">;
	/** Shorthand for {@link Module.Options}. */
	export type Options = Module.Options;
	/** Shorthand for {@link Module.JSON}. */
	export type JSON = Module.JSON;
	/** Shorthand for {@link Module.LocationJSON}. */
	export type LocationJSON = Module.LocationJSON;
}
