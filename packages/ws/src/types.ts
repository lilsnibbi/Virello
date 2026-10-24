import type {
	GatewayDispatchEvents,
	GatewayDispatchPayload,
	GatewayMessageUpdateDispatch,
	GatewayMessageUpdateDispatchData,
	GatewayReceivePayload,
	GatewaySendPayload,
	GatewayOpcodes,
} from "discord-api-types/v10";

/** Application Gateway commands. Authentication and heartbeats remain transport-owned. */
export type $GatewayCommand = Extract<
	GatewaySendPayload,
	{
		op:
			| GatewayOpcodes.PresenceUpdate
			| GatewayOpcodes.VoiceStateUpdate
			| GatewayOpcodes.RequestGuildMembers
			| GatewayOpcodes.RequestSoundboardSounds
			| GatewayOpcodes.RequestChannelInfo;
	}
>;

/** Bounds and cancellation for a queued Gateway command. */
export interface $GatewaySendOptions {
	/** Queue deadline in milliseconds, 1–300000. Defaults to 15000. */
	deadlineMs?: number;
	/** Cancels an unsent command. A successful write cannot be recalled. */
	signal?: AbortSignal;
}

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
