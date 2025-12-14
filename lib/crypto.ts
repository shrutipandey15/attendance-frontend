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

export async function deleteDeviceKeys(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete('deviceKeys');
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject("Failed to delete keys");
  });
}

export async function generateDeviceKeys(): Promise<string> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    false,
    ["sign", "verify"]
  );

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(keyPair, 'deviceKeys');

  const exported = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const exportedAsBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  
  return `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64}\n-----END PUBLIC KEY-----`;
}

export async function isDeviceBound(): Promise<boolean> {
  const keys = await getStoredKeys();
  return !!keys;
}

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