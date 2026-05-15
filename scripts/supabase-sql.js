#!/usr/bin/env node
/**
 * Run SQL queries against your Supabase database.
 * Usage: node scripts/supabase-sql.js "SELECT * FROM pg_tables WHERE schemaname='public'"
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const sql = process.argv.slice(2).join(" ");
if (!sql) {
  console.error("Usage: node scripts/supabase-sql.js <SQL_QUERY>");
  console.error(
    'Example: node scripts/supabase-sql.js "SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\';"'
  );
  process.exit(1);
}

// Use service_role client for admin-level queries
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function runQuery() {
  // Use the /rest/v1/rpc endpoint via a raw SQL function
  const { data, error } = await supabase.rpc("exec_sql", {
    query: sql,
  });

  if (error) {
    // If exec_sql function doesn't exist, fall back to direct query via the management API
    console.error("RPC Error:", error.message);
    console.log("\nTrying direct approach via fetch...");

    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/?limit=0`,
        {
          method: "GET",
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );
      console.log("Status:", response.status);
      const text = await response.text();
      console.log(text);
    } catch (fetchErr) {
      console.error("Direct fetch error:", fetchErr.message);
    }
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
}

runQuery();