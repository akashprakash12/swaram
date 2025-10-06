// In SettingsScreen.js
import React from "react";
import { View, Text, StyleSheet, ScrollView, Switch } from "react-native";
import CustomHeader from "../components/CustomHeader";

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <CustomHeader title="Settings" showBack={true} />
      
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Language Settings</Text>
          
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Primary Language</Text>
            <Text style={styles.settingValue}>Malayalam</Text>
          </View>
          
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Speech Rate</Text>
            <Text style={styles.settingValue}>Normal</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Preferences</Text>
          
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Real-time Processing</Text>
            <Switch value={true} trackColor={{ false: '#767577', true: '#8F13FC' }} />
          </View>
          
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Voice Feedback</Text>
            <Switch value={true} trackColor={{ false: '#767577', true: '#8F13FC' }} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>
            Swaram v1.0.0{"\n"}
            Bridging communication gaps through AI
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#191A1F" 
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8F13FC',
    marginBottom: 15,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingLabel: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  settingValue: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  aboutText: {
    fontSize: 14,
    color: '#CCCCCC',
    lineHeight: 20,
  },
});