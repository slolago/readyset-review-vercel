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
        // No invitation for this email. Two possibilities:
        //   1. Very first signup on a fresh deployment → bootstrap as admin.
        //   2. Random Google user trying to log in → REJECT.
        // The guard doc is our single source of truth for whether bootstrap
        // already happened; a transaction prevents two cold-start signups
        // from both claiming admin.
        const guardRef = db.collection('_system').doc('first-admin');
        const bootstrap = await db.runTransaction(async (tx) => {
          const guard = await tx.get(guardRef);
          if (guard.exists) return null; // signal: not the first user → reject
          const data = {
            email: userEmail,
            name: name || decoded.name || userEmail || 'User',
            avatar: avatar || decoded.picture || '',
            role: 'admin' as const,
            createdAt: Timestamp.now(),
          };
          tx.set(guardRef, { claimedBy: decoded.uid, claimedAt: Timestamp.now() });
          tx.set(userRef, data);
          return data;
        });

        if (!bootstrap) {
          // Unauthorized Google account — not invited, not first user.
          // Do NOT create a Firestore doc. Client is responsible for
          // signing the user out of Firebase Auth on receiving 403.
          return NextResponse.json(
            { error: 'Your account is not authorized. Please ask an administrator to invite you.' },
            { status: 403 }
          );
        }
        userData = bootstrap;
      }
    } else {
      userData = userDoc.data()!;
      // SEC-03: disabled check also enforced in getAuthenticatedUser for all other routes
      // Block suspended accounts from establishing a session
      if (userData.disabled === true) {
        return NextResponse.json({ error: 'Account suspended. Contact your administrator.' }, { status: 403 });
      }
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
