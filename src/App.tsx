/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { auth, db } from './firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Search from './pages/Search';
import Profile from './pages/Profile';
import UserProfile from './pages/UserProfile';
import Notifications from './pages/Notifications';
import Privacy from './pages/Privacy';
import BlockedUsers from './pages/BlockedUsers';
import Chat from './pages/Chat';
import AdminVerification from './pages/AdminVerification';
import AdminAppeals from './pages/AdminAppeals';
import { UpdateDialog } from './components/UpdateDialog';

function SuspendedScreen({ userData }: { userData: any }) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAppeal = async () => {
    if (!message.trim() || message.length > 300) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'appeals'), {
        userId: auth.currentUser?.uid,
        username: userData.username,
        fullName: userData.fullName,
        avatarUrl: userData.avatarUrl,
        message: message.trim(),
        status: 'pending',
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
        appealStatus: 'pending'
      });
      toast.success('Appeal submitted successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to submit appeal');
    } finally {
      setSubmitting(false);
    }
  };

  const status = userData.appealStatus || 'none';

  return (
    <div className="h-screen bg-white flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 shrink-0">
        <span className="text-red-500 text-2xl">⚠️</span>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Account Suspended</h1>
      <p className="text-gray-500 mb-6">Your account has been suspended by an administrator.</p>

      {status === 'none' && (
        <div className="w-full max-w-md mb-6 text-left">
          <label className="block text-sm font-medium text-gray-700 mb-2">Submit an Appeal (Max 300 characters)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 300))}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-32"
            placeholder="Explain why your account should be unsuspended..."
          />
          <div className="text-right text-xs text-gray-500 mt-1">{message.length}/300</div>
          <button
            onClick={handleAppeal}
            disabled={submitting || !message.trim()}
            className="w-full mt-3 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Appeal'}
          </button>
        </div>
      )}

      {status === 'pending' && (
        <div className="w-full max-w-md mb-6 p-4 bg-yellow-50 text-yellow-800 rounded-lg border border-yellow-200">
          Your appeal is currently under review by our team.
        </div>
      )}

      {status === 'rejected' && (
        <div className="w-full max-w-md mb-6 p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">
          Your appeal was reviewed and rejected. This decision is final.
        </div>
      )}

      <button 
        onClick={() => auth.signOut()}
        className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium"
      >
        Log Out
      </button>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, userData, loading } = useAuth();
  if (loading) return <div className="h-screen bg-white flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#DBDBDB] border-t-[#8E8E8E] rounded-full animate-spin"></div></div>;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (userData?.isSuspended) {
    return <SuspendedScreen userData={userData} />;
  }
  return <>{children}</>;
}

const pageVariants = {
  initial: { opacity: 0, x: 20 },
  in: { opacity: 1, x: 0 },
  out: { opacity: 0, x: -20 }
};

const pageTransition = {
  type: 'tween',
  ease: 'anticipate',
  duration: 0.3
};

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
      className="h-full w-full absolute top-0 left-0 bg-white"
    >
      {children}
    </motion.div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <div className="relative h-screen w-full overflow-hidden bg-white">
      <AnimatePresence mode="popLayout" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/login" element={<AnimatedPage><Login /></AnimatedPage>} />
          <Route path="/register" element={<AnimatedPage><Register /></AnimatedPage>} />
          
          <Route path="/app" element={<ProtectedRoute><AnimatedPage><Layout /></AnimatedPage></ProtectedRoute>}>
            <Route index element={<Home />} />
            <Route path="search" element={<Search />} />
            <Route path="profile" element={<Profile />} />
            <Route path="user/:userId" element={<UserProfile />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="blocked" element={<BlockedUsers />} />
            <Route path="admin/verification" element={<AdminVerification />} />
            <Route path="admin/appeals" element={<AdminAppeals />} />
          </Route>
          
          <Route path="/chat/:chatId" element={<ProtectedRoute><AnimatedPage><Chat /></AnimatedPage></ProtectedRoute>} />
        </Routes>
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <AnimatedRoutes />
        </Router>
        <Toaster position="top-center" />
        <UpdateDialog />
      </AuthProvider>
    </ErrorBoundary>
  );
}
