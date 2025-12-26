import React, { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

export default function SwaramScreen({navigation}) {
      useEffect(() => {
    // Navigate to Onboarding after 2 seconds
    const timer = setTimeout(() => {
      navigation.replace('Onboarding');
    }, 2000);

    // Clear timeout on component unmount
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>

      {/* Top Right Decoration */}
      <Image
        source={require('../../assets/top-deco.png')}
        style={styles.topRight}
        resizeMode="contain"
      />

      {/* Center Content */}
      <View style={styles.center}>
        <Image
          source={require('../../assets/top-deco.png')}
          style={styles.waveLogo}
          resizeMode="contain"
        />
        <Text style={styles.title}>SWARAM</Text>
      </View>

      {/* Bottom Left Decoration */}
      <Image
        source={require('../../assets/top-deco.png')}
        style={styles.bottomLeft}
        resizeMode="contain"
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },

  center: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1, // Ensure content stays above decorations
  },

  waveLogo: {
    width: 200,
    height: 200,
    marginBottom: 5,
  },

  title: {
    fontSize: 22,
    color: '#1E3C9F',
    letterSpacing: 2,
    fontWeight: 'bold',
  },

  topRight: {
    position: 'absolute',
    width: 950, // Use larger dimensions
    height: 950, // Use larger dimensions
    top: -350, // Adjust positioning
    right: -460, // Adjust positioning
    transform: [
      { rotate: '70deg' },
      { scale: 0.9 } // No scaling needed with larger image
    ],
  },
  bottomLeft: {
    position: 'absolute',
    width: 600,
    height: 600,
    bottom: -250,
    left: -200,
    transform: [
      { rotate: '50deg' },
      { scale: 1 } // No scaling needed
    ],
  },

});