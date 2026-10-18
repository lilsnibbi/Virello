import type {
	GatewayDispatchEvents,
	GatewayDispatchPayload,
	GatewayMessageUpdateDispatch,
	GatewayMessageUpdateDispatchData,
	GatewayReceivePayload,
} from "discord-api-types/v10";

/** Partial Discord message update with the message and channel IDs always present. */
export type $MessageUpdateData = Partial<GatewayMessageUpdateDispatchData> &
	Pick<GatewayMessageUpdateDispatchData, "id" | "channel_id">;
/** Native Discord dispatch payload, allowing partial MESSAGE_UPDATE data. */
export type $GatewayDispatch =
	| Exclude<
			GatewayDispatchPayload,
			{
				/** MESSAGE_UPDATE event discriminator for the partial message-update branch. */
				t: GatewayDispatchEvents.MessageUpdate;
			}
	  >
	| (Omit<GatewayMessageUpdateDispatch, "d"> & {
			/** Partial message update data with required message and channel IDs. */
			d: $MessageUpdateData;
	  });
/** Native incoming gateway packet, including dispatches with partial message updates. */
export type $GatewayPacket =
	Exclude<GatewayReceivePayload, GatewayDispatchPayload> | $GatewayDispatch;
