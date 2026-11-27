import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    User,
} from 'firebase/auth';

import { auth } from '../lib/firebase';

export default function AccountScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setChecking(false);
    });

    return unsubscribe;
  }, []);

  async function handleAccount() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing details', 'Enter your email and password.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }

    try {
      setLoading(true);

      if (isLogin) {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error: any) {
      Alert.alert('Account error', error.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      setEmail('');
      setPassword('');
      Alert.alert('Logged out', 'You have signed out of SafeNest.');
    } catch {
      Alert.alert('Error', 'Could not log out.');
    }
  }

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#A77BFF" size="large" />
      </View>
    );
  }

  if (user) {
    return (
      <View style={styles.container}>
        <Text style={styles.logo} accessibilityRole="header">🛡️ SafeNest</Text>
        <Text style={styles.heading}>{"You're signed in!"}</Text>
        <Text style={styles.subtitle}>{user.email}</Text>

        <View style={styles.syncCard}>
          <Text style={styles.syncTitle}>☁️ Cloud Synchronization</Text>
          <Text style={styles.syncItem}>• Realtime Database: Connected</Text>
          <Text style={styles.syncItem}>• Trusted Contacts: Synced to Cloud</Text>
          <Text style={styles.syncItem}>• Live Location Sessions: Enabled</Text>
          <Text style={styles.syncItem}>• User ID: {user.uid.substring(0, 12)}…</Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogout}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Log out of SafeNest"
          accessibilityHint="Double tap to sign out of your account"
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo} accessibilityRole="header">🛡️ SafeNest</Text>

      <Text style={styles.heading}>
        {isLogin ? 'Welcome Back' : 'Create Account'}
      </Text>

      <Text style={styles.subtitle}>Your safety, our priority.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email address"
        placeholderTextColor="#999"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={setEmail}
        accessible={true}
        accessibilityLabel="Email address"
        accessibilityHint="Enter your email address"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#999"
        secureTextEntry
        autoCapitalize="none"
        value={password}
        onChangeText={setPassword}
        accessible={true}
        accessibilityLabel="Password"
        accessibilityHint="Enter your password, at least 6 characters"
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.disabledButton]}
        onPress={handleAccount}
        disabled={loading}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={isLogin ? 'Login to your account' : 'Create a new account'}
        accessibilityHint="Double tap to submit your account credentials"
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            {isLogin ? 'Login' : 'Create Account'}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setIsLogin(!isLogin)}
        style={styles.switchButton}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={isLogin ? "Switch to Create Account" : "Switch to Login"}
        activeOpacity={0.7}
      >
        <Text style={styles.switchText}>
          {isLogin
            ? "Don't have an account? Create one"
            : 'Already have an account? Login'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#171326',
    justifyContent: 'center',
    padding: 25,
  },
  logo: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 35,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: '#BDB6D0',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  input: {
    backgroundColor: '#29233D',
    color: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 15,
    fontSize: 15,
  },
  button: {
    backgroundColor: '#A77BFF',
    padding: 17,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    minHeight: 52,
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  syncCard: {
    backgroundColor: '#211B36',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#3D3059',
  },
  syncTitle: {
    color: '#86EFAC',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  syncItem: {
    color: '#D8D1E8',
    fontSize: 12,
    lineHeight: 20,
  },
  switchButton: {
    marginTop: 25,
    alignItems: 'center',
    padding: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  switchText: {
    color: '#C4A5FF',
    fontSize: 14,
  },
});