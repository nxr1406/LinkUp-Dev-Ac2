import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { 
  collection, query, orderBy, onSnapshot, doc, getDoc, 
  addDoc, serverTimestamp, updateDoc, writeBatch, where, getDocs, deleteDoc, arrayUnion, arrayRemove 
} from 'firebase/firestore';
import { 
  ChevronLeft, Phone, Video, Camera, Mic, Smile, Send, 
  Reply, Edit2, Trash2, Globe, AlertTriangle, X, Info,
  Circle, CheckCircle, CheckCircle2, AlertCircle, BadgeCheck
} from 'lucide-react';
import { format, isToday, isYesterday, formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { AppleEmojiText } from '../components/AppleEmojiText';

export default function Chat() {
  const { chatId } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [chatData, setChatData] = useState<any>(null);
  const [translating, setTranslating] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [failedMessages, setFailedMessages] = useState<any[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypedRef = useRef<number>(0);

  const { userData } = useAuth();
  const isBlocked = userData?.blockedUsers?.includes(otherUser?.id);
  const amIBlocked = otherUser?.blockedUsers?.includes(currentUser?.uid);

  const handleReplyClick = () => {
    setReplyingTo(selectedMessage);
    setShowActionSheet(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleDeleteChat = async () => {
    if (!chatId) return;
    try {
      await deleteDoc(doc(db, 'chats', chatId));
      navigate('/app');
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  useEffect(() => {
    if (!currentUser || !chatId) return;

    // Fetch chat details and other user
    const fetchChat = async () => {
      try {
        const chatDoc = await getDoc(doc(db, 'chats', chatId));
        if (chatDoc.exists()) {
          const data = chatDoc.data();
          const otherId = data.participants.find((id: string) => id !== currentUser.uid);
          if (otherId) {
            const userUnsubscribe = onSnapshot(doc(db, 'users', otherId), (docSnap) => {
              if (docSnap.exists()) {
                setOtherUser({ id: docSnap.id, ...docSnap.data() });
              }
            }, (error) => {
              handleFirestoreError(error, OperationType.GET, `users/${otherId}`);
            });
            return userUnsubscribe;
          }
        }
      } catch (error) {
        toast.error("Failed to load chat details.");
        handleFirestoreError(error, OperationType.GET, `chats/${chatId}`);
      }
    };
    
    let userUnsub: any;
    fetchChat().then(unsub => { userUnsub = unsub; });

    // Mark messages as read
    const markAsRead = async () => {
      try {
        await updateDoc(doc(db, 'chats', chatId), {
          [`unreadCount.${currentUser.uid}`]: 0
        });
      } catch (error) {
        console.error('Error marking chat as read:', error);
      }
    };
    markAsRead();

    // Listen to chat doc for typing indicator and nicknames
    const chatUnsubscribe = onSnapshot(doc(db, 'chats', chatId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setChatData(data);
        if (data.typing && otherUser?.id) {
          setIsTyping(data.typing.includes(otherUser.id));
        } else {
          setIsTyping(false);
        }
      }
    }, (error) => {
      console.error('Error listening to chat updates:', error);
    });

    // Fetch messages
    const q = query(
      collection(db, `messages/${chatId}/msgs`),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        isPending: doc.metadata.hasPendingWrites
      }));
      setMessages(msgs);
      setLoading(false);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
      
      // Mark unread messages as read by me
      const batch = writeBatch(db);
      let hasUnread = false;
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.senderId !== currentUser.uid && (!data.readBy || !data.readBy.includes(currentUser.uid))) {
          batch.update(docSnap.ref, {
            readBy: [...(data.readBy || []), currentUser.uid]
          });
          hasUnread = true;
        }
      });
      if (hasUnread) {
        batch.commit().catch(error => {
          console.error('Error marking messages as read:', error);
        });
      }
    }, (error) => {
      setLoading(false);
      toast.error("Failed to load messages. Please check your connection or permissions.");
      handleFirestoreError(error, OperationType.GET, `messages/${chatId}/msgs`);
    });

    return () => {
      unsubscribe();
      chatUnsubscribe();
      if (userUnsub) userUnsub();
    };
  }, [chatId, currentUser, otherUser?.id]);

  const handleTyping = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (!currentUser || !chatId) return;

    try {
      if (e.target.value.trim() !== '') {
        const now = Date.now();
        if (now - lastTypedRef.current > 2000) {
          lastTypedRef.current = now;
          await updateDoc(doc(db, 'chats', chatId), {
            typing: arrayUnion(currentUser.uid)
          });
        }
        
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(async () => {
          await updateDoc(doc(db, 'chats', chatId), {
            typing: arrayRemove(currentUser.uid)
          });
          lastTypedRef.current = 0;
        }, 3000);
      } else {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        await updateDoc(doc(db, 'chats', chatId), {
          typing: arrayRemove(currentUser.uid)
        });
        lastTypedRef.current = 0;
      }
    } catch (error) {
      console.error('Error updating typing status:', error);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !currentUser || !chatId) return;
    
    const text = inputText.trim();
    const replyData = replyingTo ? {
      replyToId: replyingTo.id,
      replyToText: replyingTo.content,
      replyToSenderId: replyingTo.senderId
    } : {};
    
    setInputText('');
    setReplyingTo(null);
    
    try {
      // Clear typing indicator
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      lastTypedRef.current = 0;
      await updateDoc(doc(db, 'chats', chatId), {
        typing: arrayRemove(currentUser.uid)
      });

      await addDoc(collection(db, `messages/${chatId}/msgs`), {
        senderId: currentUser.uid,
        content: text,
        type: 'text',
        createdAt: serverTimestamp(),
        isDeleted: false,
        editedAt: null,
        reactions: {},
        deletedFor: [],
        readBy: [currentUser.uid],
        ...replyData
      });

      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: text,
        lastMessageTime: serverTimestamp(),
        lastMessageSenderId: currentUser.uid,
        // Increment unread count for other user
        [`unreadCount.${otherUser?.id}`]: 1 // Simplified, should ideally increment
      });
    } catch (error: any) {
      toast.error('Failed to send message');
      setFailedMessages(prev => [...prev, {
        id: `failed-${Date.now()}`,
        senderId: currentUser.uid,
        content: text,
        type: 'text',
        createdAt: { toDate: () => new Date(), toMillis: () => Date.now() },
        isError: true,
        isPending: false,
        readBy: [],
        ...replyData
      }]);
    }
  };

  const handleReaction = async (emoji: string) => {
    if (!selectedMessage || !currentUser || !chatId) return;
    
    const msgRef = doc(db, `messages/${chatId}/msgs`, selectedMessage.id);
    const currentReactions = selectedMessage.reactions || {};
    
    if (currentReactions[currentUser.uid] === emoji) {
      // Remove reaction
      const newReactions = { ...currentReactions };
      delete newReactions[currentUser.uid];
      await updateDoc(msgRef, { reactions: newReactions });
    } else {
      // Add/update reaction
      await updateDoc(msgRef, {
        reactions: { ...currentReactions, [currentUser.uid]: emoji }
      });

      // Send notification if reacting to someone else's message
      if (selectedMessage.senderId !== currentUser.uid && otherUser?.notificationsEnabled !== false) {
        await addDoc(collection(db, 'notifications'), {
          userId: selectedMessage.senderId,
          type: 'reaction',
          fromUserId: currentUser.uid,
          emoji,
          chatId,
          messageId: selectedMessage.id,
          createdAt: serverTimestamp(),
          read: false
        });
      }
    }
    
    setShowActionSheet(false);
    setSelectedMessage(null);
  };

  const handleDeleteForMe = async () => {
    if (!selectedMessage || !currentUser || !chatId) return;
    
    const msgRef = doc(db, `messages/${chatId}/msgs`, selectedMessage.id);
    await updateDoc(msgRef, {
      deletedFor: [...(selectedMessage.deletedFor || []), currentUser.uid]
    });
    
    setShowActionSheet(false);
    setSelectedMessage(null);
  };

  const handleUnsend = async () => {
    if (!selectedMessage || !currentUser || !chatId) return;
    if (selectedMessage.senderId !== currentUser.uid) return;
    
    const msgRef = doc(db, `messages/${chatId}/msgs`, selectedMessage.id);
    await updateDoc(msgRef, {
      isDeleted: true,
      content: 'This message was unsent'
    });
    
    // If this was the last message, update the chat's lastMessage
    const isLastMessage = messages.length > 0 && messages[messages.length - 1].id === selectedMessage.id;
    if (isLastMessage) {
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: 'This message was unsent'
      });
    }
    
    setShowActionSheet(false);
    setSelectedMessage(null);
  };

  const handleTranslate = async () => {
    if (!selectedMessage) return;
    
    setTranslating(selectedMessage.id);
    try {
      const response = await fetch('https://libretranslate.com/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: selectedMessage.content,
          source: 'auto',
          target: 'en'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Update local state to show translation (in a real app, might save to Firestore or local state map)
        toast.success(`Translation: ${data.translatedText}`);
      } else {
        throw new Error('Translation failed');
      }
    } catch (error) {
      toast.error('Translation service unavailable');
    } finally {
      setTranslating(null);
      setShowActionSheet(false);
      setSelectedMessage(null);
    }
  };

  const handleReport = async () => {
    if (!selectedMessage || !currentUser || !chatId) return;
    
    try {
      await addDoc(collection(db, 'reports'), {
        messageId: selectedMessage.id,
        chatId,
        reporterId: currentUser.uid,
        reportedUserId: selectedMessage.senderId,
        content: selectedMessage.content,
        reportedAt: serverTimestamp()
      });
      toast.success('Message reported');
    } catch (error) {
      console.error('Error reporting message:', error);
      toast.error('Failed to report message');
    } finally {
      setShowActionSheet(false);
      setSelectedMessage(null);
    }
  };

  const handleSetNickname = async () => {
    if (!chatId || !otherUser) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        [`nicknames.${otherUser.id}`]: nicknameInput.trim() || null
      });
      setShowNicknameModal(false);
      toast.success('Nickname updated');
    } catch (error) {
      console.error('Error setting nickname:', error);
      toast.error('Failed to set nickname');
    }
  };

  const formatLastSeen = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    const distance = formatDistanceToNowStrict(date);
    return `Active ${distance.replace(' seconds', 's').replace(' minutes', 'm').replace(' hours', 'h').replace(' days', 'd')} ago`;
  };

  const renderDateSeparator = (date: Date) => {
    let text = format(date, 'MMM d, yyyy').toUpperCase();
    if (isToday(date)) text = 'TODAY';
    else if (isYesterday(date)) text = 'YESTERDAY';
    else text = format(date, 'EEE, MMM d').toUpperCase();

    return (
      <div className="flex justify-center my-4">
        <span className="text-[12px] font-semibold text-[#8E8E8E]">{text}</span>
      </div>
    );
  };

  if (loading) return <div className="h-screen bg-white flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#DBDBDB] border-t-[#8E8E8E] rounded-full animate-spin"></div></div>;

  // Filter messages deleted for me
  const visibleMessages = [...messages, ...failedMessages].filter(m => !m.deletedFor?.includes(currentUser?.uid));

  return (
    <div className="flex flex-col h-screen bg-white relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-[#DBDBDB] shrink-0 bg-white z-10">
        <div className="flex items-center flex-1 min-w-0">
          <button onClick={() => navigate('/app')} className="mr-2 -ml-2 p-2">
            <ChevronLeft size={28} className="text-[#262626]" strokeWidth={1.5} />
          </button>
          <div className="relative shrink-0 mr-3 cursor-pointer" onClick={() => navigate(`/app/user/${otherUser?.id}`)}>
            <div className="w-8 h-8 rounded-full bg-[#DBDBDB] overflow-hidden">
              {otherUser?.avatarUrl ? (
                <img src={otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-[14px] font-semibold">
                  {otherUser?.fullName?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
            {otherUser?.isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#0095F6] rounded-full border-2 border-white"></div>
            )}
          </div>
          <div 
            className="flex flex-col min-w-0 cursor-pointer"
            onClick={() => navigate(`/app/user/${otherUser?.id}`)}
          >
            <span className="text-[15px] font-semibold text-[#262626] truncate flex items-center">
              <AppleEmojiText text={chatData?.nicknames?.[otherUser?.id] || otherUser?.fullName || ''} />
              {otherUser?.isVerified && (
                <BadgeCheck size={14} className="text-[#0095F6] ml-1 shrink-0" fill="#0095F6" color="white" />
              )}
            </span>
            <span className="text-[12px] text-[#8E8E8E] truncate flex items-center">
              {isTyping ? (
                <span className="text-[#0095F6] font-medium italic animate-pulse">typing...</span>
              ) : (
                otherUser?.isOnline ? 'Active now' : formatLastSeen(otherUser?.lastSeen)
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-4 shrink-0">
          <button onClick={() => setShowChatSettings(true)} className="p-2 -mr-2">
            <Info size={24} className="text-[#262626]" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {visibleMessages.map((msg, index) => {
          const isMine = msg.senderId === currentUser?.uid;
          
          // Grouping logic
          const prevMsg = index > 0 ? visibleMessages[index - 1] : null;
          const nextMsg = index < visibleMessages.length - 1 ? visibleMessages[index + 1] : null;
          
          const isSameSenderAsPrev = prevMsg && prevMsg.senderId === msg.senderId;
          const isSameSenderAsNext = nextMsg && nextMsg.senderId === msg.senderId;
          
          const isWithin60sPrev = prevMsg && msg.createdAt && prevMsg.createdAt && 
            (msg.createdAt.toMillis() - prevMsg.createdAt.toMillis() < 60000);
          const isWithin60sNext = nextMsg && msg.createdAt && nextMsg.createdAt && 
            (nextMsg.createdAt.toMillis() - msg.createdAt.toMillis() < 60000);

          const isGroupStart = !isSameSenderAsPrev || !isWithin60sPrev;
          const isGroupEnd = !isSameSenderAsNext || !isWithin60sNext;

          const showAvatar = !isMine && isGroupEnd;
          const isLastRead = isMine && msg.readBy?.includes(otherUser?.id) && 
            (index === visibleMessages.length - 1 || !visibleMessages[index + 1].readBy?.includes(otherUser?.id));
          
          let showDate = false;
          if (index === 0) showDate = true;
          else if (msg.createdAt && prevMsg?.createdAt) {
            const prevDate = prevMsg.createdAt.toDate();
            const currDate = msg.createdAt.toDate();
            if (prevDate.getDate() !== currDate.getDate()) showDate = true;
          }

          const reactions = Object.entries(msg.reactions || {});
          const groupedReactions = reactions.reduce((acc, [uid, emoji]) => {
            const e = emoji as string;
            acc[e] = (acc[e] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          const reactionEntries = Object.entries(groupedReactions);

          // Determine border radius based on grouping
          let borderRadiusClass = "rounded-[22px]";
          if (isMine) {
            if (isGroupStart && isGroupEnd) borderRadiusClass = "rounded-[22px] rounded-br-[4px]";
            else if (isGroupStart) borderRadiusClass = "rounded-[22px] rounded-br-[4px]";
            else if (isGroupEnd) borderRadiusClass = "rounded-[22px] rounded-tr-[4px] rounded-br-[4px]";
            else borderRadiusClass = "rounded-[22px] rounded-tr-[4px] rounded-br-[4px]";
          } else {
            if (isGroupStart && isGroupEnd) borderRadiusClass = "rounded-[22px] rounded-bl-[4px]";
            else if (isGroupStart) borderRadiusClass = "rounded-[22px] rounded-bl-[4px]";
            else if (isGroupEnd) borderRadiusClass = "rounded-[22px] rounded-tl-[4px] rounded-bl-[4px]";
            else borderRadiusClass = "rounded-[22px] rounded-tl-[4px] rounded-bl-[4px]";
          }

          return (
            <div key={msg.id} className="flex flex-col">
              {showDate && msg.createdAt && renderDateSeparator(msg.createdAt.toDate())}
              
              <div className={clsx("flex w-full", isGroupEnd ? "mb-2" : "mb-[2px]", isMine ? "justify-end" : "justify-start")}>
                {!isMine && (
                  <div className={clsx("w-8 h-8 rounded-full overflow-hidden shrink-0 mr-2 self-end", showAvatar ? "bg-[#DBDBDB]" : "bg-transparent")}>
                    {showAvatar && (
                      otherUser?.avatarUrl ? (
                        <img src={otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-[14px] font-semibold">
                          {otherUser?.fullName?.[0]?.toUpperCase()}
                        </div>
                      )
                    )}
                  </div>
                )}
                
                <div className="flex flex-col max-w-[70%]">
                  <div 
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSelectedMessage(msg);
                      setShowActionSheet(true);
                    }}
                    className={clsx(
                      "px-4 py-3 text-[15px] relative",
                      isMine ? "bg-[#0095F6] text-white" : "bg-[#EFEFEF] text-[#262626]",
                      borderRadiusClass,
                      msg.isDeleted && "italic opacity-70"
                    )}
                  >
                    {msg.replyToText && !msg.isDeleted && (
                      <div className={clsx(
                        "flex flex-col mb-2 p-2 rounded-[12px] border-l-4",
                        isMine ? "bg-white/20 border-white/50" : "bg-black/5 border-black/20"
                      )}>
                        <span className="text-[11px] font-semibold opacity-80 flex items-center">
                          {msg.replyToSenderId === currentUser?.uid ? 'You' : <AppleEmojiText text={otherUser?.fullName || 'User'} />}
                          {msg.replyToSenderId !== currentUser?.uid && otherUser?.isVerified && (
                            <BadgeCheck size={10} className="text-[#0095F6] ml-0.5 shrink-0" fill="#0095F6" color="white" />
                          )}
                        </span>
                        <span className="text-[13px] opacity-90 truncate"><AppleEmojiText text={msg.replyToText} /></span>
                      </div>
                    )}
                    
                    <AppleEmojiText text={msg.content} />
                    
                    {/* Reactions */}
                    {reactionEntries.length > 0 && (
                      <div className={clsx(
                        "absolute -bottom-3 flex items-center bg-white border border-[#DBDBDB] rounded-full px-1.5 py-0.5 shadow-sm space-x-1",
                        isMine ? "right-2" : "left-2"
                      )}>
                        {reactionEntries.map(([emoji, count]) => (
                          <div key={emoji} className="flex items-center space-x-1">
                            <span className="text-[12px]"><AppleEmojiText text={emoji} /></span>
                            {count > 1 && <span className="text-[10px] text-[#8E8E8E] font-semibold">{count}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Message Status Indicator (Messenger Style) */}
                {isMine && (
                  <div className="flex items-end ml-1.5 mb-1 w-3.5 h-3.5 shrink-0">
                    {msg.isError ? (
                      <AlertCircle size={14} className="text-[#ED4956]" />
                    ) : msg.isPending ? (
                      <Circle size={14} className="text-[#8E8E8E]" />
                    ) : msg.readBy?.includes(otherUser?.id) ? (
                      isLastRead ? (
                        <div className="w-3.5 h-3.5 rounded-full bg-[#DBDBDB] overflow-hidden">
                          {otherUser?.avatarUrl ? (
                            <img src={otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white text-[7px] font-semibold bg-[#DBDBDB]">
                              {otherUser?.fullName?.[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                      ) : null
                    ) : otherUser?.isOnline ? (
                      <CheckCircle size={14} className="text-white" fill="#8E8E8E" />
                    ) : (
                      <CheckCircle size={14} className="text-[#8E8E8E]" />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isTyping && (
          <div className="flex items-center py-2">
            <div className="w-8 h-8 rounded-full bg-[#DBDBDB] overflow-hidden mr-2 shrink-0">
              {otherUser?.avatarUrl ? (
                <img src={otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-[12px] font-semibold">
                  {otherUser?.fullName?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="bg-[#EFEFEF] rounded-[22px] px-4 py-3 flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-[#8E8E8E] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-1.5 h-1.5 bg-[#8E8E8E] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-1.5 h-1.5 bg-[#8E8E8E] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-2 shrink-0 bg-white flex flex-col">
        {isTyping && (
          <div className="px-2 pb-1 text-[12px] text-[#8E8E8E] italic animate-pulse flex items-center">
            {otherUser?.fullName?.split(' ')[0]}
            {otherUser?.isVerified && <BadgeCheck size={10} className="text-[#0095F6] ml-0.5 mr-1 shrink-0" fill="#0095F6" color="white" />}
            {' '}is typing...
          </div>
        )}
        {isBlocked ? (
          <div className="flex items-center justify-center p-4 bg-[#EFEFEF] rounded-lg">
            <p className="text-[14px] text-[#8E8E8E] font-medium">You have blocked this user.</p>
          </div>
        ) : amIBlocked ? (
          <div className="flex items-center justify-center p-4 bg-[#EFEFEF] rounded-lg">
            <p className="text-[14px] text-[#8E8E8E] font-medium">You cannot reply to this conversation.</p>
          </div>
        ) : (
          <div className="flex flex-col relative">
            {replyingTo && (
              <div className="flex items-center justify-between bg-[#F5F5F5] px-4 py-2 border-l-4 border-[#0095F6] rounded-t-[12px] mx-1 mb-1">
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[12px] font-semibold text-[#0095F6] flex items-center">
                    Replying to {replyingTo.senderId === currentUser?.uid ? 'yourself' : <AppleEmojiText text={otherUser?.fullName || 'user'} />}
                    {replyingTo.senderId !== currentUser?.uid && otherUser?.isVerified && (
                      <BadgeCheck size={10} className="text-[#0095F6] ml-0.5 shrink-0" fill="#0095F6" color="white" />
                    )}
                  </span>
                  <span className="text-[13px] text-[#8E8E8E] truncate"><AppleEmojiText text={replyingTo.content} /></span>
                </div>
                <button onClick={() => setReplyingTo(null)} className="p-1 ml-2">
                  <X size={18} className="text-[#8E8E8E]" />
                </button>
              </div>
            )}
            <div className="flex items-center bg-[#EFEFEF] rounded-[24px] min-h-[44px] px-1">
              {!inputText && (
                <button className="p-2" onClick={() => toast('Image sharing is not available')}>
                  <div className="w-8 h-8 rounded-full bg-[#0095F6] flex items-center justify-center">
                    <Camera size={18} className="text-white" />
                  </div>
                </button>
              )}
              
              <input
                ref={inputRef}
                type="text"
                placeholder="Message..."
                value={inputText}
                onChange={handleTyping}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                className="flex-1 bg-transparent border-none outline-none px-3 py-2 text-[15px] text-[#262626] placeholder-[#8E8E8E]"
              />
              
              {!inputText ? (
                <div className="flex items-center">
                  <button className="p-2"><Mic size={24} className="text-[#262626]" strokeWidth={1.5} /></button>
                  <button className="p-2" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                    <Smile size={24} className="text-[#262626]" strokeWidth={1.5} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center">
                  <button className="p-2 mr-1" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                    <Smile size={24} className="text-[#262626]" strokeWidth={1.5} />
                  </button>
                  <button onClick={handleSend} className="p-2 mr-1">
                    <Send size={24} className="text-[#0095F6]" strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>
            
            {showEmojiPicker && (
              <div className="absolute bottom-[70px] right-2 z-50 shadow-lg rounded-lg overflow-hidden">
                <Picker 
                  data={data} 
                  set="apple" 
                  onEmojiSelect={(emoji: any) => {
                    setInputText(prev => prev + emoji.native);
                    // Optional: keep picker open or close it
                    // setShowEmojiPicker(false);
                  }} 
                  theme="light"
                  previewPosition="none"
                  skinTonePosition="none"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Sheet Overlay */}
      {showActionSheet && selectedMessage && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowActionSheet(false)}></div>
          
          {/* Reaction Bar */}
          <div className="relative z-10 flex justify-center mb-4 px-4">
            <div className="bg-white rounded-full shadow-lg flex items-center px-2 h-11 space-x-2">
              {['❤️', '😂', '😮', '😢', '😡', '👍'].map(emoji => (
                <button 
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="text-[24px] hover:scale-110 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Action Sheet */}
          <div className="bg-white w-full rounded-t-2xl relative z-10 pb-safe animate-in slide-in-from-bottom-full duration-200">
            <div className="w-10 h-1 bg-[#DBDBDB] rounded-full mx-auto mt-3 mb-2"></div>
            
            <div className="flex flex-col">
              <button onClick={handleReplyClick} className="flex items-center px-4 py-3 active:bg-gray-50">
                <Reply size={24} className="text-[#262626] mr-3" strokeWidth={1.5} />
                <span className="text-[15px] text-[#262626]">Reply</span>
              </button>
              
              {selectedMessage.senderId === currentUser?.uid && !selectedMessage.isDeleted && (
                <>
                  <div className="h-[0.5px] bg-[#DBDBDB] ml-12"></div>
                  <button onClick={handleUnsend} className="flex items-center px-4 py-3 active:bg-gray-50">
                    <Trash2 size={24} className="text-[#ED4956] mr-3" strokeWidth={1.5} />
                    <span className="text-[15px] text-[#ED4956]">Unsend</span>
                  </button>
                </>
              )}
              
              <div className="h-[0.5px] bg-[#DBDBDB] ml-12"></div>
              <button onClick={handleDeleteForMe} className="flex items-center px-4 py-3 active:bg-gray-50">
                <X size={24} className="text-[#262626] mr-3" strokeWidth={1.5} />
                <span className="text-[15px] text-[#262626]">Delete for me</span>
              </button>
              
              {!selectedMessage.isDeleted && (
                <>
                  <div className="h-[0.5px] bg-[#DBDBDB] ml-12"></div>
                  <button onClick={handleTranslate} className="flex items-center px-4 py-3 active:bg-gray-50">
                    <Globe size={24} className="text-[#262626] mr-3" strokeWidth={1.5} />
                    <span className="text-[15px] text-[#262626]">Translate</span>
                  </button>
                </>
              )}
              
              <div className="h-[0.5px] bg-[#DBDBDB] ml-12"></div>
              <button onClick={handleReport} className="flex items-center px-4 py-3 active:bg-gray-50">
                <AlertTriangle size={24} className="text-[#ED4956] mr-3" strokeWidth={1.5} />
                <span className="text-[15px] text-[#ED4956]">Report</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Chat Settings Action Sheet */}
      {showChatSettings && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={() => setShowChatSettings(false)}>
          <div 
            className="bg-white rounded-t-2xl overflow-hidden animate-in slide-in-from-bottom-full duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-center py-3">
              <div className="w-10 h-1 bg-[#DBDBDB] rounded-full"></div>
            </div>
            <div className="flex flex-col pb-8">
              <button 
                onClick={() => {
                  setNicknameInput(chatData?.nicknames?.[otherUser?.id] || '');
                  setShowChatSettings(false);
                  setShowNicknameModal(true);
                }}
                className="w-full py-4 text-[15px] text-[#262626] font-semibold active:bg-gray-50 border-b border-[#DBDBDB]"
              >
                Set Nickname
              </button>
              <button 
                onClick={handleDeleteChat}
                className="w-full py-4 text-[15px] text-[#ED4956] font-semibold active:bg-gray-50 border-b border-[#DBDBDB]"
              >
                Delete Chat
              </button>
              <button 
                onClick={() => setShowChatSettings(false)}
                className="w-full py-4 text-[15px] text-[#262626] active:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nickname Modal */}
      {showNicknameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setShowNicknameModal(false)}>
          <div 
            className="bg-white rounded-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-[18px] font-semibold text-center mb-4">Set Nickname</h3>
              <input
                type="text"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                placeholder={otherUser?.fullName}
                className="w-full bg-[#F5F5F5] border-none rounded-xl px-4 py-3 text-[15px] outline-none mb-6"
                autoFocus
              />
              <div className="flex space-x-3">
                <button 
                  onClick={() => setShowNicknameModal(false)}
                  className="flex-1 py-3 rounded-xl font-semibold text-[#262626] bg-[#F5F5F5]"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSetNickname}
                  className="flex-1 py-3 rounded-xl font-semibold text-white bg-[#0095F6]"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
