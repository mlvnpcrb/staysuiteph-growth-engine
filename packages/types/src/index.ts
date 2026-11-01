import type { PostTemplateRow } from "./templates";
import type { CampaignJobRow, Json } from "./campaigns";
import type { MarketingEvidence, SavedGroup } from "./groups";
export const navigation = [
  {
    slug: "compose",
    label: "Compose",
    category: "primary",
    availability: "available",
    description: "Write a post and select its groups.",
  },
  {
    slug: "templates",
    label: "Templates",
    category: "primary",
    availability: "partial",
    description: "Save, edit and reuse post text and private media.",
  },
  {
    slug: "automations",
    label: "Automations",
    category: "primary",
    availability: "partial",
    description:
      "Saved campaigns. Recurring schedules and multi-step flows are not implemented yet.",
  },
  {
    slug: "lead-radar",
    label: "Lead Radar",
    category: "primary",
    availability: "planned",
    description:
      "Keyword monitoring, lead review, and replies. Not implemented yet.",
  },
  {
    slug: "activity",
    label: "Activity",
    category: "primary",
    availability: "partial",
    description:
      "Campaign queue and recorded outcomes. Calendar and full History parity are incomplete.",
  },
  {
    slug: "my-groups",
    label: "All groups",
    category: "tools",
    availability: "available",
    description: "Your Facebook group library.",
  },
  {
    slug: "group-finder",
    label: "AI Group Finder",
    category: "tools",
    availability: "planned",
    description:
      "The reference discovery and AI ranking workflow is not implemented yet.",
  },
  {
    slug: "ai-post-studio",
    label: "AI Studio",
    category: "tools",
    availability: "planned",
    description: "AI writing and business context are not connected yet.",
  },
  {
    slug: "account-safety",
    label: "Safety",
    category: "support",
    availability: "available",
    description: "Posting requirements and validation status.",
  },
  {
    slug: "settings",
    label: "Settings",
    category: "support",
    availability: "partial",
    description:
      "Appearance and extension connection. Full reference settings are incomplete.",
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
      post_templates: {
        Row: PostTemplateRow;
        Insert: Pick<
          PostTemplateRow,
          "id" | "user_id" | "name" | "text" | "assets"
        > &
          Partial<Pick<PostTemplateRow, "state">>;
        Update: Partial<
          Pick<
            PostTemplateRow,
            "name" | "text" | "assets" | "revision" | "state"
          >
        >;
        Relationships: [];
      };
      campaign_publishers: {
        Row: {
          method: "classic" | "direct";
          enabled: boolean;
          verified_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      campaign_jobs: {
        Row: CampaignJobRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
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
    Functions: {
      campaign_direct_publisher_ready: {
        Args: { p_actor_id: string };
        Returns: boolean;
      };
      campaign_publisher_ready: {
        Args: { p_actor_id: string };
        Returns: boolean;
      };
      campaign_delete: {
        Args: { p_id: string; p_revision: number; p_finish: boolean };
        Returns: Json;
      };
      campaign_command: {
        Args: {
          p_id: string;
          p_revision: number;
          p_command: string;
          p_payload: Json;
        };
        Returns: Json;
      };
    };
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

export type { CampaignJobRow, Json } from "./campaigns";

export type { PostTemplateRow } from "./templates";
