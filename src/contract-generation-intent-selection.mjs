export function selectRequiredContractGenerationIntents(architecture) {
  const interfaces = architecture?.sections?.interfaceIntent?.content?.interfaces;
  if (!Array.isArray(interfaces)) throw new TypeError("architecture omits interface intents");
  return interfaces.filter((entry) => entry?.contractGeneration?.required === true);
}
