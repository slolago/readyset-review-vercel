import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const decoded = await getAdminAuth().verifyIdToken(token);
    const db = getAdminDb();

    const { name, email, avatar } = await request.json();

    // Upsert user — first check by UID, then by email (invited users have a Firestore doc but no Auth UID yet)
    const userRef = db.collection('users').doc(decoded.uid);
    const userDoc = await userRef.get();

    let userData;
    if (!userDoc.exists) {
      const userEmail = (email || decoded.email || '').toLowerCase();

      // Look for an invitation record created by admin with the same email
      const inviteSnap = await db.collection('users')
        .where('email', '==', userEmail)
        .where('invited', '==', true)
        .limit(1)
        .get();

      if (!inviteSnap.empty) {
        // Migrate invitation to real UID: copy role, delete old doc, create new one
        const inviteData = inviteSnap.docs[0].data();
        await inviteSnap.docs[0].ref.delete();
        userData = {
          email: userEmail,
          name: name || inviteData.name || userEmail,
          avatar: avatar || decoded.picture || '',
          role: inviteData.role,
          createdAt: inviteData.createdAt,
        };
        await userRef.set(userData);
      } else {
        // Brand-new user — first ever becomes admin
        const usersSnap = await db.collection('users').limit(2).get();
        const isFirstUser = usersSnap.empty;
        userData = {
          email: userEmail,
          name: name || decoded.name || userEmail || 'User',
          avatar: avatar || decoded.picture || '',
          role: isFirstUser ? 'admin' : 'viewer',
          createdAt: Timestamp.now(),
        };
        await userRef.set(userData);
      }
    } else {
      userData = userDoc.data()!;
      // Update name/avatar from Google profile if changed
      await userRef.update({
        name: name || userData.name,
        avatar: avatar || userData.avatar,
      });
      userData = { ...userData, name: name || userData.name, avatar: avatar || userData.avatar };
    }

    return NextResponse.json({
      user: { id: decoded.uid, ...userData },
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
