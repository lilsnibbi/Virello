/**
 * Define message and application commands, parse arguments, register Discord commands, and run command checks.
 * @packageDocumentation
 */
import "../core/runtime";

export * from "../commands/arguments/Args";
export * from "../commands/arguments/Argument";
export * from "../commands/arguments/ArgumentStore";
export * from "../commands/arguments/contexts";
export type { EmojiObject } from "../commands/arguments/resolvers/emoji";
/** Built-in argument resolver functions returning Result values. */
export * as Resolvers from "../commands/arguments/resolvers/index";
export type { MessageResolverOptions } from "../commands/arguments/resolvers/message";
export * from "../commands/Command";
export * from "../commands/CommandStore";
export * from "../commands/checks/containers/Container";
export * from "../commands/checks/containers/conditions/all";
export * from "../commands/checks/containers/conditions/any";
export * from "../commands/checks/containers/conditions/Condition";
export * from "../commands/checks/containers/Entry";
export * from "../commands/checks/containers/Group";
export * from "../commands/checks/containers/permissions/client";
export * from "../commands/checks/containers/permissions/user";
export { CorePreconditions } from "../commands/checks/core";
export * from "../commands/checks/Precondition";
export * from "../commands/checks/PreconditionStore";
/** Reusable command-check functions returning success or UserError results. */
export * as PreconditionResolvers from "../commands/checks/resolvers/index";
export * from "../commands/enums";
export * from "../commands/errors/ArgumentError";
export * from "../commands/errors/Identifiers";
export * from "../commands/errors/PreconditionError";
export * from "../commands/errors/UserError";
export { ApplicationCommandRegistries } from "../commands/registration/api";
export {
	ApplicationCommandRegistry,
	type ApplicationCommandRegistryRegisterOptions,
} from "../commands/registration/Registry";
export * from "../commands/types";
export * from "../extensions/patternCommands/events";
export * from "../extensions/patternCommands/PatternCommand";
export * from "../extensions/patternCommands/PatternCommandStore";
export * from "../extensions/patternCommands/types";
export * from "../extensions/subcommands/index";
