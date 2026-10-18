import { afterEach, jest, mock, setSystemTime } from "bun:test";
import { requiredRedisUrl } from "../scripts/ciSupport";
import { registries } from "../src/commands/registration/registries";

if (process.env.CI === "true")
	requiredRedisUrl(process.env.VIRELLO_TEST_REDIS_URL);

afterEach(() => {
	mock.restore();
	jest.useRealTimers();
	setSystemTime();
	registries.clear();
});
