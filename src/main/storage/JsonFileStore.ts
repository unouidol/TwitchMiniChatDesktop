import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Small JSON file store for non-secret desktop data.
 *
 * Do not use this class for OAuth tokens or other secrets. Token storage will
 * use an operating-system credential store later.
 */
export class JsonFileStore<TValue> {
  /**
   * Creates a JSON file store.
   */
  constructor(
    private readonly filePath: string,
    private readonly defaultValue: TValue,
  ) {}

  /**
   * Reads the stored value or returns the default value when the file is absent.
   */
  async read(): Promise<TValue> {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(content) as TValue;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return this.defaultValue;
      }

      throw error;
    }
  }

  /**
   * Writes the value to disk using a small atomic replace flow.
   */
  async write(value: TValue): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    const temporaryFilePath = `${this.filePath}.tmp`;
    const serializedValue = `${JSON.stringify(value, null, 2)}\n`;

    await fs.writeFile(temporaryFilePath, serializedValue, 'utf8');
    await fs.rename(temporaryFilePath, this.filePath);
  }
}

/**
 * Node.js error with an optional file-system error code.
 */
type NodeError = Error & {
  /**
   * Node.js error code.
   */
  readonly code?: string;
};

/**
 * Checks whether an unknown value is a Node.js error object.
 */
function isNodeError(error: unknown): error is NodeError {
  return error instanceof Error;
}
