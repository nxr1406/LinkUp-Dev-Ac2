# Firestore Composite Indexes

To ensure the application runs efficiently and queries execute without errors, you need to create the following composite indexes in your Firebase Console.

## Collection: `chats`

1. **Query:** `where('participants', 'array-contains', currentUser.uid).orderBy('lastMessageTime', 'desc')`
   - **Fields:**
     - `participants` (Arrays)
     - `lastMessageTime` (Descending)

## Collection: `msgs` (Subcollection of `messages/{chatId}`)

1. **Query:** `orderBy('createdAt', 'desc')`
   - **Fields:**
     - `createdAt` (Descending)
     - (Note: This is a single-field index, which Firestore usually creates automatically, but it's good to verify).

2. **Query:** `where('expiresAt', '<=', now).where('senderId', '==', currentUser.uid)`
   - **Fields:**
     - `senderId` (Ascending)
     - `expiresAt` (Ascending)

## Collection: `users`

1. **Query:** `where('username', '>=', searchLower).where('username', '<=', searchLower + '\uf8ff')`
   - **Fields:**
     - `username` (Ascending)

---

### How to Create Indexes

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Select your project (`linkup-c22fa`).
3. Navigate to **Firestore Database** > **Indexes** tab.
4. Click **Create Index**.
5. Enter the **Collection ID** (e.g., `chats`).
6. Add the fields and their corresponding index types (Ascending, Descending, or Arrays) as listed above.
7. Click **Create**.

*Note: Building indexes can take a few minutes.*
