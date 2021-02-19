import assert from 'assert';
import path from 'path';
import { noteAnalysis, error } from 'wiznote-sdk-js-share';
import { v4 as uuidv4 } from 'uuid';
import url from 'url';

import getDefaultNoteHtml from './default_note_html';
import * as paths from '../common/paths';
import { getCurrentLang } from '../i18n';
import { getAllImagesFromMarkdown } from '../utils/markdown';
import { downloadToData } from '../common/request';
import imageType from 'image-type';
import wizWrapper from '../wrapper';

const {
  extractLinksFromMarkdown,
  extractTagsFromMarkdown,
  getMarkdownFromHtml,
  getResourcesFromHtml,
} = noteAnalysis;

const { WizInternalError } = error;
const fs = wizWrapper.fs;
// const fs from 'fs');
const saveNoteAsMarkdown = wizWrapper.options?.saveNoteAsMarkdown;

async function markdownToHtml(markdown: string) {
  const text = markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = await getDefaultNoteHtml();
  const placeholder = '<!--wiznote-lite-markdown-->';
  const index = html.indexOf(placeholder);
  if (index === -1) {
    throw new WizInternalError('invalid html template');
  }
  return html.substr(0, index) + text + html.substr(index + placeholder.length);
}

function getNoteHtmlPath(userGuid: string, kbGuid: string, noteGuid: string) {
  return path.join(paths.getNoteData(userGuid, kbGuid, noteGuid), 'index.html');
}

function getNoteMarkdownPath(userGuid: string, kbGuid: string, noteGuid: string) {
  return path.join(paths.getNoteData(userGuid, kbGuid, noteGuid), 'index.md');
}

async function writeNoteHtml(userGuid: string, kbGuid: string, noteGuid: string, html: string) {
  //
  if (saveNoteAsMarkdown) {
    const base = paths.getNoteData(userGuid, kbGuid, noteGuid);
    await fs.ensureDir(base);
    const path = getNoteMarkdownPath(userGuid, kbGuid, noteGuid);
    const markdown = getMarkdownFromHtml(html);
    await fs.writeFile(path, markdown);
    return;
  }
  //
  const base = paths.getNoteData(userGuid, kbGuid, noteGuid);
  await fs.ensureDir(base);
  //
  const p = getNoteHtmlPath(userGuid, kbGuid, noteGuid);
  await fs.writeFile(p, html);
}

async function writeNoteMarkdown(userGuid: string, kbGuid: string, noteGuid: string, markdown: string) {
  if (saveNoteAsMarkdown) {
    const base = paths.getNoteData(userGuid, kbGuid, noteGuid);
    await fs.ensureDir(base);
    const path = getNoteMarkdownPath(userGuid, kbGuid, noteGuid);
    await fs.writeFile(path, markdown);
    return;
  }
  //
  const html = await markdownToHtml(markdown);
  await writeNoteHtml(userGuid, kbGuid, noteGuid, html);
}

async function readNoteMarkdown(userGuid: string, kbGuid: string, noteGuid: string) {
  if (saveNoteAsMarkdown) {
    const path = getNoteMarkdownPath(userGuid, kbGuid, noteGuid);
    const data = await fs.readFile(path);
    const markdown = data.toString('utf8');
    return markdown;
  }
  const p = getNoteHtmlPath(userGuid, kbGuid, noteGuid);
  const data = await fs.readFile(p);
  const html = data.toString('utf8');
  return getMarkdownFromHtml(html);
}

async function readNoteHtml(userGuid: string, kbGuid: string, noteGuid: string) {
  const markdown = await readNoteMarkdown(userGuid, kbGuid, noteGuid);
  const html = await markdownToHtml(markdown);
  return html;
}

async function noteDataExists(userGuid: string, kbGuid: string, noteGuid: string) {
  const p = getNoteHtmlPath(userGuid, kbGuid, noteGuid);
  const ret = await fs.exists(p);
  return ret;
}

async function writeNoteResource(userGuid: string, kbGuid: string, noteGuid: string, resName: string, data: any) {
  const resourcePath = await paths.getNoteResources(userGuid, kbGuid, noteGuid);
  await fs.ensureDir(resourcePath)
  const resPathName = path.join(resourcePath, resName);
  await fs.writeFile(resPathName, data);
}

async function getMarkdownNoteTemplate() {
  return `# Note Title`;
}

async function getGuideNoteData() {
  const lang = getCurrentLang();
  let guideDataPath = path.join(paths.getResourcesPath(), `${lang}/guide`);
  if (!(await fs.exists(guideDataPath))) {
    guideDataPath = path.join(paths.getResourcesPath(), `en/guide`);
  }
  //
  const data = await fs.readFile(path.join(guideDataPath, 'index.md'));
  const markdown = data.toString('utf8');
  //
  const names = await fs.readdir(path.join(guideDataPath, 'index_files'));
  const images = names.map((image) => path.join(guideDataPath, 'index_files', image));
  //
  return {
    markdown,
    images,
  };
}

function extractNoteTitleAndAbstractFromText(text: string) {
  const firstLineEnd = text.indexOf('\n');
  let title;
  let abstract;
  if (firstLineEnd === -1) {
    title = text.trim();
    abstract = '';
  } else {
    title = text.substr(0, firstLineEnd).trim();
    abstract = text.substr(firstLineEnd + 1).substr(0, 200).trim();
  }
  return {
    title,
    abstract,
  };
}

async function processNoteResources(userGuid: string, kbGuid: string, noteGuid: string) {
  const markdown = await readNoteMarkdown(userGuid, kbGuid, noteGuid);
  let images = getAllImagesFromMarkdown(markdown);
  images = images.filter((image) => !image.src.startsWith('index_files/'));
  if (images.length === 0) {
    return false;
  }
  //
  const processImage = async (src: string) => {
    //
    const addImageByPath = async (p: string) => {
      assert(fs.existsSync(p));
      //
      const ext = path.extname(p);
      const guid = uuidv4();
      const resName = `${guid}${ext}`;
      const resourcePath = await paths.getNoteResources(userGuid, kbGuid, noteGuid);
      await fs.ensureDir(resourcePath)
      const resPathName = path.join(resourcePath, resName);
      await fs.copyFile(p, resPathName);
      return `index_files/${resName}`;
    };
    //
    try {
      if (src.startsWith('http://') || src.startsWith('https://')) {
        //
        const imageData = await downloadToData({
          url: src,
        });
        let type = imageType(imageData);
        if (!type) {
          type = {
            ext: 'png',
            mime: 'image/png',
          };
        }
        const guid = uuidv4();
        const resName = `${guid}.${type.ext}`;
        await writeNoteResource(userGuid, kbGuid, noteGuid, resName, imageData);
        return `index_files/${resName}`;

      } else if (src.startsWith('/')) {
        // full absolute path
        const p = src;
        if (await fs.exists(p)) {
          const ret = await addImageByPath(p);
          return ret;
        }
        //
      } else if (src.startsWith('./') || src.startsWith('../')) {
        //relative path
        const p = path.join(paths.getNoteData(userGuid, kbGuid, noteGuid), src);
        if (await fs.exists(p)) {
          const ret = await addImageByPath(p);
          return ret;
        }
        //
      } else if (src.startsWith('file://')) {
        const p = url.fileURLToPath(src);
        if (await fs.exists(p)) {
          const ret = await addImageByPath(p);
          return ret;
        }
      }
    } catch (err) {

    }
  };

  //
  const promises = images.map(async (image) => {
    (image as any).resPath = await processImage(image.src);
  });
  //
  await Promise.all(promises);
  //
  const newMarkdown = await readNoteMarkdown(userGuid, kbGuid, noteGuid);
  if (newMarkdown !== markdown) {
    // note changed
    return false;
  }
  //
  let resultMarkdown = markdown;
  images.forEach((image) => {
    //
    const resPath = (image  as any).resPath as string;
    if (!resPath) {
      return;
    }
    //
    const src = image.src;
    const reg = new RegExp(src.replace(/\\/g, '\\\\'), 'g');
    resultMarkdown = resultMarkdown.replace(reg, resPath);
  });
  //
  if (markdown === resultMarkdown) {
    // nothing replaced
    return false;
  }
  //
  await writeNoteMarkdown(userGuid, kbGuid, noteGuid, resultMarkdown);
  return true;
}

export {
  markdownToHtml,
  getMarkdownFromHtml,
  writeNoteHtml,
  writeNoteMarkdown,
  readNoteMarkdown,
  readNoteHtml,
  noteDataExists,
  getResourcesFromHtml,
  writeNoteResource,
  extractTagsFromMarkdown,
  extractLinksFromMarkdown,
  getMarkdownNoteTemplate,
  getGuideNoteData,
  extractNoteTitleAndAbstractFromText,
  processNoteResources,
};
