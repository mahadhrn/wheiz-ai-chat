import React, { memo, useRef, useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableWithoutFeedback, UIManager, findNodeHandle, Modal, TouchableOpacity, Dimensions, Image, Linking, Pressable, ActivityIndicator } from 'react-native';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Video, Audio } from 'expo-av';
import { Calendar as CalendarIcon, Languages, User } from 'lucide-react-native';
import { GestureHandlerRootView, PinchGestureHandler, PanGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

interface MessageItemProps {
  id: string;
  content: string;
  isOwnMessage: boolean;
  timestamp: string;
  file_url?: string;
  file_type?: string;
  onDelete?: (id: string) => void;
  showDateSeparator?: boolean;
  previousMessageDate?: string;
  translatedContent?: string;
  onTranslate?: (id: string) => void;
  isTranslating?: boolean;
  status?: string;
  summarizedContent?: string;
  onSummarize?: (id: string) => void;
  isSummarizing?: boolean;
}

// Separate constants for the message context menu
const MESSAGE_MENU_HEIGHT = 150;
const MESSAGE_MENU_MARGIN = 2;
const MESSAGE_MENU_WIDTH = 200;

const ContextMenu = ({ visible, onClose, position, onOptionPress, file_type }: any) => {
  if (!visible) return null;
  const { height: screenHeight, width: screenWidth } = Dimensions.get('window');
  // Decide whether to show menu above or below the message
  let top = position.y + position.height + MESSAGE_MENU_MARGIN;
  if (top + MESSAGE_MENU_HEIGHT > screenHeight) {
    top = Math.max(position.y - MESSAGE_MENU_HEIGHT - MESSAGE_MENU_MARGIN, MESSAGE_MENU_MARGIN);
  }
  // Prevent horizontal overflow
  let left = position.x;
  if (left + MESSAGE_MENU_WIDTH > screenWidth - MESSAGE_MENU_MARGIN) {
    left = Math.max(screenWidth - MESSAGE_MENU_WIDTH - MESSAGE_MENU_MARGIN, MESSAGE_MENU_MARGIN);
  }
  return (
    <Modal transparent visible={visible} animationType="fade">
      <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.contextMenu, { top, left, minWidth: MESSAGE_MENU_WIDTH, maxWidth: MESSAGE_MENU_WIDTH, height: undefined }]}>  
          {(!file_type || file_type === 'text') && (
            <>
              <TouchableOpacity style={styles.menuItem} onPress={() => onOptionPress('translate')}>
                <Feather name="globe" size={20} color="#3B82F6" style={styles.menuIcon} />
                <Text style={styles.menuText}>Translate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => onOptionPress('summarize')}>
                <MaterialIcons name="summarize" size={20} color="#3B82F6" style={styles.menuIcon} />
                <Text style={styles.menuText}>Summarize</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={styles.menuItem} onPress={() => onOptionPress('delete')}>
            <Ionicons name="trash-outline" size={20} color="#ef4444" style={styles.menuIcon} />
            <Text style={[styles.menuText, { color: '#ef4444' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

// Add this new component for the zoomable image modal
const ZoomableImage = ({ uri, onClose }: { uri: string; onClose: () => void }) => {
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const baseScale = useRef(1);
  const lastScale = useRef(1);
  const lastTranslateX = useRef(0);
  const lastTranslateY = useRef(0);

  const onPinchEvent = (event: any) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      const newScale = baseScale.current * event.nativeEvent.scale;
      setScale(newScale);
    } else if (event.nativeEvent.state === State.END) {
      baseScale.current = scale;
      lastScale.current = scale;
    }
  };

  const onPanEvent = (event: any) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      setTranslateX(lastTranslateX.current + event.nativeEvent.translationX);
      setTranslateY(lastTranslateY.current + event.nativeEvent.translationY);
    } else if (event.nativeEvent.state === State.END) {
      lastTranslateX.current = translateX;
      lastTranslateY.current = translateY;
    }
  };

  const resetZoom = () => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    baseScale.current = 1;
    lastScale.current = 1;
    lastTranslateX.current = 0;
    lastTranslateY.current = 0;
  };

  return (
    <Pressable style={styles.modalOverlay} onPress={onClose}>
      <GestureHandlerRootView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <PinchGestureHandler onGestureEvent={onPinchEvent}>
          <View style={styles.imageContainer}>
            <Image
              source={{ uri }}
              style={[
                styles.modalImage,
                {
                  transform: [
                    { scale },
                    { translateX },
                    { translateY },
                  ],
                },
              ]}
              resizeMode="contain"
            />
          </View>
        </PinchGestureHandler>
      </GestureHandlerRootView>
    </Pressable>
  );
};

export const MessageItem = memo(function MessageItem({ 
  id,
  content, 
  isOwnMessage, 
  timestamp, 
  file_url, 
  file_type,
  onDelete,
  showDateSeparator,
  previousMessageDate,
  translatedContent,
  onTranslate,
  isTranslating,
  status,
  summarizedContent,
  onSummarize,
  isSummarizing
}: MessageItemProps) {
  const bubbleRef = useRef<View>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState('');

  // Debug log for props
  console.log('MessageItem props:', { content, file_url, file_type });

  // Format the timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // Format the date for the separator
  const formatDateSeparator = (date: string) => {
    const messageDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check if the message is from today
    if (messageDate.toDateString() === today.toDateString()) {
      return 'Today';
    }
    // Check if the message is from yesterday
    else if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    // Check if the message is from this year
    else if (messageDate.getFullYear() === today.getFullYear()) {
      return messageDate.toLocaleDateString(undefined, { 
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
    }
    // For older messages, show full date
    else {
      return messageDate.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }
  };

  // Check if we need to show a date separator
  const shouldShowDateSeparator = () => {
    if (!showDateSeparator || !previousMessageDate) return false;
    
    try {
      const currentDate = new Date(timestamp);
      const prevDate = new Date(previousMessageDate);
      
      return currentDate.toDateString() !== prevDate.toDateString();
    } catch (error) {
      console.error('Error comparing dates:', error);
      return false;
    }
  };

  const handleLongPress = () => {
    if (bubbleRef.current) {
      bubbleRef.current.measureInWindow((x, y, width, height) => {
        setMenuPosition({ x, y, width, height });
        setMenuVisible(true);
      });
    }
  };

  const handleOptionPress = (option: string) => {
    setMenuVisible(false);
    if (option === 'delete' && onDelete) {
      onDelete(id);
      return;
    }
    if (option === 'translate' && onTranslate) {
      onTranslate(id);
      return;
    }
    if (option === 'summarize' && onSummarize) {
      onSummarize(id);
      return;
    }
  };

  // Helper to render message content (text, attachments, etc.)
  const renderMessageContent = () => {
    // Render event message if file_type is 'event'
    if (file_type === 'event') {
      let event;
      try {
        event = JSON.parse(content);
      } catch {
        return <Text style={{ color: 'red' }}>Invalid event data</Text>;
      }

      return (
        <View style={styles.eventContainer}>
          <CalendarIcon size={20} color={isOwnMessage ? '#fff' : '#3B82F6'} style={styles.eventIcon} />
          <View style={styles.eventContent}>
            <Text style={[styles.eventTitle, isOwnMessage && { color: '#fff' }]}>{event.title || event.name}</Text>
            {event.description && (
              <Text style={[styles.eventDescription, isOwnMessage && { color: '#fff' }]}>{event.description}</Text>
            )}
            <Text style={[styles.eventDate, isOwnMessage && { color: '#fff' }]}>
              {new Date(event.date).toLocaleString()}
            </Text>
          </View>
        </View>
      );
    }

    // Render contact message
    if (file_type === 'contact') {
      // Parse vCard for name and number
      let contactName = 'Contact';
      let contactNumber = '';
      try {
        const vCardLines = content.split('\n');
        for (const line of vCardLines) {
          if (line.startsWith('FN:')) {
            contactName = line.substring(3);
          }
          if (line.startsWith('TEL')) {
            const parts = line.split(':');
            if (parts.length > 1) {
              contactNumber = parts[1];
              break;
            }
          }
        }
      } catch (e) {}
      const handleContactPress = () => {
        if (contactNumber) {
          Linking.openURL(`tel:${contactNumber}`);
        }
      };
      const contactNameTextStyle = isOwnMessage ? [styles.contactName, { color: '#fff' }] : styles.contactName;
      const contactNumberTextStyle = isOwnMessage ? [styles.contactNumber, { color: '#fff' }] : styles.contactNumber;
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleContactPress}
          disabled={!contactNumber}
        >
          <View style={[
            styles.contactBubble,
            isOwnMessage ? styles.ownContactBubble : styles.otherContactBubble,
          ]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <User size={28} color={isOwnMessage ? '#fff' : '#3B82F6'} style={{ marginRight: 0 }} />
              <View style={styles.contactContent}>
                <Text style={contactNameTextStyle}>{contactName}</Text>
                {contactNumber ? (
                  <Text style={contactNumberTextStyle}>{contactNumber}</Text>
                ) : null}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Render file attachments
    if (file_url) {
      if (file_type === 'image') {
        return (
          <TouchableOpacity onPress={() => {
            setModalImageUrl(file_url);
            setImageModalVisible(true);
          }}>
            <Image source={{ uri: file_url }} style={styles.messageImage} />
          </TouchableOpacity>
        );
      } else if (file_type === 'audio') {
        return <AudioPlayerBubble file_url={file_url} isOwnMessage={isOwnMessage} />;
      } else if (file_type === 'file') {
        // Use the content as the file name if available
        let fileDisplayName = content || 'File';
        const fileNameStyle = [
          styles.fileText,
          { color: isOwnMessage ? '#fff' : '#000' }
        ];
        return (
          <TouchableOpacity 
            style={styles.fileContainer}
            onPress={() => Linking.openURL(file_url)}
          >
            <Feather name="file" size={20} color={isOwnMessage ? '#fff' : '#3B82F6'} style={styles.fileIcon} />
            <View style={{ flexDirection: 'column', flexShrink: 1 }}>
              <Text style={fileNameStyle} numberOfLines={1} ellipsizeMode="middle">{fileDisplayName}</Text>
              <Text style={[styles.fileText, { color: '#888', fontSize: 12 }]}>Open File</Text>
            </View>
          </TouchableOpacity>
        );
      }
    }

    // Render text content
    return (
      <View>
        <Text style={[
          styles.messageText,
          isOwnMessage ? styles.ownMessageText : styles.otherMessageText
        ]}>
          {content}
        </Text>
        {translatedContent && (
          <View style={[
            styles.translationContainer,
            { borderTopColor: isOwnMessage ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)' }
          ]}>
            <Languages 
              size={14} 
              color={isOwnMessage ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.6)'} 
              style={styles.translationIcon} 
            />
            <Text style={[
              styles.translationText,
              { color: isOwnMessage ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)' }
            ]}>
              {translatedContent}
            </Text>
          </View>
        )}
        {summarizedContent && (
          <View style={[
            styles.summaryContainer,
            { borderTopColor: isOwnMessage ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)' }
          ]}>
            <MaterialIcons 
              name="summarize" 
              size={14}
              color={isOwnMessage ? '#FFFFFF' : 'rgba(0, 0, 0, 0.6)'}
              style={styles.summaryIcon} 
            />
            <Text style={[
              styles.summaryText,
              { color: isOwnMessage ? '#FFFFFF' : 'rgba(0, 0, 0, 0.8)' }
            ]}>
              {summarizedContent}
            </Text>
          </View>
        )}
        {isTranslating && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.loadingText}>Translating...</Text>
          </View>
        )}
        {isSummarizing && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={isOwnMessage ? '#fff' : '#3B82F6'} />
            <Text style={[styles.loadingText, { color: isOwnMessage ? '#fff' : '#666' }]}>Summarizing...</Text>
          </View>
        )}
        <Text style={[
          styles.timestamp,
          isOwnMessage ? styles.ownTimestamp : styles.otherTimestamp
        ]}>
          {formatTime(timestamp)}
        </Text>
      </View>
    );
  };

  const dateSeparatorText = shouldShowDateSeparator() ? formatDateSeparator(timestamp) : null;

  return (
    <View>
      {/* Date Separator */}
      {dateSeparatorText && (
        <View style={styles.dateSeparatorContainer}>
          {/* Ensure dateSeparatorText is wrapped in Text */}
          <Text style={styles.dateSeparatorText}>{dateSeparatorText}</Text>
        </View>
      )}
      <View style={[styles.container, isOwnMessage ? styles.ownMessageContainer : styles.otherMessageContainer]}>
        <TouchableWithoutFeedback onLongPress={handleLongPress}>
          <View ref={bubbleRef} style={[styles.bubble, isOwnMessage ? styles.ownBubble : styles.otherBubble]}>
            {renderMessageContent()}
          </View>
        </TouchableWithoutFeedback>
        {/* Image Modal */}
        <Modal visible={imageModalVisible} transparent animationType="fade" onRequestClose={() => setImageModalVisible(false)}>
          <ZoomableImage uri={modalImageUrl} onClose={() => setImageModalVisible(false)} />
        </Modal>
        {/* Unified Context Menu for all message types */}
        <ContextMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          position={menuPosition}
          onOptionPress={handleOptionPress}
          file_type={file_type}
        />
      </View>
    </View>
  );
});

function AudioPlayerBubble({ file_url, isOwnMessage }: { file_url: string; isOwnMessage: boolean }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  async function playPause() {
    if (isPlaying) {
      if (sound) await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      setLoading(true);
      if (!sound) {
        const { sound: newSound, status } = await Audio.Sound.createAsync({ uri: file_url }, {}, onPlaybackStatusUpdate);
        setSound(newSound);
        if (status.isLoaded) {
          setDuration(status.durationMillis || 0);
        }
        await newSound.playAsync();
        setIsPlaying(true);
        setLoading(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
        setLoading(false);
      }
    }
  }

  function onPlaybackStatusUpdate(status: any) {
    if (!status.isLoaded) return;
    setPosition(status.positionMillis || 0);
    setDuration(status.durationMillis || 0);
    if (status.didJustFinish) {
      setIsPlaying(false);
      // Unload the sound when playback finishes
      if (sound) {
        sound.unloadAsync();
        setSound(null); // Set sound to null
      }
    }
  }

  useEffect(() => {
    if (sound) {
      sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
    }
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [sound]);

  function formatMillis(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={{ marginBottom: 4, alignSelf: isOwnMessage ? 'flex-end' : 'flex-start' }}>
      <TouchableOpacity onPress={playPause} style={[
        styles.audioBubble,
        isOwnMessage ? styles.ownAudioBubble : styles.otherAudioBubble,
      ]}>
        {loading ? (
          <ActivityIndicator size="small" color={'#000'} style={{ marginRight: 8 }} />
        ) : (
          <Feather
            name={isPlaying ? 'pause' : 'play'}
            size={24}
            color={'#000'}
            style={{ marginRight: 8 }}
          />
        )}
        {/* Progress bar */}
        <View style={styles.audioProgressBarContainer}>
          <View style={[styles.audioProgressBar, { width: `${progress * 100}%`, backgroundColor: isOwnMessage ? '#075E54' : '#3B82F6' }]} />
        </View>
        {/* Time duration */}
        <Text style={[
          styles.audioTime,
          isOwnMessage ? styles.ownAudioTime : styles.otherAudioTime,
        ]}>
          {formatMillis(duration)}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  ownMessageContainer: {
    alignSelf: 'flex-end',
    marginLeft: 'auto',
    marginRight: 0,
  },
  otherMessageContainer: {
    alignSelf: 'flex-start',
    marginRight: 'auto',
    marginLeft: 0,
  },
  bubble: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    paddingBottom: 4,
    minWidth: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  ownBubble: {
    backgroundColor: '#3B82F6', // Reverted to previous blue color
    borderTopRightRadius: 8,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  otherBubble: {
    backgroundColor: '#e2e8f0', // Reverted to previous white/light gray color
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  messageContent: {
    flexDirection: 'column',
  },
  messageText: {
    fontSize: 16,
    color: '#000',
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#000',
  },
  timestamp: {
    fontSize: 12,
    color: '#606060',
    alignSelf: 'flex-end',
    marginTop: 4,
    opacity: 0.8,
  },
  ownTimestamp: {
    color: '#fff', // Changed timestamp color to white for own messages
  },
  otherTimestamp: {
    color: '#606060',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  contextMenu: {
    position: 'absolute',
    minWidth: 180,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    paddingVertical: 8,
    paddingHorizontal: 0,
    zIndex: 1000,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  menuIcon: {
    marginRight: 12,
  },
  menuText: {
    fontSize: 16,
    color: '#222',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  dateSeparatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  dateSeparatorText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  // New styles for audio player bubble
  audioBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20, // Pill shape
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 260,
    minWidth: 150,
  },
  ownAudioBubble: {
    backgroundColor: '#3B82F6', // Reverted to blue color for sent voice messages
  },
  otherAudioBubble: {
    backgroundColor: '#e2e8f0', // Reverted to light gray/white color for received voice messages
  },
  audioProgressBarContainer: {
    flex: 1,
    height: 4,
    backgroundColor: '#e0e0e0', // Light grey track
    borderRadius: 2,
    marginHorizontal: 8,
  },
  audioProgressBar: {
    height: '100%',
    borderRadius: 2,
  },
  audioTime: {
    fontSize: 12,
    color: '#606060', // Darker grey time text
  },
  ownAudioTime: {
    color: '#606060',
  },
  otherAudioTime: {
    color: '#606060',
  },
  contactBubble: {
    borderRadius: 12,
    overflow: 'hidden',
    maxWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  ownContactBubble: {
    backgroundColor: '#3B82F6',
  },
  otherContactBubble: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  contactContent: {
    padding: 12,
    alignItems: 'center',
  },
  contactName: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 3,
  },
  contactNumber: {
    fontSize: 13,
  },
  translatingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  translatingText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#666',
  },
  translationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  translationIcon: {
    marginRight: 6,
    opacity: 0.7,
  },
  translationText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  eventContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventIcon: {
    marginRight: 8,
  },
  eventContent: {
    flexDirection: 'column',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  eventDescription: {
    color: '#666',
    fontSize: 14,
  },
  eventDate: {
    color: '#606060',
    fontSize: 12,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
  },
  fileIcon: {
    marginRight: 8,
  },
  fileText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '500',
  },
  summaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  summaryIcon: {
    marginRight: 6,
    opacity: 0.7,
  },
  summaryText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
    // color will be set conditionally in renderMessageContent
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#666',
  },
});