import React, { createContext, useContext, useState } from 'react';

const ChatContext = createContext<{
  currentOpenChatId: string | null;
  setCurrentOpenChatId: (id: string | null) => void;
}>({
  currentOpenChatId: null,
  setCurrentOpenChatId: () => {},
});

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentOpenChatId, setCurrentOpenChatId] = useState<string | null>(null);
  return (
    <ChatContext.Provider value={{ currentOpenChatId, setCurrentOpenChatId }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = () => useContext(ChatContext); 