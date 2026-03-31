import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ChevronLeft, Check, X, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export default function AdminVerification() {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only allow admin to view this page
    if (userData?.role !== 'admin') {
      navigate('/app');
      return;
    }

    const fetchRequests = async () => {
      try {
        const q = query(
          collection(db, 'verificationRequests'),
          where('status', '==', 'pending')
        );
        const snapshot = await getDocs(q);
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRequests(reqs);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'verificationRequests');
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, [userData, navigate]);

  const handleApprove = async (requestId: string, userId: string) => {
    try {
      // Update request status
      await updateDoc(doc(db, 'verificationRequests', requestId), {
        status: 'approved'
      });

      // Update user profile
      await updateDoc(doc(db, 'users', userId), {
        isVerified: true,
        verificationStatus: 'approved'
      });

      setRequests(prev => prev.filter(r => r.id !== requestId));
      toast.success('Verification approved');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `verificationRequests/${requestId}`);
      toast.error('Failed to approve verification');
    }
  };

  const handleReject = async (requestId: string, userId: string) => {
    try {
      // Update request status
      await updateDoc(doc(db, 'verificationRequests', requestId), {
        status: 'rejected'
      });

      // Update user profile
      await updateDoc(doc(db, 'users', userId), {
        isVerified: false,
        verificationStatus: 'rejected'
      });

      setRequests(prev => prev.filter(r => r.id !== requestId));
      toast.success('Verification rejected');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `verificationRequests/${requestId}`);
      toast.error('Failed to reject verification');
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
        <h1 className="text-[16px] font-semibold text-[#262626]">Verification Requests</h1>
        <div className="w-8"></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <ShieldAlert size={64} className="text-[#DBDBDB] mb-4" />
            <h3 className="text-[20px] font-bold text-[#262626] mb-2">No Pending Requests</h3>
            <p className="text-[15px] text-[#8E8E8E]">There are currently no verification requests to review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map(request => (
              <div key={request.id} className="border border-[#DBDBDB] rounded-xl p-4">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 rounded-full bg-[#DBDBDB] overflow-hidden shrink-0 mr-3">
                    {request.avatarUrl ? (
                      <img src={request.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white text-[18px] font-semibold">
                        {request.fullName?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-[16px] font-semibold text-[#262626]">{request.fullName}</h3>
                    <p className="text-[14px] text-[#8E8E8E]">@{request.username}</p>
                  </div>
                </div>
                
                <div className="space-y-2 mb-4">
                  <p className="text-[14px]"><span className="font-semibold text-[#262626]">Category:</span> {request.category}</p>
                  <p className="text-[14px]"><span className="font-semibold text-[#262626]">Submitted:</span> {new Date(request.timestamp?.toDate()).toLocaleDateString()}</p>
                  <div>
                    <span className="font-semibold text-[#262626] text-[14px]">Document:</span>
                    <a 
                      href={request.documentUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="block mt-2 py-3 px-4 bg-[#F8F8F8] border border-[#DBDBDB] rounded-lg text-[14px] text-[#0095F6] font-semibold text-center hover:bg-gray-100 transition-colors"
                    >
                      View Google Drive Document
                    </a>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button 
                    onClick={() => handleReject(request.id, request.userId)}
                    className="flex-1 py-2 rounded-lg border border-[#DBDBDB] text-[14px] font-semibold text-[#262626] flex items-center justify-center"
                  >
                    <X size={18} className="mr-1" /> Reject
                  </button>
                  <button 
                    onClick={() => handleApprove(request.id, request.userId)}
                    className="flex-1 py-2 rounded-lg bg-[#0095F6] text-[14px] font-semibold text-white flex items-center justify-center"
                  >
                    <Check size={18} className="mr-1" /> Approve
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
