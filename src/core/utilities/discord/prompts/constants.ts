import type { MessageBody } from "../../../discord/payloads";

/** A type to extend multiple discord types and simplify usage in {@link MessagePrompter} */
export type MessagePrompterMessage = string | MessageBody;

/** Supported prompt channel types, excluding voice/stage and category channels. Runtime strategies also verify they can send text. */
export type MessagePrompterChannelTypes = string | { id: string };
