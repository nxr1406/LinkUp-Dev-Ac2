import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';

const FALLBACK_VERSION = "2.1"; // Fallback if not running in Capacitor

interface UpdateData {
  version: string;
  url: string;
  features: string[];
}

export function UpdateDialog() {
  const [updateData, setUpdateData] = useState<UpdateData | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        // Get current app version from AndroidManifest.xml / build.gradle via Capacitor
        let currentVersion = FALLBACK_VERSION;
        try {
          const info = await App.getInfo();
          currentVersion = info.version;
        } catch (e) {
          console.log("Not running in Capacitor environment, using fallback version:", currentVersion);
        }

        const targetUrl = 'https://pastebin.com/raw/JaX8gX0K';
        
        // Try multiple CORS proxies to ensure reliability
        const proxies = [
          `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
          `https://api.codetabs.com/v1/proxy?quest=${targetUrl}`,
          `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
        ];

        let data: UpdateData | null = null;
        
        for (const url of proxies) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              data = await response.json();
              break; // Success, exit the loop
            }
          } catch (e) {
            console.warn(`Proxy ${url} failed, trying next...`);
          }
        }

        if (!data) {
          throw new Error("All CORS proxies failed to fetch update data.");
        }
        
        // ভার্সন চেক (যদি API এর ভার্সন বর্তমান ভার্সনের চেয়ে বড় হয়)
        if (parseFloat(data.version) > parseFloat(currentVersion)) {
          setUpdateData(data);
          setIsOpen(true);
        }
      } catch (error) {
        console.error("Failed to check for updates:", error);
      }
    };

    checkUpdate();
  }, []);

  if (!isOpen || !updateData) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      {/* Main Dialog Container */}
      <div 
        className="relative w-full max-w-[360px] rounded-[32px] overflow-hidden shadow-2xl border border-white/10 bg-[#0a0014]"
        style={{
          backgroundImage: `url('/nxr-bg.png')`, // ব্যাকগ্রাউন্ড ইমেজ
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Dark overlay to make text readable over the background */}
        <div className="absolute inset-0 bg-black/40"></div>
        
        <div className="relative z-10 p-6 flex flex-col gap-5">
          
          {/* Header Section */}
          <div className="flex items-center gap-4 bg-black/50 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-black shrink-0 flex items-center justify-center">
              <img 
                src="/nxr-logo.png" 
                alt="NXR Logo" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback if image not found
                  (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=NXR&background=000&color=E000FF';
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[#E000FF] font-bold text-[15px] tracking-wide">UPDATE AVAILABLE</h2>
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse"></div>
              </div>
              <p className="text-white/90 text-[13px] mt-0.5">New Version {updateData.version}</p>
            </div>
          </div>

          {/* Features List Section */}
          <div className="bg-black/50 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
            <ul className="space-y-2.5">
              {updateData.features?.map((feature, index) => (
                <li key={index} className="text-white text-[14px] font-semibold flex items-center gap-2">
                  <span className="w-1 h-1 bg-white rounded-full shrink-0"></span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Message Section */}
          <div className="bg-black/50 border border-white/10 rounded-2xl p-4 text-center backdrop-blur-md">
            <p className="text-white/80 text-[12px] leading-relaxed">
              A mandatory new version is available with enhanced security, improved performance, and important fixes.
            </p>
          </div>

          {/* Update Button */}
          <button 
            onClick={() => window.open(updateData.url, '_blank')}
            className="w-full bg-[#E000FF] hover:bg-[#d000ed] text-black font-bold text-[15px] py-4 rounded-2xl transition-all active:scale-[0.98] mt-2"
          >
            UPDATE
          </button>
        </div>
      </div>
    </div>
  );
}
