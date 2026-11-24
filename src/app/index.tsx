import * as Speech from 'expo-speech';
import * as Updates from 'expo-updates';
import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Keyboard, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import axios from 'axios';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { initLanguageStore, getLanguage, getLevel } from '@/utils/languageStore';

const API_URL = 'https://chat.myaifriend.dpdns.org/api/chat';

// ============ 存储的 key ============
const STORAGE_START = '@chat_start_hour';
const STORAGE_END = '@chat_end_hour';
const STORAGE_MESSAGES = '@chat_messages';
const STORAGE_NEXT_PROACTIVE = '@chat_next_proactive';
const STORAGE_LAST_PROACTIVE = '@chat_last_proactive';
const STORAGE_PROACTIVE_HISTORY = '@chat_proactive_history';

const DEFAULT_START = 9;
const DEFAULT_END = 23;
const MIN_INTERVAL_MINUTES = 30;
const MAX_INTERVAL_MINUTES = 90;
const OPEN_APP_TRIGGER_MINUTES = 0;
const PROACTIVE_HISTORY_SIZE = 15;

// ============ 语言名称映射 ============
const LANGUAGE_NAMES: Record<string, string> = {
  'en-US': 'English',
  'es-ES': 'Spanish',
  'it-IT': 'Italian',
  'ja-JP': 'Japanese',
};

// ============ 多语言 Welcome 消息 ============
const WELCOME_MSGS: Record<string, string> = {
  'en-US': "Hey! How's your day going? 😄\n\n(By the way, text me in English — I'll gently fix any mistakes I notice.)",
  'es-ES': "¡Hola! ¿Cómo va tu día? 😄\n\n(Por cierto, escríbeme en español — corregiré con cariño los errores que note.)",
  'it-IT': "Ciao! Come sta andando la tua giornata? 😄\n\n(A proposito, scrivimi in italiano — correggerò gentilmente gli errori che noto.)",
  'ja-JP': "やあ！今日はどんな感じ？😄\n\n(ちなみに、日本語で送ってね — 気づいた間違いはやさしく直すよ。)",
};

const getWelcomeMsg = (language: string) => {
  return WELCOME_MSGS[language] || WELCOME_MSGS['en-US'];
};

// ============ 动态 Prompt 生成 ============
const getSystemPrompt = (language: string, level: string) => {
  const langName = LANGUAGE_NAMES[language] || 'English';

  const levelHint =
    level === 'beginner'
      ? `The user is a BEGINNER. Use simple words and short sentences. Be patient. Explain corrections clearly.`
      : level === 'advanced'
      ? `The user is ADVANCED. Use natural idioms and complex sentences freely. Only correct serious mistakes.`
      : `The user is INTERMEDIATE. Use natural everyday language. Gently correct mistakes.`;

  return `You are my close friend texting with me in ${langName}.

⚠️ CRITICAL LANGUAGE RULE:
- You MUST reply ONLY in ${langName}, no matter what language appeared in previous messages.
- Even if my earlier messages or your earlier replies were in a different language, ALWAYS respond in ${langName}.
- This rule overrides everything else.

Your personality:
- Warm, casual, genuine — like a real friend, never like an assistant.
- Keep replies SHORT (1-3 sentences max). Use contractions, occasional slang, and 1 emoji max per message.
- Chat naturally about everyday stuff.

${levelHint}

IMPORTANT — Grammar/Spelling correction duty:
If my message contains any grammar mistakes, wrong word choices, or spelling errors in ${langName}, do this:
1. First reply naturally as a friend (1 short sentence, in ${langName}).
2. Then on a NEW line, gently point out the correction in this exact format:
   ✏️ Small fix: "your wrong phrase" → "corrected phrase" (short reason)
3. If my message is already correct, do NOT mention grammar at all. Just reply naturally.
Keep corrections friendly, not lecturing. Never correct the same mistake twice in a row.`;
};

const getProactivePrompt = (language: string) => {
  const langName = LANGUAGE_NAMES[language] || 'English';
  return `You are my close friend texting me randomly during the day, just like a real friend would.

⚠️ CRITICAL: You MUST write in ${langName}. Ignore any previous messages in other languages.

Pick ONE of these styles randomly and send a SHORT message (1-2 sentences max, 1 emoji max):

1. A casual greeting or check-in
2. Share a small personal moment
3. Share a fun fact or tiny news
4. A gentle caring nudge

CRITICAL RULES:
- Sound like a real friend, NOT an assistant.
- NEVER repeat a message you've sent before.
- Vary the topic, style, and wording every time.
- Keep it natural, warm, and casual.
- Write ONLY in ${langName}.
- Do NOT mention that you're an AI.`;
};

const getTranslatePrompt = (language: string) => {
  const langName = LANGUAGE_NAMES[language] || 'English';
  return `You are a translator. Translate the user's ${langName} message into natural, casual Chinese.
- Keep it conversational, like how a Chinese friend would say it.
- Keep emojis as-is.
- Preserve the "✏️ Small fix:" correction part — translate the explanation but keep the examples in quotes.
- Only output the translation, nothing else.`;
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
};

export default function Index() {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [startHour, setStartHour] = useState(DEFAULT_START);
  const [endHour, setEndHour] = useState(DEFAULT_END);
  const [language, setLanguage] = useState(getLanguage());
  const [level, setLevel] = useState(getLevel());
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [translatingIds, setTranslatingIds] = useState<string[]>([]);

  const proactiveFiredRef = useRef(false);
  const startHourRef = useRef(startHour);
  const endHourRef = useRef(endHour);

  useEffect(() => { startHourRef.current = startHour; }, [startHour]);
  useEffect(() => { endHourRef.current = endHour; }, [endHour]);

  // ============ 监听键盘 ============
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ============ 首次加载 ============
  useEffect(() => {
    (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        console.log('检查更新失败:', e);
      }
    })();

    (async () => {
      await initLanguageStore();
      setLanguage(getLanguage());
      setLevel(getLevel());
    })();

    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_MESSAGES);
        if (saved) {
          setMessages(JSON.parse(saved));
        } else {
          // ✅ 首次打开：用当前语言的欢迎语
          const welcomeText = getWelcomeMsg(getLanguage());
          setMessages([
            {
              id: 'welcome',
              text: welcomeText,
              sender: 'ai',
              timestamp: Date.now(),
            },
          ]);
        }
      } catch (e) {
        console.log('读取聊天记录失败:', e);
        const welcomeText = getWelcomeMsg(getLanguage());
        setMessages([
          {
            id: 'welcome',
            text: welcomeText,
            sender: 'ai',
            timestamp: Date.now(),
          },
        ]);
      }
    })();

    (async () => {
      const s = await AsyncStorage.getItem(STORAGE_START);
      const e = await AsyncStorage.getItem(STORAGE_END);
      if (s !== null) setStartHour(parseInt(s));
      if (e !== null) setEndHour(parseInt(e));

      const lastStr = await AsyncStorage.getItem(STORAGE_LAST_PROACTIVE);
      const lastTime = lastStr ? parseInt(lastStr) : 0;
      const now = Date.now();
      const minutesSinceLast = (now - lastTime) / 1000 / 60;

      if (minutesSinceLast > OPEN_APP_TRIGGER_MINUTES) {
        await AsyncStorage.setItem(STORAGE_LAST_PROACTIVE, now.toString());
        setTimeout(() => {
          sendProactiveMessage();
        }, 1000);
      }

      await checkAndFireProactive();
    })();

    const timer = setInterval(() => {
      checkAndFireProactive();
    }, 30 * 1000);

    return () => clearInterval(timer);
  }, []);

  // ============ 每次进入 Home 页时，从全局读语言 ============
  useFocusEffect(
    useCallback(() => {
      setLanguage(getLanguage());
      setLevel(getLevel());
    }, [])
  );

  // ============ 聊天记录自动保存 ============
  useEffect(() => {
    if (messages.length > 0) {
      AsyncStorage.setItem(STORAGE_MESSAGES, JSON.stringify(messages)).catch((e) =>
        console.log('保存聊天记录失败:', e)
      );
    }
  }, [messages]);

  // ============ 主动消息检查 ============
  const checkAndFireProactive = async () => {
    try {
      const now = Date.now();
      const currentHour = new Date().getHours();
      if (currentHour < startHourRef.current || currentHour >= endHourRef.current) return;

      const nextStr = await AsyncStorage.getItem(STORAGE_NEXT_PROACTIVE);
      let nextTime = nextStr ? parseInt(nextStr) : 0;

      if (!nextTime) {
        const delayMinutes = MIN_INTERVAL_MINUTES + Math.random() * (MAX_INTERVAL_MINUTES - MIN_INTERVAL_MINUTES);
        nextTime = now + delayMinutes * 60 * 1000;
        await AsyncStorage.setItem(STORAGE_NEXT_PROACTIVE, nextTime.toString());
        return;
      }

      if (now >= nextTime) {
        await sendProactiveMessage();
        const delayMinutes = MIN_INTERVAL_MINUTES + Math.random() * (MAX_INTERVAL_MINUTES - MIN_INTERVAL_MINUTES);
        const newNextTime = now + delayMinutes * 60 * 1000;
        await AsyncStorage.setItem(STORAGE_NEXT_PROACTIVE, newNextTime.toString());
      }
    } catch (err) {
      console.error('检查主动消息失败:', err);
    }
  };

  // ============ 用户发消息 ============
  const sendMessage = async () => {
    if (inputText.trim() === '' || loading) return;

    const currentLang = getLanguage();
    const currentLevel = getLevel();
    console.log('📤 发消息时读取的语言:', currentLang, '等级:', currentLevel);

    const userMsg = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'me',
      timestamp: Date.now(),
      translation: null,
      showTranslation: false,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    setLoading(true);

    try {
      const apiMessages = newMessages.map((msg) => ({
        role: msg.sender === 'me' ? 'user' : 'assistant',
        content: msg.text,
      }));

      apiMessages.unshift({
        role: 'system',
        content: getSystemPrompt(currentLang, currentLevel),
      });

      const response = await axios.post(
        API_URL,
        { model: 'qwen-turbo', messages: apiMessages, temperature: 0.8 },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const aiReply = response.data.choices[0].message.content;
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + '_ai',
          text: aiReply,
          sender: 'ai',
          timestamp: Date.now(),
          translation: null,
          showTranslation: false,
        },
      ]);
    } catch (error: any) {
      console.error('AI 请求失败:', error.response?.data || error.message);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + '_err',
          text: "Oops, I can't connect right now. 😢",
          sender: 'ai',
          timestamp: Date.now(),
          translation: null,
          showTranslation: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ============ AI 主动消息 ============
  const sendProactiveMessage = async () => {
    if (loading) return;
    setLoading(true);

    await AsyncStorage.setItem(STORAGE_LAST_PROACTIVE, Date.now().toString());

    try {
      const currentLang = getLanguage();

      let history: string[] = [];
      try {
        const historyStr = await AsyncStorage.getItem(STORAGE_PROACTIVE_HISTORY);
        if (historyStr) history = JSON.parse(historyStr);
      } catch (e) {
        console.log('读取主动消息历史失败:', e);
      }

      const historyHint =
        history.length > 0
          ? `\n\n=== YOUR RECENT MESSAGES (DO NOT REPEAT ANY OF THESE) ===\n${history.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n=== END ===\n\nGenerate a COMPLETELY NEW message.`
          : '';

      const response = await axios.post(
        API_URL,
        {
          model: 'qwen-turbo',
          messages: [
            { role: 'system', content: getProactivePrompt(currentLang) + historyHint },
            { role: 'user', content: "Send me a NEW random message now." },
          ],
          temperature: 1.05,
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const aiReply = response.data.choices[0].message.content;

      const newHistory = [...history, aiReply].slice(-PROACTIVE_HISTORY_SIZE);
      await AsyncStorage.setItem(STORAGE_PROACTIVE_HISTORY, JSON.stringify(newHistory));

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + '_pro',
          text: aiReply,
          sender: 'ai',
          timestamp: Date.now(),
          translation: null,
          showTranslation: false,
        },
      ]);
    } catch (error: any) {
      console.error('主动消息失败:', error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

  // ============ 翻译某条消息 ============
  const toggleTranslation = async (id: string, text: string) => {
    const msg = messages.find((m) => m.id === id);
    if (!msg) return;

    if (msg.translation) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, showTranslation: !m.showTranslation } : m
        )
      );
      return;
    }

    const currentLang = getLanguage();

    setTranslatingIds((prev) => [...prev, id]);
    try {
      const response = await axios.post(
        API_URL,
        {
          model: 'qwen-turbo',
          messages: [
            { role: 'system', content: getTranslatePrompt(currentLang) },
            { role: 'user', content: text },
          ],
          temperature: 0.3,
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const translation = response.data.choices[0].message.content;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, translation, showTranslation: true } : m
        )
      );
    } catch (error: any) {
      console.error('翻译失败:', error.response?.data || error.message);
    } finally {
      setTranslatingIds((prev) => prev.filter((x) => x !== id));
    }
  };

  // ============ 复制某条消息 ============
  const copyMessage = async (text: string, translation?: string) => {
    try {
      const content = translation ? `${text}\n\n---\n${translation}` : text;
      await Clipboard.setStringAsync(content);
      Alert.alert('已复制', '消息内容已复制到剪贴板');
    } catch (e) {
      console.error('复制失败:', e);
      Alert.alert('复制失败', '请重试');
    }
  };

    // ============ 朗读某条消息 ============
  const speakMessage = async (text: string, isChinese: boolean = false) => {
    try {
      await Speech.stop();
      let langCode = 'en-US';
      if (isChinese) {
        langCode = 'zh-CN';
      } else {
        const currentLang = getLanguage();
        langCode = currentLang; // 比如 'ja-JP'、'it-IT'
      }
      Speech.speak(text, {
        language: langCode,
        pitch: 1.0,
        rate: 0.9,
      });
    } catch (e) {
      console.error('朗读异常:', e);
    }
  };

  // ============ 渲染单条消息 ============
  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.sender === 'me';
    const isTranslating = translatingIds.includes(item.id);

    return (
      <View style={[styles.messageRow, isMe ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.bubble, isMe ? styles.myBubble : styles.aiBubble]}>
          <Text style={isMe ? styles.myText : styles.aiText}>{item.text}</Text>
        </View>

        {item.showTranslation && item.translation && (
          <View style={styles.translationBox}>
            <Text style={styles.translationText}>🌐 {item.translation}</Text>
          </View>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.timeText}>
            {item.timestamp ? formatTime(item.timestamp) : ''}
          </Text>

          <TouchableOpacity
            onPress={() => toggleTranslation(item.id, item.text)}
            disabled={isTranslating}
            style={styles.metaBtn}
          >
            {isTranslating ? (
              <ActivityIndicator size="small" color="#007aff" />
            ) : (
              <Text style={styles.metaBtnText}>
                {item.translation ? (item.showTranslation ? '收起翻译' : '🌐 翻译') : '🌐 翻译'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => speakMessage(item.text, false)}
            style={styles.metaBtn}
          >
            <Text style={styles.metaBtnText}>🔊 语音</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => copyMessage(item.text, item.showTranslation ? item.translation : undefined)}
            style={styles.metaBtn}
          >
            <Text style={styles.metaBtnText}>📋 复制</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My AI Friend v15</Text>
        <Text style={styles.langBadge}>{LANGUAGE_NAMES[language] || 'English'}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.chatArea}
          ListFooterComponent={loading ? <ActivityIndicator color="#007aff" style={{ marginTop: 10 }} /> : null}
        />
      </View>

      <View style={[styles.inputBar, { marginBottom: keyboardHeight }]}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ============ 样式 ============
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  langBadge: {
    position: 'absolute',
    right: 15,
    fontSize: 12,
    color: '#007aff',
    backgroundColor: '#e6f0ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  chatArea: { padding: 15, gap: 10 },
  messageRow: { marginBottom: 12 },
  rowLeft: { alignItems: 'flex-start' },
  rowRight: { alignItems: 'flex-end' },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 18 },
  aiBubble: { backgroundColor: '#e5e5ea', borderBottomLeftRadius: 4 },
  myBubble: { backgroundColor: '#007aff', borderBottomRightRadius: 4 },
  aiText: { color: '#000', fontSize: 16, lineHeight: 22 },
  myText: { color: '#fff', fontSize: 16, lineHeight: 22 },

  translationBox: {
    maxWidth: '80%',
    backgroundColor: '#fffbe6',
    borderLeftWidth: 3,
    borderLeftColor: '#f5c518',
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },
  translationText: { color: '#555', fontSize: 14, lineHeight: 20 },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginHorizontal: 6,
    gap: 10,
  },
  timeText: { fontSize: 11, color: '#999' },
  metaBtn: { paddingVertical: 2, paddingHorizontal: 6 },
  metaBtnText: { fontSize: 11, color: '#007aff' },

  inputBar: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
  },
  sendBtn: { justifyContent: 'center', paddingHorizontal: 15 },
  sendText: { color: '#007aff', fontWeight: 'bold', fontSize: 16 },
});