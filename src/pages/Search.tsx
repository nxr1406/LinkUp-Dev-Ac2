import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Search as SearchIcon, X, UserSearch, BadgeCheck } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

import { AppleEmojiText } from '../components/AppleEmojiText';

export default function Search() {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        handleSearch(searchQuery);
      } else {
        setResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearch = async (text: string) => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const lowerText = text.toLowerCase();
      const titleText = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

      const usernameQuery = query(
        collection(db, 'users'),
        where('username', '>=', lowerText),
        where('username', '<=', lowerText + '\uf8ff')
      );

      const fullNameQueryLower = query(
        collection(db, 'users'),
        where('fullName', '>=', lowerText),
        where('fullName', '<=', lowerText + '\uf8ff')
      );

      const fullNameQueryTitle = query(
        collection(db, 'users'),
        where('fullName', '>=', titleText),
        where('fullName', '<=', titleText + '\uf8ff')
      );

      const [usernameSnap, fullNameLowerSnap, fullNameTitleSnap] = await Promise.all([
        getDocs(usernameQuery),
        getDocs(fullNameQueryLower),
        getDocs(fullNameQueryTitle)
      ]);

      const usersMap = new Map();

      const processSnapshot = (snapshot: any) => {
        snapshot.docs.forEach((doc: any) => {
          if (doc.id !== currentUser.uid && !userData?.blockedUsers?.includes(doc.id)) {
            usersMap.set(doc.id, { id: doc.id, ...doc.data() });
          }
        });
      };

      processSnapshot(usernameSnap);
      processSnapshot(fullNameLowerSnap);
      processSnapshot(fullNameTitleSnap);

      setResults(Array.from(usersMap.values()));
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.GET, 'users');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 h-14 border-b border-[#DBDBDB] shrink-0">
        <div className="w-8"></div>
        <h1 className="text-[16px] font-semibold text-[#262626]">Search</h1>
        <button onClick={() => navigate('/app')} className="text-[#0095F6] text-[14px] font-semibold w-8 text-right">
          Cancel
        </button>
      </div>

      <div className="p-4 shrink-0">
        <div className="relative flex items-center bg-[#EFEFEF] rounded-xl h-9 px-3">
          <SearchIcon size={16} className="text-[#8E8E8E] mr-2" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-[14px] text-[#262626] placeholder-[#8E8E8E]"
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="ml-2">
              <X size={16} className="text-[#8E8E8E]" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center p-4">
            <div className="w-6 h-6 border-2 border-[#DBDBDB] border-t-[#8E8E8E] rounded-full animate-spin"></div>
          </div>
        ) : searchQuery.length > 0 && results.length === 0 ? (
          <div className="flex justify-center p-4">
            <p className="text-[#8E8E8E] text-[14px]">No results for '{searchQuery}'</p>
          </div>
        ) : searchQuery.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#8E8E8E]">
            <UserSearch size={64} strokeWidth={1} className="mb-4 text-[#DBDBDB]" />
            <p className="text-[14px]">Search for people</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {results.map(user => (
              <div 
                key={user.id} 
                onClick={() => navigate(`/app/user/${user.id}`)}
                className="flex items-center px-4 py-2 active:bg-gray-50 cursor-pointer"
              >
                <div className="w-11 h-11 rounded-full bg-[#DBDBDB] overflow-hidden shrink-0">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-[18px] font-semibold">
                      {user.fullName?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-[14px] font-semibold text-[#262626] flex items-center">
                    <AppleEmojiText text={user.fullName || ''} />
                    {user.isVerified && (
                      <BadgeCheck size={14} className="text-[#0095F6] ml-1 shrink-0" fill="#0095F6" color="white" />
                    )}
                  </p>
                  <p className="text-[13px] text-[#8E8E8E] flex items-center">
                    {user.username}
                    {user.isVerified && (
                      <BadgeCheck size={12} className="text-[#0095F6] ml-1 shrink-0" fill="#0095F6" color="white" />
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
