import { ZodError } from "zod";
import { runStitchOutputCapabilityProbe } from "../stitch/probe/stitch-output-capability-probe.js";

function formatCliError(error: unknown): string {
  if (error instanceof ZodError) {
    const envIssue = error.issues.find((issue) => issue.path[0] === "STITCH_API_KEY");
    if (envIssue) {
      return "Missing Stitch credentials. Set STITCH_API_KEY, or STITCH_ACCESS_TOKEN together with GOOGLE_CLOUD_PROJECT, in .env before running the capability probe.";
    }
    return `Environment configuration error: ${error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`;
  }

  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

async function main(): Promise<void> {
  const report = await runStitchOutputCapabilityProbe();
  process.stdout.write(
    `Stitch capability probe completed.\n` +
      `probeRunId: ${report.probeRunId}\n` +
      `artifactRoot: ${report.artifactRoot}\n` +
      `reportPath: ${report.reportPath}\n`
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${formatCliError(error)}\n`);
  process.exitCode = 1;
});
