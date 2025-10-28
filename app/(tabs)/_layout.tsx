import React from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { MessageSquare, Search, User, MoreVertical } from 'lucide-react-native';
import { View, Text, StyleSheet, Platform, StatusBar, SafeAreaView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const TAB_LABELS: Record<string, string> = {
  '/(tabs)/index': 'Chats',
  '/(tabs)/search': 'Search',
  '/(tabs)/profile': 'Profile',
};

// Add WheizHeaderProps type
interface WheizHeaderProps {
  menuVisible: boolean;
  setMenuVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function TabLayout() {
  const { loading: authLoading, user } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    console.log('TabLayout mounted');
    // Add a small delay to ensure everything is ready
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 500);

    // Add error boundary
    const handleError = (event: ErrorEvent | PromiseRejectionEvent) => {
      console.error('TabLayout error:', event);
      const errorMessage = event instanceof ErrorEvent 
        ? event.message 
        : event.reason?.message || 'An unexpected error occurred';
      setError(errorMessage);
    };

    if (Platform.OS === 'web') {
      window.addEventListener('error', handleError as EventListener);
      window.addEventListener('unhandledrejection', handleError as EventListener);
    }

    return () => {
      clearTimeout(timer);
      if (Platform.OS === 'web') {
        window.removeEventListener('error', handleError as EventListener);
        window.removeEventListener('unhandledrejection', handleError as EventListener);
      }
      console.log('TabLayout unmounting');
    };
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', padding: 20 }}>
        <Text style={{ color: '#ef4444', textAlign: 'center', marginBottom: 10 }}>Something went wrong</Text>
        <TouchableOpacity 
          style={{ padding: 10, backgroundColor: '#0173fe', borderRadius: 8 }}
          onPress={() => {
            setError(null);
            setIsReady(false);
            setTimeout(() => setIsReady(true), 500);
          }}
        >
          <Text style={{ color: 'white' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (authLoading || !isReady || !user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#0173fe" />
        <Text style={{ marginTop: 10, color: '#64748b' }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <WheizHeader menuVisible={menuVisible} setMenuVisible={setMenuVisible} />
      {menuVisible && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 2000, elevation: 2000 }]} pointerEvents="box-none">
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.08)' }]}
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
          />
          <View style={styles.floatingMenuContainer}>
            <TouchableOpacity
              style={styles.floatingMenuItem}
              activeOpacity={0.7}
              onPress={() => {
                setMenuVisible(false);
                router.push('/groups/create');
              }}
            >
              <Text style={styles.floatingMenuText}>Create Group</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#0173fe',
          tabBarInactiveTintColor: '#94a3b8',
          tabBarStyle: {
            borderTopWidth: 0,
            backgroundColor: '#f8fafc',
            height: 60,
            paddingBottom: 8,
            justifyContent: 'center',
            alignItems: 'center',
          },
          tabBarLabelStyle: {
            fontSize: 12,
            overflow: 'visible',
          },
          tabBarLabelPosition: 'below-icon',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: '',
            tabBarIcon: ({ color }) => <MessageSquare size={30} color={color} />,
            tabBarLabel: 'Chats',
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: '',
            tabBarIcon: ({ color }) => <Search size={30} color={color} />,
            tabBarLabel: 'Search',
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: '',
            tabBarIcon: ({ color }) => <User size={30} color={color} />,
            tabBarLabel: 'Profile',
          }}
        />
      </Tabs>
    </View>
  );
}

function WheizHeader({ menuVisible, setMenuVisible }: WheizHeaderProps) {
  const pathname = usePathname();
  let headerTitleText = '';
  let headerTextStyle = {};

  if (pathname.endsWith('/search')) {
    headerTitleText = 'Search';
    headerTextStyle = styles.searchTextStyle;
  } else if (pathname.endsWith('/profile')) {
    headerTitleText = 'Profile';
    headerTextStyle = styles.profileTextStyle;
  } else if (pathname.endsWith('/index')) {
    headerTitleText = 'Wheiz';
    headerTextStyle = styles.wheizTextStyle;
  } else {
    headerTitleText = 'Wheiz';
    headerTextStyle = styles.wheizTextStyle;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerContent}>
        <View style={styles.headerTitleContainer}>
          <Text style={headerTextStyle}>{String(headerTitleText)}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#f8fafc',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    paddingHorizontal: 15,
    paddingTop: 30, // More space at the top
    paddingBottom: 4, // Less space at the bottom
    backgroundColor: '#f8fafc',
  },
  headerTitleContainer: { // Dedicated container for the main header title text
    flex: 1, // Allow it to take available space
    justifyContent: 'center', // Center text vertically within container
    alignItems: 'flex-start', // Ensure left alignment
    // Padding is handled by headerContent paddingHorizontal
  },
  headerTitle: {
    color: '#1bc2fe', // Apply the requested color
    fontWeight: 'bold',
    fontSize: 30, // Adjusted font size
    letterSpacing: 0.5, // Adjusted letter spacing
    marginTop: 20, // Add a small top margin to the text itself to move it down
    zIndex: 2,
    // textAlign is handled by the container's alignItems
  },
  tabLabelContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 16,
  },
  tabLabel: {
    color: '#1e293b',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 0,
    zIndex: 15,
    top: 40,
    fontFamily: 'System',
    letterSpacing: 0.5,
  },
  // Define separate styles for each header title text
  wheizTextStyle: {
    color: '#2c67f2', // Apply the requested blue color
    fontWeight: 'bold',
    fontSize: 30,
    letterSpacing: 0,
    marginTop: 25, // Use margin to position vertically if needed, coordinating with container padding
    zIndex: 2,
    // textShadowColor, textShadowOffset, textShadowRadius as previously set for Wheiz if desired
  },
  searchTextStyle: {
    color: '#1e293b', // Default text color for search header
    fontWeight: 'normal',
    fontSize: 30,
    marginTop: 25, // Match Wheiz header margin
    // Add other styling for search header if needed
  },
  profileTextStyle: {
    color: '#1e293b', // Default text color for profile header
    fontWeight: 'normal',
    fontSize: 30,
    marginTop: 25, // Match Wheiz header margin
    // Add other styling for profile header if needed
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.08)',
    zIndex: 1000,
  },
  floatingMenuContainer: {
    position: 'absolute',
    top: 60,
    right: 18,
    backgroundColor: '#fff',
    borderRadius: 12,
    minWidth: 170,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1001,
  },
  floatingMenuItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  floatingMenuText: {
    fontSize: 16,
    color: '#222',
  },
});