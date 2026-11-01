import type { Json } from "./campaigns";
export type PostTemplateRow = {
  id: string;
  user_id: string;
  name: string;
  text: string;
  assets: Json;
  revision: number;
  state: "draft" | "ready" | "deleting";
  created_at: string;
  updated_at: string;
};
