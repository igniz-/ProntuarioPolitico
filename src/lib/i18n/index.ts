import { en } from "./en";
import { es } from "./es";
import type { Language, Translation } from "./types";

export type { Language, Translation } from "./types";

export const translations: Record<Language, Translation> = { en, es };

export function getTranslation(language: Language): Translation {
  return translations[language];
}
