import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  Switch,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { AppConfig } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { DirectSmsService } from '@/services/sms';
import { motionSensorService } from '@/services/sensors';
import { offlineQueueService } from '@/services/offlineQueue';
import { MultilingualService, EmergencyLanguage, SUPPORTED_LANGUAGES } from '@/services/multilingual';
import { api, formatApiError } from '@/services/api';

const NOTIF_PREFS_KEY = 'safelink_notif_prefs';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout, updateProfile, isAuthenticated, isLoading: authLoading } = useAuth();

  // Edit Profile Modal (Feature 9)
  const [isEditModal, setIsEditModal] = useState(false);
  const [name, setName] = useState(user?.name || user?.display_name || '');
  const [phone, setPhone] = useState(user?.phone_number || '');
  const [bloodType, setBloodType] = useState(user?.blood_type || '');
  const [allergies, setAllergies] = useState(user?.allergies || '');
  const [existingConditions, setExistingConditions] = useState(user?.existing_conditions || '');
  const [medications, setMedications] = useState(user?.medications || '');
  const [medicalNotes, setMedicalNotes] = useState(user?.medical_notes || '');
  const [shareMedicalWithSos, setShareMedicalWithSos] = useState(!!user?.share_medical_with_sos);
  const [isSaving, setIsSaving] = useState(false);

  // Motion Sensor & Countdown (Features 1 & 2)
  const [shakeEnabled, setShakeEnabled] = useState(true);
  const [countdownDuration, setCountdownDuration] = useState(5);

  // Offline Queue (Feature 6)
  const [queueStatus, setQueueStatus] = useState({ isOnline: true, pendingCount: 0 });

  // Feature 1: Cancellation PIN State
  const [cancellationPinSet, setCancellationPinSet] = useState<boolean>(!!user?.cancellation_pin_set);
  const [isPinModalVisible, setIsPinModalVisible] = useState<boolean>(false);
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [pinPassword, setPinPassword] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [isPinSaving, setIsPinSaving] = useState<boolean>(false);
  const [isResetMode, setIsResetMode] = useState<boolean>(false);

  // Feature 2: Multilingual Messaging State
  const [emergencyLang, setEmergencyLang] = useState<EmergencyLanguage>('en');

  // Notification Preferences (Persisted)
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [smsDispatch, setSmsDispatch] = useState(true);
  const [backgroundBeacon, setBackgroundBeacon] = useState(true);
  const [hasDirectSms, setHasDirectSms] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    DirectSmsService.checkPermission().then(setHasDirectSms);
    motionSensorService.loadSettings().then(setShakeEnabled);
    motionSensorService.getCountdownDuration().then(setCountdownDuration);
    MultilingualService.getSelectedLanguage().then(setEmergencyLang);
    setCancellationPinSet(!!user?.cancellation_pin_set);

    const unsubQueue = offlineQueueService.subscribe((pendingCount, isOnline) => {
      setQueueStatus({ pendingCount, isOnline });
    });

    AsyncStorage.getItem(NOTIF_PREFS_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.soundAlerts !== undefined) setSoundAlerts(parsed.soundAlerts);
          if (parsed.smsDispatch !== undefined) setSmsDispatch(parsed.smsDispatch);
          if (parsed.backgroundBeacon !== undefined) setBackgroundBeacon(parsed.backgroundBeacon);
        } catch {}
      }
    });

    return () => {
      unsubQueue();
    };
  }, []);

  const handleToggleShake = async (val: boolean) => {
    setShakeEnabled(val);
    await motionSensorService.setShakeEnabled(val);
  };

  const handleChangeCountdown = async (sec: number) => {
    setCountdownDuration(sec);
    await motionSensorService.setCountdownDuration(sec);
  };

  const handleManualQueueSync = async () => {
    await offlineQueueService.flushQueue();
    Alert.alert('Queue Synchronized', 'Offline location and incident queue synced with server.');
  };

  const handleChangeLanguage = async (lang: EmergencyLanguage) => {
    setEmergencyLang(lang);
    await MultilingualService.setSelectedLanguage(lang);
  };

  const handleOpenPinModal = (reset = false) => {
    setIsResetMode(reset);
    setNewPin('');
    setConfirmPin('');
    setPinPassword('');
    setPinError('');
    setIsPinModalVisible(true);
  };

  const handleSavePin = async () => {
    setPinError('');
    if (!newPin.trim() || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      setPinError('PIN must be 4 to 6 numeric digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('PIN confirmation does not match.');
      return;
    }

    setIsPinSaving(true);
    try {
      if (isResetMode) {
        if (!pinPassword.trim()) {
          setPinError('Account password is required to reset your PIN.');
          setIsPinSaving(false);
          return;
        }
        await api.users.resetCancellationPin(pinPassword, newPin);
        Alert.alert('PIN Reset', 'Your SOS Cancellation PIN has been successfully reset.');
      } else {
        await api.users.setCancellationPin(newPin, pinPassword || undefined);
        Alert.alert('PIN Configured', 'Your personal SOS Cancellation PIN has been configured.');
      }
      setCancellationPinSet(true);
      setIsPinModalVisible(false);
    } catch (err: any) {
      setPinError(formatApiError(err));
    } finally {
      setIsPinSaving(false);
    }
  };

  const saveNotifPref = async (key: string, value: boolean) => {
    const updated = {
      soundAlerts: key === 'sound' ? value : soundAlerts,
      smsDispatch: key === 'sms' ? value : smsDispatch,
      backgroundBeacon: key === 'beacon' ? value : backgroundBeacon,
    };
    if (key === 'sound') setSoundAlerts(value);
    if (key === 'sms') setSmsDispatch(value);
    if (key === 'beacon') setBackgroundBeacon(value);
    await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(updated));
  };

  const handleOpenEdit = () => {
    setName(user?.name || user?.display_name || '');
    setPhone(user?.phone_number || '');
    setBloodType(user?.blood_type || '');
    setAllergies(user?.allergies || '');
    setExistingConditions(user?.existing_conditions || '');
    setMedications(user?.medications || '');
    setMedicalNotes(user?.medical_notes || '');
    setShareMedicalWithSos(!!user?.share_medical_with_sos);
    setIsEditModal(true);
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        phone_number: phone.trim() || undefined,
        blood_type: bloodType.trim() || undefined,
        allergies: allergies.trim() || undefined,
        existing_conditions: existingConditions.trim() || undefined,
        medications: medications.trim() || undefined,
        medical_notes: medicalNotes.trim() || undefined,
        share_medical_with_sos: shareMedicalWithSos,
      });
      setIsEditModal(false);
      Alert.alert('Profile Saved', 'Your medical and emergency safeguard information has been updated.');
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Could not save profile updates.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out of SafeLink', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const isAdmin = user?.role === 'ADMIN';

  return (
    <ScreenWrapper scrollable activeTab="settings" contentContainerStyle={styles.container}>
      {/* Screen Header */}
      <View style={styles.screenHeader}>
        <Text style={styles.headerTitle}>Settings & Profile</Text>
        <Text style={styles.headerSub}>Manage your account, medical safeguard info, and preferences</Text>
      </View>

      {/* User Profile Card */}
      <Card style={styles.card}>
        <View style={styles.profileRow}>
          <View style={[styles.avatarCircle, isAdmin && styles.adminAvatarCircle]}>
            <Text style={styles.avatarInitial}>
              {user?.name ? user.name[0].toUpperCase() : 'M'}
            </Text>
          </View>

          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.profileName}>{user?.name || user?.display_name || 'Mohith'}</Text>
              <Badge
                label={user?.role || 'USER'}
                variant={isAdmin ? 'danger' : 'info'}
                style={{ marginLeft: 8 }}
              />
            </View>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            {user?.phone_number && (
              <Text style={styles.profilePhone}>{user.phone_number}</Text>
            )}
          </View>

          <TouchableOpacity onPress={handleOpenEdit} style={styles.editProfileBtn}>
            <Ionicons name="pencil" size={16} color={Colors.infoBlue} />
          </TouchableOpacity>
        </View>

        {/* Medical Safeguard Row (Feature 9) */}
        <View style={styles.medicalInfoRow}>
          <View style={styles.medicalPill}>
            <Text style={styles.medicalPillLabel}>BLOOD</Text>
            <Text style={styles.medicalPillVal}>{user?.blood_type || 'O+'}</Text>
          </View>
          <View style={[styles.medicalPill, { flex: 2 }]}>
            <Text style={styles.medicalPillLabel}>ALLERGIES</Text>
            <Text style={styles.medicalPillVal} numberOfLines={1}>
              {user?.allergies || 'None reported'}
            </Text>
          </View>
        </View>

        {(user?.existing_conditions || user?.medications) && (
          <View style={[styles.medicalInfoRow, { marginTop: 6 }]}>
            {user?.existing_conditions && (
              <View style={[styles.medicalPill, { flex: 1 }]}>
                <Text style={styles.medicalPillLabel}>CONDITIONS</Text>
                <Text style={styles.medicalPillVal} numberOfLines={1}>{user.existing_conditions}</Text>
              </View>
            )}
            {user?.medications && (
              <View style={[styles.medicalPill, { flex: 1 }]}>
                <Text style={styles.medicalPillLabel}>MEDICATIONS</Text>
                <Text style={styles.medicalPillVal} numberOfLines={1}>{user.medications}</Text>
              </View>
            )}
          </View>
        )}

        {user?.medical_notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>MEDICAL NOTES:</Text>
            <Text style={styles.notesText}>{user.medical_notes}</Text>
          </View>
        )}

        <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons
            name={user?.share_medical_with_sos ? 'shield-checkmark' : 'lock-closed'}
            size={14}
            color={user?.share_medical_with_sos ? Colors.safetyGreen : Colors.textMuted}
          />
          <Text style={{ fontSize: 11, color: Colors.textMuted, marginLeft: 6 }}>
            {user?.share_medical_with_sos
              ? 'Medical info will be shared with emergency contacts during SOS'
              : 'Medical profile is private (will NOT be shared during SOS)'}
          </Text>
        </View>
      </Card>

      {/* Emergency QR Identity Card */}
      <Card style={[styles.card, { borderColor: Colors.infoBlue, borderWidth: 1.2 }]}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="qr-code-outline" size={18} color={Colors.infoBlue} />
            <Text style={styles.cardHeading}>Emergency QR Identity Card</Text>
          </View>
          <Badge label="FIRST RESPONDER" variant="info" />
        </View>
        <Text style={styles.cardSubText}>
          Generate a physical emergency QR badge to share vital medical information and emergency contacts with paramedics, doctors, and bystanders.
        </Text>
        <Button
          title="Open QR Identity Card"
          onPress={() => router.push('/qr-card')}
          variant="outline"
          size="sm"
          style={{ marginTop: 10, borderColor: Colors.infoBlue }}
          textStyle={{ color: Colors.infoBlue }}
          leftIcon={<Ionicons name="scan-outline" size={16} color={Colors.infoBlue} />}
        />
      </Card>

      {/* Secure SOS Cancellation PIN */}
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="key-outline" size={18} color={Colors.warningAmber} />
            <Text style={styles.cardHeading}>SOS Cancellation Security PIN</Text>
          </View>
          <Badge
            label={cancellationPinSet ? 'PIN CONFIGURED' : 'NOT CONFIGURED'}
            variant={cancellationPinSet ? 'success' : 'warning'}
          />
        </View>
        <Text style={styles.cardSubText}>
          Require a 4 to 6-digit PIN before cancelling an active emergency to prevent unauthorized cancellation by assailants or accidental taps.
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
          <Button
            title={cancellationPinSet ? 'Change PIN' : 'Configure PIN'}
            onPress={() => handleOpenPinModal(false)}
            variant="secondary"
            size="sm"
            style={{ flex: 1 }}
            leftIcon={<Ionicons name="lock-closed" size={15} color="#FFFFFF" />}
          />
          {cancellationPinSet && (
            <Button
              title="Reset PIN"
              onPress={() => handleOpenPinModal(true)}
              variant="outline"
              size="sm"
              style={{ flex: 1 }}
              leftIcon={<Ionicons name="refresh" size={15} color={Colors.textSecondary} />}
            />
          )}
        </View>
      </Card>

      {/* Multilingual Emergency Messaging */}
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="language-outline" size={18} color={Colors.emergencyRedBright} />
            <Text style={styles.cardHeading}>Emergency Message Language</Text>
          </View>
          <Badge
            label={SUPPORTED_LANGUAGES.find((l) => l.code === emergencyLang)?.nativeName || 'English'}
            variant="danger"
          />
        </View>
        <Text style={styles.cardSubText}>
          Select the language for SMS alerts sent to emergency contacts during an SOS:
        </Text>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSel = emergencyLang === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => handleChangeLanguage(lang.code)}
                style={[styles.langChip, isSel && styles.langChipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.langChipNative, isSel && styles.langChipNativeActive]}>
                  {lang.nativeName}
                </Text>
                <Text style={[styles.langChipCode, isSel && styles.langChipCodeActive]}>
                  {lang.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Live Template Preview Accordion */}
        <View style={styles.templatePreviewBox}>
          <Text style={styles.templatePreviewHeader}>SMS TEMPLATE PREVIEW:</Text>
          <Text style={styles.templatePreviewText}>
            {MultilingualService.buildMessage(
              {
                name: user?.name || user?.display_name || 'Mohith',
                incidentId: 'SOS-20261117-SAMPLE',
                activationTime: '10:30 PM',
                locationUrl: 'https://maps.google.com/?q=12.9716,77.5946',
                description: 'Need immediate emergency assistance',
              },
              emergencyLang
            )}
          </Text>
        </View>
      </Card>

      

      {/* ------------------------------------------------------------- */}
      {/* ADMINISTRATOR ACCESS (Only visible if user is ADMIN) */}
      {/* ------------------------------------------------------------- */}
      {isAdmin && (
        <Card style={styles.adminCard}>
          <View style={styles.headerRow}>
            <Ionicons name="shield-half" size={18} color="#F59E0B" />
            <Text style={styles.adminCardTitle}>Administrator Command Center</Text>
          </View>
          <Text style={styles.adminCardDesc}>
            Privileged tools for monitoring user safety, dispatch logs, and incident records.
          </Text>

          <View style={styles.adminNavGrid}>
            <Button
              title="Overview"
              onPress={() => router.push('/admin/dashboard')}
              variant="secondary"
              size="sm"
              style={{ flex: 1, marginRight: 6 }}
              leftIcon={<Ionicons name="speedometer-outline" size={15} color="#F59E0B" />}
            />
            <Button
              title="Users"
              onPress={() => router.push('/admin/users')}
              variant="secondary"
              size="sm"
              style={{ flex: 1, marginRight: 6 }}
              leftIcon={<Ionicons name="people-outline" size={15} color="#F59E0B" />}
            />
            <Button
              title="Incidents"
              onPress={() => router.push('/admin/incidents')}
              variant="secondary"
              size="sm"
              style={{ flex: 1 }}
              leftIcon={<Ionicons name="alert-circle-outline" size={15} color="#F59E0B" />}
            />
          </View>
        </Card>

      
      )}

      {/* Notification Settings */}
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="notifications" size={18} color={Colors.infoBlue} />
          <Text style={styles.cardHeading}>Emergency Notification Preferences</Text>
        </View>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Audible SOS Siren & Vibration</Text>
            <Text style={styles.toggleSub}>Plays high-priority emergency sounds during alert</Text>
          </View>
          <Switch
            value={soundAlerts}
            onValueChange={(val) => saveNotifPref('sound', val)}
            trackColor={{ false: '#1E356D', true: Colors.emergencyRedBright }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Emergency SMS Composer Prompt</Text>
            <Text style={styles.toggleSub}>Prompts native SMS prefilled with live GPS</Text>
          </View>
          <Switch
            value={smsDispatch}
            onValueChange={(val) => saveNotifPref('sms', val)}
            trackColor={{ false: '#1E356D', true: Colors.safetyGreen }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Background GPS Location Beacon</Text>
            <Text style={styles.toggleSub}>Keeps GPS coordinates synchronized for dispatch</Text>
          </View>
          <Switch
            value={backgroundBeacon}
            onValueChange={(val) => saveNotifPref('beacon', val)}
            trackColor={{ false: '#1E356D', true: Colors.infoBlue }}
            thumbColor="#FFFFFF"
          />
        </View>
      </Card>

      {/* Emergency Sensors & Automation */}
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="hardware-chip" size={18} color={Colors.emergencyRedBright} />
          <Text style={styles.cardHeading}>Emergency Sensors & Triggers</Text>
        </View>

        {/* Shake to SOS (Feature 2) */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.toggleLabel}>Shake to SOS (Motion Sensor)</Text>
            <Text style={styles.toggleSub}>
              Detects deliberate shaking motion and starts the SOS countdown
            </Text>
          </View>
          <Switch
            value={shakeEnabled}
            onValueChange={handleToggleShake}
            trackColor={{ false: '#1E356D', true: Colors.emergencyRedBright }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.divider} />

        {/* SOS Countdown Duration (Feature 1) */}
        <View style={{ paddingVertical: 4 }}>
          <Text style={styles.toggleLabel}>SOS Verification Countdown</Text>
          <Text style={styles.toggleSub}>
            Grace period to cancel accidental triggers before emergency dispatch
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {[5, 8, 10].map((sec) => {
              const isSel = countdownDuration === sec;
              return (
                <TouchableOpacity
                  key={sec}
                  onPress={() => handleChangeCountdown(sec)}
                  style={[
                    styles.countdownChip,
                    isSel && styles.countdownChipActive,
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.countdownChipText,
                      isSel && styles.countdownChipTextActive,
                    ]}
                  >
                    {sec} Seconds
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Offline SOS Queue (Feature 6) */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.toggleLabel}>Offline Telemetry Sync Queue</Text>
            <Text style={styles.toggleSub}>
              {queueStatus.isOnline
                ? `Network online • ${queueStatus.pendingCount} pending updates`
                : `Offline mode • ${queueStatus.pendingCount} updates queued locally`}
            </Text>
          </View>
          <Button
            title="Sync Now"
            onPress={handleManualQueueSync}
            variant="outline"
            size="sm"
            disabled={!queueStatus.isOnline || queueStatus.pendingCount === 0}
            leftIcon={<Ionicons name="sync" size={14} color={Colors.infoBlue} />}
          />
        </View>
      </Card>

      

      {/* Device Permissions Status */}
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="lock-closed" size={18} color={Colors.safetyGreen} />
          <Text style={styles.cardHeading}>Device Sensor Permissions</Text>
        </View>

        <View style={styles.permissionItem}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="navigate-circle" size={18} color={Colors.safetyGreen} />
            <Text style={styles.permText}>GPS High-Precision Location</Text>
          </View>
          <Badge label="ENABLED" variant="success" />
        </View>

        <View style={styles.permissionItem}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="book" size={18} color={Colors.infoBlue} />
            <Text style={styles.permText}>Device Emergency Contacts</Text>
          </View>
          <Badge label="ENABLED" variant="info" />
        </View>

        <TouchableOpacity
          onPress={async () => {
            const granted = await DirectSmsService.requestPermission();
            setHasDirectSms(granted);
            if (granted) {
              Alert.alert('Direct SMS Enabled', 'Direct cellular SMS transmission is active for SOS activations.');
            } else {
              Alert.alert(
                'Composer Fallback Active',
                'Android direct SMS is optional. SafeLink will invoke the prefilled SMS composer fallback when SOS triggers.'
              );
            }
          }}
          activeOpacity={0.7}
        >
          <View style={styles.permissionItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons
                name="chatbubble-ellipses"
                size={18}
                color={hasDirectSms ? Colors.safetyGreen : Colors.warningAmber}
              />
              <View style={{ marginLeft: 6 }}>
                <Text style={styles.permText}>Direct Emergency SMS</Text>
                <Text style={{ fontSize: 10, color: Colors.textMuted }}>Tap to configure direct dispatch</Text>
              </View>
            </View>
            <Badge
              label={hasDirectSms ? 'DIRECT NATIVE' : 'COMPOSER FALLBACK'}
              variant={hasDirectSms ? 'success' : 'warning'}
            />
          </View>
        </TouchableOpacity>

        <View style={styles.permissionItem}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="key" size={18} color={Colors.safetyGreen} />
            <Text style={styles.permText}>Argon2id + JWT Security</Text>
          </View>
          <Badge label="ACTIVE" variant="success" />
        </View>
      </Card>

      

      {/* Connection & Network Diagnostics */}
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="server" size={18} color={Colors.infoBlue} />
          <Text style={styles.cardHeading}>Backend API Server</Text>
        </View>
        <Text style={styles.diagnosticsUrl}>Configured API URL: {AppConfig.apiUrl}</Text>
        <Text style={styles.diagnosticsNote}>
          • Physical Device: http://192.168.1.6:8001{'\n'}
          • Web / Emulator: http://localhost:8001
        </Text>
      </Card>

      {/* Logout Button */}
      <Button
        title="Sign Out of SafeLink"
        onPress={handleLogout}
        variant="danger"
        size="md"
        style={{ marginBottom: 20 }}
        leftIcon={<Ionicons name="log-out-outline" size={18} color="#FFFFFF" />}
      />

      {/* Edit Profile Modal */}
      <Modal visible={isEditModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Edit Emergency Medical Profile</Text>
              <TouchableOpacity onPress={() => setIsEditModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              <Input
                label="Full Name"
                value={name}
                onChangeText={setName}
                leftIcon={<Ionicons name="person-outline" size={20} color={Colors.textMuted} />}
              />

              <Input
                label="Phone Number"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                leftIcon={<Ionicons name="call-outline" size={20} color={Colors.textMuted} />}
              />

              <Input
                label="Blood Group (e.g. O+, A+, B-, AB+)"
                placeholder="e.g. O+, A-, B+"
                value={bloodType}
                onChangeText={setBloodType}
                leftIcon={<Ionicons name="medkit-outline" size={20} color={Colors.textMuted} />}
              />

              <Input
                label="Allergies"
                placeholder="e.g. Penicillin, Peanuts, Latex"
                value={allergies}
                onChangeText={setAllergies}
                leftIcon={<Ionicons name="warning-outline" size={20} color={Colors.textMuted} />}
              />

              <Input
                label="Existing Medical Conditions"
                placeholder="e.g. Asthma, Diabetes Type 1, Hypertension"
                value={existingConditions}
                onChangeText={setExistingConditions}
                leftIcon={<Ionicons name="fitness-outline" size={20} color={Colors.textMuted} />}
              />

              <Input
                label="Important Medications"
                placeholder="e.g. Insulin, Albuterol inhaler, Epipen"
                value={medications}
                onChangeText={setMedications}
                leftIcon={<Ionicons name="bandage-outline" size={20} color={Colors.textMuted} />}
              />

              <Input
                label="Emergency Medical Notes"
                placeholder="e.g. Wears medical ID bracelet on left wrist"
                value={medicalNotes}
                onChangeText={setMedicalNotes}
                leftIcon={<Ionicons name="document-text-outline" size={20} color={Colors.textMuted} />}
              />

              {/* Consent Toggle (Feature 9) */}
              <View style={[styles.toggleRow, { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1E293B', marginTop: 10 }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.toggleLabel}>Share with Emergency Contacts</Text>
                  <Text style={styles.toggleSub}>
                    Attach this medical profile to SOS dispatches. If disabled, info remains strictly private.
                  </Text>
                </View>
                <Switch
                  value={shareMedicalWithSos}
                  onValueChange={setShareMedicalWithSos}
                  trackColor={{ false: '#1E356D', true: Colors.safetyGreen }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <Button
                title="Save Profile Updates"
                onPress={handleSaveProfile}
                variant="emergency"
                size="lg"
                loading={isSaving}
                style={{ marginTop: 14, marginBottom: 10 }}
                leftIcon={<Ionicons name="checkmark-sharp" size={18} color="#FFFFFF" />}
              />
            </ScrollView>
          </Card>

      
        </View>
      </Modal>
      {/* PIN Configuration & Reset Modal */}
      <Modal visible={isPinModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                {isResetMode
                  ? 'Reset SOS Cancellation PIN'
                  : cancellationPinSet
                  ? 'Update Cancellation PIN'
                  : 'Set SOS Cancellation PIN'}
              </Text>
              <TouchableOpacity onPress={() => setIsPinModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: Colors.textSecondary, marginBottom: 14, lineHeight: 18 }}>
              {isResetMode
                ? 'Enter your account password to verify identity and configure a new 4 to 6-digit cancellation PIN.'
                : 'Enter a 4 to 6-digit numeric PIN. This PIN will be required whenever you cancel an active emergency.'}
            </Text>

            {pinError ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={Colors.emergencyRedBright} />
                <Text style={styles.errorBannerText}>{pinError}</Text>
              </View>
            ) : null}

            {isResetMode && (
              <Input
                label="Account Password (Identity Verification)"
                placeholder="Enter your account password"
                secureTextEntry
                value={pinPassword}
                onChangeText={setPinPassword}
                leftIcon={<Ionicons name="lock-closed-outline" size={20} color={Colors.textMuted} />}
              />
            )}

            <Input
              label="New 4-6 Digit Numeric PIN"
              placeholder="e.g. 1234"
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              value={newPin}
              onChangeText={setNewPin}
              leftIcon={<Ionicons name="key-outline" size={20} color={Colors.textMuted} />}
            />

            <Input
              label="Confirm New PIN"
              placeholder="Re-enter 4-6 digit PIN"
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              value={confirmPin}
              onChangeText={setConfirmPin}
              leftIcon={<Ionicons name="checkmark-circle-outline" size={20} color={Colors.textMuted} />}
            />

            <Button
              title={isResetMode ? 'Reset PIN' : 'Save PIN'}
              onPress={handleSavePin}
              variant="emergency"
              size="lg"
              loading={isPinSaving}
              style={{ marginTop: 10 }}
              leftIcon={<Ionicons name="shield-checkmark" size={18} color="#FFFFFF" />}
            />
          </Card>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
  },
  screenHeader: {
    marginBottom: 14,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  headerSub: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  card: {
    padding: 16,
    backgroundColor: '#101F42',
    borderColor: '#1E356D',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeading: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
  },
  /* Profile Card */
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E356D',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  adminAvatarCircle: {
    borderColor: '#F59E0B',
    backgroundColor: '#3B2305',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  profileEmail: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  profilePhone: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  editProfileBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0D1836',
    borderWidth: 1,
    borderColor: '#1E356D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicalInfoRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  medicalPill: {
    flex: 1,
    backgroundColor: '#0A142D',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#172554',
  },
  medicalPillLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  medicalPillVal: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  notesBox: {
    backgroundColor: '#0A142D',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#172554',
  },
  notesLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  notesText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  /* Admin Card */
  adminCard: {
    padding: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderWidth: 1.5,
    marginBottom: 14,
  },
  adminCardTitle: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
  },
  adminCardDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  adminNavGrid: {
    flexDirection: 'row',
  },
  /* Toggles */
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toggleLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  toggleSub: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#172554',
    marginVertical: 10,
  },
  /* Permissions */
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#172554',
  },
  permText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  /* Diagnostics */
  diagnosticsUrl: {
    color: Colors.infoBlue,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  diagnosticsNote: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  /* Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    padding: 20,
    backgroundColor: '#0F1D3D',
    borderColor: '#1E356D',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#172554',
    paddingBottom: 10,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  countdownChip: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#0A142D',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#172554',
  },
  countdownChipActive: {
    borderColor: Colors.emergencyRedBright,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  countdownChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  countdownChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  cardSubText: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    marginBottom: 4,
  },
  langChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#0A142D',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#172554',
  },
  langChipActive: {
    borderColor: Colors.emergencyRedBright,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  langChipNative: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  langChipNativeActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  langChipCode: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  langChipCodeActive: {
    color: Colors.emergencyRedBright,
    fontWeight: '700',
  },
  templatePreviewBox: {
    backgroundColor: '#090E20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#172554',
    padding: 12,
    marginTop: 12,
  },
  templatePreviewHeader: {
    color: Colors.warningAmber,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  templatePreviewText: {
    color: '#E2E8F0',
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'monospace',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: Colors.emergencyRedBright,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorBannerText: {
    color: Colors.emergencyRedBright,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
});
