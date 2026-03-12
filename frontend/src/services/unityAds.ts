/**
 * Unity Ads Integration Service
 * 
 * ============================================
 * CONFIGURATION - PUT YOUR CREDENTIALS HERE!
 * ============================================
 * 
 * To get your Unity Ads credentials:
 * 1. Go to https://dashboard.unity.com
 * 2. Create a project or select existing one
 * 3. Go to Monetization > Placements
 * 4. Copy your Game ID and Placement IDs
 * 
 * Game IDs are different for iOS and Android!
 */

import { Platform } from 'react-native';

// ============================================
// 🔑 CRYPTOMACHINA - UNITY ADS CREDENTIALS 🔑
// ============================================
export const UNITY_ADS_CONFIG = {
  // Your Unity Game IDs (get from Unity Dashboard)
  GAME_ID_IOS: '6063662',      // Using Android ID for now - update when you have iOS
  GAME_ID_ANDROID: '6063662',  // CryptoMachina Android Game ID
  
  // Your Placement IDs for Rewarded Video Ads
  PLACEMENT_ID_REWARDED: 'Rewarded_Android',  // CryptoMachina Rewarded Ad Unit
  
  // Test Mode - SET TO false FOR PRODUCTION!
  TEST_MODE: true,  // Keep true for safe testing
};
// ============================================

// Get the correct Game ID based on platform
export const getGameId = (): string => {
  return Platform.OS === 'ios' 
    ? UNITY_ADS_CONFIG.GAME_ID_IOS 
    : UNITY_ADS_CONFIG.GAME_ID_ANDROID;
};

// Get placement ID
export const getRewardedPlacementId = (): string => {
  return UNITY_ADS_CONFIG.PLACEMENT_ID_REWARDED;
};

// Check if credentials are configured
export const isUnityAdsConfigured = (): boolean => {
  const gameId = getGameId();
  return gameId !== 'YOUR_IOS_GAME_ID_HERE' && 
         gameId !== 'YOUR_ANDROID_GAME_ID_HERE' &&
         gameId.length > 0;
};

/**
 * Unity Ads Service Class
 * Handles initialization and ad display
 */
class UnityAdsService {
  private initialized: boolean = false;
  private isLoading: boolean = false;

  /**
   * Initialize Unity Ads SDK
   * Call this once when app starts (in _layout.tsx or App.tsx)
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;
    
    // Check if running on web (Unity Ads doesn't work on web)
    if (Platform.OS === 'web') {
      console.log('[UnityAds] Web platform detected - using mock ads');
      return false;
    }

    // Check if credentials are configured
    if (!isUnityAdsConfigured()) {
      console.warn('[UnityAds] Not configured! Please add your Game ID in src/services/unityAds.ts');
      return false;
    }

    try {
      const UnityAds = require('react-native-unity-ads').default;
      const gameId = getGameId();
      
      await UnityAds.initialize(gameId, UNITY_ADS_CONFIG.TEST_MODE);
      this.initialized = true;
      console.log('[UnityAds] Initialized successfully with Game ID:', gameId);
      return true;
    } catch (error) {
      console.error('[UnityAds] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Load a rewarded ad
   */
  async loadRewardedAd(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const UnityAds = require('react-native-unity-ads').default;
      const placementId = getRewardedPlacementId();
      
      this.isLoading = true;
      await UnityAds.load(placementId);
      this.isLoading = false;
      console.log('[UnityAds] Ad loaded for placement:', placementId);
      return true;
    } catch (error) {
      this.isLoading = false;
      console.error('[UnityAds] Failed to load ad:', error);
      return false;
    }
  }

  /**
   * Show a rewarded video ad
   * Returns true if user completed watching the ad
   */
  async showRewardedAd(): Promise<boolean> {
    // Web fallback - return true for mock
    if (Platform.OS === 'web') {
      console.log('[UnityAds] Web platform - returning mock success');
      return true; // Will use mock modal in UI
    }

    if (!this.initialized || !isUnityAdsConfigured()) {
      console.warn('[UnityAds] Not initialized or configured');
      return false;
    }

    try {
      const UnityAds = require('react-native-unity-ads').default;
      const placementId = getRewardedPlacementId();
      
      // First load the ad
      await this.loadRewardedAd();
      
      // Show the ad and wait for result
      const result = await UnityAds.show(placementId);
      
      // Check if ad was completed
      if (result === 'COMPLETED') {
        console.log('[UnityAds] Ad completed - user earned reward');
        return true;
      } else {
        console.log('[UnityAds] Ad not completed:', result);
        return false;
      }
    } catch (error) {
      console.error('[UnityAds] Failed to show ad:', error);
      return false;
    }
  }

  /**
   * Check if an ad is ready to show
   */
  async isAdReady(): Promise<boolean> {
    if (Platform.OS === 'web') return true;
    if (!this.initialized) return false;

    try {
      const UnityAds = require('react-native-unity-ads').default;
      const placementId = getRewardedPlacementId();
      return await UnityAds.isReady(placementId);
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const unityAdsService = new UnityAdsService();
export default unityAdsService;
