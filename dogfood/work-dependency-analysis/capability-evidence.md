# WorkDependencyAnalysis capability evidence

Retrieved from primary project documentation on 2026-08-03. These sources support bounded capability selection; they do not grant an external tool workflow authority.

- OPA evaluates policy over structured input, supports versioned bundles, and can compile Rego entrypoints to WebAssembly for JavaScript-hosted evaluation: https://www.openpolicyagent.org/docs/ and https://www.openpolicyagent.org/docs/wasm
- Graphology-DAG provides cycle detection and topological traversal over directed graphs: https://graphology.github.io/standard-library/dag.html
- Spec Kit documents `/speckit.analyze` as cross-artifact consistency and coverage analysis after tasks and before implementation: https://github.com/github/spec-kit
- Task Master exposes structured task dependencies and dependency validation/fixing, making it suitable only as an optional proposal source: https://github.com/eyaltoledano/claude-task-master
- OpenSpec custom schemas define version-controlled artifacts and artifact dependencies, allowing a bounded dependency proposal artifact without invoking its full workflow: https://github.com/Fission-AI/OpenSpec/blob/main/docs/customization.md
