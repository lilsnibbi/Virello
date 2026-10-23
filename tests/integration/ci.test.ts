import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	assertCanaryToolchain,
	assertCompleteTests,
	requiredRedisUrl,
} from "../../scripts/ciSupport";

const workflow = Bun.YAML.parse(
	readFileSync(join(import.meta.dir, "../../.github/workflows/ci.yml"), "utf8"),
) as {
	on: Record<string, unknown>;
	permissions: Record<string, string>;
	jobs: Record<
		string,
		{
			if: string;
			needs?: string[];
			permissions?: Record<string, string>;
			"runs-on"?: string;
			uses?: string;
			outputs?: Record<string, string>;
			steps?: {
				run?: string;
				uses?: string;
				with?: Record<string, unknown>;
				env?: Record<string, string>;
				id?: string;
				"continue-on-error"?: boolean;
			}[];
		}
	>;
};
const release = workflow.jobs.release;
const validateSteps = workflow.jobs.validate.steps ?? [];

const publishWorkflow = Bun.YAML.parse(
	readFileSync(
		join(import.meta.dir, "../../.github/workflows/publish.yml"),
		"utf8",
	),
) as {
	on: Record<string, unknown>;
	jobs: Record<
		string,
		{
			permissions: Record<string, string>;
			steps: { run?: string; uses?: string }[];
		}
	>;
};

type SkipOptions = {
	event?: string;
	prAuthor?: string;
	commitAuthor?: string;
	actor?: string;
	headRef?: string;
	refName?: string;
};

function eventContext(options: SkipOptions) {
	return {
		actor: options.actor ?? "",
		event_name: options.event ?? "push",
		head_ref: options.headRef ?? "",
		ref_name: options.refName ?? "main",
		event: {
			head_commit: { author: { username: options.commitAuthor ?? "" } },
			pull_request: { user: { login: options.prAuthor ?? "" } },
		},
	};
}

function skipValidation(options: SkipOptions = {}): boolean {
	const step = workflow.jobs.required.steps?.find(
		(candidate) => candidate.id === "require_validation",
	);
	const expression = step?.env?.SKIP_VALIDATION;
	if (!expression) throw new Error("Validation skip expression is missing");
	const normalized = expression
		.trim()
		.replace(/^\$\{\{/, "")
		.replace(/\}\}$/, "")
		.trim();
	return Function(
		"github",
		"startsWith",
		`return (${normalized});`,
	)(eventContext(options), (value: string, prefix: string) =>
		value.startsWith(prefix),
	);
}

function shouldValidate(options: SkipOptions = {}): boolean {
	const expression = workflow.jobs.validate.if.trim().slice(3, -2).trim();
	return Function(
		"github",
		"startsWith",
		`return (${expression});`,
	)(eventContext(options), (value: string, prefix: string) =>
		value.startsWith(prefix),
	);
}

// Exercise the actual restricted boolean expression, not a second handwritten gate.
function eligible(options: Record<string, unknown> = {}): boolean {
	const {
		result = "success",
		required = "success",
		validated = "abc",
		sha = "abc",
		event = "push",
		refType = "branch",
		branch = "trunk",
		defaultBranch = "trunk",
		enabled = "true",
		validationSkipped = "false",
	} = options;
	const expression = release.if.trim().slice(3, -2).trim();
	return Function(
		"needs",
		"github",
		"vars",
		"always",
		`return (${expression});`,
	)(
		{
			validate: { result, outputs: { sha: validated } },
			required: {
				result: required,
				outputs: { validation_skipped: validationSkipped },
			},
		},
		{
			sha,
			event_name: event,
			ref_type: refType,
			ref_name: branch,
			event: { repository: { default_branch: defaultBranch } },
		},
		{ VIRELLO_RELEASES: enabled },
		() => true,
	);
}

describe("CI release boundary", () => {
	test("release depends on all validation with least privilege and immutable checkout", () => {
		expect(Object.keys(workflow.on).sort()).toEqual([
			"pull_request",
			"push",
			"workflow_dispatch",
		]);
		expect(workflow.permissions).toEqual({});
		expect(workflow.jobs.validate.permissions).toEqual({ contents: "read" });
		expect(workflow.jobs.required.needs).toEqual(["validate"]);
		expect(release.needs).toEqual(["validate", "required"]);
		expect(workflow.jobs.required.if).toBe("${{ always() }}");
		expect(validateSteps[0]?.with?.ref).toBe("${{ github.sha }}");
		expect(validateSteps[0]?.with?.["persist-credentials"]).toBe(false);
		expect(
			workflow.jobs.validate.steps?.some(
				(step) => step.run === "bun scripts/ci.ts",
			),
		).toBe(true);
		expect(
			release.steps?.some((step) => step.uses?.startsWith("actions/checkout@")),
		).toBe(false);
		for (const job of Object.values(workflow.jobs)) {
			if (job.uses) {
				expect(job.uses).toBe("./.github/workflows/publish.yml");
				continue;
			}
			expect(job["runs-on"]).toBe("ubuntu-24.04");
			for (const step of job.steps ?? []) {
				expect(step["continue-on-error"]).toBeUndefined();
				if (step.uses) expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
			}
		}
	});
	test("skips only bot-authored changes and release-please source branches", () => {
		for (const options of [
			{ event: "pull_request", prAuthor: "github-actions[bot]" },
			{ event: "push", commitAuthor: "github-actions[bot]" },
			{ event: "push", refName: "release-please--branches--main" },
			{
				event: "pull_request",
				prAuthor: "maintainer",
				headRef: "release-please--branches--main",
			},
		]) {
			expect(skipValidation(options)).toBe(true);
			expect(shouldValidate(options)).toBe(false);
		}
		for (const options of [
			{
				event: "pull_request",
				actor: "github-actions[bot]",
				prAuthor: "maintainer",
				headRef: "feature",
			},
			{
				event: "push",
				actor: "github-actions[bot]",
				commitAuthor: "maintainer",
				refName: "main",
			},
		]) {
			expect(skipValidation(options)).toBe(false);
			expect(shouldValidate(options)).toBe(true);
		}
	});
	test("publishes release-created versions and published tags", () => {
		expect((publishWorkflow.on.release as { types: string[] }).types).toEqual([
			"published",
		]);
		expect(release.outputs?.release_created).toBe(
			"${{ steps.release_please.outputs.release_created }}",
		);
		expect(workflow.jobs.publish.if).toBe(
			"${{ !cancelled() && needs.release.result == 'success' && needs.release.outputs.release_created == 'true' }}",
		);
		expect(workflow.jobs.publish.permissions).toEqual({
			contents: "read",
			"id-token": "write",
		});
		expect(
			publishWorkflow.jobs.publish.steps.some((step) =>
				step.run?.includes("bun scripts/release.ts publish"),
			),
		).toBe(true);
	});
	test("workflow validation invokes an existing checker", () => {
		expect(
			validateSteps.some((step) => step.run === "bash scripts/checkActions.sh"),
		).toBe(true);
		expect(
			existsSync(join(import.meta.dir, "../../scripts/checkActions.sh")),
		).toBe(true);
	});
	test("only eligible enabled default-branch pushes release", () => {
		expect(eligible()).toBe(true);
		expect(eligible({ branch: "main", defaultBranch: "main" })).toBe(true);
	});
	for (const result of ["failure", "cancelled", "skipped", ""]) {
		test(`validation ${result || "missing"} blocks release`, () =>
			expect(eligible({ result })).toBe(false));
		test(`required gate ${result || "missing"} blocks release`, () =>
			expect(eligible({ required: result })).toBe(false));
	}
	test("allows Release Please after an intentional validation skip", () => {
		expect(eligible({ result: "skipped", validationSkipped: "true" })).toBe(
			true,
		);
		expect(eligible({ result: "failure", validationSkipped: "true" })).toBe(
			false,
		);
		expect(eligible({ result: "skipped" })).toBe(false);
	});
	for (const options of [
		{ event: "pull_request" },
		{ event: "workflow_dispatch" },
		{ event: "workflow_run" },
		{ branch: "feature" },
		{ refType: "tag" },
		{ enabled: "false" },
		{ enabled: "" },
		{ validated: "older" },
		{ validated: "" },
	])
		test(`blocks ${JSON.stringify(options)}`, () =>
			expect(eligible(options)).toBe(false));
});

describe("complete validation prerequisites", () => {
	test("CI selects canary from the manifest and rejects stable toolchains", () => {
		const manifest = JSON.parse(
			readFileSync(join(import.meta.dir, "../../package.json"), "utf8"),
		);
		expect(manifest.packageManager).toBe("bun@canary");
		expect(validateSteps[1]?.with?.["bun-version-file"]).toBe("package.json");
		expect(() =>
			assertCanaryToolchain(manifest.packageManager, "1.4.4-canary.1+abc123"),
		).not.toThrow();
		expect(() =>
			assertCanaryToolchain(manifest.packageManager, "1.5.0-canary.2+def456"),
		).not.toThrow();
		expect(() =>
			assertCanaryToolchain(manifest.packageManager, "1.4.4+abc123"),
		).toThrow("Use Bun canary");
		expect(() =>
			assertCanaryToolchain("bun@1.4.4", "1.4.4-canary.1+abc123"),
		).toThrow("Set packageManager");
	});

	test("missing, external and non-Redis endpoints fail", () => {
		for (const url of [
			undefined,
			"",
			"redis://example.com:6379",
			"https://127.0.0.1",
		])
			expect(() => requiredRedisUrl(url)).toThrow();
		expect(requiredRedisUrl("redis://127.0.0.1:6379")).toBe(
			"redis://127.0.0.1:6379",
		);
	});
	test("passing report is accepted; skipped, failed, errored and absent reports fail", () => {
		assertCompleteTests(
			'<testsuites tests="1" failures="0" skipped="0"><testcase name="ok"/></testsuites>',
		);
		for (const xml of [
			"",
			"<testsuites/>",
			"<testsuites><testcase><skipped/></testcase></testsuites>",
			'<testsuites skipped="2"><testcase/></testsuites>',
			"<testsuites><testcase><failure/></testcase></testsuites>",
			'<testsuites errors="1"><testcase/></testsuites>',
		])
			expect(() => assertCompleteTests(xml)).toThrow();
	});
});
