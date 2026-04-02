import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAEmIcqR7DR0LD8YFLB1D6gkVa-c7YHSqo',
  authDomain: 'vyapify.firebaseapp.com',
  projectId: 'vyapify',
  storageBucket: 'vyapify.firebasestorage.app',
  messagingSenderId: '174405323369',
  appId: '1:174405323369:web:9f8e4e89f8e4e89f8e4e8',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
