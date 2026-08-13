# WorkDependencyAnalysis OPA policy provenance

`dependency.rego` is the human-reviewable source for `policy.wasm`. The WASM
is checked in because WorkDependencyAnalysis evaluates a version-pinned policy
offline and the installable package must not download or compile code at
runtime.

The exact compiler is the official Open Policy Agent Windows AMD64 release:

```text
OPA version: 1.16.2
Asset: opa_windows_amd64.exe
Asset SHA-256: f1a66f971611732de5078aafacc0cbb043a9c3b02e5daa78f6924c46083f9124
Source: https://github.com/open-policy-agent/opa/releases/tag/v1.16.2
```

From the repository root on Windows, reproduce the checked-in bytes with the
exact backslash source locator (OPA embeds that locator in two data bytes):

```powershell
opa_windows_amd64.exe build --target wasm `
  --entrypoint devrelay/work_dependency/decision `
  --output policy-bundle.tar.gz `
  'policies\work-dependency-analysis\dependency.rego'
tar -xzf policy-bundle.tar.gz
```

Expected `policy.wasm` SHA-256:

```text
d15e94c5062e97bc736b8b5481cf6aca13351795fa262e2919eb6cc6fded7734
```

Two independent OPA 1.16.2 builds using this command were byte-identical. A
forward-slash source locator changes only the two embedded path-separator bytes
and therefore has a different digest; it is not the canonical build invocation.
