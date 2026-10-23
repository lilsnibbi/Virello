import type {
	APIApplicationCommandInteractionDataBasicOption,
	ModalSubmitComponent,
} from "discord-api-types/v10";

/** Choose the true or false result type, or their union for an unknown boolean. */
export type If<
	Value extends boolean,
	TrueResult,
	FalseResult,
> = Value extends true
	? TrueResult
	: Value extends false
		? FalseResult
		: TrueResult | FalseResult;

/** Return a definite value when required is true; otherwise include the fallback type, null by default. */
export type RequiredIf<
	Value extends boolean,
	ValueType,
	FallbackType = null,
> = If<Value, ValueType, ValueType | FallbackType>;

/** Native Discord option kinds excluding subcommand containers. */
export type BasicApplicationCommandOptionType =
	APIApplicationCommandInteractionDataBasicOption["type"];

// This extra type is required because apparently just inlining what `_TypeToOptionMap` does into `TypeToOptionMap` does not behave the same
/**
 * Intermediate native option map used for type narrowing.
 * @internal
 */
type _TypeToOptionMap = {
	[
		Option in BasicApplicationCommandOptionType
	]: APIApplicationCommandInteractionDataBasicOption & {
		/**
		 * Option-kind discriminator used by the map.
		 * @internal
		 */
		type: Option;
	};
};

/** Native basic option payloads indexed by their option type. */
export type TypeToOptionMap = {
	[Option in keyof _TypeToOptionMap]: _TypeToOptionMap[Option];
};

/** Native component kinds allowed in modal submissions. */
export type ModalComponentType = ModalSubmitComponent["type"];

/**
 * Intermediate modal component map used for type narrowing.
 * @internal
 */
type _TypeToModalComponentMap = {
	[Component in ModalComponentType]: ModalSubmitComponent & {
		/**
		 * Component-kind discriminator used by the map.
		 * @internal
		 */
		type: Component;
	};
};

/** Native submitted modal components indexed by component type. */
export type TypeToModalComponentMap = {
	[
		Component in keyof _TypeToModalComponentMap
	]: _TypeToModalComponentMap[Component];
};
