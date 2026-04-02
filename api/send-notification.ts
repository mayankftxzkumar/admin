import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin SDK once
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({
    credential: cert(serviceAccount),
    projectId: 'vyapify',
  });
}

const db = getFirestore();
const messaging = getMessaging();

export default async function handler(req: any, res: any) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify the request comes from an authenticated admin
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);

    // Only allow the admin UID
    if (decodedToken.uid !== 'pS6IxoLoCgM97tED7Q6mavFFfWG2') {
      return res.status(403).json({ error: 'Forbidden — not an admin' });
    }

    const { title, body, target } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    let successCount = 0;
    let failureCount = 0;

    if (!target || target === 'ALL_USERS') {
      // ── Broadcast to all users via topic ──
      const topicMessage = {
        notification: { title, body },
        topic: 'all_users',
      };

      const topicResponse = await messaging.send(topicMessage);
      successCount = 1;
      console.log('[FCM] Topic message sent:', topicResponse);

    } else {
      // ── Send to a specific user via their FCM token ──
      const userDoc = await db.collection('users').doc(target).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User not found' });
      }

      const fcmToken = userDoc.data()?.fcmToken;
      if (!fcmToken) {
        return res.status(400).json({ error: 'User has no FCM token. They may not have the latest app version.' });
      }

      const directMessage = {
        notification: { title, body },
        token: fcmToken,
      };

      try {
        const response = await messaging.send(directMessage);
        successCount = 1;
        console.log('[FCM] Direct message sent:', response);
      } catch (sendErr: any) {
        failureCount = 1;
        console.error('[FCM] Send error:', sendErr.message);
      }
    }

    // Log to Firestore
    await db.collection('notifications_log').add({
      title,
      body,
      target: target || 'ALL_USERS',
      sentAt: new Date().toISOString(),
      status: successCount > 0 ? 'sent' : 'failed',
      successCount,
      failureCount,
    });

    return res.status(200).json({
      success: true,
      message: `Notification sent. Success: ${successCount}, Failed: ${failureCount}`,
    });

  } catch (err: any) {
    console.error('[API] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
