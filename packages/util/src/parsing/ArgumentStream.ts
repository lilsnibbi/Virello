import { Option, Result } from "../result/index";
import type { Parameter } from "./lexer/streams/ParameterStream";
import type { ParserResult } from "./parser/ParserResult";

/** Consume positional arguments while reading parsed flags/options independently. Rejected parses leave their argument available. */
export class ArgumentStream {
	/** Underlying positional parameters, flags, and named option values. */
	public readonly results: ParserResult;
	/** Mutable used-index set and next-position cursor. Use save/restore for temporary parsing. */
	public state: ArgumentStream.State;

	/**
	 * Create a reader with no consumed positions.
	 * @param results - Parsed positional, flag, and option data.
	 */
	public constructor(results: ParserResult) {
		this.results = results;
		this.state = { used: new Set(), position: 0 };
	}

	/** Whether all ordered parameters were used. */
	public get finished() {
		return this.used === this.length;
	}

	/** The number of ordered parameters. */
	public get length() {
		return this.results.ordered.length;
	}

	/** The remaining amount of ordered parameters. */
	public get remaining() {
		return this.length - this.used;
	}

	/** The number of ordered parameters that have been used. */
	public get used() {
		return this.state.used.size;
	}

	/** Get the value of the next unused ordered token. */
	public single(): Option<string> {
		if (this.finished) return Option.none;

		while (this.state.used.has(this.state.position)) {
			++this.state.position;
		}

		this.state.used.add(this.state.position);
		return Option.some(this.results.ordered[this.state.position++].value);
	}

	/** Transform the next unused token. Use singleMapAsync for an async callback. */
	public singleMap<T>(
		predicate: (value: string) => Option<T>,
		useAnyways = false,
	): Option<T> {
		if (this.finished) return Option.none;

		while (this.state.used.has(this.state.position)) {
			++this.state.position;
		}

		const result = predicate(this.results.ordered[this.state.position].value);
		if (result.isSome() || useAnyways) {
			this.state.used.add(this.state.position);
			++this.state.position;
		}

		return result;
	}

	/** Transform the next unused token with an async callback. */
	public async singleMapAsync<T>(
		predicate: (value: string) => Promise<Option<T>>,
		useAnyways = false,
	): Promise<Option<T>> {
		if (this.finished) return Option.none;

		while (this.state.used.has(this.state.position)) {
			++this.state.position;
		}

		const result = await predicate(
			this.results.ordered[this.state.position].value,
		);
		if (result.isSome() || useAnyways) {
			this.state.used.add(this.state.position);
			++this.state.position;
		}

		return result;
	}

	/** Parse the next unused token, keeping its error on failure. Use singleParseAsync for async work. */
	public singleParse<T, E>(
		predicate: (value: string) => Result<T, E>,
		useAnyways = false,
	): Result<T, E | null> {
		if (this.finished) return Result.err(null);

		while (this.state.used.has(this.state.position)) {
			++this.state.position;
		}

		const result = predicate(this.results.ordered[this.state.position].value);
		if (result.isOk() || useAnyways) {
			this.state.used.add(this.state.position);
			++this.state.position;
		}

		return result;
	}

	/** Parse the next unused token asynchronously, keeping its error on failure. */
	public async singleParseAsync<T, E>(
		predicate: (value: string) => Promise<Result<T, E>>,
		useAnyways = false,
	): Promise<Result<T, E | null>> {
		if (this.finished) return Result.err(null);

		while (this.state.used.has(this.state.position)) {
			++this.state.position;
		}

		const result = await predicate(
			this.results.ordered[this.state.position].value,
		);
		if (result.isOk() || useAnyways) {
			this.state.used.add(this.state.position);
			++this.state.position;
		}

		return result;
	}

	/** Return the value of the first element in the array within `Option.some` where `predicate` returns `true`, and `Option.none` otherwise.  This does not support asynchronous results, refer to {@link findAsync}. */
	public find(
		predicate: (value: string) => boolean,
		from = this.state.position,
	): Option<string> {
		for (let i = from; i < this.length; ++i) {
			if (this.state.used.has(i)) continue;

			const parameter = this.results.ordered[i].value;
			if (predicate(parameter)) {
				this.state.used.add(i);
				return Option.some(parameter);
			}
		}

		return Option.none;
	}

	/** Return the value of the first element in the array within `Option.some` where `predicate` returns `true`, and `Option.none` otherwise.  This is an asynchronous variant of {@link find}. */
	public async findAsync(
		predicate: (value: string) => Promise<boolean>,
		from = this.state.position,
	): Promise<Option<string>> {
		for (let i = from; i < this.length; ++i) {
			if (this.state.used.has(i)) continue;

			const parameter = this.results.ordered[i].value;
			if (await predicate(parameter)) {
				this.state.used.add(i);
				return Option.some(parameter);
			}
		}

		return Option.none;
	}

	/** Return the value of the first element in the array within `Option.some` where `predicate` returns `Some`, and `Option.none` otherwise.  This does not support asynchronous results, refer to {@link findMapAsync}. */
	public findMap<T>(
		predicate: (value: string) => Option<T>,
		from = this.state.position,
	): Option<T> {
		for (let i = from; i < this.length; ++i) {
			if (this.state.used.has(i)) continue;

			const parameter = this.results.ordered[i].value;
			const result = predicate(parameter);
			if (result.isSome()) {
				this.state.used.add(i);
				return result;
			}
		}

		return Option.none;
	}

	/** Return the value of the first element in the array within `Option.some` where `predicate` returns `Some`, and `Option.none` otherwise.  This is an asynchronous variant of {@link findMap}. */
	public async findMapAsync<T>(
		predicate: (value: string) => Promise<Option<T>>,
		from = this.state.position,
	): Promise<Option<T>> {
		for (let i = from; i < this.length; ++i) {
			if (this.state.used.has(i)) continue;

			const parameter = this.results.ordered[i].value;
			const result = await predicate(parameter);
			if (result.isSome()) {
				this.state.used.add(i);
				return result;
			}
		}

		return Option.none;
	}

	/** Find the first token that parses successfully, collecting errors from failed attempts. */
	public findParse<T, E>(
		predicate: (value: string) => Result<T, E>,
		from = this.state.position,
	): Result<T, E[]> {
		const errors: E[] = [];
		for (let i = from; i < this.length; ++i) {
			if (this.state.used.has(i)) continue;

			const parameter = this.results.ordered[i].value;
			const result = predicate(parameter);
			if (result.isOk()) {
				this.state.used.add(i);
				return result as Result.Ok<T>;
			}

			errors.push(result.unwrapErr());
		}

		return Result.err(errors);
	}

	/** Find and retrieves the first unused parameter that could be transformed. */
	public async findParseAsync<T, E>(
		predicate: (value: string) => Promise<Result<T, E>>,
		from = this.state.position,
	): Promise<Result<T, E[]>> {
		const errors: E[] = [];
		for (let i = from; i < this.length; ++i) {
			if (this.state.used.has(i)) continue;

			const parameter = this.results.ordered[i].value;
			const result = await predicate(parameter);
			if (result.isOk()) {
				this.state.used.add(i);
				return result as Result.Ok<T>;
			}

			errors.push(result.unwrapErr());
		}

		return Result.err(errors);
	}

	/** Get multiple unused parameters. */
	public many(
		limit = Infinity,
		from = this.state.position,
	): Option<Parameter[]> {
		if (this.finished) return Option.none;

		const parameters: Parameter[] = [];
		for (let i = from; i < this.length; ++i) {
			// If the current parameter was already used, skip:
			if (this.state.used.has(i)) continue;

			// Mark current parameter as used, and push it to the resulting array:
			this.state.used.add(i);
			parameters.push(this.results.ordered[i]);

			// If the parameters reached the limit, break the loop:
			if (parameters.length >= limit) break;
		}

		return parameters.length ? Option.some(parameters) : Option.none;
	}

	/**
	 * Select unused positional arguments, consuming only matches.
	 * @param predicate - Test for whether to consume a value.
	 * @param from - Starting position; defaults to the current cursor.
	 * @returns Some with collected values, including an empty list if nothing matched. Returns None only when already
	 * finished. Callback errors propagate.
	 */
	public filter(
		predicate: (value: string) => boolean,
		from = this.state.position,
	): Option<string[]> {
		if (this.finished) return Option.none;

		const parameters: string[] = [];
		for (let i = from; i < this.length; ++i) {
			if (this.state.used.has(i)) continue;

			const parameter = this.results.ordered[i].value;
			if (predicate(parameter)) {
				this.state.used.add(i);
				parameters.push(parameter);
			}
		}

		return Option.some(parameters);
	}

	/**
	 * Select unused positional arguments, consuming only matches. Callbacks are awaited one at a time.
	 * @param predicate - Test for whether to consume a value.
	 * @param from - Starting position; defaults to the current cursor.
	 * @returns A promise for Some with collected values, including an empty list if nothing matched. Returns None only when
	 * already finished. Callback errors propagate.
	 */
	public async filterAsync(
		predicate: (value: string) => Promise<boolean>,
		from = this.state.position,
	): Promise<Option<string[]>> {
		if (this.finished) return Option.none;

		const parameters: string[] = [];
		for (let i = from; i < this.length; ++i) {
			if (this.state.used.has(i)) continue;

			const parameter = this.results.ordered[i].value;
			if (await predicate(parameter)) {
				this.state.used.add(i);
				parameters.push(parameter);
			}
		}

		return Option.some(parameters);
	}

	/**
	 * Map unused positional arguments, consuming only Some results.
	 * @param predicate - Mapper returning Some to accept or None to skip.
	 * @param from - Starting position; defaults to the current cursor.
	 * @returns Some with collected values, including an empty list if nothing matched. Returns None only when already
	 * finished. Callback errors propagate.
	 */
	public filterMap<T>(
		predicate: (value: string) => Option<T>,
		from = this.state.position,
	): Option<T[]> {
		if (this.finished) return Option.none;

		const parameters: T[] = [];
		for (let i = from; i < this.length; ++i) {
			if (this.state.used.has(i)) continue;

			const parameter = this.results.ordered[i].value;
			const result = predicate(parameter);
			result.inspect((value) => {
				this.state.used.add(i);
				parameters.push(value);
			});
		}

		return Option.some(parameters);
	}

	/**
	 * Map unused positional arguments, consuming only Some results. Callbacks are awaited one at a time.
	 * @param predicate - Mapper returning Some to accept or None to skip.
	 * @param from - Starting position; defaults to the current cursor.
	 * @returns A promise for Some with collected values, including an empty list if nothing matched. Returns None only when
	 * already finished. Callback errors propagate.
	 */
	public async filterMapAsync<T>(
		predicate: (value: string) => Promise<Option<T>>,
		from = this.state.position,
	): Promise<Option<T[]>> {
		if (this.finished) return Option.none;

		const parameters: T[] = [];
		for (let i = from; i < this.length; ++i) {
			if (this.state.used.has(i)) continue;

			const parameter = this.results.ordered[i].value;
			const result = await predicate(parameter);
			result.inspect((value) => {
				this.state.used.add(i);
				parameters.push(value);
			});
		}

		return Option.some(parameters);
	}

	/** Check whether any of the flags were given. */
	public flag(...keys: readonly string[]): boolean {
		return keys.some((key) => this.results.flags.has(key));
	}

	/** Get the last value of any option. When there are multiple names, the last value of the last found name is given. */
	public option(...keys: readonly string[]): Option<string> {
		return this.options(...keys).map((values) => values.at(-1)!);
	}

	/** Get all values from all options. */
	public options(...keys: readonly string[]): Option<readonly string[]> {
		const entries: string[] = [];
		for (const key of keys) {
			const values = this.results.options.get(key);
			if (values) entries.push(...values);
		}

		return entries.length ? Option.some(entries) : Option.none;
	}

	/** Copy the used-index set and cursor into a restorable state. */
	public save(): ArgumentStream.State {
		return {
			used: new Set(this.state.used),
			position: this.state.position,
		};
	}

	/**
	 * Adopt a saved state object without cloning it.
	 * @param state - State from save() or an equivalent valid state.
	 */
	public restore(state: ArgumentStream.State) {
		this.state = state;
	}

	/** Mark every positional argument unused and move the cursor to zero. */
	public reset() {
		this.restore({ used: new Set(), position: 0 });
	}
}

/** Types and helpers for {@link ArgumentStream}. */
export declare namespace ArgumentStream {
	/** Consumption state for positional arguments. */
	export interface State {
		/** Zero-based positions already consumed. */
		used: Set<number>;
		/** Cursor used to begin the next positional read. */
		position: number;
	}
}
