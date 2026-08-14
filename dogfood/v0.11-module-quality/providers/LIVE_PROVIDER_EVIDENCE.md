# V0.11 live-provider evidence

Evidence digest: `sha256:e37069d418d845dfb0b3ee3076b3f2f80b140960606b668331fb1d090b9c3c4d`

| Provider | Operation | Maturity | Receipt |
| --- | --- | --- | --- |
| openspec | requirements.validate | live-conformant | `sha256:55fb7e7e7f047f920ec2390e9d6412f699f00edce21fdafc232f9fa62fc9894e` |
| spec-kit | requirements.validate | live-conformant | `sha256:e8ba5c0354cda3c51a8e76c74214a2389773366b08939ba76e7cf2e328edebdb` |
| structurizr | architecture.validate | live-conformant | `sha256:ab9e8764257d9a55c9da7a8028f61bd32d29629c9e3191808e0e1fb089ef4cd6` |
| structurizr | architecture.inspect | live-conformant | `sha256:262adccd4a705978614f5481d7b42a84196ab59a5d4f03c6022f4d141f7e6ebe` |
| structurizr | architecture.export | live-conformant | `sha256:ca8b47fa8ff642ad8a62452705bd056308bc2306515767c8e3cb875fa115c978` |
| madr | decision.validate | live-conformant | `sha256:fb31b96ebce069fff6245e3f8cb9c968e0613e9f530e904ad1356155dd78eaa8` |
| madr | decision.validate | live-conformant | `sha256:b9135f9fc7e7e8dc8d04979d00dd6f2dd827d4f51fe7e40e0d5e26bb9ae2b5f3` |
| madr | decision.validate | live-conformant | `sha256:eb9b02b7658e0f7f882ddd0b86ad26cfb635205f00b9d04ccbd490a5cd0398f0` |
| madr | decision.validate | live-conformant | `sha256:812c51602dc7e92c5d2755530583aa1c6c198b159db8d0844f2c3679b6d80b7a` |
| madr | decision.validate | live-conformant | `sha256:14eb1722b7372d2ec41ccd8b107bb36d2b749e99dbe1565cc9752bb456a4c07c` |
| madr | decision.validate | live-conformant | `sha256:a40580dda53dd67ecb136d8b4c94e5b2ff2e6a46ed654c795e62737b3d5e456a` |
| madr | decision.validate | live-conformant | `sha256:faf92163c81f6a425d7b9416665821e8d68d4892dfc24fc59f699e27f0884b1d` |
| madr | decision.validate | live-conformant | `sha256:92704ebb9246f9ce3d863e261b6abd5f7b40173f07d03ad79dd50c9e01d9e09e` |
| madr | decision.validate | live-conformant | `sha256:653df573e798f55194082974d3d3cdaec759c947b8ac97d8a1c34ecc456fc911` |
| madr | decision.validate | live-conformant | `sha256:eb43857a8277e1bcc21c028fddf851b77020aec5fcce1393a560e7522cb3658b` |

## Godot compatibility

Godot 4.7.1 + Godot AI 3.1.5 + GdUnit4 6.2.0: **supported-with-wrapper-bypass** on Windows.

The exact GdUnit4 runner passed 2/2 tests with JUnit evidence. The upstream Windows wrapper port-0 incompatibility is preserved in the JSON evidence and was bypassed only by invoking its underlying pinned runner directly.

## Boundaries

- OpenSpec and Spec Kit gathering remain bounded host-mediated strategy operations; the live evidence here attests their real validation/bootstrap surfaces, not lifecycle authority.
- Structurizr legacy cumulative-model connectivity and view coverage remain visible as warnings; inspection has zero errors.
- MADR is a template repository rather than an upstream CLI; DevRelay executes an exact-template-pinned deterministic validator.
- Godot compatibility is claimed only for the exact Windows fixture combination shown above.
