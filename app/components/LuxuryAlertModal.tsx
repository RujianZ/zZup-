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
  /**
   * 传了 onConfirm 就切换到**确认模式**：渲染「取消 / 确认」两个按钮。
   *
   * 关键约定：点遮罩、按返回键、点取消 —— 一律只调用 onClose，**绝不触发 onConfirm**。
   * （曾经的写法是把确认动作挂在 onClose 上，于是"点旁边取消"反而执行了删除。）
   */
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  /** 确认按钮用红色（删除、移除等不可逆操作） */
  destructive?: boolean;
}

export default function LuxuryAlertModal({
  visible, title, message, buttonText = 'Got it', type = 'error', onClose,
  onConfirm, confirmText = 'Confirm', cancelText = 'Cancel', destructive = false,
}: LuxuryAlertModalProps) {
  const { colors } = useTheme();

  if (!visible) return null;

  const iconName = type === 'error' ? 'alert-circle' : type === 'success' ? 'checkmark-circle' : 'information-circle';
  const iconColor = type === 'error' ? '#EF4444' : type === 'success' ? '#10B981' : colors.brand;
  const iconBg = type === 'error' ? 'rgba(239, 68, 68, 0.15)' : type === 'success' ? 'rgba(16, 185, 129, 0.15)' : colors.cardMutedBg;

  const isConfirm = typeof onConfirm === 'function';

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

              {isConfirm ? (
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.button, styles.flex, { backgroundColor: colors.cardMutedBg, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={onClose}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.buttonText, { color: colors.text }]}>{cancelText}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.flex, { backgroundColor: destructive ? '#EF4444' : colors.brand }]}
                    onPress={onConfirm}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.buttonText}>{confirmText}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[styles.button, styles.full, { backgroundColor: colors.brand }]} onPress={onClose} activeOpacity={0.85}>
                  <Text style={styles.buttonText}>{buttonText}</Text>
                </TouchableOpacity>
              )}
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
  row: { flexDirection: 'row', gap: 10, width: '100%' },
  button: { height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  flex: { flex: 1 },
  full: { width: '100%' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
