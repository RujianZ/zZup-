import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

interface LuxuryAlertModalProps {
  visible: boolean;
  title: string;
  message: string;
  buttonText?: string;
  type?: 'error' | 'info' | 'success';
  onClose: () => void;
}

export default function LuxuryAlertModal({
  visible, title, message, buttonText = 'Got it', type = 'error', onClose,
}: LuxuryAlertModalProps) {
  const { colors } = useTheme();

  if (!visible) return null;

  const iconName = type === 'error' ? 'alert-circle' : type === 'success' ? 'checkmark-circle' : 'information-circle';
  const iconColor = type === 'error' ? '#EF4444' : type === 'success' ? '#10B981' : colors.brand;
  const iconBg = type === 'error' ? 'rgba(239, 68, 68, 0.15)' : type === 'success' ? 'rgba(16, 185, 129, 0.15)' : colors.cardMutedBg;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={[styles.iconBg, { backgroundColor: iconBg }]}>
                <Ionicons name={iconName as any} size={30} color={iconColor} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.message, { color: colors.subText }]}>{message}</Text>
              <TouchableOpacity style={[styles.button, { backgroundColor: colors.brand }]} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.buttonText}>{buttonText}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  card: { borderRadius: 24, padding: 24, width: '100%', maxWidth: 330, alignItems: 'center', borderWidth: 1 },
  iconBg: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, marginBottom: 24, textAlign: 'center' },
  button: { width: '100%', height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
