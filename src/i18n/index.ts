import i18next from 'i18next';
import en from './en.json';
import cn from './zh-cn.json';
import tw from './zh-tw.json';
import merge from 'lodash/merge';

import wizWrapper from '../wrapper';
const { app } = wizWrapper;

const sdkResources = {
  en: {
    translation: en,
  },
  'zh-CN': {
    translation: cn,
  },
  'zh-TW': {
    translation: tw,
  },
};

let currentLang = 'en';

async function i18nInit(resources: {[index: string]: string}) {
  const locale = app.getLocale();
  const currentLocale = locale;
  currentLang = resources[currentLocale] ? currentLocale : 'en';
  //
  await i18next.init({
    lng: currentLang,
    debug: false,
    resources: merge({}, sdkResources, resources) as any,
  });
}

function getCurrentLang(): string {
  return currentLang;
}

export {
  i18nInit,
  getCurrentLang,
};
