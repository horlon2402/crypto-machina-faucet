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
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { router } from 'expo-router';
import unityAdsService, { isUnityAdsConfigured, UNITY_ADS_CONFIG } from '../../src/services/unityAds';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface ClaimStatus {
  available: boolean;
  seconds_remaining: number;
}

interface BalanceData {
  balances: { LTC: number; TRX: number; JST: number };
  consecutive_days: number;
  bonus_percent: number;
  claim_status: { [key: string]: ClaimStatus };
}

const COIN_CONFIG = {
  LTC: {
    name: 'Litecoin',
    color: '#345D9D',
    icon: 'flash',
    reward: 0.0000025,
  },
  TRX: {
    name: 'Tron',
    color: '#FF0013',
    icon: 'planet',
    reward: 0.01,
  },
  JST: {
    name: 'JUST',
    color: '#18AA6D',
    icon: 'leaf',
    reward: 0.05,
  },
};

export default function DashboardScreen() {
  const { user, isAuthenticated, isLoading: authLoading, logout, sessionToken, refreshUser } = useAuth();
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingCoin, setClaimingCoin] = useState<string | null>(null);
  const [timers, setTimers] = useState<{ [key: string]: number }>({});
  const [showAdModal, setShowAdModal] = useState(false);
  const [adCoin, setAdCoin] = useState<string | null>(null);
  const [adProgress, setAdProgress] = useState(0);
  const [unityAdsReady, setUnityAdsReady] = useState(false);
  const [adStatus, setAdStatus] = useState<string>('initializing');

  // Initialize Unity Ads on mount
  useEffect(() => {
    const initAds = async () => {
      if (Platform.OS === 'web') {
        setAdStatus('web-mock');
        return;
      }
      
      if (!isUnityAdsConfigured()) {
        setAdStatus('not-configured');
        return;
      }
      
      setAdStatus('initializing');
      const success = await unityAdsService.initialize();
      setUnityAdsReady(success);
      if (success) {
        setAdStatus('loading');
        const loaded = await unityAdsService.loadRewardedAd();
        setAdStatus(loaded ? 'ready' : 'load-failed');
      } else {
        setAdStatus('init-failed');
      }
    };
    initAds();
  }, []);

  // Refresh Unity Ads
  const refreshUnityAds = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Info', 'Unity Ads only works on mobile devices. Web preview uses simulated ads.');
      return;
    }
    
    setAdStatus('refreshing');
    try {
      const success = await unityAdsService.initialize();
      if (success) {
        const loaded = await unityAdsService.loadRewardedAd();
        setAdStatus(loaded ? 'ready' : 'load-failed');
        setUnityAdsReady(loaded);
        Alert.alert('Success', loaded ? 'Ad loaded successfully!' : 'Failed to load ad');
      } else {
        setAdStatus('init-failed');
        Alert.alert('Error', 'Failed to initialize Unity Ads');
      }
    } catch (error) {
      setAdStatus('error');
      Alert.alert('Error', 'Failed to refresh ads');
    }
  };

  // Check auth and redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [authLoading, isAuthenticated]);

  // Fetch balance data
  const fetchBalanceData = useCallback(async () => {
    if (!sessionToken) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/balance`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setBalanceData(data);
        
        // Update timers from server data
        const newTimers: { [key: string]: number } = {};
        Object.entries(data.claim_status).forEach(([coin, status]: [string, any]) => {
          if (!status.available && status.seconds_remaining > 0) {
            newTimers[coin] = status.seconds_remaining;
          }
        });
        setTimers(newTimers);
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (sessionToken) {
      fetchBalanceData();
    }
  }, [sessionToken, fetchBalanceData]);

  // Timer countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers((prev) => {
        const updated = { ...prev };
        let needsRefresh = false;
        
        Object.keys(updated).forEach((coin) => {
          if (updated[coin] > 0) {
            updated[coin] -= 1;
            if (updated[coin] <= 0) {
              delete updated[coin];
              needsRefresh = true;
            }
          }
        });
        
        if (needsRefresh) {
          fetchBalanceData();
        }
        
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [fetchBalanceData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBalanceData();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBalance = (amount: number, coin: string): string => {
    if (coin === 'LTC') {
      return amount.toFixed(8);
    }
    return amount.toFixed(4);
  };

  // Mock rewarded ad for web/testing
  const showMockRewardedAd = async (coin: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setAdCoin(coin);
      setAdProgress(0);
      setShowAdModal(true);

      let progress = 0;
      const adInterval = setInterval(() => {
        progress += 20;
        setAdProgress(progress);
        
        if (progress >= 100) {
          clearInterval(adInterval);
          setTimeout(() => {
            setShowAdModal(false);
            setAdCoin(null);
            setAdProgress(0);
            resolve(true);
          }, 500);
        }
      }, 1000);
    });
  };

  // Show rewarded ad (Unity Ads or Mock)
  const showRewardedAd = async (coin: string): Promise<boolean> => {
    // Use Unity Ads on mobile if configured
    if (Platform.OS !== 'web' && unityAdsReady && isUnityAdsConfigured()) {
      const result = await unityAdsService.showRewardedAd();
      // Pre-load next ad
      unityAdsService.loadRewardedAd();
      return result;
    }
    
    // Fallback to mock ad for web or if Unity not configured
    return showMockRewardedAd(coin);
  };

  const handleClaim = async (coin: string) => {
    if (claimingCoin || timers[coin] > 0) return;

    setClaimingCoin(coin);

    try {
      // Show rewarded ad first
      const adWatched = await showRewardedAd(coin);
      
      if (!adWatched) {
        Alert.alert('Ad Error', 'Please watch the complete ad to claim your reward.');
        setClaimingCoin(null);
        return;
      }

      // Make claim request
      const response = await fetch(`${BACKEND_URL}/api/claim/${coin}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({ ad_viewed: true }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          'Reward Claimed!',
          `You received ${data.total_reward.toFixed(8)} ${coin}\n+${data.bonus_percent}% loyalty bonus!`,
          [{ text: 'Awesome!' }]
        );
        
        // Refresh data
        await fetchBalanceData();
        await refreshUser();
      } else {
        Alert.alert('Error', data.detail || 'Failed to claim reward');
      }
    } catch (error) {
      console.error('Claim error:', error);
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setClaimingCoin(null);
    }
  };

  if (authLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f7931a" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name || 'User'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Ionicons name="log-out-outline" size={24} color="#f7931a" />
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
        {/* Unity Ads Status Banner with Refresh */}
        {UNITY_ADS_CONFIG.TEST_MODE && (
          <View style={styles.adStatusBanner}>
            <Ionicons 
              name={
                adStatus === 'ready' ? 'checkmark-circle' : 
                adStatus === 'web-mock' ? 'desktop-outline' :
                adStatus === 'initializing' || adStatus === 'loading' || adStatus === 'refreshing' ? 'sync' :
                'warning'
              } 
              size={16} 
              color={
                adStatus === 'ready' ? '#4ade80' : 
                adStatus === 'web-mock' ? '#60a5fa' :
                adStatus === 'initializing' || adStatus === 'loading' || adStatus === 'refreshing' ? '#fbbf24' :
                '#ef4444'
              } 
            />
            <Text style={styles.adStatusText}>
              {adStatus === 'ready' && 'Unity Ads: Ready'}
              {adStatus === 'web-mock' && 'Web Preview: Using Simulated Ads'}
              {adStatus === 'initializing' && 'Unity Ads: Initializing...'}
              {adStatus === 'loading' && 'Unity Ads: Loading ad...'}
              {adStatus === 'refreshing' && 'Unity Ads: Refreshing...'}
              {adStatus === 'not-configured' && 'Unity Ads: Not Configured'}
              {adStatus === 'init-failed' && 'Unity Ads: Init Failed'}
              {adStatus === 'load-failed' && 'Unity Ads: Load Failed'}
              {adStatus === 'error' && 'Unity Ads: Error'}
            </Text>
            <TouchableOpacity 
              style={styles.refreshAdsButton} 
              onPress={refreshUnityAds}
              disabled={adStatus === 'initializing' || adStatus === 'loading' || adStatus === 'refreshing'}
            >
              <Ionicons name="refresh" size={16} color="#f7931a" />
            </TouchableOpacity>
          </View>
        )}

        {/* Loyalty Bonus Card */}
        <View style={styles.loyaltyCard}>
          <View style={styles.loyaltyHeader}>
            <Ionicons name="flame" size={24} color="#f7931a" />
            <Text style={styles.loyaltyTitle}>Daily Streak</Text>
          </View>
          <View style={styles.loyaltyContent}>
            <Text style={styles.streakDays}>
              {balanceData?.consecutive_days || 0} Days
            </Text>
            <View style={styles.bonusBadge}>
              <Text style={styles.bonusText}>
                +{balanceData?.bonus_percent || 0}% Bonus
              </Text>
            </View>
          </View>
          <Text style={styles.loyaltyHint}>
            Claim daily to increase your bonus (max +100%)
          </Text>
        </View>

        {/* Coin Cards */}
        <Text style={styles.sectionTitle}>Your Balances</Text>
        {Object.entries(COIN_CONFIG).map(([coin, config]) => {
          const balance = balanceData?.balances?.[coin] || 0;
          const canClaim = !timers[coin] || timers[coin] <= 0;
          const timeRemaining = timers[coin] || 0;
          const isClaiming = claimingCoin === coin;

          return (
            <View key={coin} style={styles.coinCard}>
              <View style={styles.coinHeader}>
                <View style={[styles.coinIcon, { backgroundColor: config.color }]}>
                  <Ionicons name={config.icon as any} size={24} color="#fff" />
                </View>
                <View style={styles.coinInfo}>
                  <Text style={styles.coinName}>{config.name}</Text>
                  <Text style={styles.coinSymbol}>{coin}</Text>
                </View>
              </View>
              
              <View style={styles.balanceSection}>
                <Text style={styles.balanceLabel}>Balance</Text>
                <Text style={styles.balanceAmount}>
                  {formatBalance(balance, coin)} {coin}
                </Text>
              </View>

              <View style={styles.rewardInfo}>
                <Text style={styles.rewardLabel}>Reward per claim:</Text>
                <Text style={styles.rewardAmount}>
                  {config.reward.toFixed(8)} {coin}
                  {balanceData?.bonus_percent ? (
                    <Text style={styles.bonusAmount}>
                      {' '}(+{balanceData.bonus_percent}%)
                    </Text>
                  ) : null}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.claimButton,
                  { backgroundColor: config.color },
                  (!canClaim || isClaiming) && styles.claimButtonDisabled,
                ]}
                onPress={() => handleClaim(coin)}
                disabled={!canClaim || isClaiming}
              >
                {isClaiming ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : canClaim ? (
                  <>
                    <Ionicons name="gift" size={20} color="#fff" />
                    <Text style={styles.claimButtonText}>Watch Ad & Claim</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="time" size={20} color="#fff" />
                    <Text style={styles.claimButtonText}>
                      Wait {formatTime(timeRemaining)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      {/* Mock Ad Modal (for web/testing) */}
      <Modal visible={showAdModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.adModal}>
            <View style={styles.adHeader}>
              <Ionicons name="videocam" size={40} color="#f7931a" />
              <Text style={styles.adTitle}>Watching Ad...</Text>
            </View>
            
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${adProgress}%` }]} />
            </View>
            
            <Text style={styles.adMessage}>
              Please wait while the ad plays.{"\n"}You'll receive your {adCoin} reward after!
            </Text>
            
            <Text style={styles.adCounter}>{Math.floor(adProgress / 20)}/5 seconds</Text>
            
            {!isUnityAdsConfigured() && (
              <Text style={styles.mockAdNote}>
                (Mock Ad - Configure Unity Ads for real ads)
              </Text>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
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
  greeting: {
    fontSize: 14,
    color: '#888',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
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
  adStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 6,
  },
  adStatusText: {
    fontSize: 12,
    color: '#888',
  },
  loyaltyCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#f7931a33',
  },
  loyaltyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  loyaltyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f7931a',
  },
  loyaltyContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  streakDays: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  bonusBadge: {
    backgroundColor: '#f7931a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  bonusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loyaltyHint: {
    fontSize: 12,
    color: '#666',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  coinCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  coinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  coinIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  coinInfo: {
    flex: 1,
  },
  coinName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  coinSymbol: {
    fontSize: 14,
    color: '#888',
  },
  balanceSection: {
    marginBottom: 12,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  rewardInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#0a0a0a',
    padding: 12,
    borderRadius: 8,
  },
  rewardLabel: {
    fontSize: 12,
    color: '#888',
  },
  rewardAmount: {
    fontSize: 12,
    color: '#f7931a',
    fontWeight: '500',
  },
  bonusAmount: {
    color: '#4ade80',
  },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adModal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 32,
    width: '85%',
    alignItems: 'center',
  },
  adHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  adTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
  },
  progressContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#f7931a',
    borderRadius: 4,
  },
  adMessage: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 16,
  },
  adCounter: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f7931a',
  },
  mockAdNote: {
    fontSize: 10,
    color: '#666',
    marginTop: 12,
    fontStyle: 'italic',
  },
});
