import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@staysuite/types";
import { postTemplateSchema, type TemplateAsset } from "@staysuite/validation";
export class TemplateConflictError extends Error {
  constructor() {
    super("Template changed. Reload before saving.");
  }
}
export function templateRepository(
  client: SupabaseClient<Database>,
  userId: string,
) {
  return {
    async list() {
      const result = await client
        .from("post_templates")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (result.error) throw result.error;
      return result.data.map((row) => postTemplateSchema.parse(row));
    },
    async find(id: string) {
      const result = await client
        .from("post_templates")
        .select("*")
        .eq("user_id", userId)
        .eq("id", id)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data ? postTemplateSchema.parse(result.data) : null;
    },
    async create(
      id: string,
      name: string,
      text: string,
      assets: TemplateAsset[],
    ) {
      const result = await client
        .from("post_templates")
        .insert({
          id,
          user_id: userId,
          name,
          text,
          assets: assets.map((asset) => ({ ...asset })),
          state: assets.length ? "draft" : "ready",
        })
        .select("*")
        .single();
      if (result.error) throw result.error;
      return postTemplateSchema.parse(result.data);
    },
    async save(
      id: string,
      revision: number,
      input: {
        name: string;
        text: string;
        assets: TemplateAsset[];
        state: "draft" | "ready" | "deleting";
      },
    ) {
      const result = await client
        .from("post_templates")
        .update({
          ...input,
          assets: input.assets.map((asset) => ({ ...asset })),
          revision: revision + 1,
        })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("revision", revision)
        .select("*")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new TemplateConflictError();
      return postTemplateSchema.parse(result.data);
    },
    async remove(id: string, revision: number) {
      const result = await client
        .from("post_templates")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .eq("revision", revision)
        .select("id")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new TemplateConflictError();
    },
  };
}
