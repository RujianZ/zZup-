import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import MarkdownDoc from '../../components/legal/MarkdownDoc';
import { LEGAL_DOCS, type LegalDocKey } from '../../../lib/legal/documents.generated';

/**
 * App 内的文书阅读器。**不跳浏览器，也不是 PDF。**
 *
 * 正文是打包进来的（lib/legal/documents.generated.ts，由 scripts/sync-legal.mjs
 * 从网站仓库的正本生成），所以离线也能读，而且「用户同意的那份文字」跟这个
 * 构建绑死 —— 出纠纷时能精确回答他当时看到的是哪一版。
 *
 * 模态呈现，右上角 ✕；安卓实体返回键和下滑手势也能关。
 */
export default function LegalDocScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors: c } = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);

  const key: LegalDocKey = route.params?.doc ?? 'terms';
  const doc = LEGAL_DOCS[key];

  return (
    <View style={s.root}>
      <StatusBar style={c.statusBarStyle} />
      <SafeAreaView style={s.flex} edges={['top', 'bottom']}>
        <View style={s.header}>
          <View style={s.flex}>
            <Text style={s.title} numberOfLines={1}>{doc.title}</Text>
            <Text style={s.meta}>VERSION {doc.version} · {doc.updated}</Text>
          </View>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            style={({ pressed }) => [s.close, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="close" size={20} color={c.subText} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator
        >
          <MarkdownDoc
            body={doc.body}
            // 文书之间互相引用时在 App 内继续往上叠，而不是把人踢去浏览器
            onInternalLink={(next) => navigation.push('LegalDoc', { doc: next })}
          />
          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 6,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.headerBg,
    },
    title: { fontSize: 17, fontWeight: '700', color: c.text, letterSpacing: -0.2 },
    meta: { fontSize: 11, color: c.tertiaryText, letterSpacing: 0.6, marginTop: 3 },
    close: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: c.cardMutedBg,
      alignItems: 'center', justifyContent: 'center',
    },
    scroll: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },
  });
