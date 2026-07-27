// Mirrors SCHEMA.md. The cheese-facing types are declared now even though
// build/cheeses.json is still empty, so the reader layer drops in without a rewrite.

export interface Plant {
  datcp_id: string;
  address: string;
  city: string;
  county: string;
  operations: string[];
}

export interface Retail {
  store: boolean;
  mail_order: boolean;
  online: boolean;
}

export interface Editorial {
  summary: string | null;
  visit_notes: string | null;
  photo: string | null;
}

export interface Creamery {
  id: string;
  name: string;
  aka: string[];
  city: string;
  county: string | null;
  lat: number | null;
  lng: number | null;
  address: string;
  website: string | null;
  retail: Retail;
  plants: Plant[];
  dfw_company_id: number | null;
  founded: number | null;
  status: "active" | "closed";
  editorial: Editorial;
}

export interface SimilarRef {
  cheese_id: string;
  score: number;
}

export interface Cheese {
  id: string;
  name: string;
  creamery_id: string;
  family: string;
  milk: string[];
  texture: string;
  age_band: string;
  rind: string;
  flavor: string[];
  add_ins: string[];
  raw_milk: boolean | null;
  trademarked: boolean;
  wisconsin_original: boolean;
  description: string | null;
  description_generated: boolean;
  image: string | null;
  similar: SimilarRef[];
}

export interface Certification {
  type: string;
  year: number | null;
}

export interface Person {
  id: string;
  name: string;
  creamery_ids: string[];
  certifications: Certification[];
  active: boolean;
}

export interface AwardEntry {
  cheese_name: string;
  maker: string;
  company: string;
  city: string;
}

export interface Award {
  id: string;
  contest: "wccc" | "uscc";
  year: number;
  class_number: number;
  class_name: string;
  placement: number;
  finalist: boolean;
  champion: boolean;
  score: number | null;
  entry: AwardEntry;
  creamery_id: string | null;
  cheese_id: string | null;
}

export interface Highlight {
  cheese_id: string;
  type: "editorial" | "sponsored";
  label: string;
  sponsor: string | null;
  starts: string;
  ends: string;
}

export interface Dataset {
  creameries: Creamery[];
  cheeses: Cheese[];
  people: Person[];
  awards: Award[];
  highlights: Highlight[];
}
