import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  let step = 'start';
  try {
    step = 'authHeader';
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    step = 'verifyToken';
    const token = authHeader.slice(7);
    const decoded = await getAdminAuth().verifyIdToken(token);

    step = 'getDb';
    const db = getAdminDb();

    step = 'parseBody';
    const { name, email, avatar } = await request.json();

    step = 'firestoreRead';
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
        // Brand-new user — first ever becomes admin. Use a transaction with
        // a guard doc so two concurrent signups can't both claim admin.
        const guardRef = db.collection('_system').doc('first-admin');
        userData = await db.runTransaction(async (tx) => {
          const guard = await tx.get(guardRef);
          const isFirstUser = !guard.exists;
          const data = {
            email: userEmail,
            name: name || decoded.name || userEmail || 'User',
            avatar: avatar || decoded.picture || '',
            role: isFirstUser ? 'admin' : 'viewer',
            createdAt: Timestamp.now(),
          };
          if (isFirstUser) {
            tx.set(guardRef, { claimedBy: decoded.uid, claimedAt: Timestamp.now() });
          }
          tx.set(userRef, data);
          return data;
        });
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
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Session error at [${step}]:`, msg);
    return NextResponse.json({ error: msg, step }, { status: 500 });
  }
}
