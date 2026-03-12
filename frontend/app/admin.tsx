import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface WithdrawalRequest {
  request_id: string;
  user_id: string;
  user_email?: string;
  coin: string;
  amount: number;
  wallet_address: string;
  status: string;
  created_at: string;
  processed_at?: string;
}

interface AdminStats {
  total_users: number;
  total_claims: number;
  pending_withdrawals: number;
  total_withdrawn: { [key: string]: number };
}

const COIN_COLORS: { [key: string]: string } = {
  LTC: '#345D9D',
  TRX: '#FF0013',
  JST: '#18AA6D',
};

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Admin password - SECURED
  const ADMIN_PASSWORD = 'Wira12485511....';

  const handleLogin = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      fetchData();
    } else {
      Alert.alert('Error', 'Invalid admin password');
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch withdrawals
      const withdrawalsRes = await fetch(`${BACKEND_URL}/api/admin/withdrawals?status=${filter}`, {
        headers: {
          'X-Admin-Key': ADMIN_PASSWORD,
        },
      });
      if (withdrawalsRes.ok) {
        const data = await withdrawalsRes.json();
        setWithdrawals(data.withdrawals || []);
      }

      // Fetch stats
      const statsRes = await fetch(`${BACKEND_URL}/api/admin/stats`, {
        headers: {
          'X-Admin-Key': ADMIN_PASSWORD,
        },
      });
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, filter, fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleProcessWithdrawal = async (requestId: string, action: 'approve' | 'reject') => {
    const actionText = action === 'approve' ? 'approve' : 'reject';
    
    Alert.alert(
      `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} Withdrawal`,
      `Are you sure you want to ${actionText} this withdrawal request?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionText.charAt(0).toUpperCase() + actionText.slice(1),
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: async () => {
            setProcessingId(requestId);
            try {
              const response = await fetch(`${BACKEND_URL}/api/admin/withdrawals/${requestId}/${action}`, {
                method: 'POST',
                headers: {
                  'X-Admin-Key': ADMIN_PASSWORD,
                },
              });

              if (response.ok) {
                Alert.alert('Success', `Withdrawal ${action}d successfully`);
                fetchData();
              } else {
                const data = await response.json();
                Alert.alert('Error', data.detail || 'Failed to process withdrawal');
              }
            } catch (error) {
              Alert.alert('Error', 'Network error');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
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

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loginContainer}>
          <Ionicons name="shield-checkmark" size={60} color="#f7931a" />
          <Text style={styles.loginTitle}>Admin Panel</Text>
          <Text style={styles.loginSubtitle}>Enter admin password to continue</Text>
          
          <TextInput
            style={styles.passwordInput}
            placeholder="Admin Password"
            placeholderTextColor="#666"
            secureTextEntry
            value={adminPassword}
            onChangeText={setAdminPassword}
          />
          
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Login</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#888" />
            <Text style={styles.backButtonText}>Back to App</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Admin Panel</Text>
          <Text style={styles.headerSubtitle}>Manage withdrawals</Text>
        </View>
        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={() => setIsAuthenticated(false)}
        >
          <Ionicons name="log-out-outline" size={24} color="#ef4444" />
        </TouchableOpacity>
      </View>

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
      >
        {/* Stats Cards */}
        {stats && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.total_users}</Text>
              <Text style={styles.statLabel}>Total Users</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.total_claims}</Text>
              <Text style={styles.statLabel}>Total Claims</Text>
            </View>
            <View style={[styles.statCard, styles.statCardHighlight]}>
              <Text style={styles.statValueHighlight}>{stats.pending_withdrawals}</Text>
              <Text style={styles.statLabelHighlight}>Pending</Text>
            </View>
          </View>
        )}

        {/* Filter Tabs */}
        <View style={styles.filterContainer}>
          {(['pending', 'completed', 'rejected', 'all'] as const).map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterTab,
                filter === status && styles.filterTabActive,
              ]}
              onPress={() => setFilter(status)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  filter === status && styles.filterTabTextActive,
                ]}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Withdrawals List */}
        <Text style={styles.sectionTitle}>Withdrawal Requests</Text>
        
        {loading ? (
          <ActivityIndicator size="large" color="#f7931a" style={{ marginTop: 20 }} />
        ) : withdrawals.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color="#333" />
            <Text style={styles.emptyText}>No {filter} withdrawals</Text>
          </View>
        ) : (
          withdrawals.map((withdrawal) => (
            <View key={withdrawal.request_id} style={styles.withdrawalCard}>
              <View style={styles.withdrawalHeader}>
                <View
                  style={[
                    styles.coinBadge,
                    { backgroundColor: COIN_COLORS[withdrawal.coin] || '#666' },
                  ]}
                >
                  <Text style={styles.coinBadgeText}>{withdrawal.coin}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(withdrawal.status) + '22' },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: getStatusColor(withdrawal.status) },
                    ]}
                  >
                    {withdrawal.status}
                  </Text>
                </View>
              </View>

              <Text style={styles.withdrawalAmount}>
                {withdrawal.amount} {withdrawal.coin}
              </Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>User:</Text>
                <Text style={styles.detailValue}>
                  {withdrawal.user_email || withdrawal.user_id}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Wallet:</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {withdrawal.wallet_address}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Date:</Text>
                <Text style={styles.detailValue}>
                  {new Date(withdrawal.created_at).toLocaleString()}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Request ID:</Text>
                <Text style={styles.detailValue}>{withdrawal.request_id}</Text>
              </View>

              {withdrawal.status === 'pending' && (
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.approveButton]}
                    onPress={() => handleProcessWithdrawal(withdrawal.request_id, 'approve')}
                    disabled={processingId === withdrawal.request_id}
                  >
                    {processingId === withdrawal.request_id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={18} color="#fff" />
                        <Text style={styles.actionButtonText}>Approve</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.rejectButton]}
                    onPress={() => handleProcessWithdrawal(withdrawal.request_id, 'reject')}
                    disabled={processingId === withdrawal.request_id}
                  >
                    <Ionicons name="close" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 32,
  },
  passwordInput: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 16,
  },
  loginButton: {
    width: '100%',
    backgroundColor: '#f7931a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  backButtonText: {
    color: '#888',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#888',
  },
  logoutButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statCardHighlight: {
    backgroundColor: '#f7931a22',
    borderWidth: 1,
    borderColor: '#f7931a',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  statValueHighlight: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f7931a',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  statLabelHighlight: {
    fontSize: 12,
    color: '#f7931a',
    marginTop: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: '#f7931a',
  },
  filterTabText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#666',
    marginTop: 8,
  },
  withdrawalCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  withdrawalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  coinBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  coinBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  withdrawalAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
    width: 80,
  },
  detailValue: {
    fontSize: 12,
    color: '#fff',
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  approveButton: {
    backgroundColor: '#4ade80',
  },
  rejectButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
