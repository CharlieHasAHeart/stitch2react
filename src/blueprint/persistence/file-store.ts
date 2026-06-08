import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  BlueprintQualityReport,
  BlueprintVersion,
  GateReport,
  GenerationArtifact,
  GenerationSession,
  GenerationStageRun,
  RepairPlan,
  ValidationReport
} from "../types/blueprint.js";

export type FileStoreCollections = {
  sessions: Record<string, GenerationSession>;
  stageRuns: Record<string, GenerationStageRun>;
  artifacts: Record<string, GenerationArtifact>;
  blueprintVersions: Record<string, BlueprintVersion>;
  validationReports: Record<string, ValidationReport>;
  qualityReviewReports: Record<string, BlueprintQualityReport>;
  gateReports: Record<string, GateReport>;
  repairPlans: Record<string, RepairPlan>;
};

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) {
    return fallback;
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export class FileBlueprintStore {
  readonly rootDir: string;
  readonly sessionsDir: string;
  readonly stageRunsDir: string;
  readonly artifactsDir: string;
  readonly blueprintVersionsDir: string;
  readonly validationReportsDir: string;
  readonly qualityReviewReportsDir: string;
  readonly gateReportsDir: string;
  readonly repairPlansDir: string;
  readonly indexesDir: string;

  collections: FileStoreCollections;

  constructor(rootDir = resolve(process.cwd(), "artifacts")) {
    this.rootDir = rootDir;
    this.sessionsDir = join(rootDir, "generation_sessions");
    this.stageRunsDir = join(rootDir, "generation_stage_runs");
    this.artifactsDir = join(rootDir, "generation_artifacts");
    this.blueprintVersionsDir = join(rootDir, "blueprint_versions");
    this.validationReportsDir = join(rootDir, "validation_reports");
    this.qualityReviewReportsDir = join(rootDir, "quality_review_reports");
    this.gateReportsDir = join(rootDir, "gate_reports");
    this.repairPlansDir = join(rootDir, "repair_plans");
    this.indexesDir = join(rootDir, "indexes");

    ensureDir(this.sessionsDir);
    ensureDir(this.stageRunsDir);
    ensureDir(this.artifactsDir);
    ensureDir(this.blueprintVersionsDir);
    ensureDir(this.validationReportsDir);
    ensureDir(this.qualityReviewReportsDir);
    ensureDir(this.gateReportsDir);
    ensureDir(this.repairPlansDir);
    ensureDir(this.indexesDir);

    this.collections = {
      sessions: readJson(join(this.indexesDir, "sessions.json"), {}),
      stageRuns: readJson(join(this.indexesDir, "stage-runs.json"), {}),
      artifacts: readJson(join(this.indexesDir, "artifacts.json"), {}),
      blueprintVersions: readJson(join(this.indexesDir, "blueprint-versions.json"), {}),
      validationReports: readJson(join(this.indexesDir, "validation-reports.json"), {}),
      qualityReviewReports: readJson(join(this.indexesDir, "quality-review-reports.json"), {}),
      gateReports: readJson(join(this.indexesDir, "gate-reports.json"), {}),
      repairPlans: readJson(join(this.indexesDir, "repair-plans.json"), {})
    };
  }

  artifactVersion(sessionId: string, artifactType: GenerationArtifact["artifactType"]): number {
    return (
      Object.values(this.collections.artifacts).filter(
        (artifact) => artifact.sessionId === sessionId && artifact.artifactType === artifactType
      ).length + 1
    );
  }

  blueprintVersion(sessionId: string): number {
    return (
      Object.values(this.collections.blueprintVersions).filter(
        (version) => version.sessionId === sessionId
      ).length + 1
    );
  }

  saveSession(session: GenerationSession): void {
    this.collections.sessions[session.id] = session;
    writeJson(join(this.sessionsDir, `${session.id}.json`), session);
    writeJson(join(this.indexesDir, "sessions.json"), this.collections.sessions);
  }

  saveStageRun(stageRun: GenerationStageRun): void {
    this.collections.stageRuns[stageRun.id] = stageRun;
    writeJson(join(this.stageRunsDir, `${stageRun.id}.json`), stageRun);
    writeJson(join(this.indexesDir, "stage-runs.json"), this.collections.stageRuns);
  }

  saveArtifactRecord(artifact: GenerationArtifact): void {
    this.collections.artifacts[artifact.id] = artifact;
    const artifactDir = join(this.artifactsDir, artifact.sessionId, artifact.artifactType);
    ensureDir(artifactDir);
    writeJson(join(artifactDir, `${artifact.id}.json`), artifact.json);
    writeJson(join(this.artifactsDir, `${artifact.id}.record.json`), artifact);
    writeJson(join(this.indexesDir, "artifacts.json"), this.collections.artifacts);
  }

  saveBlueprintVersion(version: BlueprintVersion): void {
    this.collections.blueprintVersions[version.id] = version;
    writeJson(join(this.blueprintVersionsDir, `${version.id}.json`), version);
    writeJson(join(this.indexesDir, "blueprint-versions.json"), this.collections.blueprintVersions);
  }

  saveValidationReport(report: ValidationReport): void {
    this.collections.validationReports[report.id] = report;
    writeJson(join(this.validationReportsDir, `${report.id}.json`), report);
    writeJson(join(this.indexesDir, "validation-reports.json"), this.collections.validationReports);
  }

  saveQualityReviewReport(report: BlueprintQualityReport): void {
    this.collections.qualityReviewReports[report.id] = report;
    writeJson(join(this.qualityReviewReportsDir, `${report.id}.json`), report);
    writeJson(join(this.indexesDir, "quality-review-reports.json"), this.collections.qualityReviewReports);
  }

  saveGateReport(report: GateReport): void {
    this.collections.gateReports[report.id] = report;
    writeJson(join(this.gateReportsDir, `${report.id}.json`), report);
    writeJson(join(this.indexesDir, "gate-reports.json"), this.collections.gateReports);
  }

  saveRepairPlan(plan: RepairPlan): void {
    this.collections.repairPlans[plan.id] = plan;
    writeJson(join(this.repairPlansDir, `${plan.id}.json`), plan);
    writeJson(join(this.indexesDir, "repair-plans.json"), this.collections.repairPlans);
  }
}
