import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  DocumentData,
  QueryConstraint,
  addDoc,
  limit,
} from 'firebase/firestore';
import { db } from './firebase-client';
import type { User, Project, Folder, Asset, Comment, ReviewLink } from '@/types';

// Generic helpers
async function getDocument<T>(
  collectionName: string,
  id: string
): Promise<T | null> {
  const ref = doc(db, collectionName, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as T;
}

async function queryDocuments<T>(
  collectionName: string,
  constraints: QueryConstraint[]
): Promise<T[]> {
  const ref = collection(db, collectionName);
  const q = query(ref, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
}

// Users
export const usersCollection = () => collection(db, 'users');

export async function getUser(userId: string): Promise<User | null> {
  return getDocument<User>('users', userId);
}

export async function createUser(userId: string, data: Omit<User, 'id'>): Promise<void> {
  await setDoc(doc(db, 'users', userId), data);
}

export async function updateUser(userId: string, data: Partial<User>): Promise<void> {
  await updateDoc(doc(db, 'users', userId), data as DocumentData);
}

export async function getAllUsers(): Promise<User[]> {
  return queryDocuments<User>('users', [orderBy('createdAt', 'desc')]);
}

// Projects
export async function getProject(projectId: string): Promise<Project | null> {
  return getDocument<Project>('projects', projectId);
}

export async function getUserProjects(userId: string): Promise<Project[]> {
  const owned = await queryDocuments<Project>('projects', [
    where('ownerId', '==', userId),
    orderBy('updatedAt', 'desc'),
  ]);

  const collab = await queryDocuments<Project>('projects', [
    where('collaborators', 'array-contains', { userId }),
    orderBy('updatedAt', 'desc'),
  ]);

  // Merge and deduplicate
  const map = new Map<string, Project>();
  [...owned, ...collab].forEach((p) => map.set(p.id, p));
  return Array.from(map.values());
}

export async function getAccessibleProjects(userId: string): Promise<Project[]> {
  const ref = collection(db, 'projects');
  const snap = await getDocs(ref);
  const projects: Project[] = [];
  snap.docs.forEach((d) => {
    const p = { id: d.id, ...d.data() } as Project;
    if (
      p.ownerId === userId ||
      p.collaborators?.some((c) => c.userId === userId)
    ) {
      projects.push(p);
    }
  });
  return projects.sort(
    (a, b) => b.updatedAt?.toMillis() - a.updatedAt?.toMillis()
  );
}

export async function createProject(data: Omit<Project, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'projects'), data);
  return ref.id;
}

export async function updateProject(
  projectId: string,
  data: Partial<Project>
): Promise<void> {
  await updateDoc(doc(db, 'projects', projectId), {
    ...data,
    updatedAt: Timestamp.now(),
  } as DocumentData);
}

export async function deleteProject(projectId: string): Promise<void> {
  await deleteDoc(doc(db, 'projects', projectId));
}

// Folders
export async function getFolder(folderId: string): Promise<Folder | null> {
  return getDocument<Folder>('folders', folderId);
}

export async function getProjectFolders(
  projectId: string,
  parentId: string | null = null
): Promise<Folder[]> {
  const constraints: QueryConstraint[] = [
    where('projectId', '==', projectId),
    orderBy('createdAt', 'asc'),
  ];
  if (parentId === null) {
    constraints.push(where('parentId', '==', null));
  } else {
    constraints.push(where('parentId', '==', parentId));
  }
  return queryDocuments<Folder>('folders', constraints);
}

export async function createFolder(data: Omit<Folder, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'folders'), data);
  return ref.id;
}

export async function updateFolder(
  folderId: string,
  data: Partial<Folder>
): Promise<void> {
  await updateDoc(doc(db, 'folders', folderId), data as DocumentData);
}

export async function deleteFolder(folderId: string): Promise<void> {
  await deleteDoc(doc(db, 'folders', folderId));
}

// Assets
export async function getAsset(assetId: string): Promise<Asset | null> {
  return getDocument<Asset>('assets', assetId);
}

export async function getProjectAssets(
  projectId: string,
  folderId: string | null = null
): Promise<Asset[]> {
  const constraints: QueryConstraint[] = [
    where('projectId', '==', projectId),
    orderBy('createdAt', 'desc'),
  ];
  if (folderId === null) {
    constraints.push(where('folderId', '==', null));
  } else {
    constraints.push(where('folderId', '==', folderId));
  }
  return queryDocuments<Asset>('assets', constraints);
}

export async function createAsset(
  assetId: string,
  data: Omit<Asset, 'id'>
): Promise<void> {
  await setDoc(doc(db, 'assets', assetId), data);
}

export async function updateAsset(
  assetId: string,
  data: Partial<Asset>
): Promise<void> {
  await updateDoc(doc(db, 'assets', assetId), data as DocumentData);
}

export async function deleteAsset(assetId: string): Promise<void> {
  await deleteDoc(doc(db, 'assets', assetId));
}

// Comments
export async function getComment(commentId: string): Promise<Comment | null> {
  return getDocument<Comment>('comments', commentId);
}

export async function getAssetComments(assetId: string): Promise<Comment[]> {
  return queryDocuments<Comment>('comments', [
    where('assetId', '==', assetId),
    orderBy('createdAt', 'asc'),
  ]);
}

export async function createComment(data: Omit<Comment, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'comments'), data);
  return ref.id;
}

export async function updateComment(
  commentId: string,
  data: Partial<Comment>
): Promise<void> {
  await updateDoc(doc(db, 'comments', commentId), data as DocumentData);
}

export async function deleteComment(commentId: string): Promise<void> {
  await deleteDoc(doc(db, 'comments', commentId));
}

// Review Links
export async function getReviewLinkByToken(
  token: string
): Promise<ReviewLink | null> {
  const results = await queryDocuments<ReviewLink>('reviewLinks', [
    where('token', '==', token),
    limit(1),
  ]);
  return results[0] || null;
}

export async function getProjectReviewLinks(
  projectId: string
): Promise<ReviewLink[]> {
  return queryDocuments<ReviewLink>('reviewLinks', [
    where('projectId', '==', projectId),
    orderBy('createdAt', 'desc'),
  ]);
}

export async function createReviewLink(
  data: Omit<ReviewLink, 'id'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'reviewLinks'), data);
  return ref.id;
}

export async function deleteReviewLink(linkId: string): Promise<void> {
  await deleteDoc(doc(db, 'reviewLinks', linkId));
}
