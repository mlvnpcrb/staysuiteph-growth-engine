import type { MarketingEvidence, SavedGroup } from "./groups";
export const navigation = [
  {
    slug: "overview",
    label: "Overview",
    description: "Your workspace at a glance.",
  },
  {
    slug: "group-finder",
    label: "Group Finder",
    description: "Find the right communities for your next stay.",
  },
  {
    slug: "my-groups",
    label: "My Groups",
    description: "Keep your communities and their rules in one place.",
  },
  {
    slug: "ai-post-studio",
    label: "AI Post Studio",
    description: "Turn a property story into a thoughtful draft.",
  },
  {
    slug: "campaigns",
    label: "Campaigns",
    description: "Plan meaningful outreach, one group at a time.",
  },
  {
    slug: "posting-queue",
    label: "Posting Queue",
    description: "Review your next steps before you publish.",
  },
  {
    slug: "lead-radar",
    label: "Lead Radar",
    description: "A future home for guest enquiries you choose to save.",
  },
  {
    slug: "analytics",
    label: "Analytics",
    description: "Understand your activity when real data is connected.",
  },
  {
    slug: "account-safety",
    label: "Account Safety",
    description: "Stay informed and keep every action in your control.",
  },
  {
    slug: "settings",
    label: "Settings",
    description: "Your workspace, preferences, and connection status.",
  },
] as const;
export type Section = (typeof navigation)[number]["slug"];
export type SyncSnapshot = {
  userId: string;
  serverTime: string;
  integration: "not_connected";
};
export type Database = {
  public: {
    Tables: {
      saved_groups: {
        Row: SavedGroup;
        Insert: Pick<
          SavedGroup,
          | "user_id"
          | "identity"
          | "url"
          | "title"
          | "destination"
          | "accommodation"
          | "audience"
          | "evidence"
        >;
        Update: Partial<
          Pick<
            SavedGroup,
            "notes" | "review_status" | "rule_evidence" | "last_reviewed_at"
          >
        > & {
          marketing_evidence?: MarketingEvidence | undefined;
          destination?: string | undefined;
          accommodation?: string | undefined;
          audience?: string | undefined;
        };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; display_name: string; created_at: string };
        Insert: { id: string; display_name?: string; created_at?: string };
        Update: { display_name?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
export type {
  SavedGroup,
  GroupSearch,
  GroupAssessment,
  MarketingEvidence,
} from "./groups";
