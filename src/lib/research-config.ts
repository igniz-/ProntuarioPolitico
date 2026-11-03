export const researchConfig = {
  validation: {
    minimumTextLength: 1,
    nameMaxLength: 300,
    countryMaxLength: 200,
    partyMaxLength: 300,
    positionMaxLength: 500,
    tenureMaxLength: 500,
    salaryMaxLength: 200,
    summaryMaxLength: 5000,
    itemTitleMaxLength: 300,
    itemSummaryMaxLength: 4000,
    itemDateMaxLength: 100,
    itemSourceMaxLength: 300,
    collectionMaxItems: 100,
    spectrumMin: -100,
    spectrumMax: 100,
  },
  confidence: {
    fractionScaleMax: 1,
    percentageScale: 100,
    highMinimum: 80,
    mediumMinimum: 50,
  },
  portrait: {
    revalidateSeconds: 86_400,
  },
  model: {
    azureApiVersion: "2024-10-21",
    foundryMaxCompletionTokens: 6_000,
    temperature: 0.1,
  },
} as const;
