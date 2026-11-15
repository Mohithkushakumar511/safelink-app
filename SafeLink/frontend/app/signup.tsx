import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';

export default function SignupScreen() {
  const router = useRouter();
  const { signup, isLoading } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignup = async () => {
    if (!name.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please provide a valid email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setErrorMessage(null);
    try {
      await signup({
        name: name.trim(),
        email: email.trim(),
        password: password,
        phone_number: phone.trim() || undefined,
        blood_type: bloodType.trim() || undefined,
        allergies: allergies.trim() || undefined,
      });
      router.replace('/dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed.');
    }
  };

  return (
    <ScreenWrapper scrollable contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Register for personal emergency response & tracking</Text>

        {errorMessage && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color={Colors.emergencyRedBright} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <Input
          label="Full Name *"
          placeholder="e.g. Mohith"
          value={name}
          onChangeText={setName}
          leftIcon={<Ionicons name="person-outline" size={20} color={Colors.textMuted} />}
        />

        <Input
          label="Email Address *"
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          leftIcon={<Ionicons name="mail-outline" size={20} color={Colors.textMuted} />}
        />

        <Input
          label="Password * (min 6 chars)"
          placeholder="Create a strong password"
          isPassword
          value={password}
          onChangeText={setPassword}
          leftIcon={<Ionicons name="lock-closed-outline" size={20} color={Colors.textMuted} />}
        />

        <Input
          label="Phone Number"
          placeholder="+1 (555) 000-0000"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          leftIcon={<Ionicons name="call-outline" size={20} color={Colors.textMuted} />}
        />

        <View style={styles.inlineRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Input
              label="Blood Type (Optional)"
              placeholder="e.g. O+"
              autoCapitalize="characters"
              value={bloodType}
              onChangeText={setBloodType}
              leftIcon={<Ionicons name="medkit-outline" size={20} color={Colors.textMuted} />}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Input
              label="Allergies (Optional)"
              placeholder="e.g. Penicillin"
              value={allergies}
              onChangeText={setAllergies}
              leftIcon={<Ionicons name="warning-outline" size={20} color={Colors.textMuted} />}
            />
          </View>
        </View>

        <Button
          title="Create SafeLink Profile"
          onPress={handleSignup}
          variant="emergency"
          size="lg"
          loading={isLoading}
          style={{ marginTop: 8 }}
          leftIcon={<Ionicons name="shield-checkmark-outline" size={20} color="#FFFFFF" />}
        />
      </Card>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Already registered? </Text>
        <TouchableOpacity onPress={() => router.push('/login')} activeOpacity={0.7}>
          <Text style={styles.signInLink}>Sign In Here</Text>
        </TouchableOpacity>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 20,
  },
  card: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  inlineRow: {
    flexDirection: 'row',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 13,
    fontWeight: '600',
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
  signInLink: {
    color: Colors.emergencyRedBright,
    fontSize: 14,
    fontWeight: '700',
  },
});
