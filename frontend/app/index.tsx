import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useAuth } from './context/AuthContext';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const { user, isLoading, login, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.replace('/(tabs)/dashboard');
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f7931a" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="wallet" size={60} color="#f7931a" />
          </View>
          <Text style={styles.title}>Crypto Faucet</Text>
          <Text style={styles.subtitle}>Earn Free Crypto Daily</Text>
        </View>

        {/* Crypto Icons */}
        <View style={styles.cryptoIcons}>
          <View style={styles.cryptoItem}>
            <View style={[styles.cryptoCircle, { backgroundColor: '#345D9D' }]}>
              <Text style={styles.cryptoSymbol}>LTC</Text>
            </View>
            <Text style={styles.cryptoName}>Litecoin</Text>
          </View>
          <View style={styles.cryptoItem}>
            <View style={[styles.cryptoCircle, { backgroundColor: '#FF0013' }]}>
              <Text style={styles.cryptoSymbol}>TRX</Text>
            </View>
            <Text style={styles.cryptoName}>Tron</Text>
          </View>
          <View style={styles.cryptoItem}>
            <View style={[styles.cryptoCircle, { backgroundColor: '#18AA6D' }]}>
              <Text style={styles.cryptoSymbol}>JST</Text>
            </View>
            <Text style={styles.cryptoName}>JUST</Text>
          </View>
        </View>

        {/* Features */}
        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="time-outline" size={24} color="#f7931a" />
            <Text style={styles.featureText}>Claim every 5 minutes</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="trending-up-outline" size={24} color="#f7931a" />
            <Text style={styles.featureText}>Up to +100% loyalty bonus</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#f7931a" />
            <Text style={styles.featureText}>Secure & Fast Withdrawals</Text>
          </View>
        </View>

        {/* Login Button */}
        <TouchableOpacity style={styles.loginButton} onPress={login}>
          <Ionicons name="logo-google" size={24} color="#fff" />
          <Text style={styles.loginButtonText}>Sign in with Google</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          By signing in, you agree to our Terms of Service
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(247, 147, 26, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  cryptoIcons: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
    gap: 24,
  },
  cryptoItem: {
    alignItems: 'center',
  },
  cryptoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  cryptoSymbol: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cryptoName: {
    color: '#888',
    fontSize: 12,
  },
  features: {
    marginBottom: 40,
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  featureText: {
    color: '#fff',
    fontSize: 14,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7931a',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 16,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  disclaimer: {
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
  },
});
