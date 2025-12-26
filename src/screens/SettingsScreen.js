
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Switch, 
  List, 
  Divider, 
  IconButton,
  Card,
  Chip,
} from 'react-native-paper';
import colors from '../constants/colors';

export default function SettingsScreen({ navigation }) {
  const [settings, setSettings] = useState({
    // Camera Settings
    enableFlash: false,
    enableGrid: true,
    enableSound: true,
    enableVibration: true,
    cameraQuality: 'high', // 'low', 'medium', 'high'
    autoFocus: true,
    
    // Processing Settings
    enableRealTime: true,
    showConfidence: true,
    saveHistory: true,
    maxHistoryItems: 100,
    
    // Accessibility
    largeText: false,
    highContrast: false,
    reduceMotion: false,
    
    // Privacy
    analyticsEnabled: false,
    crashReports: false,
    autoDeleteData: true,
  });

  const [selectedQuality, setSelectedQuality] = useState('high');
  const [selectedTheme, setSelectedTheme] = useState('light');

  const handleSettingToggle = (key) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleQualitySelect = (quality) => {
    setSelectedQuality(quality);
    setSettings(prev => ({
      ...prev,
      cameraQuality: quality
    }));
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear all translation history?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: () => {
            Alert.alert('Success', 'Translation history cleared');
          }
        },
      ]
    );
  };

  const handleResetSettings = () => {
    Alert.alert(
      'Reset Settings',
      'Reset all settings to default values?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset', 
          style: 'destructive',
          onPress: () => {
            setSettings({
              enableFlash: false,
              enableGrid: true,
              enableSound: true,
              enableVibration: true,
              cameraQuality: 'high',
              autoFocus: true,
              enableRealTime: true,
              showConfidence: true,
              saveHistory: true,
              maxHistoryItems: 100,
              largeText: false,
              highContrast: false,
              reduceMotion: false,
              analyticsEnabled: false,
              crashReports: false,
              autoDeleteData: true,
            });
            setSelectedQuality('high');
            Alert.alert('Success', 'Settings reset to default');
          }
        },
      ]
    );
  };

  const openPrivacyPolicy = () => {
    Linking.openURL('https://example.com/privacy');
  };

  const openTermsOfService = () => {
    Linking.openURL('https://example.com/terms');
  };

  const getQualityDescription = () => {
    switch(selectedQuality) {
      case 'low': return 'Faster processing, lower accuracy';
      case 'medium': return 'Balanced speed and accuracy';
      case 'high': return 'Best accuracy, slower processing';
      default: return '';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* App Info Card */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <View style={styles.appInfo}>
              <Text style={styles.appName}>SWARAM</Text>
              <Text style={styles.appVersion}>Version 1.0.0</Text>
              <Text style={styles.appDescription}>
                Indian Sign Language & Lip Reading Translator
              </Text>
              <View style={styles.techTags}>
                <Chip style={styles.techChip} textStyle={styles.techChipText}>
                  TensorFlow Lite
                </Chip>
                <Chip style={styles.techChip} textStyle={styles.techChipText}>
                  3D CNN
                </Chip>
                <Chip style={styles.techChip} textStyle={styles.techChipText}>
                  BiLSTM
                </Chip>
              </View>
              <View style={styles.privacyBadge}>
                <Text style={styles.privacyBadgeText}>🔒 All Processing On-Device</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Camera Settings */}
        <List.Section style={styles.section}>
          <List.Subheader style={styles.sectionTitle}>📷 CAMERA SETTINGS</List.Subheader>
          <Card style={styles.settingsCard}>
            <Card.Content>
              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Enable Flash</Text>
                  <Text style={styles.settingDescription}>
                    Use flash in low light conditions
                  </Text>
                </View>
                <Switch
                  value={settings.enableFlash}
                  onValueChange={() => handleSettingToggle('enableFlash')}
                  color={colors.primary}
                />
              </View>
              <Divider style={styles.divider} />

              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Show Grid Overlay</Text>
                  <Text style={styles.settingDescription}>
                    Display grid for better framing
                  </Text>
                </View>
                <Switch
                  value={settings.enableGrid}
                  onValueChange={() => handleSettingToggle('enableGrid')}
                  color={colors.primary}
                />
              </View>
              <Divider style={styles.divider} />

              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Auto Focus</Text>
                  <Text style={styles.settingDescription}>
                    Automatic camera focus adjustment
                  </Text>
                </View>
                <Switch
                  value={settings.autoFocus}
                  onValueChange={() => handleSettingToggle('autoFocus')}
                  color={colors.primary}
                />
              </View>
              <Divider style={styles.divider} />

              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Camera Quality</Text>
                  <Text style={styles.settingDescription}>
                    {getQualityDescription()}
                  </Text>
                </View>
                <View style={styles.qualitySelector}>
                  {['low', 'medium', 'high'].map((quality) => (
                    <TouchableOpacity
                      key={quality}
                      style={[
                        styles.qualityOption,
                        selectedQuality === quality && styles.qualityOptionActive
                      ]}
                      onPress={() => handleQualitySelect(quality)}
                    >
                      <Text style={[
                        styles.qualityText,
                        selectedQuality === quality && styles.qualityTextActive
                      ]}>
                        {quality.charAt(0).toUpperCase() + quality.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </Card.Content>
          </Card>
        </List.Section>

        {/* Processing Settings */}
        <List.Section style={styles.section}>
          <List.Subheader style={styles.sectionTitle}>⚙️ PROCESSING SETTINGS</List.Subheader>
          <Card style={styles.settingsCard}>
            <Card.Content>
              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Real-time Translation</Text>
                  <Text style={styles.settingDescription}>
                    Process and translate immediately
                  </Text>
                </View>
                <Switch
                  value={settings.enableRealTime}
                  onValueChange={() => handleSettingToggle('enableRealTime')}
                  color={colors.primary}
                />
              </View>
              <Divider style={styles.divider} />

              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Show Confidence Scores</Text>
                  <Text style={styles.settingDescription}>
                    Display accuracy percentage for translations
                  </Text>
                </View>
                <Switch
                  value={settings.showConfidence}
                  onValueChange={() => handleSettingToggle('showConfidence')}
                  color={colors.primary}
                />
              </View>
              <Divider style={styles.divider} />

              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Save Translation History</Text>
                  <Text style={styles.settingDescription}>
                    Store previous translations locally
                  </Text>
                </View>
                <Switch
                  value={settings.saveHistory}
                  onValueChange={() => handleSettingToggle('saveHistory')}
                  color={colors.primary}
                />
              </View>
            </Card.Content>
          </Card>
        </List.Section>

        {/* Accessibility */}
        <List.Section style={styles.section}>
          <List.Subheader style={styles.sectionTitle}>♿ ACCESSIBILITY</List.Subheader>
          <Card style={styles.settingsCard}>
            <Card.Content>
              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Large Text</Text>
                  <Text style={styles.settingDescription}>
                    Increase text size throughout the app
                  </Text>
                </View>
                <Switch
                  value={settings.largeText}
                  onValueChange={() => handleSettingToggle('largeText')}
                  color={colors.primary}
                />
              </View>
              <Divider style={styles.divider} />

              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>High Contrast Mode</Text>
                  <Text style={styles.settingDescription}>
                    Enhanced contrast for better visibility
                  </Text>
                </View>
                <Switch
                  value={settings.highContrast}
                  onValueChange={() => handleSettingToggle('highContrast')}
                  color={colors.primary}
                />
              </View>
              <Divider style={styles.divider} />

              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Reduce Motion</Text>
                  <Text style={styles.settingDescription}>
                    Minimize animations and transitions
                  </Text>
                </View>
                <Switch
                  value={settings.reduceMotion}
                  onValueChange={() => handleSettingToggle('reduceMotion')}
                  color={colors.primary}
                />
              </View>
            </Card.Content>
          </Card>
        </List.Section>

        {/* Privacy */}
        <List.Section style={styles.section}>
          <List.Subheader style={styles.sectionTitle}>🔒 PRIVACY</List.Subheader>
          <Card style={styles.settingsCard}>
            <Card.Content>
              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Analytics</Text>
                  <Text style={styles.settingDescription}>
                    Help improve app by sending anonymous usage data
                  </Text>
                </View>
                <Switch
                  value={settings.analyticsEnabled}
                  onValueChange={() => handleSettingToggle('analyticsEnabled')}
                  color={colors.primary}
                />
              </View>
              <Divider style={styles.divider} />

              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Crash Reports</Text>
                  <Text style={styles.settingDescription}>
                    Automatically send crash reports
                  </Text>
                </View>
                <Switch
                  value={settings.crashReports}
                  onValueChange={() => handleSettingToggle('crashReports')}
                  color={colors.primary}
                />
              </View>
              <Divider style={styles.divider} />

              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Auto-delete Data</Text>
                  <Text style={styles.settingDescription}>
                    Automatically clear data after 30 days
                  </Text>
                </View>
                <Switch
                  value={settings.autoDeleteData}
                  onValueChange={() => handleSettingToggle('autoDeleteData')}
                  color={colors.primary}
                />
              </View>
            </Card.Content>
          </Card>
        </List.Section>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={handleClearHistory}
          >
            <Text style={styles.actionButtonText}>🗑️ Clear History</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, styles.resetButton]}
            onPress={handleResetSettings}
          >
            <Text style={styles.actionButtonText}>🔄 Reset Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Legal Links */}
        <View style={styles.legalContainer}>
          <TouchableOpacity onPress={openPrivacyPolicy}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.legalSeparator}>•</Text>
          <TouchableOpacity onPress={openTermsOfService}>
            <Text style={styles.legalLink}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={styles.legalSeparator}>•</Text>
          <TouchableOpacity onPress={() => navigation.navigate('About')}>
            <Text style={styles.legalLink}>About</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Made with ❤️ for the hearing impaired community
          </Text>
          <Text style={styles.footerSubtext}>
            All processing happens locally on your device
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEFFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  infoCard: {
    marginBottom: 20,
    backgroundColor: colors.primary,
    borderRadius: 20,
    elevation: 4,
  },
  appInfo: {
    alignItems: 'center',
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  appVersion: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 10,
  },
  appDescription: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 20,
  },
  techTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 15,
  },
  techChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  techChipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '500',
  },
  privacyBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  privacyBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginLeft: 0,
    paddingLeft: 0,
    marginBottom: 8,
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    elevation: 2,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingInfo: {
    flex: 1,
    marginRight: 15,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  divider: {
    marginVertical: 4,
  },
  qualitySelector: {
    flexDirection: 'row',
    backgroundColor: colors.lightGrey,
    borderRadius: 20,
    padding: 4,
  },
  qualityOption: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    minWidth: 70,
    alignItems: 'center',
  },
  qualityOptionActive: {
    backgroundColor: colors.primary,
  },
  qualityText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  qualityTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 30,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
    marginHorizontal: 5,
    elevation: 2,
  },
  resetButton: {
    backgroundColor: colors.errorLight,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  legalContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  legalLink: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
    paddingHorizontal: 10,
  },
  legalSeparator: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#EAEFFF',
  },
  footerText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 5,
  },
  footerSubtext: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    opacity: 0.7,
  },
});
