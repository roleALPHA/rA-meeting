import { crc32 } from 'node:zlib';

/**
 * The Teams app package the SharePoint package carries (spfx/teams/TeamsSPFxApp.zip). Without it SharePoint generates
 * one Teams app per web part. With it there is one app, roleALPHA Sessions: a meeting tab and side panel, and a
 * personal app that explains how to use it. See https://learn.microsoft.com/sharepoint/dev/spfx/deployment-spfx-teams-solutions.
 */

export const meetingsComponentId = 'd7391660-3f52-4e4b-b95f-7a71e4c5092e';

export const developer = {
  name: 'roleALPHA GmbH',
  websiteUrl: 'https://rolealpha.com',
  privacyUrl: 'https://rolealpha.com/legal/datenschutz',
  termsOfUseUrl: 'https://rolealpha.com/legal/agb',
};

export const description = {
  short: 'Governance outcomes from Teams meetings straight into roleALPHA',
  // The Marketplace requires the description to name every component and every service the app depends on.
  full:
    'A side panel for Microsoft Teams meetings: link the meeting to a circle, record what was agreed on each ' +
    "agenda item, and let rALPH, roleALPHA's assistant, turn it into proposals for roles, policies and " +
    'accountabilities. People review every proposal; adopted ones become drafts in one roleALPHA scenario per ' +
    'meeting, which is submitted for decision by the participants. The result is posted to the meeting chat. ' +
    'The app runs in the browser and has no server of its own. Meeting outcomes are stored in roleALPHA, the ' +
    'only service outside your tenant the app talks to; nothing is stored in SharePoint. rALPH runs in roleALPHA, ' +
    'and no other AI service is used. Using the app needs a roleALPHA account. Reading the meeting chat and ' +
    'posting to it needs administrator consent for Microsoft Graph. The package contains the roleALPHA Sessions ' +
    'web part and a Microsoft Teams app (meeting tab and side panel, personal app).',
};

/** Teams replaces {teamSiteDomain}, {teamSitePath} and {locale} when it loads the app. */
const hosted = (path: string, query: string) =>
  `https://{teamSiteDomain}${path}/_layouts/15/TeamsLogon.aspx?SPFX=true&dest=${path}/_layouts/15/teamshostedapp.aspx%3F${query}%26componentId=${meetingsComponentId}%26forceLocale={locale}`;

export function teamsManifest(version: string) {
  return {
    $schema: 'https://developer.microsoft.com/en-us/json-schemas/teams/v1.16/MicrosoftTeams.schema.json',
    manifestVersion: '1.16',
    packageName: 'com.rolealpha.meetings',
    // The id of the app SharePoint generated before, so the update replaces it in the Teams store.
    id: meetingsComponentId,
    version,
    developer,
    name: { short: 'roleALPHA Sessions', full: 'roleALPHA Sessions' },
    description,
    icons: { outline: `${meetingsComponentId}_outline.png`, color: `${meetingsComponentId}_color.png` },
    accentColor: '#072A26',
    staticTabs: [
      {
        entityId: 'rolealpha-meetings',
        name: 'roleALPHA Sessions',
        contentUrl: hosted('', 'teams%26personal'),
        scopes: ['personal'],
      },
    ],
    configurableTabs: [
      {
        configurationUrl: hosted('{teamSitePath}', 'openPropertyPane=true%26teams'),
        canUpdateConfiguration: false,
        scopes: ['groupchat'],
        context: ['meetingSidePanel', 'meetingDetailsTab', 'meetingChatTab'],
      },
    ],
    validDomains: [
      '*.login.microsoftonline.com',
      '*.sharepoint.com',
      'spoprod-a.akamaihd.net',
      'resourceseng.blob.core.windows.net',
    ],
    webApplicationInfo: { resource: 'https://{teamSiteDomain}', id: '00000003-0000-0ff1-ce00-000000000000' },
  };
}

/** A ZIP archive without compression; fixed timestamps keep the package reproducible. */
export function zip(files: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x21, 12); // 1980-01-01
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(file.data.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, file.data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(file.data.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + file.data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
