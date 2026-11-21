import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/** The severities that block a change; the other two are recorded (D-244). */
export const SEVERITIES = ["critical", "serious", "moderate", "minor"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const BLOCKING_SEVERITIES: Severity[] = ["critical", "serious"];

export interface Violation {
  surface: string;
  id: string;
  impact: string;
  help: string;
  elements: string[];
}

export interface AuditResult {
  violations: Violation[];
  /** Rules that ran and passed: proof the audit actually executed. */
  passes: number;
  blocking: boolean;
}

/** One line per violation, with the surface, the rule and the first element. */
export function formatViolation(violation: Violation): string {
  const element = violation.elements[0]?.slice(0, 120) ?? "(no element)";
  return `${violation.surface} [${violation.impact}] ${violation.id}: ${violation.help} -> ${element}`;
}

/**
 * Run axe on the current page. The rule set is axe's default: the floor decides
 * what fails, and every severity is returned so the record can count all four.
 */
export async function auditPage(page: Page, surface: string): Promise<AuditResult> {
  const results = await new AxeBuilder({ page }).analyze();
  const violations: Violation[] = results.violations.map((violation) => ({
    surface,
    id: violation.id,
    impact: violation.impact ?? "minor",
    help: violation.help,
    elements: violation.nodes.map((node) => node.target.join(" ")),
  }));
  const blocking = violations.some((violation) =>
    BLOCKING_SEVERITIES.includes(violation.impact as Severity),
  );
  return { violations, passes: results.passes.length, blocking };
}
