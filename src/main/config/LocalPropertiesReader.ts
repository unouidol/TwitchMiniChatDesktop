import fs from 'node:fs';
import path from 'node:path';

/**
 * Map of key/value pairs loaded from a Java-style local.properties file.
 */
export type LocalProperties = Readonly<Record<string, string>>;

/**
 * Reads local development properties from the project root.
 *
 * This is intentionally used only by the Electron main process. Secrets loaded
 * from local.properties must never be exposed directly to the renderer.
 */
export function readLocalPropertiesFromProjectRoot(): LocalProperties {
  const propertiesPath = path.join(process.cwd(), 'local.properties');

  if (!fs.existsSync(propertiesPath)) {
    return {};
  }

  const content = fs.readFileSync(propertiesPath, 'utf8');

  return parseLocalProperties(content);
}

/**
 * Parses a minimal Java-style .properties file.
 *
 * This parser supports the simple KEY=value format used for local TMC
 * development secrets. It ignores empty lines and comment lines.
 */
function parseLocalProperties(content: string): LocalProperties {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#') || line.startsWith('!')) {
      continue;
    }

    const separatorIndex = findSeparatorIndex(line);

    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key) {
      values[key] = value;
    }
  }

  return values;
}

/**
 * Finds the first supported key/value separator in a properties line.
 */
function findSeparatorIndex(line: string): number {
  const equalsIndex = line.indexOf('=');
  const colonIndex = line.indexOf(':');

  if (equalsIndex < 0) {
    return colonIndex;
  }

  if (colonIndex < 0) {
    return equalsIndex;
  }

  return Math.min(equalsIndex, colonIndex);
}
