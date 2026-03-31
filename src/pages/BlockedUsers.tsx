import { useState, useEffect } from 'react';
import { ChevronLeft, BadgeCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { toast } from 'sonner';

export default function BlockedUsers() {
  const navigate = useNavigate();
  const { currentUser, userData } = useAuth();
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBlockedUsers = async () => {
      if (!userData?.blockedUsers || userData.blockedUsers.length === 0) {
        setBlockedUsers([]);
        setLoading(false);
        return;
      }

      try {
        const usersData = await Promise.all(
          userData.blockedUsers.map(async (userId: string) => {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              return { id: userDoc.id, ...userDoc.data() };
            }
            return null;
          })
        );
        setBlockedUsers(usersData.filter(Boolean));
      } catch (error) {
        console.error('Error fetching blocked users:', error);
        handleFirestoreError(error, OperationType.GET, 'users');
      } finally {
        setLoading(false);
      }
    };

    fetchBlockedUsers();
  }, [userData?.blockedUsers]);

  const handleUnblock = async (userId: string) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        blockedUsers: arrayRemove(userId)
      });
      toast.success('User unblocked');
    } catch (error) {
      console.error('Error unblocking user:', error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center px-4 h-14 border-b border-[#DBDBDB] shrink-0">
        <button onClick={() => navigate(-1)} className="mr-4">
          <ChevronLeft size={28} className="text-[#262626]" strokeWidth={1.5} />
        </button>
        <h1 className="text-[16px] font-semibold text-[#262626]">Blocked accounts</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex justify-center mt-10">
            <div className="w-6 h-6 border-2 border-[#DBDBDB] border-t-[#8E8E8E] rounded-full animate-spin"></div>
          </div>
        ) : blockedUsers.length === 0 ? (
          <div className="text-center mt-10 text-[#8E8E8E] text-[14px]">
            You haven't blocked anyone.
          </div>
        ) : (
          <div className="space-y-4">
            {blockedUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between">
                <div 
                  className="flex items-center cursor-pointer"
                  onClick={() => navigate(`/app/user/${user.id}`)}
                >
                  <div className="w-12 h-12 rounded-full bg-[#DBDBDB] overflow-hidden mr-3">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white text-[20px] font-semibold">
                        {user.fullName?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#262626] flex items-center">
                      {user.username}
                      {user.isVerified && (
                        <BadgeCheck size={14} className="text-[#0095F6] ml-1 shrink-0" fill="#0095F6" color="white" />
                      )}
                    </p>
                    <p className="text-[14px] text-[#8E8E8E] flex items-center">
                      {user.fullName}
                      {user.isVerified && (
                        <BadgeCheck size={12} className="text-[#0095F6] ml-1 shrink-0" fill="#0095F6" color="white" />
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleUnblock(user.id)}
                  className="px-4 h-8 rounded-lg bg-[#EFEFEF] text-[14px] font-semibold text-[#262626]"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
