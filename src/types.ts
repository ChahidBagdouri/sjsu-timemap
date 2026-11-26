export type Meeting = {
  days: number[];
  startMinute: number | null;
  endMinute: number | null;
  startDate: string;
  endDate: string;
  location: string;
  kind: "scheduled" | "asynchronous" | "unknown";
};
export type Section = {
  id: string;
  classNumber: string;
  course: string;
  subject: string;
  section: string;
  title: string;
  modality: string;
  component: string;
  instructor: string;
  notes: string;
  requirements: string;
  status: string;
  college: string | null;
  department: string | null;
  courseLevel: string | null;
  enrollment: number | null;
  capacity: number | null;
  waitlist: number | null;
  combinedGroup: string | null;
  combinedFlag: boolean;
  weightingEligible: boolean;
  enrollmentObservedAt: string | null;
  meetings: Meeting[];
};
export type Term = {
  id: string;
  label: string;
  timeZone: string;
  startDate: string;
  endDate: string;
};
export type Dataset = {
  schemaVersion: number;
  generatedAt: string;
  term: Term;
  sources: {
    name: string;
    url: string;
    observedAt: string;
    sourceDataDate: string | null;
  }[];
  quality: {
    sections: number;
    timedSections: number;
    joinCoverage: number;
    enrollmentMatches: number;
    weightableSections: number;
    combinedSectionsExcludedFromWeights: number;
    parseIssues: unknown[];
  };
  warnings: string[];
  sections: Section[];
};
export type Manifest = {
  schemaVersion: number;
  generatedAt: string;
  terms: (Term & {
    file: string;
    sha256: string;
    sections: number;
    enrollmentCoverage: number;
  })[];
};
export type Metric = "sections" | "enrollment" | "capacity";
export type Place = "all" | "campus" | "online";
