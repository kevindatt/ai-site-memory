import type { UserContext } from "./types";

/**
 * Authorization boundary (PRD §16).
 * Must run BEFORE retrieval reaches any model.
 * Phase-0: fixed demo user allow-listed to the demo project only.
 */
const DEMO_USER: UserContext = {
  userId: "demo-user",
  projectIds: ["qubators-demo"]
};

export function getDemoUser(): UserContext {
  return DEMO_USER;
}

export function checkAccess(user: UserContext, projectId: string): boolean {
  return user.projectIds.includes(projectId);
}
