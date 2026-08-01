import {
  TRACEABILITY_DIAGNOSTIC_SCHEMA,
  TRACEABILITY_GRAPH_SCHEMA,
  TRACEABILITY_RECEIPT_SCHEMA,
  TRACEABILITY_UPDATE_SCHEMA,
  validateTraceabilityDiagnosticReport,
  validateTraceabilityGraphSnapshot,
  validateTraceabilityMergeReceipt,
  validateTraceabilityUpdate,
} from "./traceability-artifact-validator.mjs";

const CONTRACTS = Object.freeze([
  Object.freeze({
    schema: TRACEABILITY_GRAPH_SCHEMA,
    validate: validateTraceabilityGraphSnapshot,
  }),
  Object.freeze({
    schema: TRACEABILITY_UPDATE_SCHEMA,
    validate: validateTraceabilityUpdate,
  }),
  Object.freeze({
    schema: TRACEABILITY_RECEIPT_SCHEMA,
    validate: validateTraceabilityMergeReceipt,
  }),
  Object.freeze({
    schema: TRACEABILITY_DIAGNOSTIC_SCHEMA,
    validate: validateTraceabilityDiagnosticReport,
  }),
]);

export function traceabilityRuntimeArtifactContracts() {
  return [...CONTRACTS];
}
