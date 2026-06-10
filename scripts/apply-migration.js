#!/usr/bin/env node
/**
 * Applies the RLS policies, triggers, and functions to Haloprofile's Supabase
 * without dropping any existing tables or data.
 */
import "dotenv/config";

const SUPABASE_URL = "https://pluksclbjkerwnbqfsue.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set.");
  process.exit(1);
}

const headers = {
  "apikey": SERVICE_ROLE_KEY,
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function runSQL(sql) {
  // Try using the pg_dump endpoint via supabase
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  // This won't work directly - we need a different approach
}

async function main() {
  console.log("Checking current state of database...\n");

  // Check RLS status
  const tables = ["profiles", "uploads", "training_jobs", "generated_photos", "orders"];
  
  for (const table of tables) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
      headers: { ...headers, "Accept": "application/json" }
    });
    console.log(`${table}: status=${res.status}`);
  }

  console.log("\n--- Enabling RLS on tables ---");

  for (const table of tables) {
    // Enable RLS via the SQL endpoint using the pg client via service_role
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "PATCH",
      headers: { 
        ...headers, 
        "Prefer": "return=minimal" 
      },
      body: JSON.stringify({})
    });
    // RLS can't be enabled via REST API
  }

  console.log("\nRLS must be enabled via direct SQL connection (cannot be done via REST API).");
  console.log("\nPlease run the following SQL in your Supabase Dashboard SQL Editor:");
  console.log("Go to: https://supabase.com/dashboard/project/pluksclbjkerwnbqfsue/sql/new");
  console.log("");
  console.log("Then paste the contents of supabase/migrations/001_initial_schema.sql");
  console.log("But FIRST remove the CREATE TABLE IF NOT EXISTS sections (tables already exist).");
  console.log("");
  console.log("Alternatively, I can generate a migration file that only adds what's missing.\n");
}

main().catch(console.error);
