import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center px-4 h-14 border-b border-[#DBDBDB] shrink-0">
        <button onClick={() => navigate(-1)} className="mr-4">
          <ChevronLeft size={28} className="text-[#262626]" strokeWidth={1.5} />
        </button>
        <h1 className="text-[16px] font-semibold text-[#262626]">Privacy Policy</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="text-[20px] font-bold text-[#262626] mb-4">Privacy Policy</h2>
        
        <div className="space-y-4 text-[14px] text-[#262626]">
          <p>
            <strong>1. Information Collection</strong><br/>
            We collect information you provide directly to us, such as when you create or modify your account, use our services, or communicate with us.
          </p>
          
          <p>
            <strong>2. Use of Information</strong><br/>
            We may use the information we collect to provide, maintain, and improve our services, as well as to develop new ones.
          </p>
          
          <p>
            <strong>3. Sharing of Information</strong><br/>
            We do not share your personal information with third parties without your consent, except in the limited circumstances described in this policy.
          </p>
          
          <p>
            <strong>4. Data Security</strong><br/>
            We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access, disclosure, alteration and destruction.
          </p>
          
          <p>
            <strong>5. Changes to this Policy</strong><br/>
            We may change this Privacy Policy from time to time. If we make changes, we will notify you by revising the date at the top of the policy.
          </p>
        </div>
      </div>
    </div>
  );
}
