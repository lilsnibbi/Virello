/** A module failed to release resources, so startup cannot safely continue. */
export class ModuleCleanupError extends AggregateError {}
