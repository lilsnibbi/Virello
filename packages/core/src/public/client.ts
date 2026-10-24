/**
 * Create the Virello Discord client, access shared services, and configure framework logging.
 * @packageDocumentation
 */
import "@virello/util/bun";

export { type Container, container } from "../core/Container";
export * from "../core/client/VirelloClient";
export * from "@virello/logging";
export { version } from "../version";
