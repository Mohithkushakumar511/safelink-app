import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { api, formatApiError } from '@/services/api';

export default function LoginScreen() {
  const router = useRouter();
  const { login, demoLogin, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  useEffect(() => {
    let isMounted = true;
    api.health.check()
      .catch((err: any) => {
        if (isMounted) {
          setErrorMessage(formatApiError(err));
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }
    setErrorMessage(null);
    try {
      await login(email.trim(), password);
      router.replace('/dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check credentials.');
    }
  };

  const handleDemo = async (role: 'USER' | 'ADMIN') => {
    setErrorMessage(null);
    try {
      await demoLogin(role);
      router.replace('/dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || 'Demo login failed.');
    }
  };

  return (
    <ScreenWrapper scrollable contentContainerStyle={styles.container}>
      {/* Header Brand */}
      <View style={styles.brandSection}>
        <View style={styles.logoCircle}>
          <Ionicons name="shield-checkmark" size={44} color={Colors.emergencyRedBright} />
        </View>
        <Text style={styles.brandTitle}>SAFELINK</Text>
        <Text style={styles.brandSub}>Emergency Contact & Live Location Shield</Text>
      </View>

      {/* Main Login Card */}
      <Card style={styles.formCard}>
        <Text style={styles.welcomeTitle}>Sign In</Text>
        <Text style={styles.welcomeSub}>Access your emergency safeguard profile</Text>

        {errorMessage && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color={Colors.emergencyRedBright} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <Input
          label="Email Address"
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={(val) => {
            setEmail(val);
            if (errorMessage) setErrorMessage(null);
          }}
          leftIcon={<Ionicons name="mail-outline" size={20} color={Colors.textMuted} />}
        />

        <Input
          label="Password"
          placeholder="Enter your password"
          isPassword
          value={password}
          onChangeText={(val) => {
            setPassword(val);
            if (errorMessage) setErrorMessage(null);
          }}
          leftIcon={<Ionicons name="lock-closed-outline" size={20} color={Colors.textMuted} />}
        />

        <Button
          title="Sign In"
          onPress={handleLogin}
          variant="emergency"
          size="lg"
          loading={isLoading}
          style={styles.signInBtn}
          leftIcon={<Ionicons name="log-in-outline" size={20} color="#FFFFFF" />}
        />

        {/* Demo Fast Access Section */}
        <View style={styles.demoSection}>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ONE-TAP DEMO ACCESS</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.demoButtonsRow}>
            <Button
              title="User Demo (Mohith)"
              onPress={() => handleDemo('USER')}
              variant="outline"
              size="md"
              loading={isLoading}
              style={{ flex: 1, marginRight: 6 }}
              leftIcon={<Ionicons name="person" size={16} color={Colors.infoBlue} />}
            />
            <Button
              title="Admin Demo (Mohith)"
              onPress={() => handleDemo('ADMIN')}
              variant="outline"
              size="md"
              loading={isLoading}
              style={{ flex: 1, marginLeft: 6, borderColor: 'rgba(245, 158, 11, 0.4)' }}
              textStyle={{ color: Colors.warningAmber }}
              leftIcon={<Ionicons name="shield" size={16} color={Colors.warningAmber} />}
            />
          </View>
        </View>
      </Card>

      {/* Footer / Create Account */}
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <TouchableOpacity onPress={() => router.push('/signup')} activeOpacity={0.7}>
          <Text style={styles.signUpLink}>Create Account</Text>
        </TouchableOpacity>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    paddingVertical: 24,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.emergencyBadge,
    borderWidth: 2,
    borderColor: 'rgba(220, 38, 38, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
  brandSub: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  formCard: {
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  welcomeSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderColor: 'rgba(220, 38, 38, 0.4)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    marginLeft: 8,
    color: Colors.emergencyRedBright,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  signInBtn: {
    marginTop: 8,
    width: '100%',
  },
  demoSection: {
    marginTop: 20,
    paddingTop: 8,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.divider,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 8,
  },
  demoButtonsRow: {
    flexDirection: 'row',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  signUpLink: {
    color: Colors.emergencyRedBright,
    fontSize: 14,
    fontWeight: '700',
  },
});
