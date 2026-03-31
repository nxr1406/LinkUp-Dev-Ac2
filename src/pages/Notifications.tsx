import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { ChevronLeft, BellOff, BadgeCheck } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { clsx } from 'clsx';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export default function Notifications() {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    if (userData) {
      setNotificationsEnabled(userData.notificationsEnabled !== false);
    }
  }, [userData]);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const notifsData = await Promise.all(snapshot.docs.map(async (notifDoc) => {
        const data = notifDoc.data();
        let fromUser = null;
        if (data.fromUserId) {
          const userSnap = await getDoc(doc(db, 'users', data.fromUserId));
          if (userSnap.exists()) {
            fromUser = { id: userSnap.id, ...userSnap.data() };
          }
        }
        return {
          id: notifDoc.id,
          ...data,
          fromUser
        };
      }));
      
      // Sort in memory to avoid requiring a composite index
      notifsData.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      
      setNotifications(notifsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'notifications');
    });

    return unsubscribe;
  }, [currentUser]);

  const toggleNotifications = async () => {
    if (!currentUser) return;
    const newState = !notificationsEnabled;
    setNotificationsEnabled(newState);
    await updateDoc(doc(db, 'users', currentUser.uid), {
      notificationsEnabled: newState
    });
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    const distance = formatDistanceToNowStrict(date);
    return distance.replace(' seconds', 's').replace(' minutes', 'm').replace(' hours', 'h').replace(' days', 'd');
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center px-4 h-14 border-b border-[#DBDBDB] shrink-0">
        <button onClick={() => navigate(-1)} className="mr-4">
          <ChevronLeft size={28} className="text-[#262626]" strokeWidth={1.5} />
        </button>
        <h1 className="text-[16px] font-semibold text-[#262626]">Notifications</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 border-b border-[#DBDBDB]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-[#262626]">Pause All</h2>
              <p className="text-[12px] text-[#8E8E8E]">Temporarily pause notifications</p>
            </div>
            <button 
              onClick={toggleNotifications}
              className={clsx(
                "w-11 h-6 rounded-full relative transition-colors duration-200 ease-in-out",
                !notificationsEnabled ? "bg-[#0095F6]" : "bg-[#DBDBDB]"
              )}
            >
              <div className={clsx(
                "w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform duration-200 ease-in-out",
                !notificationsEnabled ? "translate-x-[22px]" : "translate-x-0.5"
              )}></div>
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-24 h-24 rounded-full border-2 border-[#262626] flex items-center justify-center mb-4">
                <BellOff size={48} className="text-[#262626]" strokeWidth={1.5} />
              </div>
              <h2 className="text-[20px] font-semibold text-[#262626] mb-2">No notifications</h2>
              <p className="text-[14px] text-[#8E8E8E] text-center">When someone interacts with you, you'll see it here.</p>
            </div>
          ) : (
            notifications.map(notif => (
              <div 
                key={notif.id} 
                className="flex items-center px-4 py-3 active:bg-gray-50 cursor-pointer"
                onClick={() => {
                  if (notif.type === 'follow') {
                    navigate(`/app/user/${notif.fromUserId}`);
                  }
                }}
              >
                <div className="w-11 h-11 rounded-full bg-[#DBDBDB] overflow-hidden shrink-0">
                  {notif.fromUser?.avatarUrl ? (
                    <img src={notif.fromUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-[18px] font-semibold">
                      {notif.fromUser?.fullName?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="ml-3 flex-1 min-w-0">
                  <p className="text-[14px] text-[#262626] flex items-center flex-wrap">
                    <span className="font-semibold flex items-center">
                      {notif.fromUser?.username || 'Someone'}
                      {notif.fromUser?.isVerified && (
                        <BadgeCheck size={14} className="text-[#0095F6] ml-1 shrink-0" fill="#0095F6" color="white" />
                      )}
                    </span>
                    <span className="ml-1">
                      {notif.type === 'follow' && 'started following you.'}
                      {notif.type === 'reaction' && `reacted to your message: ${notif.emoji}`}
                    </span>
                    <span className="text-[#8E8E8E] ml-1">{formatTime(notif.createdAt)}</span>
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
