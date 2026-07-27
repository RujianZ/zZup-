import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co'
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key'

// Set to true to bypass connection to offline local/remote Supabase backend
export const USE_MOCK = false;

const realSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// --- MOCK SUPABASE IMPLEMENTATION ---

const MOCK_USER = {
  id: 'mock-uid',
  email: 'mock-user@gmail.com',
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  role: 'authenticated'
}

const MOCK_SESSION = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: MOCK_USER
}

const MOCK_PROFILE_DEFAULT = {
  id: 'mock-uid',
  zzup_id: 'test_owner',
  real_name: 'Test Owner',
  bio: 'This is a mock bio',
  avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120',
  qr_code_url: null,
  date_of_birth: '1995-01-01',
  nationality: 'CN',
  region: 'Beijing',
  university: 'zZuP University',
  personal_email: 'test@gmail.com',
  personal_email_verified: true,
  edu_email: 'test@zzup.edu',
  edu_verified: true,
  pet_name: 'Coco',
  pet_avatar_url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=120',
  pet_bio: 'Woof woof!',
  pet_breed: 'Golden Retriever',
  pet_level: 5,
  pet_xp: 450,
  profile_visibility: 'real_with_pet',
  show_date_of_birth: true,
  show_nationality: true,
  show_qr_code: true,
  created_at: new Date().toISOString()
}

const MOCK_FRIENDS = [
  {
    id: 'user-monica',
    zzup_id: 'monica_xu',
    real_name: 'Monica Xu',
    pet_name: 'Coco',
    avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120',
    pet_avatar_url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=120',
    profile_visibility: 'real_with_pet',
    university: 'zZuP University'
  },
  {
    id: 'user-alex',
    zzup_id: 'alex_gan',
    real_name: 'Alex_Gan',
    pet_name: 'Neko',
    avatar_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=120',
    pet_avatar_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=120',
    profile_visibility: 'real_with_pet',
    university: 'zZuP University'
  },
  {
    id: 'user-haowen',
    zzup_id: 'haowen',
    real_name: 'Haowen',
    pet_name: 'Panda',
    avatar_url: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=120',
    pet_avatar_url: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=120',
    profile_visibility: 'real_with_pet',
    university: 'zZuP University'
  }
]

async function getStoredProfile() {
  try {
    const val = await AsyncStorage.getItem('zzup_mock_profile');
    if (val) return JSON.parse(val);
  } catch {}
  return { ...MOCK_PROFILE_DEFAULT };
}

async function setStoredProfile(profile: any) {
  try {
    await AsyncStorage.setItem('zzup_mock_profile', JSON.stringify(profile));
  } catch {}
}

const MOCK_CONVERSATIONS_DEFAULT = [
  {
    conversation_id: 'zzuper-talk-id',
    kind: 'zzuper_talk',
    is_temporary: false,
    expires_at: null,
    status: 'active',
    my_identity: 'real',
    peer_id: 'mock-uid',
    display_name: 'My zZuPer',
    display_avatar: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=120',
    members_count: 2,
    last_message: 'Hi! Let\'s go for a walk today! 🐾',
    last_message_at: new Date(Date.now() - 3600 * 1000).toISOString()
  },
  {
    conversation_id: 'dm-alex-gan',
    kind: 'dm',
    is_temporary: false,
    expires_at: null,
    status: 'active',
    my_identity: 'real',
    peer_id: 'user-alex',
    display_name: 'Alex_Gan',
    display_avatar: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=120',
    members_count: 2,
    last_message: 'Hey, I am at the East Tennis Court.',
    last_message_at: new Date(Date.now() - 7200 * 1000).toISOString()
  },
  {
    conversation_id: 'group-zzup',
    kind: 'group',
    is_temporary: false,
    expires_at: null,
    status: 'active',
    my_identity: 'real',
    peer_id: null,
    display_name: 'zZuP! Tennis Club',
    display_avatar: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=120',
    members_count: 8,
    last_message: 'Monica: Who is joining the tournament tomorrow?',
    last_message_at: new Date(Date.now() - 86400 * 1000).toISOString()
  }
];

async function getStoredConversations() {
  try {
    const val = await AsyncStorage.getItem('zzup_mock_conversations');
    if (val) return JSON.parse(val);
  } catch {}
  return [...MOCK_CONVERSATIONS_DEFAULT];
}

async function setStoredConversations(conversations: any) {
  try {
    await AsyncStorage.setItem('zzup_mock_conversations', JSON.stringify(conversations));
  } catch {}
}

class MockAuth {
  private listeners: Set<(event: string, session: any) => void> = new Set();
  private isLoggedIn = false;
  private isInitialized = false;

  private async ensureInitialized() {
    if (this.isInitialized) return;
    try {
      const val = await AsyncStorage.getItem('zzup_mock_logged_in');
      this.isLoggedIn = val === 'true';
    } catch {
      this.isLoggedIn = false;
    }
    this.isInitialized = true;
  }

  private triggerListeners(event: string, session: any) {
    this.listeners.forEach(cb => {
      try {
        cb(event, session);
      } catch (e) {
        console.error('Error in auth listener:', e);
      }
    });
  }

  async signUp({ email, password }: any) {
    await this.ensureInitialized();
    this.isLoggedIn = true;
    await AsyncStorage.setItem('zzup_mock_logged_in', 'true');
    
    // Create new empty profile for onboarding
    const newProfile = {
      ...MOCK_PROFILE_DEFAULT,
      personal_email: email,
      real_name: null, // Null triggers onboarding
      zzup_id: email.split('@')[0],
      pet_name: null,
      university: null,
    };
    await setStoredProfile(newProfile);

    const user = { ...MOCK_USER, email };
    const session = { ...MOCK_SESSION, user };
    this.triggerListeners('SIGNED_IN', session);
    return { data: { user, session }, error: null };
  }

  async signInWithPassword({ email, password }: any) {
    await this.ensureInitialized();
    this.isLoggedIn = true;
    await AsyncStorage.setItem('zzup_mock_logged_in', 'true');

    // Restore standard test profile if it doesn't exist or is empty
    const stored = await getStoredProfile();
    if (!stored || !stored.real_name) {
      await setStoredProfile({ ...MOCK_PROFILE_DEFAULT, personal_email: email });
    }

    const user = { ...MOCK_USER, email };
    const session = { ...MOCK_SESSION, user };
    this.triggerListeners('SIGNED_IN', session);
    return { data: { user, session }, error: null };
  }

  async signOut() {
    await this.ensureInitialized();
    this.isLoggedIn = false;
    await AsyncStorage.removeItem('zzup_mock_logged_in');
    this.triggerListeners('SIGNED_OUT', null);
    return { error: null };
  }

  async getSession() {
    await this.ensureInitialized();
    return { data: { session: this.isLoggedIn ? MOCK_SESSION : null }, error: null };
  }

  async getUser() {
    await this.ensureInitialized();
    return { data: { user: this.isLoggedIn ? MOCK_USER : null }, error: null };
  }

  onAuthStateChange(callback: (event: string, session: any) => void) {
    this.listeners.add(callback);
    // Fire immediately with initial state
    this.getSession().then(({ data: { session } }) => {
      callback('INITIAL_SESSION', session);
    });
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners.delete(callback);
          }
        }
      }
    };
  }
}

class MockQueryBuilder {
  private tableName: string;
  private updateFields: any = null;
  private insertFields: any = null;
  private filters: Record<string, any> = {};

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select() { return this; }
  insert(fields?: any) {
    this.insertFields = fields;
    return this;
  }
  update(fields: any) {
    this.updateFields = fields;
    return this;
  }
  delete() { return this; }
  upsert() { return this; }
  eq(column: string, value: any) {
    this.filters[column] = value;
    return this;
  }
  neq() { return this; }
  lt() { return this; }
  lte() { return this; }
  gt() { return this; }
  gte() { return this; }
  order() { return this; }
  limit() { return this; }
  single() { return this; }
  maybeSingle() { return this; }
  not() { return this; }
  in() { return this; }
  or() { return this; }

  // Support thenable interface to work with await
  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any): Promise<any> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    let data: any = null;
    let error: any = null;

    if (this.tableName === 'profiles') {
      if (this.updateFields) {
        const current = await getStoredProfile();
        const updated = { ...current, ...this.updateFields };
        await setStoredProfile(updated);
        data = updated;
      } else {
        data = await getStoredProfile();
      }
    } else {
      switch (this.tableName) {
        case 'explorations':
          data = {
            active_title: 'Novice Explorer',
            titles_earned: ['Novice Explorer', 'Pet Lover']
          };
          break;
        case 'friendships':
          data = [
            {
              id: 'friendship-1',
              status: 'accepted',
              requester_id: 'mock-uid',
              addressee_id: 'user-monica',
              requester: MOCK_PROFILE_DEFAULT,
              addressee: MOCK_FRIENDS[0]
            },
            {
              id: 'friendship-2',
              status: 'accepted',
              requester_id: 'user-alex',
              addressee_id: 'mock-uid',
              requester: MOCK_FRIENDS[1],
              addressee: MOCK_PROFILE_DEFAULT
            },
            {
              id: 'friendship-3',
              status: 'accepted',
              requester_id: 'mock-uid',
              addressee_id: 'user-haowen',
              requester: MOCK_PROFILE_DEFAULT,
              addressee: MOCK_FRIENDS[2]
            }
          ];
          break;
        case 'messages':
          {
            const storedVal = await AsyncStorage.getItem('zzup_mock_messages');
            let msgs = storedVal ? JSON.parse(storedVal) : [
              {
                id: 'msg-1',
                conversation_id: 'zzuper-talk-id',
                sender_id: 'system',
                identity_mode: 'pet',
                content: 'Looks great!',
                image_url: null,
                created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
                profiles: {
                  real_name: 'Coco',
                  pet_name: 'Coco',
                  avatar_url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=120',
                  pet_avatar_url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=120'
                }
              },
              {
                id: 'msg-2',
                conversation_id: 'dm-alex-gan',
                sender_id: 'user-alex',
                identity_mode: 'real',
                content: "You're now friends!",
                image_url: null,
                created_at: new Date(Date.now() - 600 * 1000).toISOString(),
                profiles: {
                  real_name: 'Alex_Gan',
                  pet_name: 'Neko',
                  avatar_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=120',
                  pet_avatar_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=120'
                }
              }
            ];

            if (this.insertFields) {
              const profile = await getStoredProfile();
              const newMsg = {
                id: 'msg-' + Date.now(),
                conversation_id: this.insertFields.conversation_id || 'dm-alex-gan',
                sender_id: 'mock-uid',
                identity_mode: this.insertFields.identity_mode || 'real',
                content: this.insertFields.content,
                image_url: this.insertFields.image_url || null,
                created_at: new Date().toISOString(),
                profiles: {
                  real_name: profile.real_name,
                  pet_name: profile.pet_name,
                  avatar_url: profile.avatar_url,
                  pet_avatar_url: profile.pet_avatar_url
                }
              };
              msgs.push(newMsg);
              await AsyncStorage.setItem('zzup_mock_messages', JSON.stringify(msgs));
              data = newMsg;
            } else {
              let filtered = msgs;
              if (this.filters.conversation_id) {
                filtered = msgs.filter((m: any) => m.conversation_id === this.filters.conversation_id);
              }
              if (filtered.length === 0 && this.filters.conversation_id === 'dm-haowen') {
                filtered = [
                  {
                    id: 'msg-haowen-welcome',
                    conversation_id: 'dm-haowen',
                    sender_id: 'user-haowen',
                    identity_mode: 'real',
                    content: 'Hey there! How is it going?',
                    created_at: new Date(Date.now() - 600 * 1000).toISOString(),
                    profiles: {
                      real_name: 'Haowen',
                      pet_name: 'Panda',
                      avatar_url: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=120',
                      pet_avatar_url: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=120'
                    }
                  }
                ];
              }
              data = filtered;
            }
          }
          break;
        case 'travel_posts':
          if (this.updateFields) {
            if (this.updateFields.status === 'returned') {
              await AsyncStorage.removeItem('zzup_mock_active_post');
              data = null;
            } else {
              const storedVal = await AsyncStorage.getItem('zzup_mock_active_post');
              if (storedVal) {
                const currentPost = JSON.parse(storedVal);
                const updatedPost = { ...currentPost, ...this.updateFields };
                await AsyncStorage.setItem('zzup_mock_active_post', JSON.stringify(updatedPost));
                data = updatedPost;
              } else {
                data = null;
              }
            }
          } else {
            const storedVal = await AsyncStorage.getItem('zzup_mock_active_post');
            data = storedVal ? JSON.parse(storedVal) : null;
          }
          break;
        case 'travel_comments':
          data = [
            {
              id: 'comment-mock-1',
              travel_post_id: 'post-mock-1',
              author_id: 'user-alex',
              content: 'Hey Coco, let\'s play tennis next Friday!',
              created_at: new Date(Date.now() - 1800 * 1000).toISOString(),
              profiles: {
                real_name: 'Alex_Gan',
                pet_name: 'Neko',
                avatar_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=120',
                pet_avatar_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=120'
              }
            }
          ];
          break;
        case 'conversations':
        case 'groups':
          if (this.insertFields) {
            const newGroup = {
              id: 'dm-' + Date.now(),
              kind: this.insertFields.kind || 'petchat',
              chat_type: 'direct',
              group_type: 'direct',
              is_searchable: false,
              created_by: 'mock-uid',
              members_count: 2,
              is_temporary: true,
              expires_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
              is_agent_chat: true,
              description: 'Temporary Direct Message',
              ...this.insertFields
            };
            data = newGroup;
          } else {
            data = {
              id: 'dm-alex-gan',
              name: 'Telepathy Chat',
              kind: 'petchat',
              chat_type: 'direct',
              group_type: 'direct',
              is_temporary: true,
              expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
              is_agent_chat: true,
              description: 'Matched Fellow'
            };
          }
          break;
        case 'conversation_members':
        case 'group_members':
          if (this.insertFields) {
            data = this.insertFields;
          } else {
            data = [
              { user_id: 'mock-uid', account_id: 'mock-uid' },
              { user_id: 'user-alex', account_id: 'user-alex' }
            ];
          }
          break;
        default:
          data = null; // Return null instead of [] for mock single queries to prevent truthy invalid objects
      }
    }

    return { data, error };
  }
}

class MockChannel {
  on(event: string, filter: any, callback: (payload: any) => void) {
    return this;
  }
  subscribe() {
    return this;
  }
}

const mockAuthInstance = new MockAuth();

class MockSupabaseClient {
  auth = mockAuthInstance;

  from(tableName: string) {
    return new MockQueryBuilder(tableName);
  }

  rpc(functionName: string, args?: any) {
    if (functionName === 'reply_to_travel_comment') {
      return { data: 'dm-alex-gan', error: null };
    }
    if (functionName === 'get_my_profile') {
      return (async () => {
        const profile = await getStoredProfile();
        return { data: profile, error: null };
      })();
    }
    if (functionName === 'get_other_profile') {
      const found = MOCK_FRIENDS.find(f => f.id === args?.target_id);
      return { data: found || null, error: null };
    }
    if (functionName === 'list_conversations') {
      return (async () => {
        const conversations = await getStoredConversations();
        return { data: conversations, error: null };
      })();
    }
    if (functionName === 'create_group') {
      const pName = args?.p_name || 'New Pack';
      return (async () => {
        const id = 'group-mock-' + Date.now();
        const conversations = await getStoredConversations();
        const newGroup = {
          conversation_id: id,
          kind: 'group',
          is_temporary: false,
          expires_at: null,
          status: 'active',
          my_identity: 'real',
          peer_id: null,
          display_name: pName,
          display_avatar: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=120',
          members_count: 3,
          last_message: 'Group created. Chat is ready!',
          last_message_at: new Date().toISOString()
        };
        conversations.unshift(newGroup);
        await setStoredConversations(conversations);
        return { data: id, error: null };
      })();
    }
    return { data: null, error: null };
  }

  channel(name: string) {
    return new MockChannel();
  }

  removeChannel(channel: any) {
    // No-op
  }

  functions = {
    invoke: async (functionName: string, options?: any) => {
      if (functionName === 'travel-mode') {
        const action = options?.body?.action;
        if (action === 'create') {
          const newPost = {
            id: 'post-mock-' + Date.now(),
            user_id: 'mock-uid',
            content: options.body.content,
            image_url: options.body.image_url || null,
            audio_url: null,
            started_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
            view_count: 5,
            status: 'traveling'
          };
          await AsyncStorage.setItem('zzup_mock_active_post', JSON.stringify(newPost));
          return { data: { post: newPost }, error: null };
        } else if (action === 'match') {
          const posts = [
            {
              id: 'post-roamer-1',
              user_id: 'user-alex',
              content: 'Just finished playing tennis at the East Courts! Anyone up for a match tomorrow?',
              image_url: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=300',
              audio_url: null,
              started_at: new Date().toISOString(),
              ends_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
              view_count: 12,
              status: 'traveling',
              author_profile: {
                id: 'user-alex',
                real_name: 'Alex_Gan',
                pet_name: 'Neko',
                pet_breed: 'Husky',
                avatar_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=120',
                pet_avatar_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=120',
                university: 'zZuP University'
              }
            },
            {
              id: 'post-roamer-2',
              user_id: 'user-haowen',
              content: 'Studying in the Main Library room 402. So quiet here.',
              image_url: null,
              audio_url: null,
              started_at: new Date().toISOString(),
              ends_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
              view_count: 4,
              status: 'traveling',
              author_profile: {
                id: 'user-haowen',
                real_name: 'Haowen',
                pet_name: 'Panda',
                pet_breed: 'Pug',
                avatar_url: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=120',
                pet_avatar_url: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=120',
                university: 'zZuP University'
              }
            }
          ];
          return { data: { posts }, error: null };
        }
      } else if (functionName === 'agent-chat') {
        const action = options?.body?.action;
        if (action === 'join_match') {
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                data: {
                  status: 'matched',
                  groupId: 'dm-alex-gan'
                },
                error: null
              });
            }, 1000);
          });
        } else if (action === 'cancel_match') {
          return { data: { success: true }, error: null };
        }
      }
      return { data: null, error: null };
    }
  };
}

export const supabase = (USE_MOCK ? new MockSupabaseClient() : realSupabase) as unknown as SupabaseClient;
