import type { TrainingManifest } from '../../shared/types';

export type ScormVersion = '1.2' | '2004';

function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toXmlIdentifier(raw: string): string {
  const cleaned = String(raw || 'training')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[^a-zA-Z_]+/, '');
  return `HCC_${cleaned || 'training'}`;
}

export function buildScormImsManifest(
  manifest: TrainingManifest,
  filePaths: string[],
  version: ScormVersion
): string {
  const title = escapeXml(manifest.name || 'HTML Curriculum Composer Training');
  const pkgId = escapeXml(toXmlIdentifier(manifest.projectId || manifest.name));
  const uniqueFiles = Array.from(
    new Set(
      filePaths
        .map((p) => p.replace(/\\/g, '/').replace(/^\/+/, ''))
        .filter((p) => p && p !== 'imsmanifest.xml')
    )
  ).sort((a, b) => a.localeCompare(b));

  const fileEntries = uniqueFiles
    .map((href) => `      <file href="${escapeXml(href)}" />`)
    .join('\n');

  if (version === '1.2') {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<manifest identifier="${pkgId}" version="1.0"`,
      '  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"',
      '  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">',
      '  <metadata>',
      '    <schema>ADL SCORM</schema>',
      '    <schemaversion>1.2</schemaversion>',
      '  </metadata>',
      '  <organizations default="ORG_1">',
      '    <organization identifier="ORG_1">',
      `      <title>${title}</title>`,
      '      <item identifier="ITEM_1" identifierref="RES_1" isvisible="true">',
      `        <title>${title}</title>`,
      '      </item>',
      '    </organization>',
      '  </organizations>',
      '  <resources>',
      '    <resource identifier="RES_1" type="webcontent" adlcp:scormtype="sco" href="index.html">',
      fileEntries,
      '    </resource>',
      '  </resources>',
      '</manifest>',
      ''
    ].join('\n');
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<manifest identifier="${pkgId}" version="1.0"`,
    '  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"',
    '  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"',
    '  xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"',
    '  xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"',
    '  xmlns:imsss="http://www.imsglobal.org/xsd/imsss">',
    '  <metadata>',
    '    <schema>ADL SCORM</schema>',
    '    <schemaversion>2004 4th Edition</schemaversion>',
    '  </metadata>',
    '  <organizations default="ORG_1">',
    '    <organization identifier="ORG_1">',
    `      <title>${title}</title>`,
    '      <item identifier="ITEM_1" identifierref="RES_1" isvisible="true">',
    `        <title>${title}</title>`,
    '      </item>',
    '    </organization>',
    '  </organizations>',
    '  <resources>',
    '    <resource identifier="RES_1" type="webcontent" adlcp:scormType="sco" href="index.html">',
    fileEntries,
    '    </resource>',
    '  </resources>',
    '</manifest>',
    ''
  ].join('\n');
}
