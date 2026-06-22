/**
 * The boundary every PoE2 data extractor depends on, and the only thing that
 * knows where bytes come from. An extractor asks a {@link GgpkSource} for
 * decoded tables and raw files; whether those are served from the patch CDN, a
 * local game install, or a pre-extracted cache is the source's concern, never
 * the extractor's.
 *
 * Keeping this interface dependency-free is deliberate: the extractor packages
 * import only the type, so none of them pull in the (heavy) acquisition stack.
 */

/** One decoded row of a GGPK data table, keyed by column name. */
export type TableRow = Record<string, unknown>;

/** A read-only view over the GGPK, abstracted from how the data is acquired. */
export interface GgpkSource {
  /**
   * Decoded rows of a GGPK data table (e.g. `PassiveSkills`), in table order.
   * Column selection is the source's concern — typically driven by an extract
   * config shared with the underlying `pathofexile-dat` tooling.
   */
  table(name: string): Promise<TableRow[]>;

  /**
   * Raw bytes of a GGPK file by its logical path (e.g.
   * `metadata/passiveskillgraph.psg`), or `null` if the source cannot serve it
   * (for instance a texture bundle the patch CDN does not host).
   */
  file(path: string): Promise<Uint8Array | null>;
}
