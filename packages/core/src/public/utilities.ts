/**
 * Shared async, binary, collection, parsing, filesystem, HTTP, and result helpers.
 * @packageDocumentation
 */
import "@virello/util/bun";

export * from "@virello/util/async";
export * from "@virello/util/async";
/** Binary buffers, codecs, schemas, and serialization helpers. */
export * as Binary from "@virello/util/binary";
export * from "@virello/util/collections";
export * from "../utilities/decorators/index";
export * from "@virello/util/filesystem";
export * from "@virello/util/http";
export type { Awaitable } from "@virello/util/general";
/** General helpers and their supporting types. */
export * as Utils from "@virello/util/general";
/** Lazy iterable transforms and consuming iterator helpers. */
export * as Iterators from "@virello/util/iterators";
/** Tokenize text and consume positional arguments, flags, and options. */
export * as Parsing from "@virello/util/parsing";
export * from "@virello/util/result";
