import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users, userProfiles, subscriptionPlans, subscriptions, notifications } from '../db/schema.ts';

export type UserRole = 'super_admin' | 'admin' | 'org_owner' | 'teacher' | 'team_manager' | 'student';

const INITIAL_SUPER_ADMIN_EMAIL = 'happypcp@gmail.com';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
  organizationId: number | null;
  emailVerified: boolean;
}

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  dbUser?: DbUser;
}

export async function getOrCreateDbUser(decoded: DecodedIdToken): Promise<DbUser> {
  const email = (decoded.email || `${decoded.uid}@lexiscore.local`).toLowerCase();
  const fullName = decoded.name || email.split('@')[0] || 'LexiScore Learner';
  const avatarUrl = decoded.picture || null;
  const emailVerified = Boolean(decoded.email_verified);
  const initialRole: UserRole = email === INITIAL_SUPER_ADMIN_EMAIL ? 'super_admin' : 'student';

  try {
    const upserted = await db
      .insert(users)
      .values({
        uid: decoded.uid,
        email,
        fullName,
        avatarUrl,
        role: initialRole,
        emailVerified,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          emailVerified,
          updatedAt: new Date(),
        },
      })
      .returning();

    const user = upserted[0];

    // Ensure profile exists
    await db
      .insert(userProfiles)
      .values({
        userId: user.id,
        targetExam: 'pte_academic',
        targetScore: '79',
        weeklyHours: 10,
      })
      .onConflictDoNothing({ target: userProfiles.userId });

    // Ensure default Free subscription exists if none present
    const existingSub = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .limit(1);

    if (existingSub.length === 0) {
      const freePlan = await db
        .select({ id: subscriptionPlans.id })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.code, 'free'))
        .limit(1);

      if (freePlan.length > 0) {
        const end = new Date();
        end.setFullYear(end.getFullYear() + 10);
        await db.insert(subscriptions).values({
          userId: user.id,
          planId: freePlan[0].id,
          billingCycle: 'monthly',
          status: 'active',
          provider: 'manual',
          currentPeriodEnd: end,
        });

        await db.insert(notifications).values({
          userId: user.id,
          channel: 'in_app',
          category: 'welcome',
          title: 'Welcome to LexiScore',
          body: 'Your workspace is ready. Start a quick speaking drill or launch a timed mock exam across PTE, IELTS, or DET.',
        });
      }
    }

    return user;
  } catch (error) {
    console.error('Database user synchronization failed:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.firebaseUser = decodedToken;
    req.dbUser = await getOrCreateDbUser(decodedToken);
    return next();
  } catch (error) {
    console.error('Firebase token verification error:', error);
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
};

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const decodedToken = await adminAuth.verifyIdToken(token);
        req.firebaseUser = decodedToken;
        req.dbUser = await getOrCreateDbUser(decodedToken);
      } catch {
        // Proceed as unauthenticated guest
      }
    }
  }
  return next();
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.dbUser.role as UserRole)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action.' });
    }
    return next();
  };
};
