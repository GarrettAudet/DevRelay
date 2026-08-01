import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalJsonDigest,
  sha256Digest,
} from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import {
  PROJECT_OVERVIEW_DOCUMENT,
  PROJECT_OVERVIEW_PROJECTION,
  PROJECT_OVERVIEW_RENDERER,
  deriveProjectOverview,
  diffProjectOverviewSections,
  renderProjectOverviewMarkdownBytes,
} from "../src/project-overview.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const fixtures = Object.fromEntries(
  await Promise.all(
    Object.entries({
      module: "examples/modules/requirements-gathering.module.json",
      openspecPlugin: "examples/plugins/openspec.plugin.json",
      specKitPlugin: "examples/plugins/github-spec-kit.plugin.json",
      openspecInvocation:
        "examples/invocations/requirements-openspec.invocation.json",
      specKitInvocation:
        "examples/invocations/requirements-spec-kit.invocation.json",
      changeInvocation:
        "examples/invocations/requirements-openspec-change-set.invocation.json",
      clarificationInvocation:
        "examples/invocations/requirements-spec-kit-clarification.invocation.json",
      resumeInvocation:
        "examples/invocations/requirements-clarification-resume-openspec.invocation.json",
      openspecResult: "examples/results/requirements-openspec.result.json",
      specKitResult: "examples/results/requirements-spec-kit.result.json",
      changeResult:
        "examples/results/requirements-openspec-change-set.result.json",
      clarificationResult:
        "examples/results/requirements-spec-kit-clarification.result.json",
      goal: "examples/artifacts/goal-001.json",
      projectContext: "examples/artifacts/project-context-001.json",
      repositorySnapshot: "examples/artifacts/repository-snapshot-001.json",
      draft: "examples/artifacts/requirements-draft-001.json",
      baseline: "examples/artifacts/requirements-baseline-001.json",
      changeSet: "examples/artifacts/requirements-change-set-001.json",
      request: "examples/artifacts/clarification-request-001.json",
      response: "examples/artifacts/clarification-response-001.json",
      continuation: "examples/artifacts/requirements-continuation-001.json",
      nativeBundle: "examples/artifacts/native-source-bundle-001.json",
    }).map(async ([name, path]) => [name, await readJson(path)]),
  ),
);

const nativeBytes = Object.freeze({
  openspec: await readFile(
    new URL("examples/native/openspec/proposal.md", root),
  ),
  "github-spec-kit": await readFile(
    new URL("examples/native/github-spec-kit/spec.md", root),
  ),
});

const types = Object.freeze({
  goal: [
    "https://devrelay.dev/artifacts/goal/v1",
    "application/vnd.devrelay.goal+json",
  ],
  projectContext: [
    "https://devrelay.dev/artifacts/project-context/v1",
    "application/vnd.devrelay.project-context+json",
  ],
  repositorySnapshot: [
    "https://devrelay.dev/artifacts/repository-snapshot/v1",
    "application/vnd.devrelay.repository-snapshot+json",
  ],
  baseline: [
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
  ],
  draft: [
    "https://devrelay.dev/artifacts/requirements-draft/v1",
    "application/vnd.devrelay.requirements-draft+json",
  ],
  changeSet: [
    "https://devrelay.dev/artifacts/requirements-change-set/v1",
    "application/vnd.devrelay.requirements-change-set+json",
  ],
  request: [
    "https://devrelay.dev/artifacts/clarification-request-set/v1",
    "application/vnd.devrelay.clarification-request-set+json",
  ],
  response: [
    "https://devrelay.dev/artifacts/clarification-response-set/v1",
    "application/vnd.devrelay.clarification-response-set+json",
  ],
  continuation: [
    "https://devrelay.dev/artifacts/requirements-gathering-continuation/v1",
    "application/vnd.devrelay.requirements-gathering-continuation+json",
  ],
  native: [
    "https://devrelay.dev/artifacts/native-source-bundle/v1",
    "application/vnd.devrelay.native-source-bundle+json",
  ],
  overviewDraft: [
    "https://devrelay.dev/artifacts/project-overview-draft/v1",
    "application/vnd.devrelay.project-overview-draft+json",
  ],
  overviewChange: [
    "https://devrelay.dev/artifacts/project-overview-change-set-draft/v1",
    "application/vnd.devrelay.project-overview-change-set-draft+json",
  ],
  overviewBaseline: [
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
  ],
});

function pointer(ref) {
  return { artifactId: ref.artifactId, digest: ref.digest };
}

function renderedOverviewDocument(store, overview, artifactId) {
  const bytes = renderProjectOverviewMarkdownBytes(overview);
  const artifact = store.addBytes(artifactId, bytes);
  return {
    path: PROJECT_OVERVIEW_DOCUMENT.path,
    schema: PROJECT_OVERVIEW_DOCUMENT.schema,
    mediaType: PROJECT_OVERVIEW_DOCUMENT.mediaType,
    artifact: pointer(artifact),
    renderer: { ...PROJECT_OVERVIEW_RENDERER },
  };
}

function addProjectOverviewDraft(store, requirementsRef, requirements, suffix) {
  const overview = deriveProjectOverview(requirements);
  const draft = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectOverviewDraft",
    draftId: `project-overview-draft-${suffix}`,
    requirementsDraft: pointer(requirementsRef),
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview,
    renderedDocument: renderedOverviewDocument(
      store,
      overview,
      `project-overview-md-${suffix}`,
    ),
  };
  return { draft, ref: store.add(draft.draftId, "overviewDraft", draft) };
}

function addProjectOverviewBaseline(
  store,
  requirementsRef,
  requirements,
  suffix,
) {
  const overview = deriveProjectOverview(requirements);
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectOverviewBaseline",
    baselineId: `project-overview-baseline-${suffix}`,
    version: "1.0.0",
    approvedOverviewCandidate: {
      artifactId: `project-overview-draft-${suffix}`,
      digest: `sha256:${"a".repeat(64)}`,
    },
    requirementsBaseline: pointer(requirementsRef),
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview,
    renderedDocument: renderedOverviewDocument(
      store,
      overview,
      `project-overview-baseline-md-${suffix}`,
    ),
    approvalEvidence: [
      {
        artifactId: `project-overview-approval-${suffix}`,
        digest: `sha256:${"b".repeat(64)}`,
      },
    ],
  };
  return {
    baseline,
    ref: store.add(baseline.baselineId, "overviewBaseline", baseline),
  };
}

function addProjectOverviewChange(
  store,
  requirementsChangeRef,
  replacement,
  overviewBaseline,
  suffix,
) {
  const overview = deriveProjectOverview(replacement);
  const changedSections = diffProjectOverviewSections(
    overviewBaseline.baseline.overview,
    overview,
  );
  const change = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectOverviewChangeSetDraft",
    changeSetId: `project-overview-change-${suffix}`,
    baseOverview: pointer(overviewBaseline.ref),
    requirementsChangeSet: pointer(requirementsChangeRef),
    changeDisposition: changedSections.length > 0 ? "changed" : "unchanged",
    changedSections,
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview,
    renderedDocument: renderedOverviewDocument(
      store,
      overview,
      `project-overview-change-md-${suffix}`,
    ),
  };
  return { change, ref: store.add(change.changeSetId, "overviewChange", change) };
}

function artifactStore() {
  const values = new Map();
  return {
    add(artifactId, type, value) {
      const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      values.set(artifactId, bytes);
      return {
        artifactId,
        schema: types[type][0],
        mediaType: types[type][1],
        digest: sha256Digest(bytes),
        uri: `artifact://requirements-release/${artifactId}`,
      };
    },
    addBytes(artifactId, bytes) {
      values.set(artifactId, Buffer.from(bytes));
      return {
        artifactId,
        digest: sha256Digest(bytes),
      };
    },
    artifacts: {
      async load(ref) {
        const bytes = values.get(ref.artifactId);
        if (!bytes) {
          throw new Error(`missing ${ref.artifactId}`);
        }
        return bytes;
      },
    },
  };
}

function checkpointStore() {
  const values = new Map();
  return {
    values,
    store: {
      async get(key) {
        return values.get(key);
      },
      async put(key, value) {
        values.set(key, value);
      },
    },
  };
}

function executable({ plugin, result, calls }) {
  return createModuleRegistry({
    modules: [fixtures.module],
    plugins: [
      {
        definition: plugin,
        adapter: {
          async invoke(invocation, adapterContext, producer) {
            calls.count += 1;
            return typeof result === "function"
              ? result(invocation, adapterContext, producer)
              : result;
          },
        },
      },
    ],
    artifactContracts: requirementsRuntimeArtifactContracts(),
  });
}

function baseInputs(
  goalRef,
  contextRef,
  repositoryRef,
  baselineRef,
  projectOverviewBaselineRef,
) {
  return [
    { role: "goal", artifact: pointer(goalRef) },
    { role: "project-context", artifact: pointer(contextRef) },
    ...(repositoryRef
      ? [{ role: "repository-snapshot", artifact: pointer(repositoryRef) }]
      : []),
    ...(baselineRef
      ? [{ role: "requirements-baseline", artifact: pointer(baselineRef) }]
      : []),
    ...(projectOverviewBaselineRef
      ? [
          {
            role: "project-overview-baseline",
            artifact: pointer(projectOverviewBaselineRef),
          },
        ]
      : []),
  ];
}

function bindSourceRefs(value, refs) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      bindSourceRefs(entry, refs);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value.sourceRefs)) {
    const byRole = new Map([
      ["goal", refs.goalRef],
      ["project-context", refs.contextRef],
      ["repository-snapshot", refs.repositoryRef],
      ["requirements-baseline", refs.baselineRef],
    ]);
    for (const sourceRef of value.sourceRefs) {
      const exact = byRole.get(sourceRef.role);
      if (exact) {
        sourceRef.artifact = pointer(exact);
      }
    }
  }
  for (const child of Object.values(value)) {
    bindSourceRefs(child, refs);
  }
}

function nativeBundle({
  store,
  plugin,
  config,
  canonicalOutputs,
  mutate,
}) {
  const bundle = structuredClone(fixtures.nativeBundle);
  bundle.plugin = {
    id: plugin.metadata.id,
    version: plugin.metadata.version,
  };
  bundle.tool = {
    name: config.toolName,
    version: config.toolVersion,
  };
  bundle.operation = config.nativeOperation;
  if (config.schema !== undefined) {
    bundle.schema = config.schema;
  } else {
    delete bundle.schema;
  }
  const sourceRef = store.addBytes(
    `${plugin.metadata.id}-native-source-bytes`,
    nativeBytes[plugin.metadata.id],
  );
  bundle.sources = [
    {
      role: plugin.metadata.id === "openspec" ? "proposal" : "feature-spec",
      path:
        plugin.metadata.id === "openspec"
          ? "openspec/changes/add-user-authentication/proposal.md"
          : "specs/add-user-authentication/spec.md",
      artifact: pointer(sourceRef),
    },
  ];
  bundle.canonicalOutputs = canonicalOutputs.map(pointer);
  mutate?.(bundle);
  return bundle;
}

function commonInputs(
  store,
  {
    repository = false,
    baseline = false,
    baselineValue = fixtures.baseline,
  } = {},
) {
  const goal = structuredClone(fixtures.goal);
  if (baseline) {
    goal.goalId = "goal-change-runtime";
  }
  const goalRef = store.add(goal.goalId, "goal", goal);
  const contextRef = store.add(
    "project-context-runtime",
    "projectContext",
    fixtures.projectContext,
  );
  const repositoryRef = repository
    ? store.add(
        "repository-snapshot-runtime",
        "repositorySnapshot",
        fixtures.repositorySnapshot,
      )
    : undefined;
  const baselineRef = baseline
    ? store.add(
        "requirements-baseline-runtime",
        "baseline",
        baselineValue,
      )
    : undefined;
  const projectOverviewBaseline = baseline
    ? addProjectOverviewBaseline(
        store,
        baselineRef,
        baselineValue.requirements,
        "runtime",
      )
    : undefined;
  return {
    goalRef,
    contextRef,
    repositoryRef,
    baselineRef,
    projectOverviewBaseline,
    projectOverviewBaselineRef: projectOverviewBaseline?.ref,
  };
}

function draftScenario({
  plugin = fixtures.openspecPlugin,
  invocationFixture = fixtures.openspecInvocation,
  resultFixture = fixtures.openspecResult,
  repository = false,
  mutateDraft,
  mutateNative,
} = {}) {
  const store = artifactStore();
  const refs = commonInputs(store, { repository });
  const draft = structuredClone(fixtures.draft);
  draft.baseInputs = baseInputs(
    refs.goalRef,
    refs.contextRef,
    refs.repositoryRef,
  );
  draft.goal = pointer(refs.goalRef);
  draft.projectContext = pointer(refs.contextRef);
  bindSourceRefs(draft, refs);
  mutateDraft?.(draft, refs);
  const draftRef = store.add(
    `${plugin.metadata.id}-requirements-draft`,
    "draft",
    draft,
  );
  const projectOverview = addProjectOverviewDraft(
    store,
    draftRef,
    draft.requirements,
    plugin.metadata.id,
  );
  const invocation = structuredClone(invocationFixture);
  invocation.inputs = {
    goal: [refs.goalRef],
    "project-context": [refs.contextRef],
    ...(refs.repositoryRef
      ? { "repository-snapshot": [refs.repositoryRef] }
      : {}),
  };
  const native = nativeBundle({
    store,
    plugin,
    config: invocation.config,
    canonicalOutputs: [draftRef, projectOverview.ref],
    mutate: mutateNative,
  });
  const nativeRef = store.add(
    `${plugin.metadata.id}-native-source`,
    "native",
    native,
  );
  const result = structuredClone(resultFixture);
  result.outputs = {
    "requirements-draft": [draftRef],
    "project-overview-draft": [projectOverview.ref],
    "native-source-bundle": [nativeRef],
  };
  result.evidence[0].artifact = structuredClone(nativeRef);
  const calls = { count: 0 };
  const checkpoints = checkpointStore();
  return {
    invocation,
    result,
    registry: executable({ plugin, result, calls }),
    calls,
    checkpoints,
    store,
  };
}

function changeScenario({
  mutateBaseline,
  mutateChange,
  mutateNative,
} = {}) {
  const store = artifactStore();
  const baseline = structuredClone(fixtures.baseline);
  mutateBaseline?.(baseline);
  const refs = commonInputs(store, {
    repository: true,
    baseline: true,
    baselineValue: baseline,
  });
  const changeSet = structuredClone(fixtures.changeSet);
  changeSet.baseInputs = baseInputs(
    refs.goalRef,
    refs.contextRef,
    refs.repositoryRef,
    refs.baselineRef,
    refs.projectOverviewBaselineRef,
  );
  changeSet.baseline = pointer(refs.baselineRef);
  changeSet.expectedRequirementsDigest = canonicalJsonDigest(
    baseline.requirements,
  );
  bindSourceRefs(changeSet, refs);
  changeSet.changedSections = Object.keys(changeSet.replacement)
    .filter(
      (section) =>
        canonicalJsonDigest(changeSet.replacement[section]) !==
        canonicalJsonDigest(baseline.requirements[section]),
    )
    .sort();
  mutateChange?.(changeSet, refs);
  const changeRef = store.add(
    "requirements-change-set-runtime",
    "changeSet",
    changeSet,
  );
  const projectOverview = addProjectOverviewChange(
    store,
    changeRef,
    changeSet.replacement,
    refs.projectOverviewBaseline,
    "runtime",
  );
  const invocation = structuredClone(fixtures.changeInvocation);
  invocation.inputs = {
    goal: [refs.goalRef],
    "project-context": [refs.contextRef],
    "repository-snapshot": [refs.repositoryRef],
    "requirements-baseline": [refs.baselineRef],
    "project-overview-baseline": [refs.projectOverviewBaselineRef],
  };
  const native = nativeBundle({
    store,
    plugin: fixtures.openspecPlugin,
    config: invocation.config,
    canonicalOutputs: [changeRef, projectOverview.ref],
    mutate: mutateNative,
  });
  const nativeRef = store.add("openspec-change-native", "native", native);
  const result = structuredClone(fixtures.changeResult);
  result.outputs = {
    "requirements-change-set": [changeRef],
    "project-overview-change-set-draft": [projectOverview.ref],
    "native-source-bundle": [nativeRef],
  };
  result.evidence[0].artifact = structuredClone(nativeRef);
  const calls = { count: 0 };
  const checkpoints = checkpointStore();
  return {
    invocation,
    result,
    registry: executable({
      plugin: fixtures.openspecPlugin,
      result,
      calls,
    }),
    calls,
    checkpoints,
    store,
  };
}

function clarificationScenario({ mutateRequest, mutateContinuation } = {}) {
  const store = artifactStore();
  const refs = commonInputs(store);
  const invocation = structuredClone(fixtures.clarificationInvocation);
  invocation.inputs = {
    goal: [refs.goalRef],
    "project-context": [refs.contextRef],
  };
  const issued = {};
  const result = (_invocation, _adapterContext, producer) => {
    const request = structuredClone(fixtures.request);
    request.baseInputs = baseInputs(refs.goalRef, refs.contextRef);
    mutateRequest?.(request);
    const requestRef = store.add(
      "clarification-request-runtime",
      "request",
      request,
    );
    const continuation = structuredClone(fixtures.continuation);
    continuation.baseInputs = baseInputs(refs.goalRef, refs.contextRef);
    continuation.clarificationRequest = pointer(requestRef);
    continuation.unresolvedQuestionIds = request.questions.map(({ id }) => id);
    bindSourceRefs(continuation, refs);
    continuation.sourceInvocation = {
      invocationId: producer.invocationId,
      invocationFingerprint: producer.invocationFingerprint,
      stepInvocationDigest: producer.stepInvocationDigest,
      plugin: structuredClone(producer.plugin),
    };
    mutateContinuation?.(continuation, producer);
    const continuationRef = store.add(
      "requirements-continuation-runtime",
      "continuation",
      continuation,
    );
    Object.assign(issued, {
      request,
      requestRef,
      continuation,
      continuationRef,
      refs,
    });
    const moduleResult = structuredClone(fixtures.clarificationResult);
    moduleResult.outputs = {
      "clarification-requests": [requestRef],
      continuation: [continuationRef],
    };
    return moduleResult;
  };
  const calls = { count: 0 };
  const checkpoints = checkpointStore();
  return {
    invocation,
    registry: executable({
      plugin: fixtures.specKitPlugin,
      result,
      calls,
    }),
    calls,
    checkpoints,
    store,
    issued,
  };
}

let resumeSequence = 0;

function resumeScenario({
  issuance,
  checkpoints = issuance.checkpoints,
  continuationRef = issuance.issued.continuationRef,
  mutateResponse,
  mutateDraft,
  mutateNative,
} = {}) {
  const { store, issued } = issuance;
  resumeSequence += 1;
  const suffix = String(resumeSequence).padStart(3, "0");
  const response = structuredClone(fixtures.response);
  response.request = pointer(issued.requestRef);
  response.responses = [
    {
      questionId: issued.request.questions[0].id,
      answer: [...issued.request.questions[0].options],
    },
  ];
  mutateResponse?.(response, issued.request);
  const responseRef = store.add(
    `clarification-response-runtime-${suffix}`,
    "response",
    response,
  );
  const draft = structuredClone(fixtures.draft);
  draft.baseInputs = baseInputs(issued.refs.goalRef, issued.refs.contextRef);
  draft.goal = pointer(issued.refs.goalRef);
  draft.projectContext = pointer(issued.refs.contextRef);
  bindSourceRefs(draft, issued.refs);
  mutateDraft?.(draft);
  const draftRef = store.add(
    `resumed-requirements-draft-${suffix}`,
    "draft",
    draft,
  );
  const projectOverview = addProjectOverviewDraft(
    store,
    draftRef,
    draft.requirements,
    `resumed-${suffix}`,
  );
  const invocation = structuredClone(fixtures.resumeInvocation);
  invocation.inputs = {
    goal: [issued.refs.goalRef],
    "project-context": [issued.refs.contextRef],
    "clarification-request": [issued.requestRef],
    continuation: [continuationRef],
    "clarification-responses": [responseRef],
  };
  const native = nativeBundle({
    store,
    plugin: fixtures.openspecPlugin,
    config: invocation.config,
    canonicalOutputs: [draftRef, projectOverview.ref],
    mutate: mutateNative,
  });
  const nativeRef = store.add(
    `resumed-openspec-native-${suffix}`,
    "native",
    native,
  );
  const result = structuredClone(fixtures.openspecResult);
  result.invocationId = invocation.invocationId;
  result.outputs = {
    "requirements-draft": [draftRef],
    "project-overview-draft": [projectOverview.ref],
    "native-source-bundle": [nativeRef],
  };
  result.evidence[0].artifact = structuredClone(nativeRef);
  const calls = { count: 0 };
  return {
    invocation,
    result,
    registry: executable({
      plugin: fixtures.openspecPlugin,
      result,
      calls,
    }),
    calls,
    checkpoints,
    store,
  };
}

async function execute(scenario) {
  return scenario.registry.execute(scenario.invocation, {
    artifacts: scenario.store.artifacts,
    checkpoints: scenario.checkpoints.store,
  });
}

async function rejectsLineage(scenario) {
  await assert.rejects(
    execute(scenario),
    (error) => ["DR2103", "DR2104"].includes(error.code),
  );
}

test("both requirements plug-ins execute one exact byte-backed draft contract", async () => {
  const openSpec = draftScenario();
  const specKit = draftScenario({
    plugin: fixtures.specKitPlugin,
    invocationFixture: fixtures.specKitInvocation,
    resultFixture: fixtures.specKitResult,
  });
  assert.equal((await execute(openSpec)).outcome, "drafted");
  assert.equal((await execute(specKit)).outcome, "drafted");
  assert.equal(openSpec.calls.count, 1);
  assert.equal(specKit.calls.count, 1);
});

test("draft baseInputs bind the exact goal, context, and optional repository", async () => {
  await rejectsLineage(
    draftScenario({
      mutateDraft(draft) {
        draft.baseInputs[0].artifact.artifactId = "unrelated-goal";
      },
    }),
  );
  await rejectsLineage(
    draftScenario({
      repository: true,
      mutateDraft(draft) {
        draft.baseInputs = draft.baseInputs.filter(
          ({ role }) => role !== "repository-snapshot",
        );
      },
    }),
  );
  await rejectsLineage(
    draftScenario({
      mutateDraft(draft) {
        draft.goal = {
          artifactId: "unrelated-goal",
          digest: `sha256:${"0".repeat(64)}`,
        };
      },
    }),
  );
  await rejectsLineage(
    draftScenario({
      mutateDraft(draft) {
        draft.requirements.userStories[0].sourceRefs[0].artifact = {
          artifactId: "fabricated-evidence",
          digest: `sha256:${"f".repeat(64)}`,
        };
      },
    }),
  );
});

test("requirements source references bind roles to exact runtime evidence", async () => {
  await rejectsLineage(
    draftScenario({
      mutateDraft(draft) {
        draft.requirements.userStories[0].sourceRefs[0].role =
          "project-context";
      },
    }),
  );

  const nativeSource = {
    artifactId: "openspec-native-source-bytes",
    digest: sha256Digest(nativeBytes.openspec),
  };
  const valid = draftScenario({
    mutateDraft(draft) {
      draft.requirements.userStories[0].sourceRefs = [
        { role: "proposal", artifact: structuredClone(nativeSource) },
      ];
    },
  });
  assert.equal((await execute(valid)).outcome, "drafted");

  await rejectsLineage(
    draftScenario({
      mutateDraft(draft) {
        draft.requirements.userStories[0].sourceRefs = [
          {
            role: "feature-spec",
            artifact: structuredClone(nativeSource),
          },
        ];
      },
    }),
  );
});

test("change sets bind all exact base inputs and non-stale baseline targets", async () => {
  assert.equal(
    (await execute(changeScenario())).outcome,
    "change_set_drafted",
  );
  await rejectsLineage(
    changeScenario({
      mutateChange(changeSet) {
        changeSet.baseInputs.find(
          ({ role }) => role === "repository-snapshot",
        ).artifact.artifactId = "unrelated-repository";
      },
    }),
  );
  await rejectsLineage(
    changeScenario({
      mutateChange(changeSet) {
        changeSet.baseline.artifactId = "unrelated-baseline";
      },
    }),
  );
  await rejectsLineage(
    changeScenario({
      mutateChange(changeSet) {
        changeSet.expectedRequirementsDigest = `sha256:${"0".repeat(64)}`;
      },
    }),
  );
  await rejectsLineage(
    changeScenario({
      mutateChange(changeSet) {
        changeSet.replacement.capabilities[0].id = "CAP-RENAMED";
      },
    }),
  );
  await rejectsLineage(
    changeScenario({
      mutateChange(changeSet) {
        changeSet.replacement = structuredClone(
          fixtures.baseline.requirements,
        );
        changeSet.changedSections = [];
      },
    }),
  );
  await rejectsLineage(
    changeScenario({
      mutateChange(changeSet) {
        changeSet.replacement.acceptanceCriteria.push(
          structuredClone(changeSet.replacement.acceptanceCriteria[0]),
        );
      },
    }),
  );
  await rejectsLineage(
    changeScenario({
      mutateChange(changeSet) {
        changeSet.replacement.dependencies.push(
          "A dependency change omitted from changedSections.",
        );
      },
    }),
  );
});

test("native provenance binds plug-in, tool, operation, bytes, and portable paths", async () => {
  await rejectsLineage(
    draftScenario({
      mutateNative(bundle) {
        bundle.tool.name = "Fabricated Tool";
      },
    }),
  );
  await rejectsLineage(
    draftScenario({
      mutateNative(bundle) {
        bundle.operation = "architecture.design";
      },
    }),
  );
  await rejectsLineage(
    draftScenario({
      mutateNative(bundle) {
        bundle.schema = "spec-driven";
      },
    }),
  );
  await rejectsLineage(
    draftScenario({
      mutateNative(bundle) {
        bundle.sources[0].artifact.digest = `sha256:${"0".repeat(64)}`;
      },
    }),
  );
  await rejectsLineage(
    draftScenario({
      mutateNative(bundle) {
        bundle.sources.push(structuredClone(bundle.sources[0]));
      },
    }),
  );
  await rejectsLineage(
    draftScenario({
      mutateNative(bundle) {
        bundle.sources[0].path = "openspec/../proposal.md";
      },
    }),
  );
  for (const invalidPath of [
    "openspec/changes/\u0000proposal.md",
    "openspec/CON/proposal.md",
    "openspec/proposal.md.",
    "openspec/proposal.md ",
  ]) {
    await rejectsLineage(
      draftScenario({
        mutateNative(bundle) {
          bundle.sources[0].path = invalidPath;
        },
      }),
    );
  }
});

test("clarification issuance binds sourceInvocation to the current checkpoint identity", async () => {
  const valid = clarificationScenario();
  assert.equal((await execute(valid)).outcome, "needs_clarification");
  assert.equal(valid.checkpoints.values.size, 1);

  await rejectsLineage(
    clarificationScenario({
      mutateContinuation(continuation) {
        continuation.sourceInvocation.stepInvocationDigest =
          `sha256:${"0".repeat(64)}`;
      },
    }),
  );
  await rejectsLineage(
    clarificationScenario({
      mutateContinuation(continuation) {
        continuation.clarificationRequest.artifactId = "unrelated-request";
      },
    }),
  );
  await rejectsLineage(
    clarificationScenario({
      mutateContinuation(continuation) {
        continuation.unresolvedQuestionIds = ["Q-DIFFERENT"];
      },
    }),
  );
  await rejectsLineage(
    clarificationScenario({
      mutateContinuation(continuation) {
        continuation.workingRequirements.userStories[0].sourceRefs[0].artifact = {
          artifactId: "fabricated-evidence",
          digest: `sha256:${"f".repeat(64)}`,
        };
      },
    }),
  );
});

test("cross-plug-in resume requires the exact terminal clarification checkpoint", async () => {
  const issuance = clarificationScenario();
  await execute(issuance);
  const resumed = resumeScenario({ issuance });
  assert.equal((await execute(resumed)).outcome, "drafted");
  assert.equal(resumed.calls.count, 1);

  const missingCheckpoint = resumeScenario({
    issuance,
    checkpoints: checkpointStore(),
  });
  await rejectsLineage(missingCheckpoint);
  assert.equal(missingCheckpoint.calls.count, 0);

  const tamperedContinuation = structuredClone(issuance.issued.continuation);
  tamperedContinuation.sourceInvocation.plugin.id = "openspec";
  const tamperedContinuationRef = issuance.store.add(
    "tampered-requirements-continuation",
    "continuation",
    tamperedContinuation,
  );
  const mismatch = resumeScenario({
    issuance,
    continuationRef: tamperedContinuationRef,
  });
  await rejectsLineage(mismatch);
  assert.equal(mismatch.calls.count, 0);

  const badCheckpointStore = checkpointStore();
  for (const [key, value] of issuance.checkpoints.values) {
    const changed = structuredClone(value);
    if (changed.moduleResult?.outcome === "needs_clarification") {
      changed.moduleResult.outputs["clarification-requests"][0].artifactId =
        "request-never-issued";
    }
    badCheckpointStore.values.set(key, changed);
  }
  const mismatchedCheckpoint = resumeScenario({
    issuance,
    checkpoints: badCheckpointStore,
  });
  await rejectsLineage(mismatchedCheckpoint);
  assert.equal(mismatchedCheckpoint.calls.count, 0);
});

test("resume rejects unrelated requests, unknown answers, and invalid choices", async () => {
  const issuance = clarificationScenario();
  await execute(issuance);
  await rejectsLineage(
    resumeScenario({
      issuance,
      mutateResponse(response) {
        response.request.artifactId = "request-never-issued";
      },
    }),
  );
  await rejectsLineage(
    resumeScenario({
      issuance,
      mutateResponse(response) {
        response.responses[0].questionId = "Q-UNKNOWN";
      },
    }),
  );
  await rejectsLineage(
    resumeScenario({
      issuance,
      mutateResponse(response) {
        response.responses[0].answer = ["Undeclared factor"];
      },
    }),
  );
});
