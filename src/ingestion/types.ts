import type {
  RoleFamily,
  OpportunityStatus,
  SourceType,
} from "@prisma/client";

/**
 * Raw shapes as authored in a dataset or returned by a future ATS adapter,
 * before normalization. Dates are ISO strings (`YYYY-MM-DD`) or null.
 */

export interface RawEmployer {
  name: string;
  sector?: string;
  hq?: string;
  website?: string;
  logoHint?: string;
}

export interface RawOpportunity {
  employer: string; // must match a RawEmployer.name
  title: string;
  roleFamily: RoleFamily;
  divisionDesk?: string;
  location: string;
  status: OpportunityStatus;
  opensAt?: string | null;
  deadlineAt?: string | null;
  firstSeen?: string;
  lastSeen?: string;
  summary: string; // original normalized summary — never copied verbatim
  eligibilityNotes?: string;
  sponsorshipInfo?: string;
  applicationUrl?: string;
  sourceUrl?: string;
  sourceType?: SourceType;
  tags?: string[];
}

export interface RawDataset {
  source: string;
  employers: RawEmployer[];
  opportunities: RawOpportunity[];
}

/**
 * Fully normalized opportunity ready to be upserted. Adds derived fields and a
 * parse-confidence score in [0,1].
 */
export interface NormalizedOpportunity {
  employer: string;
  title: string;
  programmeType: string;
  roleFamily: RoleFamily;
  divisionDesk: string | null;
  location: string;
  country: string;
  isUkBased: boolean;
  isSummerInternship: boolean;
  status: OpportunityStatus;
  opensAt: Date | null;
  deadlineAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  descriptionSummary: string;
  eligibilityNotes: string | null;
  sponsorshipInfo: string | null;
  applicationUrl: string | null;
  sourceUrl: string | null;
  sourceType: SourceType;
  tags: string[];
  confidence: number;
}

/** Common interface every future ingestion source (ATS adapter) implements. */
export interface SourceAdapter {
  /** Stable identifier, e.g. "greenhouse:goldman-sachs". */
  readonly id: string;
  /** Pull raw opportunities from the source. */
  fetch(): Promise<RawDataset>;
}
