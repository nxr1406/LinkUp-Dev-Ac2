import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { ChevronLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export default function AdminAppeals() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [appeals, setAppeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userData?.role !== 'admin') {
      navigate('/app');
      return;
    }

    const fetchAppeals = async () => {
      try {
        const q = query(
          collection(db, 'appeals'),
          where('status', '==', 'pending')
        );
        const snapshot = await getDocs(q);
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAppeals(reqs);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'appeals');
      } finally {
        setLoading(false);
      }
    };

    fetchAppeals();
  }, [userData, navigate]);

  const handleApprove = async (appealId: string, userId: string) => {
    try {
      await updateDoc(doc(db, 'appeals', appealId), { status: 'approved' });
      await updateDoc(doc(db, 'users', userId), {
        isSuspended: false,
        appealStatus: 'approved'
      });
      setAppeals(prev => prev.filter(r => r.id !== appealId));
      toast.success('Appeal approved, user unsuspended');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `appeals/${appealId}`);
      toast.error('Failed to approve appeal');
    }
  };

  const handleReject = async (appealId: string, userId: string) => {
    try {
      await updateDoc(doc(db, 'appeals', appealId), { status: 'rejected' });
      await updateDoc(doc(db, 'users', userId), { appealStatus: 'rejected' });
      setAppeals(prev => prev.filter(r => r.id !== appealId));
      toast.success('Appeal rejected');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `appeals/${appealId}`);
      toast.error('Failed to reject appeal');
    }
  };

  if (loading) {
    return <div className="h-screen bg-white flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#DBDBDB] border-t-[#8E8E8E] rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 h-14 border-b border-[#DBDBDB] shrink-0">
        <button onClick={() => navigate('/app/profile')} className="p-2 -ml-2">
          <ChevronLeft size={28} className="text-[#262626]" strokeWidth={1.5} />
        </button>
        <h1 className="text-[16px] font-semibold text-[#262626]">Suspension Appeals</h1>
        <div className="w-8"></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {appeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-[#FAFAFA] rounded-full flex items-center justify-center mb-4">
              <Check size={32} className="text-[#8E8E8E]" />
            </div>
            <h2 className="text-[18px] font-semibold text-[#262626] mb-2">No Pending Appeals</h2>
            <p className="text-[14px] text-[#8E8E8E]">You're all caught up!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {appeals.map(appeal => (
              <div key={appeal.id} className="bg-white border border-[#DBDBDB] rounded-xl p-4 shadow-sm">
                <div className="flex items-center mb-3">
                  <div className="w-10 h-10 rounded-full bg-[#DBDBDB] overflow-hidden shrink-0">
                    {appeal.avatarUrl ? (
                      <img src={appeal.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                        {appeal.fullName?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="ml-3">
                    <p className="text-[14px] font-semibold text-[#262626]">{appeal.fullName}</p>
                    <p className="text-[12px] text-[#8E8E8E]">@{appeal.username}</p>
                  </div>
                </div>
                
                <div className="bg-[#FAFAFA] p-3 rounded-lg mb-4">
                  <p className="text-[14px] text-[#262626] whitespace-pre-wrap">{appeal.message}</p>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => handleReject(appeal.id, appeal.userId)}
                    className="flex-1 py-2 bg-white border border-[#DBDBDB] text-[#ED4956] font-semibold rounded-lg text-[14px] active:bg-gray-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(appeal.id, appeal.userId)}
                    className="flex-1 py-2 bg-[#0095F6] text-white font-semibold rounded-lg text-[14px] active:bg-blue-600"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
