import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';

import { Palette, Radius, Spacing } from '@/constants/theme';
import { GlassCard } from '@/components/ui/glass-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { TacticalButton } from '@/components/ui/tactical-button';
import { auth } from '@/lib/firebase';
import { fetchContactsFromCloud, syncContactsToCloud } from '@/lib/safety-service';

type Contact = {
  id: string;
  name: string;
  phone: string;
};

const STORAGE_KEY = 'safenest_trusted_contacts';

export default function ContactsScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function loadContacts() {
      try {
        let currentContacts: Contact[] = [];
        const saved = await SecureStore.getItemAsync(STORAGE_KEY);
        if (saved) {
          currentContacts = JSON.parse(saved) as Contact[];
          setContacts(currentContacts);
        }

        // Cloud sync with Firebase Realtime Database if authenticated
        if (auth.currentUser) {
          const cloudContacts = await fetchContactsFromCloud(auth.currentUser.uid);
          if (cloudContacts && cloudContacts.length > 0) {
            const map = new Map<string, Contact>();
            currentContacts.forEach((c) => map.set(c.phone, c));
            cloudContacts.forEach((c) => map.set(c.phone, c));
            const merged = Array.from(map.values());
            setContacts(merged);
            await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged));
          }
        }
      } catch {
        Alert.alert('Error', 'Could not load saved contacts from secure storage.');
      } finally {
        setLoaded(true);
      }
    }

    loadContacts();
  }, []);

  async function saveContacts(next: Contact[]) {
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      setContacts(next);
      if (auth.currentUser) {
        void syncContactsToCloud(auth.currentUser.uid, next);
      }
    } catch {
      Alert.alert('Error', 'Could not save contacts to secure storage.');
    }
  }

  async function addContact() {
    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    if (!cleanName || !cleanPhone) {
      Alert.alert('Missing Details', 'Please enter both contact name and phone number.');
      return;
    }

    if (cleanPhone.length < 5) {
      Alert.alert('Invalid Number', 'Please enter a valid phone number (at least 5 digits).');
      return;
    }

    setAdding(true);
    const next = [
      ...contacts,
      {
        id: Date.now().toString(),
        name: cleanName,
        phone: cleanPhone,
      },
    ];

    await saveContacts(next);
    setName('');
    setPhone('');
    setAdding(false);
  }

  function removeContact(id: string, contactName: string) {
    Alert.alert(
      `Remove ${contactName}?`,
      'This person will no longer receive emergency dispatch alerts or telemetry from your device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void saveContacts(contacts.filter((c) => c.id !== id));
          },
        },
      ]
    );
  }

  async function callContact(phoneNumber: string) {
    const url = `tel:${phoneNumber}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Call Contact', `Calling ${phoneNumber}`);
      }
    } catch {
      Alert.alert('Error', `Could not initiate call to ${phoneNumber}`);
    }
  }

  async function testAlertContact(contactItem: Contact) {
    const msg = `SafeNest Alert Test: Hi ${contactItem.name}, this is a verified test from my SafeNest emergency app. You are registered in my Safe Circle.`;
    const smsUrl = `sms:${contactItem.phone}?body=${encodeURIComponent(msg)}`;
    try {
      const canOpen = await Linking.canOpenURL(smsUrl);
      if (canOpen) {
        await Linking.openURL(smsUrl);
      } else {
        Alert.alert('Simulated Alert', `Simulated SMS dispatched to ${contactItem.name} (${contactItem.phone}):\n\n"${msg}"`);
      }
    } catch {
      Alert.alert('Simulated Alert', `Simulated SMS dispatched to ${contactItem.name} (${contactItem.phone})`);
    }
  }

  function getInitials(fullName: string) {
    const parts = fullName.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return fullName.substring(0, 2).toUpperCase();
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        {/* Top Navigation & Status */}
        <View style={styles.topNav}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            }}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Back to dashboard"
          >
            <Ionicons name="arrow-back" size={16} color={Palette.textPrimary} />
            <Text style={styles.backBtnText}>Dashboard</Text>
          </TouchableOpacity>

          <StatusBadge
            label={`${contacts.length} IN CIRCLE`}
            variant={contacts.length > 0 ? 'lime' : 'neutral'}
          />
        </View>

        {/* Editorial Header */}
        <View style={styles.editorialHeader}>
          <Text style={styles.kicker}>GUARDIAN MESH</Text>
          <Text style={styles.heading}>Safe Circle.</Text>
          <Text style={styles.subheading}>
            Trusted people who receive instantaneous automated SMS dispatch and live satellite telemetry links when SOS is triggered.
          </Text>
        </View>

        {/* Add Contact Card */}
        <GlassCard style={styles.addCard}>
          <Text style={styles.addCardTitle}>ENROLL NEW GUARDIAN</Text>
          <TextInput
            style={styles.input}
            placeholder="Full Name (e.g. Elena Rostova)"
            placeholderTextColor={Palette.textMuted}
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Mobile Number (e.g. +1 555 019 2834)"
            placeholderTextColor={Palette.textMuted}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TacticalButton
            label="+ Add Guardian"
            variant="primary"
            icon={<Ionicons name="person-add" size={16} color="#0A0C10" />}
            onPress={addContact}
            loading={adding}
            style={styles.addBtn}
          />
        </GlassCard>

        {/* Contact List */}
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            contacts.length > 0 ? (
              <View style={styles.listHeaderRow}>
                <Text style={styles.listHeaderTitle}>ACTIVE GUARDIANS</Text>
                <Text style={styles.listHeaderMeta}>SYNCED TO CLOUD</Text>
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            loaded ? (
              <GlassCard style={styles.emptyCard}>
                <View style={styles.emptyIconOrb}>
                  <Ionicons name="people-outline" size={32} color={Palette.accentLime} />
                </View>
                <Text style={styles.emptyTitle}>No Guardians Configured</Text>
                <Text style={styles.emptyDesc}>
                  Add at least 1 or 2 people you trust. In emergencies, SafeNest dispatches simulated SMS alerts with your real-time satellite coordinates to your safe circle.
                </Text>
              </GlassCard>
            ) : undefined
          }
          renderItem={({ item }) => (
            <GlassCard style={styles.contactCard}>
              <View style={styles.contactTopRow}>
                <View style={styles.avatarOrb}>
                  <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
                </View>

                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{item.name}</Text>
                  <Text style={styles.contactPhone}>{item.phone}</Text>
                </View>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => removeContact(item.id, item.name)}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name}`}
                >
                  <Ionicons name="trash-outline" size={16} color={Palette.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.contactActionsRow}>
                <TouchableOpacity
                  style={styles.contactActionBtn}
                  onPress={() => callContact(item.phone)}
                >
                  <Ionicons name="call" size={14} color={Palette.textPrimary} />
                  <Text style={styles.contactActionText}>Direct Call</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.contactActionBtn, styles.testAlertBtn]}
                  onPress={() => testAlertContact(item)}
                >
                  <Ionicons name="send" size={13} color={Palette.accentLime} />
                  <Text style={[styles.contactActionText, { color: Palette.accentLime }]}>Test Alert</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          )}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.bgPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.select({ ios: 60, android: 45 }) ?? 45,
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
  },
  backBtnText: {
    color: Palette.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  editorialHeader: {
    marginBottom: Spacing.four,
  },
  kicker: {
    color: Palette.accentLime,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  heading: {
    color: Palette.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subheading: {
    color: Palette.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  addCard: {
    marginBottom: Spacing.four,
  },
  addCardTitle: {
    color: Palette.accentLime,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: Spacing.two,
  },
  input: {
    backgroundColor: Palette.bgSecondary,
    color: Palette.textPrimary,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
    marginBottom: 10,
  },
  addBtn: {
    marginTop: 2,
    minHeight: 46,
  },
  listContent: {
    paddingBottom: 110,
    gap: 10,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
    marginTop: Spacing.two,
  },
  listHeaderTitle: {
    color: Palette.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  listHeaderMeta: {
    color: Palette.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  contactCard: {
    padding: Spacing.three,
  },
  contactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.two,
  },
  avatarOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1.5,
    borderColor: Palette.borderHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Palette.accentLime,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    color: Palette.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  contactPhone: {
    color: Palette.textSecondary,
    fontSize: 13,
    marginTop: 2,
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  contactActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  contactActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
  },
  testAlertBtn: {
    backgroundColor: 'rgba(212, 255, 58, 0.08)',
    borderColor: 'rgba(212, 255, 58, 0.25)',
  },
  contactActionText: {
    color: Palette.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    padding: Spacing.five,
    marginTop: Spacing.three,
  },
  emptyIconOrb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Palette.accentLimeSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  emptyTitle: {
    color: Palette.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyDesc: {
    color: Palette.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
});