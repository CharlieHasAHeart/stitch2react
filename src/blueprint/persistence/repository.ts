import { checksumJson } from "../shared/hash.js";
import { createId } from "../shared/ids.js";
import type {
  ArtifactType,
  BlueprintQualityReport,
  ProductBlueprintV1,
  BlueprintVersion,
  BlueprintVersionStatus,
  GateReport,
  GenerationArtifact,
  GenerationSession,
  GenerationStageRun,
  RepairGuardReport,
  RepairPlan,
  RepairProvenance,
  SessionStatus,
  ValidationReport
} from "../types/blueprint.js";
import { FileBlueprintStore } from "./file-store.js";
import type { ProjectBundleManifest } from "./file-store.js";

function nowIso(): string {
  return new Date().toISOString();
}

export class BlueprintRepository {
  constructor(private readonly store: FileBlueprintStore) {}

  createSession(rawInputArtifactId = ""): GenerationSession {
    const session: GenerationSession = {
      id: createId("sess"),
      status: "created",
      rawInputArtifactId,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.store.saveSession(session);
    return session;
  }

  updateSession(sessionId: string, patch: Partial<GenerationSession>): GenerationSession {
    const existing = this.requireSession(sessionId);
    const updated = {
      ...existing,
      ...patch,
      updatedAt: nowIso()
    };
    this.store.saveSession(updated);
    return updated;
  }

  saveArtifact(
    sessionId: string,
    artifactType: ArtifactType,
    json: unknown,
    checksum?: string
  ): GenerationArtifact {
    const artifact: GenerationArtifact = {
      id: createId("art"),
      sessionId,
      artifactType,
      version: this.store.artifactVersion(sessionId, artifactType),
      json,
      checksum: checksum ?? checksumJson(json),
      createdAt: nowIso()
    };
    this.store.saveArtifactRecord(artifact);
    return artifact;
  }

  savePageHtmlFile(sessionId: string, pageId: string, html: string): string {
    return this.store.savePageHtmlFile(sessionId, pageId, html);
  }

  saveProjectBundleFile(projectId: string, relativePath: string, value: unknown): string {
    return this.store.saveProjectBundleFile(projectId, relativePath, value);
  }

  saveProjectBundleTextFile(projectId: string, relativePath: string, value: string): string {
    return this.store.saveProjectBundleTextFile(projectId, relativePath, value);
  }

  saveProjectBundleManifest(projectId: string, manifest: ProjectBundleManifest): string {
    return this.store.saveProjectBundleManifest(projectId, manifest);
  }

  createStageRun(stageRun: GenerationStageRun): GenerationStageRun {
    this.store.saveStageRun(stageRun);
    return stageRun;
  }

  updateStageRun(stageRunId: string, patch: Partial<GenerationStageRun>): GenerationStageRun {
    const existing = this.requireStageRun(stageRunId);
    const updated = {
      ...existing,
      ...patch,
      updatedAt: nowIso()
    };
    this.store.saveStageRun(updated);
    return updated;
  }

  createBlueprintVersion(
    sessionId: string,
    artifactId: string,
    status: BlueprintVersionStatus
  ): BlueprintVersion {
    const version: BlueprintVersion = {
      id: createId("bp"),
      sessionId,
      version: this.store.blueprintVersion(sessionId),
      status,
      artifactId,
      createdAt: nowIso()
    };
    this.store.saveBlueprintVersion(version);
    return version;
  }

  updateBlueprintVersion(blueprintId: string, patch: Partial<BlueprintVersion>): BlueprintVersion {
    const existing = this.requireBlueprintVersion(blueprintId);
    const updated = { ...existing, ...patch };
    this.store.saveBlueprintVersion(updated);
    return updated;
  }

  supersedeNonFrozenBlueprints(sessionId: string, exceptBlueprintId: string): void {
    for (const version of Object.values(this.store.collections.blueprintVersions)) {
      if (
        version.sessionId === sessionId &&
        version.id !== exceptBlueprintId &&
        version.status !== "frozen"
      ) {
        this.store.saveBlueprintVersion({
          ...version,
          status: "superseded"
        });
      }
    }
  }

  saveValidationReport(report: ValidationReport): ValidationReport {
    this.store.saveValidationReport(report);
    return report;
  }

  saveQualityReviewReport(report: BlueprintQualityReport): BlueprintQualityReport {
    this.store.saveQualityReviewReport(report);
    return report;
  }

  saveGateReport(report: GateReport): GateReport {
    this.store.saveGateReport(report);
    return report;
  }

  saveRepairPlan(plan: RepairPlan): RepairPlan {
    this.store.saveRepairPlan(plan);
    return plan;
  }

  saveRepairProvenance(report: RepairProvenance): RepairProvenance {
    this.saveArtifact(report.sessionId, "repair_provenance", report);
    return report;
  }

  saveRepairGuardReport(report: RepairGuardReport): RepairGuardReport {
    this.store.saveRepairGuardReport(report);
    return report;
  }

  requireSession(sessionId: string): GenerationSession {
    const session = this.store.collections.sessions[sessionId];
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return session;
  }

  requireStageRun(stageRunId: string): GenerationStageRun {
    const stageRun = this.store.collections.stageRuns[stageRunId];
    if (!stageRun) {
      throw new Error(`Unknown stage run: ${stageRunId}`);
    }
    return stageRun;
  }

  requireArtifact(artifactId: string): GenerationArtifact {
    const artifact = this.store.collections.artifacts[artifactId];
    if (!artifact) {
      throw new Error(`Unknown artifact: ${artifactId}`);
    }
    return artifact;
  }

  requireBlueprintVersion(blueprintId: string): BlueprintVersion {
    const version = this.store.collections.blueprintVersions[blueprintId];
    if (!version) {
      throw new Error(`Unknown blueprint version: ${blueprintId}`);
    }
    return version;
  }

  requireBlueprintJson(blueprintId: string): ProductBlueprintV1 {
    const version = this.requireBlueprintVersion(blueprintId);
    return this.requireArtifact(version.artifactId).json as ProductBlueprintV1;
  }

  requireLatestFrozenBlueprint(): { session: GenerationSession; version: BlueprintVersion; blueprint: ProductBlueprintV1 } {
    const frozenVersions = Object.values(this.store.collections.blueprintVersions)
      .filter((version) => version.status === "frozen")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const version = frozenVersions.at(-1);
    if (!version) {
      throw new Error("No frozen blueprint found.");
    }
    const session = this.requireSession(version.sessionId);
    const blueprint = this.requireArtifact(version.artifactId).json as ProductBlueprintV1;
    return { session, version, blueprint };
  }

  listStageRuns(sessionId: string): GenerationStageRun[] {
    return Object.values(this.store.collections.stageRuns).filter(
      (item) => item.sessionId === sessionId
    );
  }

  listArtifacts(sessionId: string): GenerationArtifact[] {
    return Object.values(this.store.collections.artifacts).filter(
      (item) => item.sessionId === sessionId
    );
  }

  listSessions(): GenerationSession[] {
    return Object.values(this.store.collections.sessions);
  }

  listGateReports(sessionId: string): GateReport[] {
    return Object.values(this.store.collections.gateReports).filter(
      (item) => item.sessionId === sessionId
    );
  }

  listRepairPlans(sessionId: string): RepairPlan[] {
    return Object.values(this.store.collections.repairPlans).filter(
      (item) => item.sessionId === sessionId
    );
  }

  listRepairGuardReports(sessionId: string): RepairGuardReport[] {
    return Object.values(this.store.collections.repairGuardReports).filter(
      (item) => item.sessionId === sessionId
    );
  }

  setSessionStatus(sessionId: string, status: SessionStatus): GenerationSession {
    return this.updateSession(sessionId, { status });
  }
}
