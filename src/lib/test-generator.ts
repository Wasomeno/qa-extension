import { TestBlueprint, TestStep } from '@/types/recording';

/**
 * Converts a TestBlueprint to a Playwright test script
 */
export function generatePlaywrightTest(blueprint: TestBlueprint): string {
  const lines: string[] = [
    `import { test, expect } from '@playwright/test';`,
    ``,
    `test('${escapeString(blueprint.name)}', async ({ page }) => {`,
  ];

  // Add navigation if baseUrl is present
  if (blueprint.baseUrl) {
    lines.push(`  await page.goto('${escapeString(blueprint.baseUrl)}');`);
  }

  // Convert each step to Playwright code
  blueprint.steps.forEach((step, index) => {
    const code = convertStepToPlaywright(step, index);
    lines.push(...code);
  });

  lines.push('});');
  lines.push('');

  // Add parameterized version if there are parameters
  if (blueprint.parameters.length > 0) {
    lines.push(...generateParameterizedTest(blueprint));
  }

  return lines.join('\n');
}

function convertStepToPlaywright(step: TestStep, index: number): string[] {
  const lines: string[] = [];
  const selector = buildSelector(step);

  switch (step.action) {
    case 'navigate':
      if (step.value) {
        lines.push(`  // Step ${index + 1}: Navigate to ${step.value}`);
        lines.push(`  await page.goto('${escapeString(step.value)}');`);
      }
      break;

    case 'click':
      lines.push(`  // Step ${index + 1}: ${step.description}`);
      lines.push(`  await page.click(${selector});`);
      break;

    case 'type':
      lines.push(`  // Step ${index + 1}: ${step.description}`);
      if (step.value) {
        lines.push(`  await page.fill(${selector}, '${escapeString(step.value)}');`);
      }
      break;

    case 'select':
      lines.push(`  // Step ${index + 1}: ${step.description}`);
      if (step.value) {
        lines.push(`  await page.selectOption(${selector}, '${escapeString(step.value)}');`);
      }
      break;

    case 'assert':
      lines.push(`  // Step ${index + 1}: Assert - ${step.description}`);
      lines.push(...convertAssertion(step, selector));
      break;

    default:
      lines.push(`  // Step ${index + 1}: ${step.description} (unsupported action: ${step.action})`);
  }

  return lines;
}

function convertAssertion(step: TestStep, selector: string): string[] {
  const lines: string[] = [];

  switch (step.assertionType) {
    case 'exists':
      lines.push(`  await expect(page.locator(${selector})).toBeVisible();`);
      break;
    case 'not_exists':
      lines.push(`  await expect(page.locator(${selector})).not.toBeVisible();`);
      break;
    case 'equals':
      if (step.expectedValue) {
        lines.push(`  await expect(page.locator(${selector})).toHaveValue('${escapeString(step.expectedValue)}');`);
      }
      break;
    case 'contains':
      if (step.expectedValue) {
        lines.push(`  await expect(page.locator(${selector})).toContainText('${escapeString(step.expectedValue)}');`);
      }
      break;
    default:
      lines.push(`  await expect(page.locator(${selector})).toBeVisible();`);
  }

  return lines;
}

function buildSelector(step: TestStep): string {
  // Use the best available selector
  const selectors: string[] = [];

  // Prefer test attributes
  if (step.elementHints?.attributes) {
    const attrs = step.elementHints.attributes;
    if (attrs['data-testid']) {
      selectors.push(`'[data-testid="${attrs['data-testid']}"]'`);
    }
    if (attrs['data-test-id']) {
      selectors.push(`'[data-test-id="${attrs['data-test-id']}"]'`);
    }
    if (attrs['data-cy']) {
      selectors.push(`'[data-cy="${attrs['data-cy']}"]'`);
    }
    if (attrs['data-qa']) {
      selectors.push(`'[data-qa="${attrs['data-qa']}"]'`);
    }
  }

  // Add the main selector if available
  if (step.selector) {
    selectors.push(`'${escapeString(step.selector)}'`);
  }

  // Add selector candidates as fallbacks (comment for reference)
  if (step.selectorCandidates && step.selectorCandidates.length > 0) {
    // Include first candidate as fallback
    // selectors.push(`'${escapeString(step.selectorCandidates[0])}'`);
  }

  // Return first available selector
  return selectors[0] || "'body'";
}

function generateParameterizedTest(blueprint: TestBlueprint): string[] {
  const lines: string[] = [
    `test.describe('${escapeString(blueprint.name)} (Parameterized)', () => {`,
  ];

  blueprint.parameters.forEach(param => {
    lines.push(`  test('${escapeString(param)}', async ({ page }) => {`);
    lines.push(`    // TODO: Set up test data for parameter: ${param}`);
    lines.push('');
    lines.push(`    // Run the test with parameter context`);

    // Add navigation if baseUrl is present
    if (blueprint.baseUrl) {
      lines.push(`    await page.goto('${escapeString(blueprint.baseUrl)}');`);
    }

    // Add parameterized step placeholder
    lines.push(`    // Parameter '${param}' would be applied here`);

    lines.push('  });');
  });

  lines.push('});');
  lines.push('');

  return lines;
}

function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Generates a filename for the test based on the blueprint name
 */
export function generateTestFilename(blueprint: TestBlueprint): string {
  const sanitizedName = blueprint.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${sanitizedName || 'test'}.spec.ts`;
}

/**
 * Exports blueprint as JSON for backup/import
 */
export function exportBlueprintAsJson(blueprint: TestBlueprint): string {
  return JSON.stringify(blueprint, null, 2);
}

/**
 * Generates a JSON filename for the blueprint
 */
export function generateBlueprintFilename(blueprint: TestBlueprint): string {
  const sanitizedName = blueprint.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${sanitizedName || 'blueprint'}-${blueprint.id.slice(0, 8)}.json`;
}
