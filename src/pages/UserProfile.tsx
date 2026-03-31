import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { ChevronLeft, MoreHorizontal, UserPlus, UserCheck, Ban, BadgeCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { toast } from 'sonner';

import { AppleEmojiText } from '../components/AppleEmojiText';

export default function UserProfile() {
  const { userId } = useParams();
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const [profileUser, setProfileUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const isBlocked = userData?.blockedUsers?.includes(userId);

  useEffect(() => {
    if (!userId) return;

    const fetchUser = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfileUser({ id: userDoc.id, ...data });
          
          if (currentUser) {
            const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (currentUserDoc.exists()) {
              const currentData = currentUserDoc.data();
              setIsFollowing(currentData.following?.includes(userId) || false);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user:', error);
        handleFirestoreError(error, OperationType.GET, `users/${userId}`);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId, currentUser]);

  const handleFollowToggle = async () => {
    if (!currentUser || !profileUser) return;

    const currentUserRef = doc(db, 'users', currentUser.uid);
    const profileUserRef = doc(db, 'users', profileUser.id);

    try {
      if (isFollowing) {
        // Unfollow
        await updateDoc(currentUserRef, {
          following: arrayRemove(profileUser.id)
        });
        await updateDoc(profileUserRef, {
          followers: arrayRemove(currentUser.uid)
        });
        setIsFollowing(false);
        setProfileUser((prev: any) => ({
          ...prev,
          followers: (prev.followers || []).filter((id: string) => id !== currentUser.uid)
        }));
      } else {
        // Follow
        await updateDoc(currentUserRef, {
          following: arrayUnion(profileUser.id)
        });
        await updateDoc(profileUserRef, {
          followers: arrayUnion(currentUser.uid)
        });
        setIsFollowing(true);
        setProfileUser((prev: any) => ({
          ...prev,
          followers: [...(prev.followers || []), currentUser.uid]
        }));

        // Send notification
        if (profileUser.notificationsEnabled !== false) {
          await addDoc(collection(db, 'notifications'), {
            userId: profileUser.id,
            type: 'follow',
            fromUserId: currentUser.uid,
            createdAt: serverTimestamp(),
            read: false
          });
        }
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast.error('Failed to update follow status. Please check your permissions.');
      handleFirestoreError(error, OperationType.UPDATE, `users/${profileUser.id}`);
    }
  };

  const handleMessage = async () => {
    if (!currentUser || !profileUser) return;

    try {
      // Check if chat exists
      const chatsRef = collection(db, 'chats');
      const q = query(chatsRef, where('participants', 'array-contains', currentUser.uid));
      const querySnapshot = await getDocs(q);
      
      let existingChatId = null;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.participants.includes(profileUser.id)) {
          existingChatId = doc.id;
        }
      });

      if (existingChatId) {
        navigate(`/chat/${existingChatId}`);
      } else {
        // Create new chat
        const newChatRef = await addDoc(collection(db, 'chats'), {
          participants: [currentUser.uid, profileUser.id],
          createdAt: serverTimestamp(),
          lastMessage: '',
          lastMessageTime: serverTimestamp(),
          unreadCount: {
            [currentUser.uid]: 0,
            [profileUser.id]: 0
          }
        });
        navigate(`/chat/${newChatRef.id}`);
      }
    } catch (error) {
      console.error('Error creating chat:', error);
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    }
  };

  const handleBlockToggle = async () => {
    if (!currentUser || !userId) return;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      if (isBlocked) {
        await updateDoc(userRef, {
          blockedUsers: arrayRemove(userId)
        });
        toast.success('User unblocked');
      } else {
        await updateDoc(userRef, {
          blockedUsers: arrayUnion(userId)
        });
        toast.success('User blocked');
        // Optionally unfollow
        if (isFollowing) {
          handleFollowToggle();
        }
      }
      setShowMenu(false);
    } catch (error) {
      console.error('Error toggling block:', error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#DBDBDB] border-t-[#262626] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center px-4 h-14 border-b border-[#DBDBDB] shrink-0">
          <button onClick={() => navigate(-1)} className="mr-4">
            <ChevronLeft size={28} className="text-[#262626]" strokeWidth={1.5} />
          </button>
          <h1 className="text-[16px] font-semibold text-[#262626]">User not found</h1>
        </div>
      </div>
    );
  }

  const followersCount = profileUser.followers?.length || 0;
  const followingCount = profileUser.following?.length || 0;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 h-14 border-b border-[#DBDBDB] shrink-0">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="mr-4">
            <ChevronLeft size={28} className="text-[#262626]" strokeWidth={1.5} />
          </button>
          <h1 className="text-[16px] font-semibold text-[#262626] flex items-center">
            {profileUser.username}
            {profileUser.isVerified && (
              <BadgeCheck size={16} className="text-[#0095F6] ml-1 shrink-0" fill="#0095F6" color="white" />
            )}
          </h1>
        </div>
        <button onClick={() => setShowMenu(true)}>
          <MoreHorizontal size={24} className="text-[#262626]" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 pb-8">
          <div className="flex flex-col items-center mt-6">
            <div className="w-28 h-28 rounded-full bg-[#DBDBDB] overflow-hidden shrink-0 border-4 border-white shadow-sm">
              {profileUser.avatarUrl ? (
                <img src={profileUser.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-[40px] font-semibold">
                  {profileUser.fullName?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
            
            <h2 className="text-[22px] font-bold text-[#262626] mt-4 flex items-center">
              <AppleEmojiText text={profileUser.fullName || ''} />
              {profileUser.isVerified && (
                <BadgeCheck size={20} className="text-[#0095F6] ml-1" fill="#0095F6" color="white" />
              )}
            </h2>
            <p className="text-[15px] text-[#8E8E8E]">@{profileUser.username}</p>
            
            {profileUser.bio && (
              <p className="text-[15px] text-[#262626] text-center mt-3 px-8 whitespace-pre-wrap leading-relaxed">
                <AppleEmojiText text={profileUser.bio} />
              </p>
            )}
            
            <div className="flex items-center justify-center space-x-8 mt-6 w-full max-w-xs">
              <div className="flex flex-col items-center">
                <span className="text-[20px] font-bold text-[#262626]">{followersCount}</span>
                <span className="text-[12px] text-[#8E8E8E] font-semibold uppercase tracking-wider mt-1">Followers</span>
              </div>
              <div className="w-[1px] h-8 bg-[#DBDBDB]"></div>
              <div className="flex flex-col items-center">
                <span className="text-[20px] font-bold text-[#262626]">{followingCount}</span>
                <span className="text-[12px] text-[#8E8E8E] font-semibold uppercase tracking-wider mt-1">Following</span>
              </div>
            </div>

            {currentUser?.uid !== profileUser.id && (
              <div className="flex space-x-3 mt-8 w-full px-2">
                <button 
                  onClick={handleFollowToggle}
                  className={clsx(
                    "flex-1 py-2.5 rounded-xl text-[15px] font-semibold shadow-sm active:scale-95 transition-transform flex items-center justify-center space-x-1",
                    isFollowing 
                      ? "bg-[#EFEFEF] text-[#262626]" 
                      : "bg-[#262626] text-white"
                  )}
                >
                  {isFollowing ? (
                    <>
                      <span>Following</span>
                      <ChevronLeft size={16} className="rotate-[-90deg]" />
                    </>
                  ) : (
                    <span>Follow</span>
                  )}
                </button>
                <button 
                  onClick={handleMessage}
                  className="flex-1 py-2.5 rounded-xl bg-[#EFEFEF] text-[15px] font-semibold text-[#262626] active:scale-95 transition-transform"
                >
                  Message
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings Bottom Sheet */}
      {showMenu && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMenu(false)}></div>
          <div className="bg-white w-full rounded-t-2xl relative z-10 animate-in slide-in-from-bottom-full duration-200">
            <div className="w-10 h-1 bg-[#DBDBDB] rounded-full mx-auto mt-3 mb-2"></div>
            <div className="flex flex-col pb-safe">
              <button 
                onClick={handleBlockToggle}
                className="flex items-center px-4 py-4 active:bg-gray-50"
              >
                <Ban size={24} className="text-[#ED4956] mr-3" strokeWidth={1.5} />
                <span className="text-[15px] text-[#ED4956]">{isBlocked ? 'Unblock' : 'Block'}</span>
              </button>
              {userData?.role === 'admin' && (
                <button 
                  onClick={async () => {
                    if (!currentUser || !userId || userData?.role !== 'admin') return;
                    try {
                      const userRef = doc(db, 'users', userId);
                      const newStatus = !profileUser.isSuspended;
                      await updateDoc(userRef, { isSuspended: newStatus });
                      setProfileUser((prev: any) => ({ ...prev, isSuspended: newStatus }));
                      toast.success(newStatus ? 'User suspended successfully' : 'User unsuspended successfully');
                      setShowMenu(false);
                    } catch (error) {
                      console.error('Error suspending user:', error);
                      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
                    }
                  }}
                  className="flex items-center px-4 py-4 active:bg-gray-50"
                >
                  <Ban size={24} className="text-[#ED4956] mr-3" strokeWidth={1.5} />
                  <span className="text-[15px] text-[#ED4956]">{profileUser.isSuspended ? 'Unsuspend User' : 'Suspend User'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
