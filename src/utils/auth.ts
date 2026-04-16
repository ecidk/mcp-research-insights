import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { logger } from "./logger.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function validateApiKey(apiKey: string): Promise<{
  valid: boolean;
  keyHash?: string;
  scopes?: string[];
  error?: string;
}> {
  if (!apiKey || !apiKey.startsWith("mcp_key_")) {
    return { valid: false, error: "Invalid API key format" };
  }

  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

  try {
    const { data, error } = await supabase
      .from("ux_mcp_api_keys")
      .select("*")
      .eq("api_key_hash", keyHash)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      logger.warn("API key not found or inactive", { keyHash });
      return { valid: false, error: "API key not found or inactive" };
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      logger.warn("API key expired", { keyHash, expires_at: data.expires_at });
      return { valid: false, error: "API key expired" };
    }

    await supabase
      .from("ux_mcp_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id);

    logger.info("API key validated successfully", { keyHash, scopes: data.scopes });
    return { valid: true, keyHash, scopes: data.scopes };
  } catch (error) {
    logger.error("Error validating API key", error);
    return { valid: false, error: "Internal error validating API key" };
  }
}

export async function checkRateLimit(keyHash: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("check_mcp_rate_limit", {
      p_api_key_hash: keyHash
    });

    if (error) {
      logger.error("Error checking rate limit", error);
      return false;
    }

    if (data === false) {
      logger.warn("Rate limit exceeded", { keyHash });
    }

    return data === true;
  } catch (error) {
    logger.error("Error checking rate limit", error);
    return false;
  }
}
