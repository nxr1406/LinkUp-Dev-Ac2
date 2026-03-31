import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) return;
    
    setLoading(true);
    try {
      let email = identifier;
      if (!identifier.includes('@')) {
        const q = query(collection(db, 'users'), where('username', '==', identifier.toLowerCase()));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          email = snapshot.docs[0].data().email;
        } else {
          throw new Error('User not found');
        }
      }
      
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/app');
    } catch (error: any) {
      console.error("Login error:", error);
      const errorCode = error.code || '';
      const errorMessage = error.message || '';

      if (errorCode === 'auth/user-not-found' || errorMessage === 'User not found' || errorMessage.includes('auth/user-not-found')) {
        toast.error('No account found with this email/username.');
      } else if (errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential' || errorMessage.includes('auth/invalid-credential') || errorMessage.includes('auth/wrong-password')) {
        toast.error('Incorrect password or email. Please try again.');
      } else if (errorCode === 'permission-denied' || errorMessage.includes('permission')) {
        toast.error('Permission error. Please use your email to log in for now.');
      } else {
        toast.error('Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!identifier) {
      toast.error('Please enter your email or username first');
      return;
    }
    try {
      let email = identifier;
      if (!identifier.includes('@')) {
        const q = query(collection(db, 'users'), where('username', '==', identifier.toLowerCase()));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          email = snapshot.docs[0].data().email;
        } else {
          throw new Error('User not found');
        }
      }
      await sendPasswordResetEmail(auth, email);
      toast.success('We sent a link to your email', {
        style: { background: '#fff', border: '1px solid #DBDBDB', borderRadius: '12px' }
      });
    } catch (error: any) {
      const errorCode = error.code || '';
      const errorMessage = error.message || '';
      if (errorCode === 'auth/user-not-found' || errorMessage === 'User not found' || errorMessage.includes('auth/user-not-found')) {
        toast.error('No account found with this email/username.');
      } else if (errorCode === 'auth/invalid-email' || errorMessage.includes('auth/invalid-email')) {
        toast.error('Invalid email address.');
      } else {
        toast.error('Failed to send reset email. Please try again.');
      }
    }
  };

  const isValid = identifier.length > 0 && password.length >= 6;

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-[350px]">
        <div className="bg-white py-8 px-10 sm:border sm:border-[#DBDBDB] rounded-[1px] mb-3 flex flex-col items-center">
          
          <div className="w-16 h-16 mb-8">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <defs>
                <linearGradient id="gradLogin" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FCAF45" />
                  <stop offset="25%" stopColor="#F77737" />
                  <stop offset="50%" stopColor="#F56040" />
                  <stop offset="75%" stopColor="#C13584" />
                  <stop offset="100%" stopColor="#833AB4" />
                </linearGradient>
              </defs>
              <path d="M50 10C27.9 10 10 27.9 10 50c0 10.6 4.1 20.2 10.8 27.4l-3.6 10.8c-.4 1.2.8 2.4 2 2l10.8-3.6C37.2 83.3 43.4 85 50 85c22.1 0 40-17.9 40-40S72.1 10 50 10z" fill="url(#gradLogin)" />
            </svg>
          </div>

          <form onSubmit={handleLogin} className="w-full space-y-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Email or Username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full h-[38px] bg-[#FAFAFA] border border-[#DBDBDB] rounded-[3px] px-2 text-[12px] focus:outline-none focus:border-[#A8A8A8]"
              />
            </div>
            
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[38px] bg-[#FAFAFA] border border-[#DBDBDB] rounded-[3px] px-2 text-[12px] focus:outline-none focus:border-[#A8A8A8] pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8E8E8E]"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button type="button" onClick={handleResetPassword} className="text-[12px] font-semibold text-[#00376B]">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={!isValid || loading}
              className="w-full h-[32px] mt-4 bg-[#0095F6] text-white font-semibold rounded-[8px] text-[14px] disabled:opacity-70 transition-opacity"
            >
              {loading ? 'Logging in...' : 'Log in'}
            </button>
          </form>

          <div className="flex items-center w-full my-6">
            <div className="flex-1 h-[1px] bg-[#DBDBDB]"></div>
            <span className="px-4 text-[13px] font-semibold text-[#737373]">OR</span>
            <div className="flex-1 h-[1px] bg-[#DBDBDB]"></div>
          </div>
        </div>

        <div className="bg-white py-5 px-10 sm:border sm:border-[#DBDBDB] rounded-[1px] text-center">
          <p className="text-[14px] text-[#262626]">
            Don't have an account? <Link to="/register" className="font-semibold text-[#0095F6]">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
