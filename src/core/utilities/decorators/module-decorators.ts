import { ApplicationCommandType } from "discord-api-types/v10";
import {
	type ContextMenuCommandBuilder,
	type SlashCommandBuilder,
	type SlashCommandOptionsOnlyBuilder,
	type SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

import { type Command } from "../../commands/Command";
import { type ApplicationCommandRegistryRegisterOptions } from "../../commands/registration/Registry";
import { container } from "../../core/Container";
import type { Container } from "../../core/modules/index";
import { type Module } from "../../core/modules/Module";
import type { Ctor } from "../../../util/general";
import { createClassDecorator, createProxy } from "./utils";

const applicationDecoratorsMap = new WeakMap<
	CommandTarget<Command>,
	unknown[]
>();
const proxyApplicationCommandToOriginal = new WeakMap<
	CommandTarget<Command>,
	CommandTarget<Command>
>();
const originalApplicationCommandToProxy = new WeakMap<
	CommandTarget<Command>,
	CommandTarget<Command>
>();

/** Decorator function that applies given options to any Virello module */
export function ApplyOptions<T extends Module.Options>(
	optionsOrFn: T | ((parameters: ApplyOptionsCallbackParameters) => T),
): ClassDecorator {
	return createClassDecorator(
		(target: Ctor<ConstructorParameters<typeof Module>, Module>) =>
			createProxy(target, {
				construct: (
					ctor,
					[context, baseOptions = {}]: [Module.Context, Module.Options],
				) =>
					new ctor(context, {
						...baseOptions,
						...(typeof optionsOrFn === "function"
							? optionsOrFn({ container, context })
							: optionsOrFn),
					}),
			}),
	);
}

/** Decorator for registering chat input command. */
export function RegisterChatInputCommand<CMD extends Command = Command>(
	optionsFn: ChatInputCommandDecoratorsMap<CMD>["optionsFn"],
	registryOptions?: ApplicationCommandRegistryRegisterOptions,
): ClassDecorator {
	return createClassDecorator((target: CommandTarget<CMD>) =>
		collectApplicationCommandDecorators(target, {
			type: "RegisterChatInputCommand",
			optionsFn,
			registryOptions,
		}),
	);
}

/** Decorator for registering message context menu command. */
export function RegisterMessageContextMenuCommand<
	CMD extends Command = Command,
>(
	optionsFn: ContextMenuCommandDecoratorsMap<CMD>["optionsFn"],
	registryOptions?: ApplicationCommandRegistryRegisterOptions,
): ClassDecorator {
	return createClassDecorator((target: CommandTarget<CMD>) =>
		collectApplicationCommandDecorators(target, {
			type: "RegisterMessageContextMenuCommand",
			optionsFn,
			registryOptions,
		}),
	);
}

/** Decorator for registering user context menu command. */
export function RegisterUserContextMenuCommand<CMD extends Command = Command>(
	optionsFn: ContextMenuCommandDecoratorsMap<CMD>["optionsFn"],
	registryOptions?: ApplicationCommandRegistryRegisterOptions,
): ClassDecorator {
	return createClassDecorator((target: CommandTarget<CMD>) =>
		collectApplicationCommandDecorators(target, {
			type: "RegisterUserContextMenuCommand",
			optionsFn,
			registryOptions,
		}),
	);
}

function collectApplicationCommandDecorators<CMD extends Command>(
	target: CommandTarget<CMD>,
	decorator: DecoratorMap<CMD>,
): CommandTarget<CMD> {
	const original = proxyApplicationCommandToOriginal.get(target) ?? target;

	const exisiting = applicationDecoratorsMap.get(original) ?? [];
	exisiting.push(decorator);
	applicationDecoratorsMap.set(original, exisiting);

	if (originalApplicationCommandToProxy.has(original))
		return originalApplicationCommandToProxy.get(
			original,
		)! as CommandTarget<CMD>;

	const proxied = createProxy(target, {
		construct(originalTarget, argArray) {
			const command: CMD = Reflect.construct(originalTarget, argArray);
			const decorators = applicationDecoratorsMap.get(
				original,
			) as DecoratorMap<CMD>[];

			const originalRegister =
				command.registerApplicationCommands?.bind(command);
			command.registerApplicationCommands =
				function registerApplicationCommands(registry: Command.Registry) {
					for (const deco of decorators) {
						switch (deco.type) {
							case "RegisterChatInputCommand": {
								registry.registerChatInputCommand(
									(builder) => deco.optionsFn(builder, command),
									deco.registryOptions,
								);
								break;
							}

							case "RegisterMessageContextMenuCommand": {
								registry.registerContextMenuCommand(
									(builder) =>
										deco
											.optionsFn(builder, command)
											.setType(ApplicationCommandType.Message),
									deco.registryOptions,
								);
								break;
							}

							case "RegisterUserContextMenuCommand": {
								registry.registerContextMenuCommand(
									(builder) =>
										deco
											.optionsFn(builder, command)
											.setType(ApplicationCommandType.User),
									deco.registryOptions,
								);
								break;
							}
						}
					}

					if (originalRegister) return originalRegister.call(this, registry);
				};

			return command;
		},
	});

	proxyApplicationCommandToOriginal.set(proxied, original);
	originalApplicationCommandToProxy.set(original, proxied);

	return proxied;
}

/** Context passed to an ApplyOptions callback while constructing a module. */
export interface ApplyOptionsCallbackParameters {
	/** Shared framework services available during construction. */
	container: Container;
	/** Loader context for the module being constructed. */
	context: Module.Context;
}

/**
 * Registration callback contract used by application command decorators.
 * @internal
 */
interface ChatInputCommandDecoratorsMap<CMD extends Command> {
	/**
	 * Decorator kind used for registration bookkeeping.
	 * @internal
	 */
	type: "RegisterChatInputCommand";
	/** Configure the supplied builder using the command instance, and return the builder. */
	optionsFn: (
		builder: SlashCommandBuilder,
		command: ThisType<CMD> & CMD,
	) =>
		| SlashCommandBuilder
		| SlashCommandSubcommandsOnlyBuilder
		| SlashCommandOptionsOnlyBuilder;
	/** Optional guild scope, localization, ID hints, and registration behavior. */
	registryOptions?: ApplicationCommandRegistryRegisterOptions;
}

/**
 * Registration callback contract used by application command decorators.
 * @internal
 */
interface ContextMenuCommandDecoratorsMap<CMD extends Command> {
	/**
	 * Decorator kind used for registration bookkeeping.
	 * @internal
	 */
	type: "RegisterMessageContextMenuCommand" | "RegisterUserContextMenuCommand";
	/** Configure the supplied builder using the command instance, and return the builder. */
	optionsFn: (
		builder: ContextMenuCommandBuilder, //
		command: ThisType<CMD> & CMD,
	) => ContextMenuCommandBuilder;
	/** Optional guild scope, localization, ID hints, and registration behavior. */
	registryOptions?: ApplicationCommandRegistryRegisterOptions;
}

type CommandTarget<CMD extends Command> = Ctor<
	ConstructorParameters<typeof Command>,
	CMD
>;
type DecoratorMap<CMD extends Command> =
	ChatInputCommandDecoratorsMap<CMD> | ContextMenuCommandDecoratorsMap<CMD>;
