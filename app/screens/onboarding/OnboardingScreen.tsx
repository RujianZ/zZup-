import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Pressable,
} from 'react-native';
// react-native 自带的 SafeAreaView 在 Android 上不生效，必须用 safe-area-context 的
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { updateProfile } from '../../../lib/api/auth';
import { useAuth } from '../../context/AuthContext';
import { PetSvgAvatar } from '../../../assets/pets';
import { AvatarHost, starterConfigFor } from '../../../assets/avatar';
import { light, spacing, radius, typography, lightShadow } from '../../theme';

const OFFICIAL_PET_BREEDS = [
  { key: 'cat', name: 'Cat', mbti: 'ISFP', desc: 'Tsundere & elegant' },
  { key: 'dog', name: 'Dog', mbti: 'ENFP', desc: 'Sunny & playful' },
  { key: 'bear', name: 'Healing Bear', mbti: 'ISFJ', desc: 'Warm & cuddly' },
  { key: 'snake', name: 'Mystical Snake', mbti: 'INFJ', desc: 'Mysterious & deep' },
  { key: 'monkey', name: 'Trendy Monkey', mbti: 'ESTP', desc: 'Quirky & witty' },
  { key: 'mobius', name: 'Mobius Loop', mbti: 'INTJ', desc: 'Futuristic geek' },
  { key: 'sloth', name: 'Sleepy Sloth', mbti: 'ISTP', desc: 'Chill & zen' },
  { key: 'disco_ball', name: 'Disco Ball', mbti: 'ESFP', desc: 'Party maker' },
  { key: 'alien', name: 'Quirky Alien', mbti: 'ENTP', desc: 'Roast master' },
  { key: 'time_lord', name: 'Time Lord', mbti: 'ENTJ', desc: 'Perfectionist' },
];

// 身体底板。这里曾经是 6 张 Unsplash 的真人照片，还按人种起了名
// （'Asian Female' / 'African Male' …）—— 既是拿别人的脸当新用户的默认身份，
// 又是逼人在注册第一步给自己贴人种标签。两件事都不该做。
//
// 现在就是这 12 张自家美术图，不排序不分组不写字，自己看着选。
// 键的顺序 = 界面顺序，故意深浅交错，不让任何一档排在最前面当"默认"。
const BODY_OPTIONS = [
  'body_female_asian_light', 'body_male_asian_light',
  'body_female_black_dark',  'body_male_black_dark',
  'body_female_white_light', 'body_male_white_light',
  'body_female_asian_dark',  'body_male_asian_dark',
  'body_female_black_light', 'body_male_black_light',
  'body_female_white_dark',  'body_male_white_dark',
];

/**
 * 美东「今天」。年龄一律按美东算，不跟随设备时区 —— 运营范围只有美国，
 * 而且设备时区可以随手改，跟着走等于给了一个绕过门槛的旋钮。
 *
 * 权威判定在数据库触发器（迁移 75），这里只是让用户选不出未成年的日期。
 */
function easternToday(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  return new Date(get('year'), get('month') - 1, get('day'));
}

/** 满 18 岁所允许的最晚生日（含当天）。*/
function latestAllowedBirthday(): Date {
  const t = easternToday();
  return new Date(t.getFullYear() - 18, t.getMonth(), t.getDate());
}

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const { session, refreshProfile } = useAuth();
  const user = session?.user;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const isEduVerified = user?.email?.toLowerCase().endsWith('.edu') ?? false;

  const [realName, setRealName] = useState('');
  // null = 还没选。默认值故意设成「刚好满 18 岁」那天，
  // 这样 18 岁用户一下就能确认，年长的往回滚即可。
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [nationality, setNationality] = useState('');
  const [selectedBody, setSelectedBody] = useState<string | null>(null);
  const [petName, setPetName] = useState('');
  const [selectedBreed, setSelectedBreed] = useState<string>('dog');
  const [petAvatarUrl] = useState<string | null>(null);

  const handleStep1 = () => {
    if (!realName.trim()) { Alert.alert('Required', 'Please enter your real name.'); return; }
    if (!birthday) { Alert.alert('Required', 'Please select your date of birth.'); return; }
    if (!selectedBody) { Alert.alert('Required', 'Please pick how you look.'); return; }
    setStep(2);
  };

  // 原本还有第 3 步「How you show up」，选 real_only / real_with_pet / pet_only。
  // 该设定（profile_visibility）已在迁移 74 里整体废弃 —— 它让用户「藏真身」的代价是
  // 「公开宠物」，而宠物正是匿名发言时用的身份，自相矛盾。现在宠物一律上主页，
  // 匿名保护改由 get_pet_identity 的裸形态承担。引导因此从 3 步缩到 2 步。
  const handleFinish = async () => {
    if (!petName.trim()) { Alert.alert('Required', "Please enter your pet's name."); return; }
    // 第一步已经拦过了，这里是兜底：没有身体就没有 avatar_url，宁可退回去重选
    if (!selectedBody) { setStep(1); return; }
    setLoading(true);
    const { error } = await updateProfile({
      real_name: realName.trim(),
      date_of_birth: birthday ? fmtDate(birthday) : undefined,
      nationality: nationality.trim() || undefined,
      // 存完整一套而不是只存 body：这是这个人的长相，以后改起手装
      // 不该把已有用户的衣服一起换掉。
      avatar_url: JSON.stringify(starterConfigFor(selectedBody)),
      pet_name: petName.trim(),
      pet_breed: selectedBreed,
      pet_avatar_url: petAvatarUrl || undefined,
      onboarded: true,
    });
    setLoading(false);
    if (error) { Alert.alert('Save failed', error); return; }
    await refreshProfile();
  };

  const Progress = ({ n }: { n: number }) => (
    <View style={styles.progressRow}>
      {[1, 2].map(i => <View key={i} style={[styles.progressDot, i <= n && styles.progressDotActive]} />)}
    </View>
  );

  const CTA = ({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) => (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }, busy && { opacity: 0.6 }]}>
      {busy ? <ActivityIndicator color="#fff" /> : <><Text style={styles.ctaText}>{label}</Text><Feather name="arrow-right" size={19} color="#fff" /></>}
    </Pressable>
  );

  // STEP 1
  if (step === 1) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Progress n={1} />
            <Text style={styles.eyebrow}>STEP 1 OF 2</Text>
            <Text style={styles.title}>Pick your look</Text>

            {isEduVerified && (
              <View style={styles.eduBanner}>
                <Ionicons name="school" size={18} color={light.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.eduTitle}>.edu verified 🎓</Text>
                  <Text style={styles.eduSub}>Student badge & campus perks unlocked.</Text>
                </View>
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} snapToInterval={132} decelerationRate="fast">
              {BODY_OPTIONS.map(body => {
                const sel = selectedBody === body;
                return (
                  <TouchableOpacity key={body} activeOpacity={0.85} style={[styles.bodyCard, sel && styles.cardActive]} onPress={() => setSelectedBody(body)}>
                    <AvatarHost config={starterConfigFor(body)} size={84} />
                    {sel && <View style={styles.checkBadge}><Ionicons name="checkmark" size={13} color="#fff" /></View>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>Real name</Text>
            <TextInput style={styles.input} placeholder="e.g. Alex Morgan" placeholderTextColor={light.textTertiary} value={realName} onChangeText={setRealName} />
            <Text style={styles.label}>Date of birth</Text>
            <TouchableOpacity
              style={[styles.input, styles.dateField]}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={birthday ? styles.dateText : styles.datePlaceholder}>
                {birthday ? fmtDate(birthday) : 'Select your date of birth'}
              </Text>
              <Ionicons name="calendar-outline" size={20} color={light.textTertiary} />
            </TouchableOpacity>
            <Text style={styles.hint}>You must be 18 or older to use zZuP!.</Text>

            {showDatePicker && (
              <DateTimePicker
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                value={birthday ?? latestAllowedBirthday()}
                // 门槛在这里就生效：18 岁以下的日期根本选不中
                maximumDate={latestAllowedBirthday()}
                minimumDate={new Date(1920, 0, 1)}
                onChange={(event, selected) => {
                  // Android 的原生对话框自己会关；iOS 的 spinner 要留着让用户滚
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (event.type === 'set' && selected) setBirthday(selected);
                }}
              />
            )}

            <CTA label="Continue" onPress={handleStep1} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // STEP 2 —— 最后一步
  return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Progress n={2} />
            <Text style={styles.eyebrow}>STEP 2 OF 2</Text>
            <Text style={styles.title}>Meet your zZuPer</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} snapToInterval={196} decelerationRate="fast">
              {OFFICIAL_PET_BREEDS.map(b => {
                const sel = selectedBreed === b.key;
                return (
                  <TouchableOpacity key={b.key} activeOpacity={0.85} style={[styles.breedCard, sel && styles.cardActive]} onPress={() => setSelectedBreed(b.key)}>
                    <View style={styles.svgWrap}><PetSvgAvatar breed={b.key} stage="child" size={120} /></View>
                    <Text style={[styles.cardName, sel && { color: light.brand }]}>{b.name}</Text>
                    <View style={styles.mbti}><Text style={styles.mbtiText}>{b.mbti}</Text></View>
                    <Text style={styles.breedDesc}>{b.desc}</Text>
                    {sel && <View style={styles.checkBadge}><Ionicons name="checkmark" size={13} color="#fff" /></View>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>Pet name</Text>
            <TextInput style={styles.input} placeholder="e.g. Barnaby" placeholderTextColor={light.textTertiary} value={petName} onChangeText={setPetName} />

            <CTA label="Finish setup" onPress={handleFinish} busy={loading} />
            <TouchableOpacity onPress={() => setStep(1)} style={styles.backLink}><Text style={styles.backText}>Back</Text></TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: light.bg },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.base, paddingBottom: spacing['3xl'] },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.xl },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: light.surfaceHi },
  progressDotActive: { backgroundColor: light.brand },
  eyebrow: { ...typography.eyebrow, color: light.brand, marginBottom: spacing.sm },
  title: { ...typography.h1, color: light.text },

  eduBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: light.brandSoft, borderRadius: radius.lg, padding: spacing.base, marginTop: spacing.lg },
  eduTitle: { ...typography.subtle, color: light.brand, fontWeight: '700' },
  eduSub: { ...typography.caption, color: light.textSecondary, marginTop: 1 },

  carousel: { paddingVertical: spacing.lg, paddingRight: spacing.xl },
  bodyCard: { width: 116, paddingVertical: spacing.sm, marginRight: spacing.base, borderRadius: radius.xl, borderWidth: 1.5, borderColor: light.border, alignItems: 'center', backgroundColor: light.surface },
  breedCard: { width: 180, padding: spacing.base, marginRight: spacing.base, borderRadius: radius.xl, borderWidth: 1.5, borderColor: light.border, alignItems: 'center', backgroundColor: light.surface },
  cardActive: { borderColor: light.brand, backgroundColor: light.brandSoft },
  svgWrap: { width: 120, height: 120, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.xs },
  cardName: { ...typography.body, color: light.text, fontWeight: '700', textAlign: 'center' },
  mbti: { backgroundColor: light.brandSoft, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm, marginTop: spacing.xs },
  mbtiText: { ...typography.micro, color: light.brand, fontWeight: '800' },
  breedDesc: { ...typography.caption, color: light.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  checkBadge: { position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 12, backgroundColor: light.brand, alignItems: 'center', justifyContent: 'center' },

  label: { ...typography.caption, color: light.textSecondary, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.md },
  input: { backgroundColor: light.surfaceHi, borderRadius: radius.md, paddingHorizontal: spacing.base, height: 52, ...typography.body, color: light.text },
  // 日期字段长得跟输入框一样，但它是个按钮 —— 需要自己排版内容
  dateField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateText: { ...typography.body, color: light.text },
  datePlaceholder: { ...typography.body, color: light.textTertiary },
  hint: { ...typography.caption, color: light.textTertiary, marginTop: spacing.sm },

  cta: { height: 54, borderRadius: radius.full, backgroundColor: light.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.xl, ...lightShadow.fab },
  ctaText: { ...typography.bodyLg, color: '#fff', fontWeight: '800' },
  backLink: { alignItems: 'center', paddingVertical: spacing.base, marginTop: spacing.xs },
  backText: { ...typography.subtle, color: light.textSecondary, fontWeight: '600' },

});
