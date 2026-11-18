import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  Switch,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Input } from '@/components/Input';
import { Colors } from '@/constants/colors';
import { AppConfig } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { api, formatApiError } from '@/services/api';

export default function EmergencyQRCardScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [qrToken, setQrToken] = useState<string>(user?.qr_token || '');
  const [emergencyInstructions, setEmergencyInstructions] = useState<string>('');
  const [sharedFields, setSharedFields] = useState<Record<string, boolean>>({
    share_name: true,
    share_phone: true,
    share_blood_type: true,
    share_allergies: true,
    share_medical_notes: true,
    share_contacts: true,
    share_instructions: true,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [isEditingInstructions, setIsEditingInstructions] = useState<boolean>(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated]);

  const loadQRSettings = async () => {
    setIsLoading(true);
    try {
      const data = await api.users.getQRSettings();
      if (data.qr_token) setQrToken(data.qr_token);
      if (data.qr_shared_fields) setSharedFields(data.qr_shared_fields);
      if (data.emergency_instructions) setEmergencyInstructions(data.emergency_instructions);
    } catch (err: any) {
      console.warn('[QRCard] Load error:', err?.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadQRSettings();
    }
  }, [isAuthenticated]);

  const handleToggleField = (field: string, val: boolean) => {
    setSharedFields((prev) => ({ ...prev, [field]: val }));
  };

  const handleSavePermissions = async () => {
    setIsSaving(true);
    try {
      await api.users.updateQRSettings(sharedFields, emergencyInstructions);
      setIsEditingInstructions(false);
      Alert.alert('Permissions Saved', 'Your Emergency QR Card visibility settings have been updated.');
    } catch (err: any) {
      Alert.alert('Update Failed', formatApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateQR = () => {
    Alert.alert(
      'Revoke & Regenerate QR Code?',
      'This will instantly invalidate your current QR code. Any previously saved, shared, or printed QR cards will stop working immediately.\n\nA new secure identifier will be created.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke & Create New',
          style: 'destructive',
          onPress: async () => {
            setIsRegenerating(true);
            try {
              const res = await api.users.regenerateQRToken();
              setQrToken(res.qr_token);
              Alert.alert('QR Code Revoked', 'Your previous QR code has been revoked and a fresh secure QR code is active.');
            } catch (err: any) {
              Alert.alert('Regeneration Failed', formatApiError(err));
            } finally {
              setIsRegenerating(false);
            }
          },
        },
      ]
    );
  };

  const publicUrl = `${AppConfig.apiUrl}/users/qr/${qrToken}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(publicUrl)}`;

  const handleShareCard = async () => {
    try {
      const userName = user?.name || user?.display_name || 'SafeLink Cardholder';
      await Share.share({
        title: `${userName}'s SafeLink Emergency QR Card`,
        message: `SafeLink Verified Emergency Medical Identity Card for ${userName}:\n\nScan QR Code or visit:\n${publicUrl}\n\nContains authorized emergency contacts, blood group, and vital medical safeguards.`,
      });
    } catch (e: any) {
      console.warn('Share error:', e);
    }
  };

  return (
    <ScreenWrapper scrollable contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Emergency QR Card</Text>
          <Text style={styles.headerSub}>Personal Medical Identity & Responder Beacon</Text>
        </View>
        <TouchableOpacity onPress={handleShareCard} style={styles.shareBtn} activeOpacity={0.7}>
          <Ionicons name="share-social-outline" size={20} color={Colors.infoBlue} />
        </TouchableOpacity>
      </View>

      {/* Main Physical QR Badge Card */}
      <Card style={styles.qrBadgeCard}>
        <View style={styles.badgeHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="shield-checkmark" size={18} color={Colors.emergencyRedBright} />
            <Text style={styles.badgeHeaderTitle}>SAFELINK EMERGENCY ID</Text>
          </View>
          <Badge label={user?.blood_type || 'BLOOD ID'} variant="danger" />
        </View>

        {/* QR Code Container */}
        <View style={styles.qrCodeContainer}>
          {isLoading || isRegenerating ? (
            <ActivityIndicator size="large" color={Colors.emergencyRedBright} style={{ height: 200 }} />
          ) : qrToken ? (
            <Image
              source={{ uri: qrImageUrl }}
              style={styles.qrCodeImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.noQrBox}>
              <Ionicons name="qr-code-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.noQrText}>Generating QR Code...</Text>
            </View>
          )}
        </View>

        <Text style={styles.cardHolderName}>
          {sharedFields.share_name ? (user?.name || user?.display_name || 'SafeLink Cardholder') : 'SafeLink Cardholder'}
        </Text>
        <Text style={styles.cardHolderPhone}>
          {sharedFields.share_phone && user?.phone_number ? user.phone_number : 'Authorized Emergency Identity'}
        </Text>

        <View style={styles.qrInstructionBanner}>
          <Ionicons name="scan-outline" size={16} color="#94A3B8" />
          <Text style={styles.qrInstructionText}>
            First responders or bystanders can scan this code with any camera to access approved emergency contacts and medical data.
          </Text>
        </View>
      </Card>

      {/* Quick Action Buttons */}
      <View style={styles.actionRow}>
        <Button
          title="Share Card Link"
          onPress={handleShareCard}
          variant="secondary"
          size="md"
          style={{ flex: 1, marginRight: 6 }}
          leftIcon={<Ionicons name="share-outline" size={18} color="#FFFFFF" />}
        />
        <Button
          title="Revoke / Regenerate"
          onPress={handleRegenerateQR}
          variant="outline"
          size="md"
          style={{ flex: 1, marginLeft: 6, borderColor: Colors.emergencyRedBright }}
          textStyle={{ color: Colors.emergencyRedBright }}
          leftIcon={<Ionicons name="refresh" size={18} color={Colors.emergencyRedBright} />}
        />
      </View>

      {/* Emergency Instructions for Responders */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="document-text-outline" size={18} color={Colors.warningAmber} />
            <Text style={styles.cardSectionTitle}>Emergency Instructions</Text>
          </View>
          <TouchableOpacity
            onPress={() => setIsEditingInstructions(!isEditingInstructions)}
            activeOpacity={0.7}
          >
            <Text style={styles.editLink}>{isEditingInstructions ? 'Done' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        {isEditingInstructions ? (
          <View style={{ marginTop: 10 }}>
            <Input
              label="Instructions for First Responders"
              placeholder="e.g. Speaks Kannada and English. Epipen in right backpack pocket."
              value={emergencyInstructions}
              onChangeText={setEmergencyInstructions}
              multiline
              numberOfLines={3}
            />
            <Button
              title="Save Instructions"
              onPress={handleSavePermissions}
              variant="emergency"
              size="sm"
              loading={isSaving}
              style={{ marginTop: 8 }}
            />
          </View>
        ) : (
          <Text style={styles.instructionsText}>
            {emergencyInstructions ||
              'No custom instructions provided. You can add specific medical instructions or language preferences here.'}
          </Text>
        )}
      </Card>

      {/* Information Sharing Privacy Controls */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="eye-outline" size={18} color={Colors.safetyGreen} />
            <Text style={styles.cardSectionTitle}>Visible Information Controls</Text>
          </View>
          <Badge label="STRICT PRIVACY" variant="success" />
        </View>
        <Text style={styles.privacySubtext}>
          Choose exactly what emergency personnel can see when scanning your QR card:
        </Text>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Full Name</Text>
            <Text style={styles.toggleSub}>{user?.name || user?.display_name || 'Display Name'}</Text>
          </View>
          <Switch
            value={sharedFields.share_name !== false}
            onValueChange={(val) => handleToggleField('share_name', val)}
            trackColor={{ false: '#1E356D', true: Colors.safetyGreen }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Phone Number</Text>
            <Text style={styles.toggleSub}>{user?.phone_number || 'Not provided'}</Text>
          </View>
          <Switch
            value={sharedFields.share_phone !== false}
            onValueChange={(val) => handleToggleField('share_phone', val)}
            trackColor={{ false: '#1E356D', true: Colors.safetyGreen }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Blood Group</Text>
            <Text style={styles.toggleSub}>{user?.blood_type || 'O+'}</Text>
          </View>
          <Switch
            value={sharedFields.share_blood_type !== false}
            onValueChange={(val) => handleToggleField('share_blood_type', val)}
            trackColor={{ false: '#1E356D', true: Colors.safetyGreen }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Allergies</Text>
            <Text style={styles.toggleSub}>{user?.allergies || 'None reported'}</Text>
          </View>
          <Switch
            value={sharedFields.share_allergies !== false}
            onValueChange={(val) => handleToggleField('share_allergies', val)}
            trackColor={{ false: '#1E356D', true: Colors.safetyGreen }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Medical Notes & Conditions</Text>
            <Text style={styles.toggleSub}>Existing conditions, medications, notes</Text>
          </View>
          <Switch
            value={sharedFields.share_medical_notes !== false}
            onValueChange={(val) => handleToggleField('share_medical_notes', val)}
            trackColor={{ false: '#1E356D', true: Colors.safetyGreen }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Emergency Contacts</Text>
            <Text style={styles.toggleSub}>One-tap emergency call buttons for responder</Text>
          </View>
          <Switch
            value={sharedFields.share_contacts !== false}
            onValueChange={(val) => handleToggleField('share_contacts', val)}
            trackColor={{ false: '#1E356D', true: Colors.safetyGreen }}
            thumbColor="#FFFFFF"
          />
        </View>

        <Button
          title="Save Sharing Permissions"
          onPress={handleSavePermissions}
          variant="emergency"
          size="md"
          loading={isSaving}
          style={{ marginTop: 14 }}
          leftIcon={<Ionicons name="checkmark-done" size={18} color="#FFFFFF" />}
        />
      </Card>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  shareBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qrBadgeCard: {
    backgroundColor: '#0F1C3F',
    borderWidth: 1.5,
    borderColor: Colors.emergencyRedBright,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  badgeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 14,
  },
  badgeHeaderTitle: {
    color: Colors.emergencyRedBright,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginLeft: 6,
  },
  qrCodeContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  qrCodeImage: {
    width: 210,
    height: 210,
  },
  noQrBox: {
    width: 210,
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noQrText: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  cardHolderName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 8,
  },
  cardHolderPhone: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
    marginBottom: 10,
  },
  qrInstructionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  qrInstructionText: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
    marginLeft: 8,
  },
  actionRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardSectionTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 6,
  },
  editLink: {
    color: Colors.infoBlue,
    fontSize: 13,
    fontWeight: '700',
  },
  instructionsText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  privacySubtext: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleLabel: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  toggleSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 4,
  },
});
