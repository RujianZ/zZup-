import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { light, spacing, radius, typography, lightShadow } from '../theme';

interface LuxuryAlertModalProps {
  visible: boolean;
  title: string;
  message: string;
  buttonText?: string;
  type?: 'error' | 'info' | 'success';
  onClose: () => void;
}

/** Clean, universal alert dialog — a white card that reads well on any backdrop. */
export default function LuxuryAlertModal({
  visible, title, message, buttonText = 'Got it', type = 'error', onClose,
}: LuxuryAlertModalProps) {
  if (!visible) return null;

  const iconName = type === 'error' ? 'alert-circle' : type === 'success' ? 'checkmark-circle' : 'information-circle';
  const iconColor = type === 'error' ? light.danger : type === 'success' ? light.success : light.brand;
  const iconBg = type === 'error' ? light.dangerSoft : type === 'success' ? '#E7F8F1' : light.brandSoft;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <View style={[styles.iconBg, { backgroundColor: iconBg }]}>
                <Ionicons name={iconName as any} size={30} color={iconColor} />
              </View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.message}>{message}</Text>
              <TouchableOpacity style={styles.button} onPress={onClose} activeOpacity={0.85}>
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
  overlay: { flex: 1, backgroundColor: 'rgba(11,11,15,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  card: { backgroundColor: light.surface, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: 330, alignItems: 'center', ...lightShadow.card },
  iconBg: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.base },
  title: { ...typography.h3, color: light.text, marginBottom: spacing.sm, textAlign: 'center' },
  message: { ...typography.subtle, color: light.textSecondary, lineHeight: 20, marginBottom: spacing.xl, textAlign: 'center' },
  button: { width: '100%', height: 50, borderRadius: radius.full, backgroundColor: light.text, justifyContent: 'center', alignItems: 'center' },
  buttonText: { ...typography.body, color: light.white, fontWeight: '700' },
});
