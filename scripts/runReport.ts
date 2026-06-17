/**
 * Run the full research pipeline once and write the output to ./output/ as:
 *   report.html  (the Cymate-branded card — open in a browser)
 *   report.txt   (plain-text version)
 *   report.json  (full structured payload: data + meta)
 *
 * Usage:  npx ts-node --transpile-only scripts/runReport.ts <domain-or-email>
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

import { runPipeline } from "../src/api/pipeline";

async function main() {
  const input = process.argv[2] || "cymate.io";
  console.log(`\n=== Signal Research Engine — test run for: ${input} ===\n`);
  const started = Date.now();

  const payload = await runPipeline(input);

  const outDir = path.join(process.cwd(), "output");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "report.html"), payload.formattedHTML, "utf8");
  fs.writeFileSync(path.join(outDir, "report.txt"), payload.formattedText, "utf8");
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(payload, null, 2), "utf8");

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\n=== DONE in ${mins} min ===`);
  console.log(`Input company : ${payload.data.inputCompany.companyName}`);
  console.log(`Target buyer  : ${payload.data.inputCompany.targetBuyer}`);
  console.log(`Signals       : ${payload.data.signals.signals.map((s) => s.signal).join(" | ")}`);
  console.log(`Companies     : ${payload.meta.totalCompanies} | Contacts: ${payload.meta.totalContacts}`);
  payload.data.companies.forEach((c) =>
    console.log(`  - ${c.name} (${c.domain}) — ${c.contacts.length} contacts${c.notFound ? " [none found]" : ""}`)
  );
  console.log(`\nOpen this in your browser to see the card:\n  ${path.join(outDir, "report.html")}\n`);
}

main().catch((e) => {
  console.error("\nRUN FAILED:", (e as Error).message);
  process.exit(1);
});
