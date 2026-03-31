import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDoc, doc, deleteDoc } from 'firebase/firestore';
import { Edit, MessageCircle, BadgeCheck } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { toast } from 'sonner';

import { AppleEmojiText } from '../components/AppleEmojiText';

export default function Home() {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);

  const handleDeleteChat = async () => {
    if (!selectedChatId) return;
    try {
      await deleteDoc(doc(db, 'chats', selectedChatId));
      setShowActionSheet(false);
      setSelectedChatId(null);
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatsData = await Promise.all(snapshot.docs.map(async (chatDoc) => {
        const data = chatDoc.data();
        const otherUserId = data.participants.find((id: string) => id !== currentUser.uid);
        let otherUser = null;
        if (otherUserId) {
          const userSnap = await getDoc(doc(db, 'users', otherUserId));
          if (userSnap.exists()) {
            otherUser = { id: userSnap.id, ...userSnap.data() };
          }
        }
        return {
          id: chatDoc.id,
          ...data,
          otherUser
        };
      }));
      
      chatsData.sort((a: any, b: any) => {
        const timeA = a.lastMessageTime?.toMillis?.() || 0;
        const timeB = b.lastMessageTime?.toMillis?.() || 0;
        return timeB - timeA;
      });
      
      setChats(chatsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'chats');
    });

    return unsubscribe;
  }, [currentUser, userData?.blockedUsers]);

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    const distance = formatDistanceToNowStrict(date);
    return distance.replace(' seconds', 's').replace(' minutes', 'm').replace(' hours', 'h').replace(' days', 'd');
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 h-14 border-b border-[#DBDBDB] shrink-0">
        <h1 className="text-[20px] font-semibold text-[#262626] flex items-center">
          {userData?.username || 'Messages'}
          {userData?.isVerified && (
            <BadgeCheck size={18} className="text-[#0095F6] ml-1 shrink-0" fill="#0095F6" color="white" />
          )}
        </h1>
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/app/search')}><Edit size={24} className="text-[#262626]" strokeWidth={1.5} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-24 h-24 rounded-full border-2 border-[#262626] flex items-center justify-center mb-4">
                <MessageCircle size={48} className="text-[#262626]" strokeWidth={1.5} />
              </div>
              <h2 className="text-[20px] font-semibold text-[#262626] mb-2">Your messages</h2>
              <p className="text-[14px] text-[#8E8E8E] mb-6 text-center">Send private messages to a friend.</p>
              <button 
                onClick={() => navigate('/app/search')}
                className="px-6 py-2 bg-[#0095F6] text-white font-semibold rounded-lg"
              >
                Send message
              </button>
            </div>
          ) : (
            chats.map(chat => {
              const unreadCount = chat.unreadCount?.[currentUser?.uid || ''] || 0;
              const isUnread = unreadCount > 0;
              
              return (
                <div 
                  key={chat.id} 
                  onClick={() => navigate(`/chat/${chat.id}`)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedChatId(chat.id);
                    setShowActionSheet(true);
                  }}
                  className="flex items-center px-4 py-3 active:bg-gray-50 cursor-pointer"
                >
                  <div className="relative w-11 h-11 shrink-0">
                    <div className="w-full h-full rounded-full bg-[#DBDBDB] overflow-hidden">
                      {chat.otherUser?.avatarUrl ? (
                        <img src={chat.otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-[18px] font-semibold">
                          {chat.otherUser?.fullName?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    {chat.otherUser?.isOnline && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#0095F6] rounded-full border-2 border-white"></div>
                    )}
                  </div>
                  <div className="ml-3 flex-1 min-w-0">
                    <p className={`text-[14px] truncate flex items-center ${isUnread ? 'font-semibold text-[#262626]' : 'text-[#262626]'}`}>
                      <AppleEmojiText text={chat.nicknames?.[chat.otherUser?.id] || chat.otherUser?.username || 'Unknown User'} />
                      {chat.otherUser?.isVerified && (
                        <BadgeCheck size={14} className="text-[#0095F6] ml-1 shrink-0" fill="#0095F6" color="white" />
                      )}
                    </p>
                    <div className="flex items-center text-[13px]">
                      <span className={`truncate ${isUnread ? 'font-semibold text-[#262626]' : 'text-[#8E8E8E]'}`}>
                        {chat.lastMessageSenderId === currentUser?.uid ? 'You: ' : ''}
                        <AppleEmojiText text={chat.lastMessage || ''} />
                      </span>
                      <span className="mx-1 text-[#8E8E8E]">·</span>
                      <span className="text-[#8E8E8E] shrink-0">{formatTime(chat.lastMessageTime)}</span>
                    </div>
                  </div>
                  {isUnread && (
                    <div className="ml-2 w-2 h-2 rounded-full bg-[#0095F6] shrink-0"></div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Action Sheet */}
      {showActionSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={() => setShowActionSheet(false)}>
          <div 
            className="bg-white rounded-t-2xl overflow-hidden animate-in slide-in-from-bottom-full duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-center py-3">
              <div className="w-10 h-1 bg-[#DBDBDB] rounded-full"></div>
            </div>
            <div className="flex flex-col pb-8">
              <button 
                onClick={handleDeleteChat}
                className="w-full py-4 text-[15px] text-[#ED4956] font-semibold active:bg-gray-50 border-b border-[#DBDBDB]"
              >
                Delete Chat
              </button>
              <button 
                onClick={() => setShowActionSheet(false)}
                className="w-full py-4 text-[15px] text-[#262626] active:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
