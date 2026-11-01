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
      "Recurring schedules and saved campaigns. Multi-step flows remain incomplete.",
  },
  {
    slug: "lead-radar",
    label: "Lead Radar",
    category: "primary",
    availability: "partial",
    description:
      "Saved targeting settings and lead inbox. Scanning and automatic replies are unavailable.",
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
      radar_settings: {
        Row: {
          user_id: string;
          scope: string;
          revision: number;
          group_ids: string[];
          keyword_rules: Json;
          scan_interval: number;
          in_page_notifications: boolean;
          desktop_notifications: boolean;
          reply_preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      radar_leads: {
        Row: {
          id: string;
          user_id: string;
          scope: string;
          group_id: string | null;
          group_identity: string;
          group_name: string;
          post_id: string;
          url: string;
          author: string;
          text: string;
          matched_keywords: Json;
          stage: string;
          is_read: boolean;
          is_starred: boolean;
          note: string;
          revision: number;
          discovered_at: string;
          post_created_at: string | null;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      campaign_schedules: {
        Row: {
          id: string;
          user_id: string;
          campaign_id: string;
          cadence: Json;
          state: string;
          revision: number;
          approved_digest: string | null;
          next_run_at: string | null;
          current_run_id: string | null;
          stop_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      campaign_schedule_runs: {
        Row: {
          id: string;
          user_id: string;
          schedule_id: string | null;
          campaign_id: string | null;
          scheduled_at: string;
          started_at: string | null;
          finished_at: string | null;
          state: string;
          outcomes: Json;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
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
      radar_command: {
        Args: {
          p_scope: string;
          p_revision: number;
          p_operation: string;
          p_payload: Json;
        };
        Returns: Json;
      };
      library_snapshot: { Args: Record<string, never>; Returns: Json };
      library_command: {
        Args: {
          p_id: string;
          p_revision: number;
          p_operation: string;
          p_payload: Json;
        };
        Returns: Json;
      };
      schedule_command: {
        Args: {
          p_id: string;
          p_revision: number;
          p_operation: string;
          p_payload: Json;
        };
        Returns: Json;
      };
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
