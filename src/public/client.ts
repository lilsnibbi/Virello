/**
 * Create the Virello Discord client, access shared services, and configure framework logging.
 * @packageDocumentation
 */
import "../core/runtime";

export { type Container, container } from "../core/Container";
export * from "../core/client/VirelloClient";
export * from "../core/logging/index";
export { version } from "../version";
