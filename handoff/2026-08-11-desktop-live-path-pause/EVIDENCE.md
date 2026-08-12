# Evidence index

| Evidence | Result | Qualification |
| --- | --- | --- |
| Commit `3aed552b718f54e9f30637d2e266a13220f289d5` | Integrated | Production MCP bootstrap and fail-closed missing binding. |
| MCP focused verification | 26/26 pass | Independently rerun in the integration checkout. |
| Commit `458ff419325bc621a4202d5cf6f1a5993adbf96b` | Integrated | Installed topology, real command, live health probe. |
| Complete affected Desktop suites | 58/58 pass | Includes Windows PowerShell 5.1 and paths with spaces. |
| `npm.cmd run verify` after corrective work | Not terminal | Emitted no failure before safe interruption; not counted as pass. |
| Plugin-creator validator | Not run | Available Python runtimes lack PyYAML. |
| `release-gate-evidence.attempt-003.json` | Historical pass | Predates the installed live-path corrections. |
| Tiny clean-installed software dogfood | Missing | Required before release readiness. |

Visible Desktop tasks:

- MCP bootstrap corrective task:
  `019ff3ee-7c5f-72e3-8fe8-3656ca671680`
- Plugin/install corrective task:
  `019ff3f6-da1d-7e22-86d2-b709df57864c`
- Stale checkout task that correctly stopped and must not be integrated:
  `019ff3ea-29b0-7250-af8d-4016bace9ac5`

