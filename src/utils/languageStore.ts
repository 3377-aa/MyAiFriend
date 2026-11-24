// ============ 全局语言存储（内存 + 持久化） ============
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_LANGUAGE = '@chat_language';
const STORAGE_LEVEL = '@chat_level';

let currentLanguage = 'en-US';
let currentLevel = 'intermediate';
let initialized = false;

// 启动时从 AsyncStorage 载入一次
export const initLanguageStore = async () => {
  if (initialized) return;
  try {
    const lang = await AsyncStorage.getItem(STORAGE_LANGUAGE);
    const lv = await AsyncStorage.getItem(STORAGE_LEVEL);
    if (lang !== null) currentLanguage = lang;
    if (lv !== null) currentLevel = lv;
  } catch (e) {
    console.log('初始化语言存储失败:', e);
  }
  initialized = true;
};

// 同步读取（不 await，直接拿最新值）
export const getLanguage = () => currentLanguage;
export const getLevel = () => currentLevel;

// 设置语言（内存 + 存储都更新）
export const setLanguageGlobal = async (lang: string) => {
  currentLanguage = lang;
  try {
    await AsyncStorage.setItem(STORAGE_LANGUAGE, lang);
  } catch (e) {
    console.log('保存语言失败:', e);
  }
};

export const setLevelGlobal = async (lv: string) => {
  currentLevel = lv;
  try {
    await AsyncStorage.setItem(STORAGE_LEVEL, lv);
  } catch (e) {
    console.log('保存等级失败:', e);
  }
};