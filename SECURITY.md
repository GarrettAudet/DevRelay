# Security policy

## Supported version

The current supported source release is DevRelay `0.3.x`. Pre-release branches
and older snapshots are not supported security baselines.

## Reporting a vulnerability

Do not place exploit details, secrets, or sensitive repository content in a
public issue. If this repository is hosted on a service with private security
advisories, use that channel. Otherwise, contact the maintainers through an
authorized private channel and include:

- the affected version and commit;
- the relevant module, contract, or runtime boundary;
- reproduction steps and expected impact;
- whether credentials, external effects, or untrusted artifacts are involved;
- any suggested mitigation.

The maintainers will acknowledge the report through the same private channel
and coordinate remediation and disclosure. No response-time guarantee is made
for this source preview.

DevRelay contract validation is not a host sandbox. A host remains responsible
for capability enforcement, process isolation, secret handling, network
policy, artifact storage, and upstream-tool security.

WorkBreakdown adapters are untrusted planners. They may emit only validated
domain candidates and cannot approve coverage, mutate TraceabilityGraph, or
claim implementation or verification. Hosts must authenticate approval
evidence and enforce configured adapter capabilities; manifest declarations
are demands, not a sandbox.

Core rejects pure plug-ins for effect-required WorkBreakdown operations and
rejects adapter-authored guard outcomes. Attached architecture models,
approved-change graph nodes, and revision candidate/evidence references are
resolved against exact content-addressed artifacts before adapter entry.

WorkBreakdown promotion accepts only the unforgeable in-process replay receipt
returned by Core after checkpoint revalidation and a baseline bound to exact
raw bytes. A plain or cloned `ModuleResult`, candidate, receipt, or baseline
object is not promotion authority. Cross-process hosts must define a separate
authenticated receipt format before moving that trust boundary.
