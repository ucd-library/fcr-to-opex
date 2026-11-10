const OPEX_NAMESPACE = 'http://www.openpreservationexchange.org/opex/v1.0';

/**
 * @param {*} value - A value to embed as XML text content or attribute value.
 * @returns {string} The value, XML-escaped.
 */
function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * @param {Array<{type: string, value: string}>} [identifiers] - Identifiers to render.
 * @returns {string} An `<Identifiers>` block, or '' if there are none.
 */
function identifiersXml(identifiers) {
  if (!identifiers || identifiers.length === 0) return '';
  const items = identifiers
    .map(id => `      <Identifier type="${escapeXml(id.type)}">${escapeXml(id.value)}</Identifier>`)
    .join('\n');
  return `    <Identifiers>\n${items}\n    </Identifiers>\n`;
}

/**
 * @param {?string} dcXml - An `oai_dc:dc` XML fragment from lib/package/dublin-core.js, or null.
 * @returns {string} A `<DescriptiveMetadata>` block, or '' if `dcXml` is null.
 */
function descriptiveMetadataXml(dcXml) {
  if (!dcXml) return '';
  return `  <DescriptiveMetadata>\n${dcXml}\n  </DescriptiveMetadata>\n`;
}

/**
 * @description Build the `.opex` XML for a folder (Preservica structural object).
 * `title` must be the original directory's exact basename - Preservica has no
 * separate "original name" field for folders, so this is the only place the
 * directory name survives for reconstruction on the way back out.
 * @param {Object} params - Folder OPEX parameters.
 * @param {string} params.title - Original directory basename.
 * @param {Array<{type: string, value: string}>} [params.identifiers] - From lib/package/jsonld-fields.js#extractIdentifiers.
 * @param {?string} [params.dcXml] - From lib/package/dublin-core.js#buildOaiDcXml, or null to omit descriptive metadata.
 * @returns {string} The complete `.opex` XML document.
 */
export function buildFolderOpex({ title, identifiers, dcXml }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OPEXMetadata xmlns="${OPEX_NAMESPACE}">
  <Properties>
    <Title>${escapeXml(title)}</Title>
${identifiersXml(identifiers)}  </Properties>
${descriptiveMetadataXml(dcXml)}</OPEXMetadata>
`;
}

/**
 * @description Build the `.opex` XML for a file (Preservica asset). `originalFilename`
 * is carried in `Transfer/OriginalFilename` per the OPEX spec, but reconstruction
 * relies on the actual uploaded filename that Preservica reports on the bitstream
 * itself rather than this field.
 * @param {Object} params - File OPEX parameters.
 * @param {string} params.title - Cosmetic title (original filename is fine here).
 * @param {Array<{type: string, value: string}>} [params.identifiers] - Rare at file level, but supported.
 * @param {string} params.originalFilename - The file's original name.
 * @param {string} params.sha1 - SHA-1 fixity hex digest of the file's contents.
 * @param {?string} [params.dcXml] - From lib/package/dublin-core.js#buildOaiDcXml, or null to omit descriptive metadata.
 * @returns {string} The complete `.opex` XML document.
 */
export function buildFileOpex({ title, identifiers, originalFilename, sha1, dcXml }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OPEXMetadata xmlns="${OPEX_NAMESPACE}">
  <Properties>
    <Title>${escapeXml(title)}</Title>
${identifiersXml(identifiers)}  </Properties>
  <Transfer>
    <Fixities>
      <Fixity type="SHA-1" value="${escapeXml(sha1)}"/>
    </Fixities>
    <OriginalFilename>${escapeXml(originalFilename)}</OriginalFilename>
  </Transfer>
${descriptiveMetadataXml(dcXml)}</OPEXMetadata>
`;
}

/**
 * @param {Array<{path: string, sha1: string}>} fixities - Path-qualified fixities.
 * @returns {string} A `<Fixities>` block with one path-qualified `<Fixity>` per file.
 */
function paxFixitiesXml(fixities) {
  const items = fixities
    .map(f => `      <Fixity type="SHA-1" value="${escapeXml(f.sha1)}" path="${escapeXml(f.path)}"/>`)
    .join('\n');
  return `    <Fixities>\n${items}\n    </Fixities>\n`;
}

/**
 * @param {string[]} folders - Relative folder paths inside the PAX.
 * @param {string[]} files - Relative file paths inside the PAX.
 * @returns {string} A `<Manifest>` block listing every folder/file, per the
 * shape shown in Preservica's "Creating complex assets within an OPEX" post.
 */
function paxManifestXml(folders, files) {
  const folderItems = folders.map(f => `        <Folder>${escapeXml(f)}</Folder>`).join('\n');
  const fileItems = files.map(f => `        <File type="content">${escapeXml(f)}</File>`).join('\n');
  return `    <Manifest>\n      <Folders>\n${folderItems}\n      </Folders>\n      <Files>\n${fileItems}\n      </Files>\n    </Manifest>\n`;
}

/**
 * @description Build the `.opex` XML for a PAX complex asset - one Preservica
 * asset containing multiple content objects (e.g. the pages of a scanned
 * document), as opposed to `buildFileOpex`'s single-content-object asset.
 * @param {Object} params - PAX OPEX parameters.
 * @param {string} params.title - Cosmetic title (e.g. the item's schema:name, or its slug).
 * @param {Array<{type: string, value: string}>} [params.identifiers] - From lib/package/jsonld-fields.js#extractIdentifiers.
 * @param {?string} [params.dcXml] - From lib/package/dublin-core.js#buildOaiDcXml, or null to omit descriptive metadata.
 * @param {Array<{path: string, sha1: string}>} params.fixities - From lib/package/pax.js#writePaxContents.
 * @param {string[]} params.folders - From lib/package/pax.js#writePaxContents.
 * @param {string[]} params.files - From lib/package/pax.js#writePaxContents.
 * @returns {string} The complete `.opex` XML document.
 */
export function buildPaxOpex({ title, identifiers, dcXml, fixities, folders, files }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OPEXMetadata xmlns="${OPEX_NAMESPACE}">
  <Properties>
    <Title>${escapeXml(title)}</Title>
${identifiersXml(identifiers)}  </Properties>
  <Transfer>
${paxFixitiesXml(fixities)}${paxManifestXml(folders, files)}  </Transfer>
${descriptiveMetadataXml(dcXml)}</OPEXMetadata>
`;
}

export default { buildFolderOpex, buildFileOpex, buildPaxOpex };
