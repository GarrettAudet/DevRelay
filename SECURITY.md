# Security policy

## Supported version

The supported public preview line is DevRelay `0.10.0-rc.x`. The historical
`0.9.0` controlled-source candidate and older snapshots are not supported
security baselines.

## Reporting a vulnerability

Do not place exploit details, secrets, or sensitive repository content in a
public issue. Use the repository's
[private vulnerability reporting](https://github.com/GarrettAudet/DevRelay/security/advisories/new)
channel. If that channel is unavailable, contact the repository owner through
`garrett.audet@gmail.com` before sharing details.
Include:

- the affected version and commit;
- the relevant module, contract, or runtime boundary;
- reproduction steps and expected impact;
- whether credentials, external effects, or untrusted artifacts are involved;
- any suggested mitigation.

The project targets acknowledgement within three business days and an initial
triage update within seven business days. These are best-effort preview targets,
not service-level guarantees. Maintainers will coordinate remediation and
disclosure through the same private channel and credit reporters who request
credit.

## Security boundary

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
