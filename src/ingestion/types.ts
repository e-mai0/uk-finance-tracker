import type {
  RoleFamily,
  OpportunityStatus,
  SourceType,
} from "@prisma/client";
import type { ProgrammeType } from "@/lib/constants";

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
  /** Classified programme season (from classifyPosting). Absent on seed/manual
   *  data → normalize defaults to SUMMER_INTERNSHIP. */
  programmeType?: ProgrammeType;
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
  /** Legacy free-text programme label (e.g. "Summer Internship"), derived from
   *  programmeTypeEnum via PROGRAMME_TYPE_LABELS. Retained until a later cycle. */
  programmeType: string;
  /** Classified programme season (persisted to Opportunity.programmeTypeEnum). */
  programmeTypeEnum: ProgrammeType;
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
  deadlineEstimated: boolean;
  isRolling: boolean;
}

/** Common interface every future ingestion source (ATS adapter) implements. */
export interface SourceAdapter {
  /** Stable identifier, e.g. "greenhouse:goldman-sachs". */
  readonly id: string;
  /** Pull raw opportunities from the source. */
  fetch(): Promise<RawDataset>;
}

/** Per-ATS config carried on an IngestionSource.config (Json) row, decoded by
 *  adapterFor and handed to the matching adapter. */
export type SourceConfig =
  | { ats: "workday"; host: string; tenant: string; site: string }
  | { ats: "oracle"; host: string; site: string }
  | { ats: "eightfold"; host: string; domain: string; endpoint: "apply" | "pcsx" }
  | { ats: "avature"; variant: "ubs" | "macquarie"; base: string; siteid?: string }
  | { ats: "radancy"; base: string }
  | { ats: "talnet"; host: string; board: number }
  | { ats: "smartrecruiters"; company: string }
  | { ats: "successfactors"; host: string };
