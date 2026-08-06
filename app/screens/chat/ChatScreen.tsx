import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getMessages, sendMessage, subscribeToMessages, Message } from '../../../lib/api/messages';
import { useAuth } from '../../context/AuthContext';
import IdentityToggle from '../../components/IdentityToggle';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatScreen() {
  const navigation  = useNavigation<any>();
  const route       = useRoute<any>();
  const { groupId, groupName, isDM } = route.params;
  const { profile } = useAuth();

  const [messages, setMessages]         = useState<Message[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [hasMore, setHasMore]           = useState(true);
  const [input, setInput]               = useState('');
  const [sending, setSending]           = useState(false);
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
    const unsubscribe = subscribeToMessages(groupId, (msg) => {
      setMessages(prev => [msg, ...prev]);
    });
    return () => unsubscribe();
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
    if (error || !data) {
      Alert.alert('Send Failed', error || 'Please try again later.');
    }
    setSending(false);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === profile?.id;
    const isPet = item.identity_mode === 'pet';

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        {!isMe && (
          item.author_avatar_url ? (
            <Image source={{ uri: item.author_avatar_url }} style={styles.msgAvatar} />
          ) : (
            <View style={[styles.msgAvatarFallback, { backgroundColor: isPet ? '#8B5CF6' : '#10B981' }]}>
              <Ionicons name={isPet ? 'paw' : 'person'} size={14} color="#fff" />
            </View>
          )
        )}
        <View style={[styles.msgBubble, isMe && styles.msgBubbleMe]}>
          {!isMe && (
            <Text style={[styles.msgAuthor, { color: isPet ? '#C084FC' : '#A1A1AA' }]}>
              {item.author_name ?? 'User'}
            </Text>
          )}
          <Text style={[styles.msgContent, isMe && styles.msgContentMe]}>{item.content}</Text>
          <Text style={[styles.msgTime, isMe && styles.msgTimeMe]}>{formatTime(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#C084FC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {groupName || 'Whisper'}
        </Text>
        {!isDM && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.navigate('GroupMembers', { groupId, groupName })}
          >
            <Ionicons name="people-outline" size={22} color="#C084FC" />
          </TouchableOpacity>
        )}
        {isDM && <View style={styles.backBtn} />}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#8B5CF6" /></View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          inverted
          renderItem={renderMessage}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#8B5CF6" style={{ padding: 16 }} /> : null}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputArea}>
          <IdentityToggle value={identityMode} onChange={setIdentityMode} />
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message..."
              placeholderTextColor="#71717A"
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={18} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0713' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#261E38',
    backgroundColor: '#13101E',
  },
  backBtn: { padding: 4, minWidth: 32 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#F3E8FF', textAlign: 'center', marginHorizontal: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },

  msgRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '80%', marginVertical: 4 },
  msgRowMe: { flexDirection: 'row-reverse', alignSelf: 'flex-end' },
  msgRowOther: { alignSelf: 'flex-start' },
  msgAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#261E38' },
  msgAvatarFallback: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  msgBubble: {
    maxWidth: '100%', backgroundColor: '#161024',
    borderRadius: 16, borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, gap: 4,
    borderWidth: 1.5, borderColor: '#261E38',
  },
  msgBubbleMe: {
    backgroundColor: '#8B5CF6',
    borderBottomLeftRadius: 16, borderBottomRightRadius: 4,
    borderColor: '#8B5CF6',
  },
  msgAuthor:  { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  msgContent: { fontSize: 14, color: '#F3E8FF', lineHeight: 20 },
  msgContentMe: { color: '#FFFFFF' },
  msgTime:    { fontSize: 10, color: '#A1A1AA', alignSelf: 'flex-end' },
  msgTimeMe:  { color: '#E9D5FF' },

  inputArea: {
    borderTopWidth: 1, borderTopColor: '#261E38',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, gap: 10,
    backgroundColor: '#13101E',
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  textInput: {
    flex: 1, backgroundColor: '#161024', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    color: '#FFFFFF', fontSize: 14, maxHeight: 100,
    borderWidth: 1.5, borderColor: '#261E38',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});