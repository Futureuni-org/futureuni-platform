type RandomBytes = (size: number) => Buffer;

/** Keys whose .env.example value is a REPLACE_WITH_* placeholder, with generated values. */
export declare function generatedSecrets(
  exampleText: string,
  random?: RandomBytes,
): Record<string, string>;

/** The .env.local text: .env.example with the placeholders filled. */
export declare function renderEnvLocal(exampleText: string, random?: RandomBytes): string;
