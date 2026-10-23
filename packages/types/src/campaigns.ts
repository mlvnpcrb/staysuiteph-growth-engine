export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export type CampaignJobRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  actor_type: "personal" | "page";
  plan: Json;
  settings: Json;
  state:
    | "draft"
    | "ready"
    | "running"
    | "paused"
    | "blocked"
    | "completed"
    | "cancelled";
  revision: number;
  approved_digest: string | null;
  next_eligible_at: string;
  stop_reason: string | null;
  created_at: string;
  updated_at: string;
};
