/**
 * Resolve Microsoft aliases to email addresses via Microsoft Graph.
 *
 * Usage:
 *   $env:GRAPH_TOKEN="eyJ0..."; npx tsx app/lib/resolve-aliases.ts
 *
 * Get your token from https://developer.microsoft.com/graph/graph-explorer
 * (needs User.Read.All or User.ReadBasic.All permission)
 */

const graphToken = process.env.GRAPH_TOKEN;

const ALIASES = [
  "nikj", "shishirgarg", "udpattem", "mohitsamant", "isharmenon",
  "hergupta", "akshitarora", "gulsing", "npasupuleti", "angogada",
  "ranimmag", "kamsharma", "gachauhan", "nikhilseth", "asniranj",
  "devenbansal", "mpeddolla", "kasoma", "mavarsh", "vimis",
  "shashkumar", "prrasto", "aryankarkra", "abhinakumar", "vaibhavverma",
  "sreedevpc", "gopalagrawal", "kummanis", "satpatel", "saswatdas",
  "sasswain", "miteshvasani", "jturuk", "samyaksharma", "vasanthaleti",
  "kakella", "akhilnagar", "yboddapati", "rajivchikine", "shjaloree",
  "hpuppala", "gudkahetvi", "shreyabhatia", "jha", "poojagiriv",
  "dalvegouri", "arsshukla", "pranavajain", "rashank", "saujai",
  "anpalla", "saibhatnagar", "anirbitdatta", "sibalakr", "vrochlani",
  "rohangupta", "abhimgautam", "pavanak", "abhipatel", "smedabaina",
  "akshaycherka", "braghavendra", "deda", "ishasdikshit", "nandanp",
  "vinmat", "kartikgupta", "nihalnema", "rishabhsingh", "suag",
  "ashok", "hamuthir", "shuj", "mrayan", "peeyushp",
  "sharmaabh", "shreyasmali", "namansinghal", "ankakula", "kapilgupta",
  "nvidyasagar", "sosahoo", "sgayathri", "supriyap", "gpokuri",
  "psaharan", "vaishnagupta", "rashmikumari", "mojha", "varshamittal",
  "btadikonda", "nandinibajaj", "vashistm", "yuktaanand", "riyaraj",
  "shreysinha", "vvibhor", "akappaganti", "antraphukan", "rajatrathi",
  "kumaripu", "lokeshverma", "pridixit", "pjaluthariya", "anantsaxena",
  "vikotha", "krjosh", "shambhsi", "ubanthia", "heenagupta",
  "ganirudh", "sakshitiwari", "rashmigupta", "asparage", "ppathre",
  "sasankagrs", "pracagarwal", "rudreshraj", "mpolimera", "gdigra",
  "sjha", "sbhalchandra", "anjchaudhary", "abhishekgupta", "htandon",
  "ruchibatra", "shahkhushi", "neerajanand", "singhrashi", "anuawasthi",
  "sharmaman", "shbali", "sisamal",
];

// Deduplicate
const uniqueAliases = [...new Set(ALIASES.map(a => a.trim().toLowerCase()))];

async function resolveAlias(alias: string): Promise<{ alias: string; email: string | null; name: string | null }> {
  const upn = `${alias}@microsoft.com`;
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}?$select=displayName,mail`,
      { headers: { Authorization: `Bearer ${graphToken}` } }
    );

    if (res.ok) {
      const data = await res.json();
      return { alias, email: data.mail ?? `${alias}@microsoft.com`, name: data.displayName };
    }

    if (res.status === 404) {
      return { alias, email: null, name: null };
    }

    // Handle rate limiting — wait and retry once
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
      console.warn(`  ⏳ Rate limited on ${alias}, waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      return resolveAlias(alias); // retry once
    }

    console.error(`  [${res.status}] Error for ${alias}`);
    return { alias, email: null, name: null };
  } catch (err) {
    console.error(`  Network error for ${alias}:`, err);
    return { alias, email: null, name: null };
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  if (!graphToken) {
    console.error("❌ GRAPH_TOKEN env var is required.");
    console.error('   Usage: $env:GRAPH_TOKEN="eyJ0..."; npx tsx app/lib/resolve-aliases.ts');
    process.exit(1);
  }

  console.log(`\n🔍 Resolving ${uniqueAliases.length} unique aliases via Microsoft Graph...\n`);

  const results: { alias: string; email: string | null; name: string | null }[] = [];

  // Process in batches of 5 to avoid rate limits
  const BATCH_SIZE = 5;
  for (let i = 0; i < uniqueAliases.length; i += BATCH_SIZE) {
    const batch = uniqueAliases.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(resolveAlias));
    results.push(...batchResults);

    const done = Math.min(i + BATCH_SIZE, uniqueAliases.length);
    process.stdout.write(`  Progress: ${done}/${uniqueAliases.length}\r`);

    // Small delay between batches
    if (i + BATCH_SIZE < uniqueAliases.length) {
      await sleep(200);
    }
  }

  console.log("\n");

  // Print results
  const found = results.filter(r => r.email);
  const notFound = results.filter(r => !r.email);

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("  RESOLVED ALIASES");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  console.log("Alias".padEnd(22) + "Email".padEnd(40) + "Name");
  console.log("─".repeat(90));

  for (const r of found) {
    console.log(`${r.alias.padEnd(22)}${(r.email || "").padEnd(40)}${r.name || ""}`);
  }

  if (notFound.length > 0) {
    console.log(`\n\n⚠ NOT FOUND (${notFound.length}):`);
    for (const r of notFound) {
      console.log(`  ${r.alias}`);
    }
  }

  // Also output CSV
  console.log("\n\n═══════════════════════════════════════════════════════════════════");
  console.log("  CSV OUTPUT (copy-paste friendly)");
  console.log("═══════════════════════════════════════════════════════════════════\n");
  console.log("alias,email,name");
  for (const r of results) {
    console.log(`${r.alias},${r.email || "NOT_FOUND"},${r.name || "N/A"}`);
  }

  console.log(`\n✅ Done. ${found.length} resolved, ${notFound.length} not found.`);
}

main();
