# Security policy

## Supported version

The current supported source release is DevRelay `0.1.x`. Pre-release branches
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
