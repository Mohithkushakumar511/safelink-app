import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
  Switch,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { api, formatApiError } from '@/services/api';
import { DeviceContactsService, DeviceContactItem } from '@/services/contacts';
import { useAuth } from '@/hooks/useAuth';

const RELATIONSHIP_OPTIONS = ['Family', 'Parent', 'Spouse', 'Sibling', 'Friend', 'Doctor', 'Neighbor', 'Colleague'];

export default function ContactsScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [contacts, setContacts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Escalation Ladder state
  const [autoEscalationEnabled, setAutoEscalationEnabled] = useState(true);
  const [escalationTimeout, setEscalationTimeout] = useState(120);

  // Add / Edit Modal state
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('Family');
  const [priorityInput, setPriorityInput] = useState('1');
  const [isDefault, setIsDefault] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Phone Contacts Picker Modal
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContactItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchContacts = async () => {
    if (!isAuthenticated || authLoading) return;
    setIsLoading(true);
    try {
      const data = await api.contacts.list();
      setContacts(data);
      await AsyncStorage.setItem('safelink_cached_contacts', JSON.stringify(data));

      try {
        const escSettings = await api.contacts.getEscalationSettings();
        if (escSettings) {
          setAutoEscalationEnabled(escSettings.auto_escalation_enabled);
          setEscalationTimeout(escSettings.escalation_timeout_seconds);
        }
      } catch (escErr) {
        console.warn('[Contacts] Escalation settings load notice:', escErr);
      }
    } catch (e: any) {
      try {
        const cached = await AsyncStorage.getItem('safelink_cached_contacts');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setContacts(parsed);
          }
        }
      } catch {}
      Alert.alert('Contacts Notice', formatApiError(e));
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        if (!isAuthenticated) {
          router.replace('/login');
        } else {
          fetchContacts();
        }
      }
    }, [authLoading, isAuthenticated])
  );

  const handleToggleAutoEscalation = async () => {
    const nextVal = !autoEscalationEnabled;
    setAutoEscalationEnabled(nextVal);
    try {
      await api.contacts.updateEscalationSettings({
        auto_escalation_enabled: nextVal,
        escalation_timeout_seconds: escalationTimeout,
      });
    } catch {
      setAutoEscalationEnabled(!nextVal);
      Alert.alert('Notice', 'Could not update automatic escalation setting.');
    }
  };

  const handleSelectTimeout = async (sec: number) => {
    setEscalationTimeout(sec);
    try {
      await api.contacts.updateEscalationSettings({
        auto_escalation_enabled: autoEscalationEnabled,
        escalation_timeout_seconds: sec,
      });
    } catch {
      Alert.alert('Notice', 'Could not update acknowledgement timeout.');
    }
  };

  const handleMovePriority = async (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= contacts.length) return;

    const updated = [...contacts];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    const orders = updated.map((c, idx) => ({
      id: c.id,
      priority: idx + 1,
    }));

    const reorderedWithPriorities = updated.map((c, idx) => ({
      ...c,
      priority: idx + 1,
      is_default: idx === 0,
    }));
    setContacts(reorderedWithPriorities);
    await AsyncStorage.setItem('safelink_cached_contacts', JSON.stringify(reorderedWithPriorities));

    try {
      await api.contacts.reorder(orders);
    } catch (err: any) {
      fetchContacts();
      Alert.alert('Reorder Notice', formatApiError(err));
    }
  };

  const openAddModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setName('');
    setPhone('');
    setRelationship('Family');
    setPriorityInput(String(contacts.length + 1));
    setIsDefault(contacts.length === 0);
    setIsModalVisible(true);
  };

  const openEditModal = (item: any) => {
    setIsEditing(true);
    setEditingId(item.id);
    setName(item.name);
    setPhone(item.phone);
    setRelationship(item.relationship || 'Family');
    setPriorityInput(String(item.priority || 1));
    setIsDefault(item.is_default);
    setIsModalVisible(true);
  };

  const handleSaveContact = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Required Information', 'Please provide both contact name and phone number.');
      return;
    }

    setModalLoading(true);
    try {
      const parsedPriority = parseInt(priorityInput, 10) || 1;
      if (isEditing && editingId) {
        await api.contacts.update(editingId, {
          name: name.trim(),
          phone: phone.trim(),
          relationship: relationship.trim(),
          is_default: isDefault,
          priority: parsedPriority,
        });
      } else {
        await api.contacts.create({
          name: name.trim(),
          phone: phone.trim(),
          relationship: relationship.trim(),
          is_default: isDefault,
          priority: parsedPriority,
        });
      }
      setIsModalVisible(false);
      fetchContacts();
    } catch (err: any) {
      Alert.alert('Save Failed', formatApiError(err));
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteContact = (item: any) => {
    Alert.alert(
      'Remove Contact',
      `Are you sure you want to remove ${item.name} from your trusted emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.contacts.delete(item.id);
              fetchContacts();
            } catch (err: any) {
              Alert.alert('Error', formatApiError(err));
            }
          },
        },
      ]
    );
  };

  const handleSetDefault = async (item: any) => {
    try {
      await api.contacts.setDefault(item.id);
      fetchContacts();
    } catch (err: any) {
      Alert.alert('Error', formatApiError(err));
    }
  };

  const handleCallContact = (phoneNumber: string) => {
    const clean = phoneNumber.replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${clean}`).catch(() => {
      Alert.alert('Call Error', 'Could not launch device phone dialer.');
    });
  };

  const handleImportFromPhone = async () => {
    setPickerLoading(true);
    setIsPickerVisible(true);
    try {
      const items = await DeviceContactsService.getDeviceContacts();
      setDeviceContacts(items);
    } catch (err: any) {
      Alert.alert('Device Access', err.message || 'Could not access phone address book.');
      setIsPickerVisible(false);
    } finally {
      setPickerLoading(false);
    }
  };

  const handleSelectDeviceContact = (item: DeviceContactItem) => {
    setName(item.name);
    setPhone(item.phone);
    setIsPickerVisible(false);
    setIsModalVisible(true);
  };

  const filteredDeviceContacts = deviceContacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
  );

  return (
    <ScreenWrapper activeTab="contacts" style={styles.screen}>
      {/* Screen Header */}
      <View style={styles.screenHeader}>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>Emergency Contacts</Text>
          <Text style={styles.headerSub}>
            Trusted responders notified with live GPS during an SOS alert
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionHeader}>
          <Button
            title="Add Contact"
            onPress={openAddModal}
            variant="emergency"
            size="sm"
            style={{ flex: 1, marginRight: 6 }}
            leftIcon={<Ionicons name="person-add" size={16} color="#FFFFFF" />}
          />
          <Button
            title="Import Phone"
            onPress={handleImportFromPhone}
            variant="secondary"
            size="sm"
            style={{ flex: 1, marginLeft: 6 }}
            leftIcon={<Ionicons name="phone-portrait-outline" size={16} color={Colors.textPrimary} />}
          />
        </View>
      </View>

      {/* Contacts List / Empty State */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.infoBlue} />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      ) : contacts.length === 0 ? (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="shield-outline" size={44} color={Colors.emergencyRedBright} />
          </View>
          <Text style={styles.emptyTitle}>No Emergency Contacts Added</Text>
          <Text style={styles.emptySub}>
            Your emergency contacts will receive immediate SMS dispatches with your live GPS location when you trigger an SOS.
          </Text>
          <Button
            title="Add First Trusted Contact"
            onPress={openAddModal}
            variant="emergency"
            size="md"
            style={{ marginTop: 18, width: '100%' }}
            leftIcon={<Ionicons name="person-add" size={18} color="#FFFFFF" />}
          />
        </Card>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 16 }}
          ListHeaderComponent={
            <Card style={styles.escalationSettingsCard}>
              <View style={styles.escalationHeaderRow}>
                <View style={styles.escalationTitleCol}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="git-network-outline" size={18} color={Colors.emergencyRedBright} style={{ marginRight: 6 }} />
                    <Text style={styles.escalationTitle}>Automatic Escalation Ladder</Text>
                  </View>
                  <Text style={styles.escalationSub}>
                    Auto-alert next contact if no response arrives before timeout
                  </Text>
                </View>
                <Switch
                  value={autoEscalationEnabled}
                  onValueChange={handleToggleAutoEscalation}
                  trackColor={{ false: '#1E293B', true: Colors.emergencyRedBright }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {autoEscalationEnabled && (
                <View style={styles.timeoutSection}>
                  <Text style={styles.timeoutLabel}>Acknowledgement Timeout:</Text>
                  <View style={styles.timeoutPillsRow}>
                    {[
                      { sec: 60, label: '60s (1m)' },
                      { sec: 120, label: '120s (2m)' },
                      { sec: 180, label: '180s (3m)' },
                      { sec: 300, label: '300s (5m)' },
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.sec}
                        style={[
                          styles.timeoutPill,
                          escalationTimeout === opt.sec && styles.timeoutPillActive,
                        ]}
                        onPress={() => handleSelectTimeout(opt.sec)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.timeoutPillText,
                            escalationTimeout === opt.sec && styles.timeoutPillTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.ladderFlowRow}>
                    <View style={styles.ladderStep}>
                      <Text style={styles.ladderStepNum}>L1</Text>
                      <Text style={styles.ladderStepText}>Primary</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} />
                    <View style={styles.ladderStep}>
                      <Text style={styles.ladderStepNum}>L2</Text>
                      <Text style={styles.ladderStepText}>Secondary</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} />
                    <View style={styles.ladderStep}>
                      <Text style={styles.ladderStepNum}>L3</Text>
                      <Text style={styles.ladderStepText}>Tertiary</Text>
                    </View>
                  </View>
                </View>
              )}
            </Card>
          }
          renderItem={({ item, index }) => {
            const priorityNum = item.priority || index + 1;
            const priorityBadgeVariant = priorityNum === 1 ? 'danger' : priorityNum === 2 ? 'warning' : 'info';
            const priorityLabel = priorityNum === 1 ? 'PRIORITY 1 • PRIMARY' : priorityNum === 2 ? 'PRIORITY 2 • SECONDARY' : `PRIORITY ${priorityNum} • TERTIARY`;

            return (
              <Card style={styles.contactCard}>
                {/* Priority & Reorder Bar */}
                <View style={styles.priorityBarRow}>
                  <Badge label={priorityLabel} variant={priorityBadgeVariant as any} />
                  <View style={styles.reorderButtonsGroup}>
                    <TouchableOpacity
                      style={[styles.reorderBtn, index === 0 && styles.reorderBtnDisabled]}
                      disabled={index === 0}
                      onPress={() => handleMovePriority(index, 'UP')}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chevron-up" size={16} color={index === 0 ? '#475569' : '#FFFFFF'} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.reorderBtn, index === contacts.length - 1 && styles.reorderBtnDisabled]}
                      disabled={index === contacts.length - 1}
                      onPress={() => handleMovePriority(index, 'DOWN')}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chevron-down" size={16} color={index === contacts.length - 1 ? '#475569' : '#FFFFFF'} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.contactMainRow}>
                  {/* Contact Avatar Circle */}
                  <View style={[styles.avatarCircle, item.is_default && styles.avatarCircleDefault]}>
                    <Text style={styles.avatarInitial}>
                      {item.name ? item.name[0].toUpperCase() : 'C'}
                    </Text>
                  </View>

                  {/* Info Text */}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={styles.nameBadgeRow}>
                      <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
                      {item.is_default && (
                        <Badge label="DEFAULT" variant="success" style={{ marginLeft: 6 }} />
                      )}
                    </View>
                    <Text style={styles.contactPhone}>{item.phone}</Text>
                    <View style={styles.relBadgeWrap}>
                      <Ionicons name="heart" size={12} color={Colors.emergencyRedBright} style={{ marginRight: 4 }} />
                      <Text style={styles.contactRelation}>{item.relationship || 'Emergency Contact'}</Text>
                    </View>
                  </View>

                  {/* Quick Call Button */}
                  <TouchableOpacity
                    style={styles.callCircleBtn}
                    onPress={() => handleCallContact(item.phone)}
                    activeOpacity={0.7}
                    accessibilityLabel={`Call ${item.name}`}
                  >
                    <Ionicons name="call" size={17} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* Action Pills Row */}
                <View style={styles.cardActionsRow}>
                  {!item.is_default && (
                    <TouchableOpacity
                      onPress={() => handleSetDefault(item)}
                      style={styles.actionPill}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="star-outline" size={13} color={Colors.infoBlue} />
                      <Text style={styles.actionPillText}>Set Default</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={() => openEditModal(item)}
                    style={styles.actionPill}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="create-outline" size={13} color={Colors.textSecondary} />
                    <Text style={styles.actionPillText}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleDeleteContact(item)}
                    style={[styles.actionPill, styles.actionPillDelete]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={13} color={Colors.emergencyRedBright} />
                    <Text style={[styles.actionPillText, { color: Colors.emergencyRedBright }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          }}
        />
      )}

      {/* Add / Edit Contact Modal */}
      <Modal visible={isModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                {isEditing ? 'Edit Emergency Contact' : 'New Emergency Contact'}
              </Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Input
              label="Contact Full Name"
              placeholder="e.g. Sarah Connor"
              value={name}
              onChangeText={setName}
              leftIcon={<Ionicons name="person-outline" size={20} color={Colors.textMuted} />}
            />

            <Input
              label="Phone Number"
              placeholder="e.g. +1 555 123 4567"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              leftIcon={<Ionicons name="call-outline" size={20} color={Colors.textMuted} />}
            />

            <Input
              label="Escalation Priority (1 = Primary, 2 = Secondary, 3 = Tertiary)"
              placeholder="1"
              keyboardType="number-pad"
              value={priorityInput}
              onChangeText={setPriorityInput}
              leftIcon={<Ionicons name="trending-up" size={18} color={Colors.textMuted} />}
            />

            {/* Relationship Chips */}
            <Text style={styles.inputLabel}>Relationship</Text>
            <View style={styles.relationshipChipsRow}>
              {RELATIONSHIP_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.relChip,
                    relationship === opt && styles.relChipActive,
                  ]}
                  onPress={() => setRelationship(opt)}
                >
                  <Text
                    style={[
                      styles.relChipText,
                      relationship === opt && styles.relChipTextActive,
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Default Contact Toggle */}
            <TouchableOpacity
              style={styles.defaultToggleRow}
              onPress={() => setIsDefault(!isDefault)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isDefault ? 'checkbox' : 'square-outline'}
                size={22}
                color={isDefault ? Colors.safetyGreen : Colors.textMuted}
              />
              <Text style={styles.defaultToggleText}>
                Set as Primary Emergency Responder
              </Text>
            </TouchableOpacity>

            <Button
              title={isEditing ? 'Update Contact' : 'Save Contact'}
              onPress={handleSaveContact}
              variant="emergency"
              size="lg"
              loading={modalLoading}
              style={{ marginTop: 14 }}
              leftIcon={<Ionicons name="checkmark-sharp" size={18} color="#FFFFFF" />}
            />
          </Card>
        </View>
      </Modal>

      {/* Device Contacts Import Modal */}
      <Modal visible={isPickerVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <Card style={styles.devicePickerCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Import From Phone</Text>
              <TouchableOpacity onPress={() => setIsPickerVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Input
              label=""
              placeholder="Search phone contacts..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              leftIcon={<Ionicons name="search" size={18} color={Colors.textMuted} />}
            />

            {pickerLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Colors.infoBlue} />
                <Text style={styles.loadingText}>Accessing device address book...</Text>
              </View>
            ) : filteredDeviceContacts.length === 0 ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <Text style={{ color: Colors.textMuted }}>No contacts found.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredDeviceContacts}
                keyExtractor={(item, idx) => `${item.name}-${idx}`}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.deviceContactItem}
                    onPress={() => handleSelectDeviceContact(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.deviceAvatar}>
                      <Text style={styles.deviceAvatarText}>{item.name[0]?.toUpperCase() || '?'}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.deviceName}>{item.name}</Text>
                      <Text style={styles.devicePhone}>{item.phone}</Text>
                    </View>
                    <Ionicons name="add-circle" size={22} color={Colors.infoBlue} />
                  </TouchableOpacity>
                )}
              />
            )}
          </Card>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    marginBottom: 14,
  },
  headerTitleGroup: {
    marginBottom: 12,
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
    marginTop: 3,
    lineHeight: 18,
  },
  actionHeader: {
    flexDirection: 'row',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 10,
  },
  emptyCard: {
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 28,
    backgroundColor: '#101F42',
    borderColor: '#1E356D',
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySub: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  /* Contact Cards */
  escalationSettingsCard: {
    marginBottom: 14,
    padding: 14,
    backgroundColor: '#0F1E3D',
    borderColor: '#1E3A8A',
    borderWidth: 1.5,
  },
  escalationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  escalationTitleCol: {
    flex: 1,
    paddingRight: 10,
  },
  escalationTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  escalationSub: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  timeoutSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  timeoutLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeoutPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  timeoutPill: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: '#0D162F',
    borderWidth: 1,
    borderColor: '#1E356D',
    alignItems: 'center',
  },
  timeoutPillActive: {
    backgroundColor: '#DC2626',
    borderColor: '#EF4444',
  },
  timeoutPillText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  timeoutPillTextActive: {
    color: '#FFFFFF',
  },
  ladderFlowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#0A1329',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 2,
  },
  ladderStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ladderStepNum: {
    color: Colors.emergencyRedBright,
    fontSize: 11,
    fontWeight: '900',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ladderStepText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  priorityBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#172554',
  },
  reorderButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reorderBtn: {
    width: 26,
    height: 26,
    borderRadius: 5,
    backgroundColor: '#1E356D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtnDisabled: {
    backgroundColor: '#0F1A34',
    opacity: 0.5,
  },
  contactCard: {
    marginBottom: 12,
    padding: 14,
    backgroundColor: '#101F42',
    borderColor: '#1E356D',
  },
  contactMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1E356D',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
  },
  avatarCircleDefault: {
    borderColor: Colors.safetyGreen,
    backgroundColor: '#064E3B',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  contactName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  contactPhone: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },
  relBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  contactRelation: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  callCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.safetyGreen,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: Colors.safetyGreen,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#172554',
    paddingTop: 8,
    gap: 8,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#0D1836',
    borderWidth: 1,
    borderColor: '#1E356D',
  },
  actionPillDelete: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  actionPillText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  /* Modals */
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
    fontSize: 17,
    fontWeight: '800',
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 4,
  },
  relationshipChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  relChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0A142D',
    borderWidth: 1,
    borderColor: '#1E356D',
  },
  relChipActive: {
    backgroundColor: Colors.emergencyRedBright,
    borderColor: Colors.emergencyRedBright,
  },
  relChipText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  relChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  defaultToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  defaultToggleText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  /* Device Contact Picker */
  devicePickerCard: {
    width: '100%',
    maxWidth: 400,
    padding: 18,
    backgroundColor: '#0F1D3D',
    borderColor: '#1E356D',
  },
  deviceContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#172554',
  },
  deviceAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E356D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  deviceName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  devicePhone: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});
