# Scanner dispositions

Baseline: protected `main` commit
`37e968516623c3d135f8829b0e56e19a7ba59722`, 43 open alerts.

## CodeQL — fix required

All 37 CodeQL alerts are actionable and block release acceptance:

| Rule                                       | Count | Resolution                                                                                                                  |
| ------------------------------------------ | ----: | --------------------------------------------------------------------------------------------------------------------------- |
| `js/file-system-race`                      |    23 | Replace path-level check/use sequences with exclusive creation, descriptor-bound reads, and exact-byte replay verification. |
| `js/identity-replacement`                  |     9 | Normalize CRLF/CR to LF rather than replacing LF with itself.                                                               |
| `js/incomplete-sanitization`               |     2 | Escape existing backslashes before Markdown delimiters and add an adversarial table regression.                             |
| `js/file-access-to-http`                   |     1 | Resolve downloads only from exact code-owned URL/version/digest tuples.                                                     |
| `js/incomplete-url-substring-sanitization` |     1 | Parse JSON Schema bytes and compare `$schema` exactly.                                                                      |
| `js/regex/missing-regexp-anchor`           |     1 | Compare the exact Apache license URL line.                                                                                  |

Release condition: the post-change CodeQL analysis for the exact candidate must
show zero open actionable CodeQL alerts.

## OpenSSF Scorecard — evidence-backed dispositions

| Alert                | Disposition                                   | Evidence / owner / expiry                                                                                                                                                                                                                                                                                    |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TokenPermissionsID` | Fix in this increment                         | `.github/workflows/release.yml` is read-only by default; attestation writes stay in the build job and tag-only `contents: write` is isolated in a dependent prerelease job. Owner: release maintainer. Close on post-merge Scorecard rerun.                                                                  |
| `BinaryArtifactsID`  | Accepted, bounded build artifact              | `policy.wasm` is the offline OPA policy runtime artifact. Human-reviewable source, official compiler asset digest, exact Windows build command, and expected byte digest are recorded in `policies/work-dependency-analysis/README.md`. Owner: WorkDependencyAnalysis maintainer. Revisit before stable 1.0. |
| `CodeReviewID`       | Accepted temporary sole-maintainer constraint | Protected main requires pull requests and checks, but a second human maintainer is not yet available. Machine review does not masquerade as human approval. Owner: Garrett Audet. Review when a second maintainer is onboarded or before stable 1.0.                                                         |
| `MaintainedID`       | Time-bound not-actionable                     | GitHub reports the repository is younger than 90 days, so Scorecard cannot infer maintenance. Protected CI and current release work are direct maintenance evidence. Owner: Garrett Audet. Expires automatically after the 90-day assessment window.                                                         |
| `FuzzingID`          | Deferred hardening                            | Deterministic unit, mutation, replay, failure-boundary, installed-package, Windows/Linux, and CodeQL gates exist; a supported JavaScript fuzz integration is not yet present. Owner: security maintainer. Required before stable 1.0, not for this source-preview boundary.                                  |
| `CIIBestPracticesID` | Administrative follow-up                      | No OpenSSF Best Practices badge is claimed. Owner: repository maintainer. Evaluate before stable 1.0; it does not invalidate current executable evidence.                                                                                                                                                    |

No Scorecard alert is dismissed as a false positive merely to make the count
green. Code-affecting signals are fixed; structural governance limits remain
visible with bounded owners and review points.
