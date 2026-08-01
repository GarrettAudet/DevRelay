# Require policy-driven multi-factor authentication

## Intent

Require every authentication factor selected by the applicable security policy before establishing a protected session.

## Requirements delta

- Modify authentication session capability to enforce policy-selected factors.
- Add a testable multi-factor acceptance criterion.
- Preserve nondisclosing authentication failures and the existing performance target.
