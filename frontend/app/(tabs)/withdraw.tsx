import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { router } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface WithdrawalRecord {
  request_id: string;
  coin: string;
  amount: number;
  wallet_address: string;
  status: string;
  created_at: string;
}

const WITHDRAWAL_THRESHOLDS: { [key: string]: number } = {
  LTC: 0.01,
  TRX: 10,
  JST: 20,
};

const COIN_CONFIG: { [key: string]: { name: string; color: string } } = {
  LTC: { name: 'Litecoin', color: '#345D9D' },
  TRX: { name: 'Tron', color: '#FF0013' },
  JST: { name: 'JUST', color: '#18AA6D' },
};

export default function WithdrawScreen() {
  const { user, isAuthenticated, isLoading: authLoading, sessionToken, refreshUser } = useAuth();
  const [selectedCoin, setSelectedCoin] = useState<string>('LTC');
  const [amount, setAmount] = useState<string>('');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [history, setHistory] = useState<WithdrawalRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Check auth
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [authLoading, isAuthenticated]);

  // Fetch withdrawal history
  const fetchHistory = useCallback(async () => {
    if (!sessionToken) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/withdraw/history`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setHistory(data.withdrawals || []);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoadingHistory(false);
      setRefreshing(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (sessionToken) {
      fetchHistory();
    }
  }, [sessionToken, fetchHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
    refreshUser();
  };

  const currentBalance = user?.balances?.[selectedCoin] || 0;
  const minThreshold = WITHDRAWAL_THRESHOLDS[selectedCoin];
  const canWithdraw = currentBalance >= minThreshold && parseFloat(amount || '0') >= minThreshold;

  const handleMaxAmount = () => {
    setAmount(currentBalance.toString());
  };

  const handleWithdraw = async () => {
    Keyboard.dismiss();
    
    if (!walletAddress || walletAddress.length < 20) {
      Alert.alert('Error', 'Please enter a valid wallet address');
      return;
    }

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount < minThreshold) {
      Alert.alert('Error', `Minimum withdrawal is ${minThreshold} ${selectedCoin}`);
      return;
    }

    if (withdrawAmount > currentBalance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }

    Alert.alert(
      'Confirm Withdrawal',
      `You are about to request a withdrawal of ${withdrawAmount} ${selectedCoin} to:\n\n${walletAddress}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setWithdrawing(true);
            try {
              const response = await fetch(`${BACKEND_URL}/api/withdraw/request`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${sessionToken}`,
                },
                credentials: 'include',
                body: JSON.stringify({
                  coin: selectedCoin,
                  amount: withdrawAmount,
                  wallet_address: walletAddress,
                }),
              });

              const data = await response.json();

              if (response.ok) {
                Alert.alert('Success', data.message);
                setAmount('');
                setWalletAddress('');
                fetchHistory();
                refreshUser();
              } else {
                Alert.alert('Error', data.detail || 'Withdrawal failed');
              }
            } catch (error) {
              console.error('Withdrawal error:', error);
              Alert.alert('Error', 'Network error. Please try again.');
            } finally {
              setWithdrawing(false);
            }
          },
        },
      ]
    );
  };

  const formatBalance = (bal: number, coin: string): string => {
    if (coin === 'LTC') return bal.toFixed(8);
    return bal.toFixed(4);
  };

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'completed':
        return '#4ade80';
      case 'pending':
        return '#fbbf24';
      case 'rejected':
        return '#ef4444';
      default:
        return '#888';
    }
  };

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f7931a" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#f7931a"
            />
          }
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Withdraw</Text>
            <Text style={styles.subtitle}>Request a payout to your wallet</Text>
          </View>

          {/* Coin Selection */}
          <Text style={styles.label}>Select Coin</Text>
          <View style={styles.coinSelector}>
            {Object.entries(COIN_CONFIG).map(([coin, config]) => (
              <TouchableOpacity
                key={coin}
                style={[
                  styles.coinOption,
                  selectedCoin === coin && {
                    backgroundColor: config.color,
                    borderColor: config.color,
                  },
                ]}
                onPress={() => {
                  setSelectedCoin(coin);
                  setAmount('');
                }}
              >
                <Text
                  style={[
                    styles.coinOptionText,
                    selectedCoin === coin && { color: '#fff' },
                  ]}
                >
                  {coin}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Balance Info */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceValue}>
                {formatBalance(currentBalance, selectedCoin)} {selectedCoin}
              </Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Minimum Withdrawal</Text>
              <Text style={styles.minValue}>
                {minThreshold} {selectedCoin}
              </Text>
            </View>
            {currentBalance < minThreshold && (
              <View style={styles.warningBox}>
                <Ionicons name="warning" size={16} color="#fbbf24" />
                <Text style={styles.warningText}>
                  You need at least {minThreshold} {selectedCoin} to withdraw
                </Text>
              </View>
            )}
          </View>

          {/* Amount Input */}
          <Text style={styles.label}>Amount</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={`Enter amount (min ${minThreshold})`}
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
            <TouchableOpacity style={styles.maxButton} onPress={handleMaxAmount}>
              <Text style={styles.maxButtonText}>MAX</Text>
            </TouchableOpacity>
          </View>

          {/* Wallet Address Input */}
          <Text style={styles.label}>Wallet Address</Text>
          <TextInput
            style={[styles.input, styles.addressInput]}
            placeholder={`Enter your ${selectedCoin} wallet address`}
            placeholderTextColor="#666"
            value={walletAddress}
            onChangeText={setWalletAddress}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Withdraw Button */}
          <TouchableOpacity
            style={[
              styles.withdrawButton,
              (!canWithdraw || withdrawing) && styles.withdrawButtonDisabled,
            ]}
            onPress={handleWithdraw}
            disabled={!canWithdraw || withdrawing}
          >
            {withdrawing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="arrow-up-circle" size={24} color="#fff" />
                <Text style={styles.withdrawButtonText}>Request Payout</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Withdrawal History */}
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Withdrawal History</Text>
            
            {loadingHistory ? (
              <ActivityIndicator size="small" color="#f7931a" />
            ) : history.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Ionicons name="receipt-outline" size={48} color="#333" />
                <Text style={styles.emptyText}>No withdrawal history</Text>
              </View>
            ) : (
              history.map((item) => (
                <View key={item.request_id} style={styles.historyItem}>
                  <View style={styles.historyHeader}>
                    <View
                      style={[
                        styles.historyCoinBadge,
                        { backgroundColor: COIN_CONFIG[item.coin]?.color || '#666' },
                      ]}
                    >
                      <Text style={styles.historyCoinText}>{item.coin}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(item.status) + '22' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: getStatusColor(item.status) },
                        ]}
                      >
                        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.historyAmount}>
                    {item.amount} {item.coin}
                  </Text>
                  <Text style={styles.historyAddress} numberOfLines={1}>
                    To: {item.wallet_address}
                  </Text>
                  <Text style={styles.historyDate}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
    marginTop: 16,
  },
  coinSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  coinOption: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  coinOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  balanceCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#888',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  minValue: {
    fontSize: 14,
    color: '#f7931a',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fbbf2422',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  warningText: {
    fontSize: 12,
    color: '#fbbf24',
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  addressInput: {
    marginBottom: 24,
  },
  maxButton: {
    backgroundColor: '#f7931a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  maxButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7931a',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  withdrawButtonDisabled: {
    backgroundColor: '#333',
  },
  withdrawButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  historySection: {
    marginTop: 32,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  emptyHistory: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: '#666',
    marginTop: 8,
  },
  historyItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyCoinBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  historyCoinText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  historyAddress: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 12,
    color: '#888',
  },
});
