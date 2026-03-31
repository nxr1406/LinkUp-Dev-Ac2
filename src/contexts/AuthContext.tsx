import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection, query, where, getDocs, writeBatch, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface AuthContextType {
  currentUser: User | null;
  userData: any | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ currentUser: null, userData: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let userDataUnsubscribe: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const docRef = doc(db, 'users', user.uid);
          
          userDataUnsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
              setUserData(docSnap.data());
            }
          }, (error) => {
            console.error("Error fetching user data:", error);
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          });

          setDoc(docRef, {
            isOnline: true,
            lastSeen: serverTimestamp()
          }, { merge: true }).catch(error => {
            console.error("Error updating user status:", error);
          });
        } catch (error) {
          console.error("Error setting up user listener:", error);
        }
        
        setLoading(false);
      } else {
        if (userDataUnsubscribe) {
          userDataUnsubscribe();
        }
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (userDataUnsubscribe) {
        userDataUnsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (currentUser && document.visibilityState === 'hidden') {
        await setDoc(doc(db, 'users', currentUser.uid), {
          isOnline: false,
          lastSeen: serverTimestamp()
        }, { merge: true });
      } else if (currentUser && document.visibilityState === 'visible') {
        await setDoc(doc(db, 'users', currentUser.uid), {
          isOnline: true,
          lastSeen: serverTimestamp()
        }, { merge: true });
      }
    };

    const handleBeforeUnload = () => {
      if (currentUser) {
        setDoc(doc(db, 'users', currentUser.uid), {
          isOnline: false,
          lastSeen: serverTimestamp()
        }, { merge: true }).catch(console.error);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUser]);

  return (
    <AuthContext.Provider value={{ currentUser, userData, loading }}>
      {loading ? (
        <div className="h-screen w-screen bg-white flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#DBDBDB] border-t-[#8E8E8E] rounded-full animate-spin"></div>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
