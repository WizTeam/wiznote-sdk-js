export interface User {
  isLocalUser: boolean,
  created: number,
  displayName: string,
  email: string,
  emailVerify: 'verified' | 'unverified',
  kbGuid: string,
  kbServer: string,
  server: string;
  password?: string,
  kbType: 'person' | 'group',
  token: string,
  userGuid: string,
  userId: string,
};

export const LOCAL_STATUS_DOWNLOADED = 1;
export const LOCAL_STATUS_NEED_REDOWNLOAD = 0;

export const VERSION_INFO_CHANGED = -1;
export const VERSION_DATA_CHANGED = -2;


export interface ServerNote {
  kbGuid: string;
  docGuid: string;
  title: string;
  category: string;
  created: number;
  modified: number;
  dataModified: number;
  version: number;
  type: string;
  fileType: string | undefined | null;
  name: string | undefined | null;
  seo: string | undefined | null;
  url: string | undefined | null;
  tags: string | undefined | null;
  owner: string | undefined | null;
  protected?: boolean | number | undefined;
  attachmentCount: number | undefined | null;
  dataMd5: string | undefined | null;
}

export interface NoteResource {
  name: string;
  size: number;
};

export interface Note {
  kbGuid: string;
  guid: string;
  title: string;
  category: string;
  created: Date;
  modified: Date;
  dataModified: Date;
  version: number;
  type: string;
  fileType: string | undefined | null;
  name: string | undefined | null;
  seo: string | undefined | null;
  url: string | undefined | null;
  tags: string | undefined | null;
  owner: string | undefined | null;
  encrypted?: boolean | number | undefined;
  abstract: string | undefined | null;
  text: string | undefined | null;
  starred: boolean | undefined | null;
  archived: boolean| undefined | null;
  trash: boolean | undefined | null,
  attachmentCount: number | undefined | null;
  dataMd5: string | undefined | null;
  localStatus: typeof LOCAL_STATUS_DOWNLOADED | typeof LOCAL_STATUS_NEED_REDOWNLOAD;
  onTop: boolean | undefined | null;
  lastSynced: Date | undefined | null | number;
  author?: string | null;
  keywords?: string | null;
  protected?: number;
  html?: string;
  resources: {
    name: string,
    size?: number,
    created?: number,
  }[],
}

export interface DeleteObject {
  created: number;
  deletedGuid: string;
  version?: number;
  type: string; // 'document' | 'attachment' | 'tag' | 'style' | 
}
