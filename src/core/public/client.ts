/**
 * Create the Virello Discord client, access shared services, and configure framework logging.
 * @packageDocumentation
 */
import "../../util/bun";

export { type Container, container } from "../core/Container";
export * from "../core/client/VirelloClient";
export * from "../../logging/index";
export { version } from "../version";
