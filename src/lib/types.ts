export type ResearchStatus = "verified" | "reported" | "disputed" | "dismissed" | "unknown";

export type ResearchItem = {
  title: string;
  summary: string;
  status: ResearchStatus;
  date?: string;
  source?: string;
  sourceUrl?: string;
  permanent?: boolean;
};

export type PublicOffice = {
  title: string;
  startDate: string;
  endDate?: string;
  status: ResearchStatus;
  source?: string;
  sourceUrl?: string;
  permanent?: boolean;
};

export type PoliticalSpectrum = {
  x: number;
  y: number;
};

export type PoliticianProfile = {
  slug: string;
  name: string;
  imageUrl?: string;
  country: string;
  party: string;
  position: string;
  tenure: string;
  salary: string;
  lastUpdated: string;
  confidence: "high" | "medium" | "low";
  spectrum?: PoliticalSpectrum;
  summary: string;
  offices?: PublicOffice[];
  laws: ResearchItem[];
  allegations: ResearchItem[];
  highlights: ResearchItem[];
};

export type PopularRecord = {
  name: string;
  imageUrl?: string;
  country?: string;
  searches: number;
};

export type PoliticianRegistryRecord = {
  id: string;
  name: string;
  aliases?: string[];
  imageUrl?: string;
  country: string;
  region: string;
  currentPosition?: string;
  sourceUrl: string;
  lastVerifiedAt: string;
};

export type RegistrySource = {
  id: string;
  kind: "wikidata-position-list" | "official-json-record-list" | "official-csv-record-list";
  endpoint: string;
  country: string;
  region: string;
  limit: number;
  currentPosition: string;
  query?: string;
  encoding?: "utf-8" | "windows-1252";
  enabled: boolean;
};
