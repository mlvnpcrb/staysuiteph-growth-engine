export type GroupSearch = {
  destination: string;
  accommodation: "Condo" | "Apartment" | "Hotel" | "Resort" | "Vacation rental";
  audience: "Guests" | "Hosts";
};
export type GroupAssessment = {
  mode: "rule_based";
  score: number;
  confidence: "low" | "medium";
  reasons: string[];
  unknowns: string[];
};
export type SavedGroup = {
  marketing_evidence?: MarketingEvidence | undefined;
  id: string;
  user_id: string;
  identity: string;
  url: string;
  title: string;
  destination: string;
  accommodation: string;
  audience: string;
  evidence: string;
  source: "manual";
  notes: string;
  review_status: "review_required" | "reviewed" | "not_suitable";
  rule_evidence: string;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingEvidence = {
  observed_at: string | null;
  source_url: string | null;
  posts_7d: number | null;
  sample_posts: number | null;
  sample_comments: number | null;
  enquiries_30d: number | null;
  bookings_30d: number | null;
  promotion_allowed: boolean | null;
};
