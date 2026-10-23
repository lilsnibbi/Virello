import { container } from "../../core/modules/index";
import { BooleanArgument as CoreBoolean } from "./builtins/Boolean";
import { ChannelArgument as CoreChannel } from "./builtins/Channel";
import { DateArgument as CoreDate } from "./builtins/Date";
import { DMChannelArgument as CoreDMChannel } from "./builtins/DMChannel";
import { EmojiArgument as CoreEmoji } from "./builtins/Emoji";
import { EnumArgument as CoreEnum } from "./builtins/Enum";
import { FloatArgument as CoreFloat } from "./builtins/Float";
import { GuildArgument as CoreGuild } from "./builtins/Guild";
import { GuildCategoryChannelArgument as CoreGuildCategoryChannel } from "./builtins/GuildCategoryChannel";
import { GuildChannelArgument as CoreGuildChannel } from "./builtins/GuildChannel";
import { GuildNewsChannelArgument as CoreGuildNewsChannel } from "./builtins/GuildNewsChannel";
import { GuildNewsThreadChannelArgument as CoreGuildNewsThreadChannel } from "./builtins/GuildNewsThreadChannel";
import { GuildPrivateThreadChannelArgument as CoreGuildPrivateThreadChannel } from "./builtins/GuildPrivateThreadChannel";
import { GuildPublicThreadChannelArgument as CoreGuildPublicThreadChannel } from "./builtins/GuildPublicThreadChannel";
import { GuildStageVoiceChannelArgument as CoreGuildStageVoiceChannel } from "./builtins/GuildStageVoiceChannel";
import { GuildTextChannelArgument as CoreGuildTextChannel } from "./builtins/GuildTextChannel";
import { GuildThreadChannelArgument as CoreGuildThreadChannel } from "./builtins/GuildThreadChannel";
import { GuildVoiceChannelArgument as CoreGuildVoiceChannel } from "./builtins/GuildVoiceChannel";
import { HyperlinkArgument as CoreHyperlink } from "./builtins/Hyperlink";
import { IntegerArgument as CoreInteger } from "./builtins/Integer";
import { MemberArgument as CoreMember } from "./builtins/Member";
import { MessageArgument as CoreMessage } from "./builtins/Message";
import { NumberArgument as CoreNumber } from "./builtins/Number";
import { PartialDMChannelArgument as CorePartialDMChannel } from "./builtins/PartialDMChannel";
import { RoleArgument as CoreRole } from "./builtins/Role";
import { StringArgument as CoreString } from "./builtins/String";
import { UserArgument as CoreUser } from "./builtins/User";

export function loadArguments(): void {
	void container.modules.addModule({
		name: "boolean",
		module: CoreBoolean,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "channel",
		module: CoreChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "date",
		module: CoreDate,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "dmChannel",
		module: CoreDMChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "emoji",
		module: CoreEmoji,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "enum",
		module: CoreEnum,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "float",
		module: CoreFloat,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "guild",
		module: CoreGuild,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "guildCategoryChannel",
		module: CoreGuildCategoryChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "guildChannel",
		module: CoreGuildChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "guildNewsChannel",
		module: CoreGuildNewsChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "guildNewsThreadChannel",
		module: CoreGuildNewsThreadChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "guildPrivateThreadChannel",
		module: CoreGuildPrivateThreadChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "guildPublicThreadChannel",
		module: CoreGuildPublicThreadChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "guildStageVoiceChannel",
		module: CoreGuildStageVoiceChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "guildTextChannel",
		module: CoreGuildTextChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "guildThreadChannel",
		module: CoreGuildThreadChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "guildVoiceChannel",
		module: CoreGuildVoiceChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "hyperlink",
		module: CoreHyperlink,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "integer",
		module: CoreInteger,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "member",
		module: CoreMember,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "message",
		module: CoreMessage,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "number",
		module: CoreNumber,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "partialDMChannel",
		module: CorePartialDMChannel,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "role",
		module: CoreRole,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "string",
		module: CoreString,
		store: "arguments",
	});
	void container.modules.addModule({
		name: "user",
		module: CoreUser,
		store: "arguments",
	});
}
