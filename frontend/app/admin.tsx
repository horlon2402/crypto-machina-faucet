import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Modal,
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

interface UserData {
  user_id: string;
  email: string;
  name: string;
  balances: { LTC: number; TRX: number; JST: number };
  consecutive_days: number;
  created_at: string;
}

interface ClaimData {
  user_id: string;
  user_email?: string;
  user_name?: string;
  coin: string;
  base_reward: number;
  bonus_percent: number;
  total_reward: number;
  ip_address: string;
  timestamp: string;
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
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'rejected'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showClaimsModal, setShowClaimsModal] = useState(false);
  const [users, setUsers] = useState<UserData[]>([]);
  const [claims, setClaims] = useState<ClaimData[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingClaims, setLoadingClaims] = useState(false);
  
  const scrollViewRef = useRef<ScrollView>(null);

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

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/users`, {
        headers: {
          'X-Admin-Key': ADMIN_PASSWORD,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchClaims = async () => {
    setLoadingClaims(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/claims`, {
        headers: {
          'X-Admin-Key': ADMIN_PASSWORD,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setClaims(data.claims || []);
      }
    } catch (error) {
      console.error('Error fetching claims:', error);
    } finally {
      setLoadingClaims(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, filter, fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Handle pending card click - filter and scroll
  const handlePendingClick = () => {
    setFilter('pending');
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 300, animated: true });
    }, 100);
  };

  // Handle users card click - show modal
  const handleUsersClick = () => {
    setShowUsersModal(true);
    fetchUsers();
  };

  // Handle claims card click - show modal
  const handleClaimsClick = () => {
    setShowClaimsModal(true);
    fetchClaims();
  };

  const handleProcessWithdrawal = async (requestId: string, action: 'approve' | 'reject') => {
    const actionText = action === 'approve' ? 'approve (mark as PAID)' : 'reject';
    
    Alert.alert(
      `${action === 'approve' ? 'Approve' : 'Reject'} Withdrawal`,
      `Are you sure you want to ${actionText} this withdrawal request?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approve' : 'Reject',
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
                const data = await response.json();
                Alert.alert('Success', data.message || `Withdrawal ${action}d successfully`);
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
      case 'paid':
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

  const formatBalance = (amount: number, coin: string): string => {
    if (coin === 'LTC') return amount.toFixed(8);
    return amount.toFixed(4);
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
          <Text style={styles.headerSubtitle}>Manage withdrawals & users</Text>
        </View>
        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={() => setIsAuthenticated(false)}
        >
          <Ionicons name="log-out-outline" size={24} color="#ef4444" />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
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
        {/* Interactive Stats Cards */}
        {stats && (
          <View style={styles.statsContainer}>
            {/* Total Users - Green - Clickable */}
            <TouchableOpacity 
              style={[styles.statCard, styles.statCardUsers]}
              onPress={handleUsersClick}
              activeOpacity={0.7}
            >
              <Ionicons name="people" size={20} color="#4ade80" style={styles.statIcon} />
              <Text style={[styles.statValue, { color: '#4ade80' }]}>{stats.total_users}</Text>
              <Text style={[styles.statLabel, { color: '#4ade80' }]}>Users</Text>
              <Text style={styles.tapHint}>Tap to view</Text>
            </TouchableOpacity>

            {/* Total Claims - Blue - Clickable */}
            <TouchableOpacity 
              style={[styles.statCard, styles.statCardClaims]}
              onPress={handleClaimsClick}
              activeOpacity={0.7}
            >
              <Ionicons name="gift" size={20} color="#60a5fa" style={styles.statIcon} />
              <Text style={[styles.statValue, { color: '#60a5fa' }]}>{stats.total_claims}</Text>
              <Text style={[styles.statLabel, { color: '#60a5fa' }]}>Claims</Text>
              <Text style={styles.tapHint}>Tap to view</Text>
            </TouchableOpacity>

            {/* Pending Withdrawals - Orange/Red - Clickable */}
            <TouchableOpacity 
              style={[styles.statCard, styles.statCardPending]}
              onPress={handlePendingClick}
              activeOpacity={0.7}
            >
              <Ionicons name="time" size={20} color="#f7931a" style={styles.statIcon} />
              <Text style={styles.statValueHighlight}>{stats.pending_withdrawals}</Text>
              <Text style={styles.statLabelHighlight}>Pending</Text>
              <Text style={styles.tapHint}>Tap to filter</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Filter Tabs */}
        <View style={styles.filterContainer}>
          {(['pending', 'paid', 'rejected', 'all'] as const).map((status) => (
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
                {status === 'paid' ? 'Paid' : status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Withdrawals List */}
        <Text style={styles.sectionTitle}>
          Withdrawal Requests {filter !== 'all' && `(${filter})`}
        </Text>
        
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
                    {withdrawal.status.toUpperCase()}
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
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        <Text style={styles.actionButtonText}>Approve (PAID)</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.rejectButton]}
                    onPress={() => handleProcessWithdrawal(withdrawal.request_id, 'reject')}
                    disabled={processingId === withdrawal.request_id}
                  >
                    <Ionicons name="close-circle" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}

              {withdrawal.status === 'paid' && (
                <View style={styles.paidBanner}>
                  <Ionicons name="checkmark-done-circle" size={20} color="#4ade80" />
                  <Text style={styles.paidText}>Payment Completed</Text>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Users Modal */}
      <Modal visible={showUsersModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                <Ionicons name="people" size={20} color="#4ade80" /> All Users ({users.length})
              </Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowUsersModal(false)}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {loadingUsers ? (
              <ActivityIndicator size="large" color="#f7931a" style={{ marginTop: 40 }} />
            ) : (
              <ScrollView style={styles.modalList}>
                {users.map((user) => (
                  <View key={user.user_id} style={styles.userCard}>
                    <View style={styles.userHeader}>
                      <Ionicons name="person-circle" size={32} color="#f7931a" />
                      <View style={styles.userInfo}>
                        <Text style={styles.userName}>{user.name}</Text>
                        <Text style={styles.userEmail}>{user.email}</Text>
                      </View>
                      <View style={styles.streakBadge}>
                        <Ionicons name="flame" size={12} color="#f7931a" />
                        <Text style={styles.streakText}>{user.consecutive_days}d</Text>
                      </View>
                    </View>
                    
                    <View style={styles.balancesRow}>
                      <View style={styles.balanceItem}>
                        <Text style={styles.balanceCoin}>LTC</Text>
                        <Text style={styles.balanceValue}>{formatBalance(user.balances?.LTC || 0, 'LTC')}</Text>
                      </View>
                      <View style={styles.balanceItem}>
                        <Text style={styles.balanceCoin}>TRX</Text>
                        <Text style={styles.balanceValue}>{formatBalance(user.balances?.TRX || 0, 'TRX')}</Text>
                      </View>
                      <View style={styles.balanceItem}>
                        <Text style={styles.balanceCoin}>JST</Text>
                        <Text style={styles.balanceValue}>{formatBalance(user.balances?.JST || 0, 'JST')}</Text>
                      </View>
                    </View>
                    
                    <Text style={styles.userDate}>
                      Joined: {new Date(user.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Claims History Modal */}
      <Modal visible={showClaimsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                <Ionicons name="gift" size={20} color="#60a5fa" /> Claim History ({claims.length})
              </Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowClaimsModal(false)}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {loadingClaims ? (
              <ActivityIndicator size="large" color="#f7931a" style={{ marginTop: 40 }} />
            ) : (
              <ScrollView style={styles.modalList}>
                {claims.map((claim, index) => (
                  <View key={`${claim.user_id}-${claim.timestamp}-${index}`} style={styles.claimCard}>
                    <View style={styles.claimHeader}>
                      <View
                        style={[
                          styles.claimCoinBadge,
                          { backgroundColor: COIN_COLORS[claim.coin] || '#666' },
                        ]}
                      >
                        <Text style={styles.claimCoinText}>{claim.coin}</Text>
                      </View>
                      <Text style={styles.claimAmount}>
                        +{claim.total_reward.toFixed(8)}
                      </Text>
                    </View>
                    
                    <View style={styles.claimDetails}>
                      <Text style={styles.claimUser}>
                        {claim.user_name || claim.user_email || claim.user_id}
                      </Text>
                      {claim.bonus_percent > 0 && (
                        <View style={styles.bonusBadge}>
                          <Text style={styles.bonusText}>+{claim.bonus_percent}% bonus</Text>
                        </View>
                      )}
                    </View>
                    
                    <Text style={styles.claimTime}>
                      {new Date(claim.timestamp).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  statCardUsers: {
    backgroundColor: '#4ade8015',
    borderWidth: 1,
    borderColor: '#4ade8050',
  },
  statCardClaims: {
    backgroundColor: '#60a5fa15',
    borderWidth: 1,
    borderColor: '#60a5fa50',
  },
  statCardPending: {
    backgroundColor: '#f7931a22',
    borderWidth: 1,
    borderColor: '#f7931a',
  },
  statIcon: {
    marginBottom: 4,
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
  tapHint: {
    fontSize: 9,
    color: '#666',
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
    paddingVertical: 14,
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
  paidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ade8022',
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  paidText: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  modalList: {
    padding: 20,
  },
  userCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  userEmail: {
    fontSize: 12,
    color: '#888',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7931a22',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  streakText: {
    fontSize: 12,
    color: '#f7931a',
    fontWeight: '600',
  },
  balancesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  balanceItem: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  balanceCoin: {
    fontSize: 10,
    color: '#888',
    marginBottom: 2,
  },
  balanceValue: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '500',
  },
  userDate: {
    fontSize: 10,
    color: '#666',
    textAlign: 'right',
  },
  // Claims modal styles
  claimCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  claimHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  claimCoinBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  claimCoinText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  claimAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4ade80',
  },
  claimDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  claimUser: {
    fontSize: 12,
    color: '#fff',
    flex: 1,
  },
  bonusBadge: {
    backgroundColor: '#f7931a33',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bonusText: {
    fontSize: 10,
    color: '#f7931a',
    fontWeight: '600',
  },
  claimTime: {
    fontSize: 10,
    color: '#666',
  },
});
