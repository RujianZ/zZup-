import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getMessages, sendMessage, subscribeToMessages, Message } from '../../../lib/api/messages';
import { useAuth } from '../../context/AuthContext';
import IdentityToggle from '../../components/IdentityToggle';
import Avatar from '../../components/ui/Avatar';
import { light, spacing, radius, typography } from '../../theme';

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { groupId, groupName, isDM } = route.params;
  const { profile } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [identityMode, setIdentityMode] = useState<'real' | 'pet'>('real');
  const flatListRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    const data = await getMessages(groupId, 30);
    setMessages(data);
    setHasMore(data.length === 30);
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
    const unsub = subscribeToMessages(groupId, (msg) => setMessages(prev => [msg, ...prev]));
    return () => unsub();
  }, [groupId, load]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[messages.length - 1].created_at;
    const data = await getMessages(groupId, 30, oldest);
    setMessages(prev => [...prev, ...data]);
    setHasMore(data.length === 30);
    setLoadingMore(false);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    const { data, error } = await sendMessage(groupId, text, identityMode);
    if (error || !data) Alert.alert('Send failed', error || 'Please try again later.');
    setSending(false);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === profile?.id;
    const isPet = item.identity_mode === 'pet';
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        {!isMe && <Avatar uri={item.author_avatar_url} name={item.author_name} size={30} />}
        <View style={{ maxWidth: '78%' }}>
          {!isMe && !isDM && (
            <Text style={styles.author}>{item.author_name ?? 'User'}{isPet ? ' 🐾' : ''}</Text>
          )}
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
            <Text style={[styles.content, isMe && styles.contentMe]}>{item.content}</Text>
          </View>
          <Text style={[styles.time, isMe && { textAlign: 'right' }]}>{formatTime(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="chevron-left" size={26} color={light.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{groupName || 'Chat'}</Text>
        {!isDM ? (
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('GroupMembers', { groupId, groupName })}>
            <Ionicons name="people-outline" size={22} color={light.text} />
          </TouchableOpacity>
        ) : <View style={styles.iconBtn} />}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={light.brand} /></View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          inverted
          renderItem={renderMessage}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={light.brand} style={{ padding: 16 }} /> : null}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputArea}>
          <IdentityToggle value={identityMode} onChange={setIdentityMode} />
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Message"
              placeholderTextColor={light.textTertiary}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || sending) && styles.sendDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="arrow-up" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: light.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, height: 52,
    borderBottomWidth: 1, borderBottomColor: light.border,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, ...typography.h3, color: light.text, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.base, paddingVertical: spacing.md },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginVertical: 5 },
  msgRowMe: { justifyContent: 'flex-end', alignSelf: 'flex-end' },
  msgRowOther: { alignSelf: 'flex-start' },
  author: { ...typography.micro, color: light.textSecondary, marginBottom: 3, marginLeft: spacing.sm },
  bubble: { borderRadius: 20, paddingHorizontal: spacing.base, paddingVertical: 10 },
  bubbleOther: { backgroundColor: light.surfaceHi, borderBottomLeftRadius: 6 },
  bubbleMe: { backgroundColor: light.brand, borderBottomRightRadius: 6 },
  content: { ...typography.body, color: light.text, lineHeight: 21 },
  contentMe: { color: light.white },
  time: { ...typography.micro, color: light.textTertiary, marginTop: 3, marginHorizontal: spacing.sm },

  inputArea: { borderTopWidth: 1, borderTopColor: light.border, paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  textInput: { flex: 1, backgroundColor: light.surfaceHi, borderRadius: 22, paddingHorizontal: spacing.base, paddingVertical: 11, ...typography.body, color: light.text, maxHeight: 110 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: light.brand, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.35 },
});
