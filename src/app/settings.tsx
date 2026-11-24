import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initLanguageStore, getLanguage, getLevel, setLanguageGlobal, setLevelGlobal } from '@/utils/languageStore';

// ============ 存储的 key（和 index.tsx 共用） ============
const STORAGE_START = '@chat_start_hour';
const STORAGE_END = '@chat_end_hour';
const STORAGE_MESSAGES = '@chat_messages';
const STORAGE_PROACTIVE_HISTORY = '@chat_proactive_history';


const DEFAULT_START = 9;
const DEFAULT_END = 23;
const DEFAULT_LANGUAGE = 'en-US';
const DEFAULT_LEVEL = 'intermediate';

// 可选语言
const LANGUAGES = [
    { code: 'en-US', label: '🇺🇸 English' },
    { code: 'es-ES', label: '🇪🇸 Español (Spanish)' },
    { code: 'it-IT', label: '🇮🇹 Italiano (Italian)' },
    { code: 'ja-JP', label: '🇯🇵 日本語 (Japanese)' },
  ];

// 英语水平
const LEVELS = [
  { code: 'beginner', label: '🌱 Beginner（初级）' },
  { code: 'intermediate', label: '🌿 Intermediate（中级）' },
  { code: 'advanced', label: '🌳 Advanced（高级）' },
];

export default function Settings() {
  const [startHour, setStartHour] = useState(DEFAULT_START);
  const [endHour, setEndHour] = useState(DEFAULT_END);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [level, setLevel] = useState(DEFAULT_LEVEL);

  // ============ 加载已保存的设置 ============
  useEffect(() => {
    (async () => {
      await initLanguageStore();
      const s = await AsyncStorage.getItem(STORAGE_START);
      const e = await AsyncStorage.getItem(STORAGE_END);
      if (s !== null) setStartHour(parseInt(s));
      if (e !== null) setEndHour(parseInt(e));
      setLanguage(getLanguage());
      setLevel(getLevel());
    })();
  }, []);

  // ============ 保存时间设置 ============
  const saveTimeSettings = async () => {
    if (startHour >= endHour) {
      Alert.alert('错误', '开始时间必须小于结束时间');
      return;
    }
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
      Alert.alert('错误', '时间必须在 0-23 之间');
      return;
    }
    await AsyncStorage.setItem(STORAGE_START, startHour.toString());
    await AsyncStorage.setItem(STORAGE_END, endHour.toString());
    Alert.alert('已保存', '主动消息时间段已更新');
  };

  // ============ 保存语言 ============
  const saveLanguage = async (code: string) => {
    console.log('📥 用户选择语言:', code); // ← 加这行
    setLanguage(code);
    await setLanguageGlobal(code);
    console.log('✅ 已保存，全局变量现在是:', getLanguage()); // ← 加这行
  };

  const saveLevel = async (code: string) => {
    setLevel(code);
    await setLevelGlobal(code);
  };

  // ============ 清空聊天记录 ============
  const clearMessages = async () => {
    Alert.alert(
      '确认清空',
      '确定要清空所有聊天记录吗？此操作不可恢复。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(STORAGE_MESSAGES);
            await AsyncStorage.removeItem(STORAGE_PROACTIVE_HISTORY);
            Alert.alert('已清空', '聊天记录已全部删除');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 顶部标题 */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>⚙️ Settings</Text>
        </View>

        {/* ============ 语言选择 ============ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌐 Language（交流语言）</Text>
          <Text style={styles.sectionHint}>选择你和 AI 朋友交流的主要语言</Text>

          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.optionRow,
                language === lang.code && styles.optionRowActive,
              ]}
              onPress={() => saveLanguage(lang.code)}
            >
              <Text style={styles.optionLabel}>{lang.label}</Text>
              {language === lang.code && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* ============ 英语水平 ============ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📚 English Level（英语水平）</Text>
          <Text style={styles.sectionHint}>AI 会根据你的水平调整措辞和纠错力度</Text>

          {LEVELS.map((lv) => (
            <TouchableOpacity
              key={lv.code}
              style={[
                styles.optionRow,
                level === lv.code && styles.optionRowActive,
              ]}
              onPress={() => saveLevel(lv.code)}
            >
              <Text style={styles.optionLabel}>{lv.label}</Text>
              {level === lv.code && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* ============ 主动消息时间 ============ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⏰ Active Hours（活跃时段）</Text>
          <Text style={styles.sectionHint}>
            AI 只在这个时间段内主动找你聊天（每 30~90 分钟一次）
          </Text>

          <View style={styles.inputRow}>
            <Text style={styles.label}>起始小时（0-23）：</Text>
            <TextInput
              style={styles.numInput}
              keyboardType="number-pad"
              value={startHour.toString()}
              onChangeText={(t) => setStartHour(parseInt(t) || 0)}
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.label}>结束小时（0-23）：</Text>
            <TextInput
              style={styles.numInput}
              keyboardType="number-pad"
              value={endHour.toString()}
              onChangeText={(t) => setEndHour(parseInt(t) || 0)}
            />
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={saveTimeSettings}>
            <Text style={styles.primaryBtnText}>保存时间设置</Text>
          </TouchableOpacity>
        </View>

        {/* ============ 危险操作 ============ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🗑️ Danger Zone</Text>

          <TouchableOpacity style={styles.dangerBtn} onPress={clearMessages}>
            <Text style={styles.dangerBtnText}>清空所有聊天记录</Text>
          </TouchableOpacity>
        </View>

        {/* 版本信息 */}
        <Text style={styles.versionText}>My AI Friend v12</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { padding: 15, paddingBottom: 40 },
  header: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold' },

  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  sectionHint: { fontSize: 12, color: '#888', marginBottom: 12, lineHeight: 16 },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#f9f9f9',
  },
  optionRowActive: {
    backgroundColor: '#e6f0ff',
    borderWidth: 1,
    borderColor: '#007aff',
  },
  optionLabel: { fontSize: 15, color: '#333' },
  checkmark: { fontSize: 18, color: '#007aff', fontWeight: 'bold' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: { fontSize: 14, color: '#333', flex: 1 },
  numInput: {
    width: 70,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 8,
    textAlign: 'center',
    fontSize: 16,
  },

  primaryBtn: {
    backgroundColor: '#007aff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  dangerBtn: {
    backgroundColor: '#ffeeee',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffcccc',
  },
  dangerBtnText: { color: '#d00', fontWeight: '600', fontSize: 15 },

  versionText: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 12,
    marginTop: 20,
  },
});