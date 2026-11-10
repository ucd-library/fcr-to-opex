/**
 * @description Shared forward mapping between a `dams-*-metadata` item's media
 * sub-folder convention and Preservica PAX representation types.
 *
 * Preservica's PAX folder-naming shortcut only documents (and every official
 * example uses) exactly two representation types: `Preservation` and `Access`
 * (optionally suffixed `_1`/`_2`... for multiple representations of the SAME
 * type). Confirmed the hard way: a third invented type name
 * (`Representation_Text`) produced an ingest validation error ("Representation
 * null: type is empty or invalid") - Preservica couldn't map it to a known
 * type. So `media/images/` (the page sequence) maps to `Preservation`, and
 * EVERYTHING else - a bare file directly in `media/`, `media/text/`, or any
 * other named sub-folder - maps to `Access`. Multiple files within one
 * representation is normal and already how the page sequence itself works
 * (multiple content-object sub-folders under one `Representation_Preservation`).
 *
 * On reconstruction, distinguishing "this Access content object was the
 * original direct file" from "this was the text transcript" can't rely on
 * representation type alone anymore (both are `Access`) - a future transform
 * command would need to split `Access` files by a `.txt` extension check
 * instead.
 */

/**
 * @description Map a source sub-folder name to a Preservica representation type.
 * @param {?string} branchName - The sub-folder name (e.g. "images", "text"), or
 * null for a bare file directly in `media/`.
 * @returns {'Preservation'|'Access'} A representation type Preservica recognizes.
 */
export function branchToRepresentationType(branchName) {
  return branchName === 'images' ? 'Preservation' : 'Access';
}

/**
 * @description Map a Preservica representation type back to the output
 * sub-folder name it reconstructs into, or null if its file(s) belong directly
 * in `media/`.
 * @param {string} representationType - "Preservation" or "Access".
 * @returns {?string} The sub-folder name, or null for a direct `media/` child.
 */
export function representationTypeToBranch(representationType) {
  return representationType === 'Preservation' ? 'images' : null;
}

export default { branchToRepresentationType, representationTypeToBranch };
