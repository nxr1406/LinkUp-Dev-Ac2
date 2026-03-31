import { useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Search, Phone, User } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, limit, getDoc, doc } from 'firebase/firestore';
import { toast } from 'sonner';

export default function Layout() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'modified') {
          const data = change.doc.data();
          const chatId = change.doc.id;
          
          // Check if there's a new message and I'm not the sender
          if (data.lastMessageSenderId && data.lastMessageSenderId !== currentUser.uid) {
            // Check if I'm currently in this chat
            const inChat = location.pathname === `/chat/${chatId}`;
            
            // We only want to notify if the unread count for me is > 0
            if (!inChat && data.unreadCount?.[currentUser.uid] > 0) {
              try {
                // Fetch sender info
                const senderSnap = await getDoc(doc(db, 'users', data.lastMessageSenderId));
                const senderData = senderSnap.exists() ? senderSnap.data() : null;
                
                toast.custom((t) => (
                  <div 
                    onClick={() => {
                      toast.dismiss(t);
                      navigate(`/chat/${chatId}`);
                    }}
                    className="flex items-center w-full bg-white border border-[#DBDBDB] rounded-xl shadow-lg p-3 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#DBDBDB] overflow-hidden shrink-0 mr-3">
                      {senderData?.avatarUrl ? (
                        <img src={senderData.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-[16px] font-semibold">
                          {senderData?.fullName?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-[14px] font-semibold text-[#262626] truncate">{senderData?.fullName}</span>
                      <span className="text-[13px] text-[#262626] truncate">{data.lastMessage}</span>
                    </div>
                    <span className="text-[12px] text-[#8E8E8E] ml-2 shrink-0">Now</span>
                  </div>
                ), { duration: 4000, id: `msg-${chatId}-${data.lastMessageTime?.toMillis()}` });
              } catch (e) {
                console.error("Error fetching sender info for toast:", e);
              }
            }
          }
        }
      });
    }, (error) => {
      console.error("Layout onSnapshot error:", error);
    });

    return unsubscribe;
  }, [currentUser, location.pathname, navigate]);

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
      
      <nav className="flex items-center justify-around h-12 border-t border-[#DBDBDB] bg-white shrink-0">
        <NavLink to="/app" end className={({ isActive }) => clsx("p-2", isActive ? "text-[#262626]" : "text-[#8E8E8E]")}>
          {({ isActive }) => <MessageCircle size={24} strokeWidth={isActive ? 2.5 : 1.5} fill={isActive ? "#262626" : "none"} />}
        </NavLink>
        <NavLink to="/app/search" className={({ isActive }) => clsx("p-2", isActive ? "text-[#262626]" : "text-[#8E8E8E]")}>
          {({ isActive }) => <Search size={24} strokeWidth={isActive ? 2.5 : 1.5} />}
        </NavLink>
        <NavLink to="/app/profile" className={({ isActive }) => clsx("p-2", isActive ? "text-[#262626]" : "text-[#8E8E8E]")}>
          {({ isActive }) => <User size={24} strokeWidth={isActive ? 2.5 : 1.5} fill={isActive ? "#262626" : "none"} />}
        </NavLink>
      </nav>
    </div>
  );
}
