import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBuhDDOQA2vJOfwL2KBTH3d_xbp3AlbjPg",
  authDomain: "linkup-c22fa.firebaseapp.com",
  projectId: "linkup-c22fa",
  storageBucket: "linkup-c22fa.firebasestorage.app",
  messagingSenderId: "1030175932136",
  appId: "1:1030175932136:web:8f105f9279379ccb5a535d",
  measurementId: "G-4XE0CXFGXD"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
