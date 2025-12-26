import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';
import { onboardData } from '../constants/onboardData';
import colors from '../constants/colors'; // Import your colors

const { width, height } = Dimensions.get('window');

export default function OnboardingScreen({ navigation }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const skipButtonOpacity = useRef(new Animated.Value(1)).current;

  // Reset animation when index changes
  useEffect(() => {
    // Fade animation for content
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Button scale animation
    buttonScale.setValue(0.9);
    Animated.spring(buttonScale, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // Skip button fade out on last slide
    if (currentIndex === onboardData.length - 1) {
      Animated.timing(skipButtonOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      skipButtonOpacity.setValue(1);
    }

    // Slide animation for skip button
    if (currentIndex < onboardData.length - 1) {
      slideAnim.setValue(-20);
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  }, [currentIndex]);

  const handleNext = () => {
    if (currentIndex < onboardData.length - 1) {
      // Add button press animation
      Animated.sequence([
        Animated.timing(buttonScale, {
          toValue: 0.95,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(buttonScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start(() => {
        flatListRef.current.scrollToIndex({
          index: currentIndex + 1,
          animated: true,
        });
      });
    } else {
      // Navigate to Home screen on last slide
      navigation.navigate('Home');
    }
  };

  const handleSkip = () => {
    // Add skip button animation
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      navigation.navigate('Home');
    });
  };

  const renderItem = ({ item, index }) => (
   
    
    <Animated.View 
      style={[
        styles.slide, 
        { 
          width,
          opacity: currentIndex === index ? fadeAnim : 0,
          transform: [
            { 
              translateY: currentIndex === index ? fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }) : 0 
            }
          ]
        }
      ]}
    >
      <Animated.Image
        source={item.image}
        style={[
          styles.illustration,
          {
            transform: [
              { 
                scale: currentIndex === index ? fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.8, 1],
                }) : 1 
              }
            ]
          }
        ]}
        resizeMode="contain"
      />
      <Animated.Text
        style={[
          styles.title,
          {
            opacity: fadeAnim,
            transform: [
              { 
                translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }) 
              }
            ]
          }
        ]}
      >
        {item.title}
      </Animated.Text>
      <Animated.Text
        style={[
          styles.description,
          {
            opacity: fadeAnim,
            transform: [
              { 
                translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }) 
              }
            ]
          }
        ]}
      >
        {item.description}
      </Animated.Text>
    </Animated.View>
  );

  const handleScroll = (event) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / width);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  const isLastSlide = currentIndex === onboardData.length - 1;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* FlatList for onboarding slides */}
      <FlatList
        ref={flatListRef}
        data={onboardData}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.id}
        getItemLayout={(data, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        decelerationRate="fast"
        snapToInterval={width}
      />

      {/* Bottom section with dots and buttons */}
      <View style={styles.bottomContainer}>
        {/* Dots indicator */}
        <View style={styles.dotsContainer}>
          {onboardData.map((_, index) => (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                currentIndex === index ? styles.dotActive : styles.dotInactive,
                {
                  transform: [
                    {
                      scale: currentIndex === index ? 
                        fadeAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 1.2],
                        }) : 1
                    }
                  ]
                }
              ]}
            />
          ))}
        </View>

        {/* Buttons Container */}
        <View style={styles.buttonsContainer}>
          {/* Skip Button - Shows on first two slides, fades out on last */}
          <Animated.View
            style={{
              opacity: skipButtonOpacity,
              transform: [
                { translateX: slideAnim },
                { scale: buttonScale }
              ],
              // Hide completely when opacity is 0
              display: isLastSlide ? 'none' : 'flex',
            }}
          >
            <TouchableOpacity 
              onPress={handleSkip} 
              style={styles.skipButton}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Next/Get Started Button - Full width on last slide */}
          <Animated.View
            style={{
              flex: isLastSlide ? 1 : 1,
              marginLeft: isLastSlide ? 0 : 20,
              transform: [{ scale: buttonScale }],
            }}
          >
            <Button
              mode="contained"
              onPress={handleNext}
              style={[
                styles.mainButton,
                isLastSlide && styles.getStartedButton
              ]}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
              {isLastSlide ? 'Get Started' : 'Next'}
            </Button>
          </Animated.View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  illustration: {
    width: width * 0.8,
    height: height * 0.4,
    maxHeight: 300,
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.primary, // #268DCD
    marginBottom: 20,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary, // #CCCCCC for description
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 20,
    backgroundColor: '#FFFFFF',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    height: 20,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: colors.secondary,
    width:15,
    height:15,
    borderRadius:15,
  },
  dotInactive: {
    backgroundColor: '#D3D3D3',
  },
  buttonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.primary, // #268DCD
    backgroundColor: 'transparent',
    minWidth: 80,
    alignItems: 'center',
  },
  skipText: {
    fontSize: 16,
    color: colors.primary, // #268DCD
    fontWeight: '600',
  },
  mainButton: {
    borderRadius: 50,
    backgroundColor: colors.primary, // #268DCD for button
    elevation: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  getStartedButton: {
    backgroundColor: colors.primary, // Keep same color for Get Started
    shadowColor: colors.primary,
  },
  buttonContent: {
    height: 50,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF', // White text on button
  },
});