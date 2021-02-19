import path from 'path';
import * as paths from '../common/paths';
import wizWrapper from '../wrapper';

const fs = wizWrapper.fs;

async function getDefaultNoteHtml() {
  const htmlPath = path.join(paths.getResourcesPath(), 'default_note.html');
  const data = await fs.readFile(htmlPath);
  return data.toString('utf8');
}

export default getDefaultNoteHtml;
