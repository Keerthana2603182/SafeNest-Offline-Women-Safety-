import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
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
  }

  function removeContact(id: string, contactName: string) {
    Alert.alert(
      `Remove ${contactName}?`,
      'This will remove this trusted contact from SafeNest emergency dispatch on this device.',
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
    const msg = `SafeNest Alert Test: Hi ${contactItem.name}, this is a test from my SafeNest app. You are listed as my emergency trusted contact.`;
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

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Loading safe circle...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
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
          <Text style={styles.backButtonText}>← Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.headerBadge}>👥 Safe Circle</Text>
      </View>

      <Text style={styles.heading} accessibilityRole="header">Trusted Contacts</Text>
      <Text style={styles.subtitle}>
        Add people you trust. In an emergency, SafeNest dispatches simulated SMS alerts with your real-time GPS coordinates to your safe circle.
      </Text>

      {/* Input Section */}
      <View style={styles.formCard}>
        <TextInput
          style={styles.input}
          placeholder="Contact name (e.g. Mom, Alex)"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
          accessible={true}
          accessibilityLabel="Contact name"
          accessibilityHint="Enter name of your trusted person"
        />

        <TextInput
          style={styles.input}
          placeholder="Phone number"
          placeholderTextColor="#999"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          accessible={true}
          accessibilityLabel="Phone number"
          accessibilityHint="Enter phone number for emergency contact"
        />

        <TouchableOpacity
          style={styles.addButton}
          onPress={addContact}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Add contact to safe circle"
          activeOpacity={0.85}
        >
          <Text style={styles.addText}>+ Add to Safe Circle</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle} accessibilityRole="header">
        Your Safe Circle ({contacts.length})
      </Text>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No contacts added yet</Text>
            <Text style={styles.emptyText}>
              Add at least 1-2 people you trust so SafeNest can notify them when SOS is triggered.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.contactCard} accessible={true} accessibilityLabel={`Contact ${item.name}, ${item.phone}`}>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{item.name}</Text>
              <Text style={styles.contactPhone}>{item.phone}</Text>
            </View>

            <View style={styles.contactActions}>
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={() => callContact(item.phone)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Call ${item.name}`}
                activeOpacity={0.7}
              >
                <Text style={styles.actionIconText}>📞</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={() => testAlertContact(item)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Send test message to ${item.name}`}
                activeOpacity={0.7}
              >
                <Text style={styles.actionIconText}>✉️</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => removeContact(item.id, item.name)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.name} from contacts`}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#100D20',
    padding: 22,
    paddingTop: 55,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#261F40',
  },
  backButtonText: {
    color: '#D8B4FE',
    fontSize: 13,
    fontWeight: '600',
  },
  headerBadge: {
    color: '#A78BFA',
    fontSize: 13,
    fontWeight: '600',
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#BDB6D0',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  formCard: {
    backgroundColor: '#211B36',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#2E2648',
    color: '#FFFFFF',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    fontSize: 15,
    minHeight: 50,
  },
  addButton: {
    backgroundColor: '#8B5CF6',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  addText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 30,
  },
  contactCard: {
    backgroundColor: '#211B36',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  contactPhone: {
    color: '#A78BFA',
    marginTop: 4,
    fontSize: 13,
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    backgroundColor: '#2E2648',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIconText: {
    fontSize: 18,
  },
  deleteButton: {
    backgroundColor: '#3E1D27',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: {
    color: '#FF6B6B',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#1E1730',
    borderRadius: 16,
    marginTop: 10,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  emptyText: {
    color: '#BDB6D0',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },
});