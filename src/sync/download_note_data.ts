import SyncKbTask from './sync_kb_task';
import * as lockers from '../common/lockers';
import * as noteData from '../db/note_data';
import { User } from '../common/interface';
import WizDb from '../db/wiz_db';

async function downloadNoteData(user: User, db: WizDb, noteGuid: string, invalidTokenHandler: () => Promise<string | null>) {
  //
  const key = noteGuid;
  const hasAlreadyLocked = lockers.isLocking(key);
  try {
    await lockers.lock(key);
    const kbGuid = await db.getKbGuid();
    if (hasAlreadyLocked) {
      // 如果之前已经被正在下载，则不重复下载，直接去尝试读取数据
      const html = await noteData.readNoteHtml(user.userGuid, kbGuid, noteGuid);
      return {
        html,
      };
    }
    //
    const serverUrl = await db.getServerUrl();
    const task = new SyncKbTask(user, serverUrl, kbGuid, db, invalidTokenHandler);
    const result = await task.downloadNoteData(noteGuid);
    //
    const markdown = noteData.getMarkdownFromHtml(result.html);
    await db.updateNoteTags(noteGuid, markdown);
    //
    return result;
  } finally {
    lockers.release(key);
  }
}

export default downloadNoteData;
