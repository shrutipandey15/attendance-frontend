// src/lib/crypto.ts

// 1. Setup IndexedDB to store our keys securely
const DB_NAME = 'AttendanceAuthDB';
const STORE_NAME = 'keys';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject("Failed to open IDB");
  });
}

// 2. Helper to get keys (This was missing!)
async function getStoredKeys(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey } | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get('deviceKeys');

    request.onsuccess = () => {
      resolve(request.result || null);
    };
    request.onerror = () => reject("Failed to read keys");
  });
}

// 3. Generate Keys (Runs once when you first login)
export async function generateDeviceKeys(): Promise<string> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    false, // Private key cannot be extracted (Very Secure!)
    ["sign", "verify"]
  );

  // Store in IndexedDB
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(keyPair, 'deviceKeys');

  // Export Public Key to send to Server
  const exported = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const exportedAsBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  
  return `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64}\n-----END PUBLIC KEY-----`;
}

// 4. Check if we are already bound
export async function isDeviceBound(): Promise<boolean> {
  const keys = await getStoredKeys();
  return !!keys;
}

// 5. Sign Data (The function you just added)
export async function signData(data: string): Promise<string> {
  const keyPair = await getStoredKeys();
  
  if (!keyPair || !keyPair.privateKey) {
    throw new Error("Private key not available. Please login again.");
  }

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  const signature = await window.crypto.subtle.sign(
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: { name: "SHA-256" },
    },
    keyPair.privateKey,
    dataBuffer
  );

  // Convert raw binary signature to Base64 string
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}