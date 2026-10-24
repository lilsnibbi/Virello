import { container } from "../../../core/modules/index";
import { ErrorListener as TaskError } from "./error";
import { NotFoundListener as TaskNotFound } from "./notFound";

export function loadListeners() {
	const store = "listeners" as const;
	void container.modules.addModule({
		name: "TaskError",
		module: TaskError,
		store,
	});
	void container.modules.addModule({
		name: "TaskNotFound",
		module: TaskNotFound,
		store,
	});
}
