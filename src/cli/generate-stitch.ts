import { ZodError } from "zod";
import {
  BlueprintRepository,
  FileBlueprintStore,
  generateStitchHtmlFromFrozenBlueprint,
  GoogleStitchSdkStageClient
} from "../blueprint/index.js";
import { readStitchEnv } from "../blueprint/shared/env.js";

function formatCliError(error: unknown): string {
  if (error instanceof ZodError) {
    const envIssue = error.issues.find((issue) => issue.path[0] === "STITCH_API_KEY");
    if (envIssue) {
      return "Missing STITCH_API_KEY. Set STITCH_API_KEY in your .env before running Stitch generation.";
    }
    return `Environment configuration error: ${error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`;
  }

  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

async function main(): Promise<void> {
  readStitchEnv();

  const repository = new BlueprintRepository(new FileBlueprintStore());
  const latest = repository.requireLatestFrozenBlueprint();

  const result = await generateStitchHtmlFromFrozenBlueprint(
    {
      sessionId: latest.session.id,
      blueprintId: latest.version.id,
      frozenBlueprint: latest.blueprint
    },
    {
      repository,
      stageClient: new GoogleStitchSdkStageClient()
    }
  );

  process.stdout.write(
    `Stitch generation completed.\n` +
      `sessionId: ${result.sessionId}\n` +
      `blueprintId: ${result.blueprintId}\n` +
      `promptPlanArtifactId: ${result.promptPlanArtifactId}\n` +
      `pagesGenerated: ${result.pageResults.length}\n`
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${formatCliError(error)}\n`);
  process.exitCode = 1;
});
