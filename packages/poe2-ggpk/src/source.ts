/**
 * The boundary every extractor depends on, and the only thing that knows where bytes come from (CDN, local install or
 * cache). Dependency-free on purpose: extractors import only the type, none of the heavy acquisition stack.
 */

export type TableRow = Record<string, unknown>;

export interface GgpkSource {
  /** Decoded rows of a table (e.g. `PassiveSkills`), in table order. Column selection is the source's concern. */
  table(name: string): Promise<TableRow[]>;

  /** Raw bytes of a file by logical path (e.g. `metadata/passiveskillgraph.psg`), or `null` if the source can't serve it (e.g. a texture bundle the CDN doesn't host). */
  file(path: string): Promise<Uint8Array | null>;
}
