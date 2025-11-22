import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../contexts/AuthContext';
import { colors, radius, spacing } from '../config/theme';

export default function AuthScreen() {
  const { loading, loginWithPassword, signupWithPassword, requestPasswordReset } = useAuth();
  const navigation = useNavigation();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setMessage(null);
      if (mode === 'signin') {
        await loginWithPassword(email, password);
      } else {
        await signupWithPassword({ email, password, name });
      }
      navigation.goBack();
    } catch (err: any) {
      setMessage(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setMessage('Enter your email first');
      return;
    }
    try {
      setMessage('Sending reset email...');
      await requestPasswordReset(email);
      setMessage('Check your inbox for reset instructions');
    } catch (err: any) {
      setMessage(err.message || 'Unable to send reset email');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Sign in to Baku Reserve</Text>
        <Text style={styles.subtitle}>
          Securely access your reservations, notifications, and concierge perks.
        </Text>

        <View style={styles.modeSwitch}>
          <Pressable
            style={[styles.modeButton, mode === 'signin' && styles.modeButtonActive]}
            onPress={() => setMode('signin')}
          >
            <Text style={[styles.modeText, mode === 'signin' && styles.modeTextActive]}>Sign in</Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === 'signup' && styles.modeButtonActive]}
            onPress={() => setMode('signup')}
          >
            <Text style={[styles.modeText, mode === 'signup' && styles.modeTextActive]}>Create account</Text>
          </Pressable>
        </View>

        {mode === 'signup' ? (
          <TextInput
            style={styles.input}
            placeholder="Full name"
            value={name}
            onChangeText={setName}
          />
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable
          style={[styles.submitButton, (submitting || loading) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || loading}
        >
          <Text style={styles.submitButtonText}>
            {submitting || loading
              ? 'Please wait…'
              : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
          </Text>
        </Pressable>

        {mode === 'signin' ? (
          <Pressable style={styles.resetButton} onPress={handleResetPassword} disabled={submitting || loading}>
            <Text style={styles.resetButtonText}>Forgot password?</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  modeSwitch: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  modeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
  },
  modeText: {
    fontWeight: '600',
    color: colors.text,
  },
  modeTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
  },
  message: {
    color: colors.primaryStrong,
    fontSize: 13,
  },
  submitButton: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  resetButton: {
    alignItems: 'center',
  },
  resetButtonText: {
    color: colors.primaryStrong,
    fontWeight: '600',
  },
});
