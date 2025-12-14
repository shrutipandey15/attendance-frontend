'use client';
import { useState, useEffect } from 'react';
import { account, databases, functions, teams } from '../lib/appwrite';
import { generateDeviceKeys, isDeviceBound, signData, deleteDeviceKeys } from '../lib/crypto'; // 👈 Imported deleteDeviceKeys
import { Query, Models } from 'appwrite';
import { useRouter } from 'next/navigation';

interface HistoryItem {
  id: string;
  action: string;
  timestamp: string;
  status: string;
}

export default function Home() {
  const router = useRouter(); 
  const [view, setView] = useState<'login' | 'dashboard'>('login');
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [loginError, setLoginError] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [currentStatus, setCurrentStatus] = useState<'checked-in' | 'checked-out' | 'unknown'>('unknown');
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [showPwdModal, setShowPwdModal] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');

  const DB_ID = '693d2c7a002d224e1d81';
  const FUNCTION_ID = '693d43f9002a766e0d81';
  const ADMIN_TEAM_ID = '693ecaa0002778dea17d'; 

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev]);
  };

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const activeUser = await account.get();
      setUser(activeUser);
      try {
        const teamList = await teams.list();
        const isAdmin = teamList.teams.some(t => t.$id === ADMIN_TEAM_ID);
        
        if (isAdmin) {
            addLog("⚡ Admin detected! Redirecting...");
            router.push('/admin');
            return;
        }
      } catch (e) {
        console.log("Not an admin or team check failed", e);
      }
      addLog(`👋 Welcome back, ${activeUser.name}`);
      
      await Promise.all([
        fetchCurrentStatus(activeUser.$id),
        fetchHistory(activeUser.$id)
      ]);
      
      setView('dashboard');
    } catch (err) {
      setView('login');
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentStatus = async (userId: string) => {
    try {
      const lastLog = await databases.listDocuments(
        DB_ID, 
        'audit', 
        [
          Query.equal('actorId', userId),
          Query.orderDesc('timestamp'),
          Query.limit(1)
        ]
      );

      if (lastLog.total > 0) {
        const lastAction = lastLog.documents[0].action;
        setCurrentStatus(lastAction === 'check-in' ? 'checked-in' : 'checked-out');
      } else {
        setCurrentStatus('checked-out');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchHistory = async (userId: string) => {
    try {
      const response = await databases.listDocuments(
        DB_ID,
        'audit',
        [
          Query.equal('actorId', userId),
          Query.orderDesc('timestamp'),
          Query.limit(5)
        ]
      );

      const items = response.documents.map(doc => ({
        id: doc.$id,
        action: doc.action,
        timestamp: new Date(doc.timestamp).toLocaleString(),
        status: 'verified'
      }));

      setHistory(items);
    } catch (error) {
      console.error("Failed to fetch history", error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      await account.createEmailPasswordSession(email, password);
      await checkSession();
    } catch (error: unknown) {
      setLoading(false);
      setLoginError("❌ Invalid Email or Password");
      console.error(error); 
    }
  };

  const performAttendance = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      const intent = currentStatus === 'checked-in' ? 'check-out' : 'check-in';
      addLog(`🚀 Initiating ${intent.toUpperCase()}...`);

      let isBound = await isDeviceBound();
      if (!isBound) {
        addLog("⚙️ Binding Device...");
        const publicKey = await generateDeviceKeys();
        const docs = await databases.listDocuments(DB_ID, 'employees', [Query.equal('email', user.email)]);
        if(docs.total > 0) {
            await databases.updateDocument(DB_ID, 'employees', docs.documents[0].$id, { 
                devicePublicKey: publicKey,
                deviceFingerprint: navigator.userAgent 
            });
        }
        isBound = true;
      }

      const today = new Date().toISOString().split('T')[0];
      const dataToSign = `${user.$id}:${today}:${intent}`;
      const signature = await signData(dataToSign);

      const execution = await functions.createExecution(
        FUNCTION_ID,
        JSON.stringify({ 
          email: user.email,
          userId: user.$id,
          dataToVerify: dataToSign,
          signature: signature,
          action: intent
        })
      );

      const response = JSON.parse(execution.responseBody);
      
      if(response.success) {
        addLog(`✅ SUCCESS: ${response.message}`);
        setCurrentStatus(intent === 'check-in' ? 'checked-in' : 'checked-out');
        await fetchHistory(user.$id); 
      } else {
        addLog(`❌ Failed: ${response.message}`);
        
        if (response.message.includes("Device not registered")) {
           await deleteDeviceKeys();
           addLog("⚠️ Key mismatch detected. Keys cleared. Please try again to re-bind.");
           alert("Security Reset: Please click the Check-in/Check-out button again to re-bind your device.");
           await checkSession();
        }
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      addLog(`🚨 An error occurred: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg('Updating...');
    try {
        await account.updatePassword(newPwd, oldPwd);
        setPwdMsg('✅ Password Changed! Logging out...');
        setTimeout(() => {
            account.deleteSession('current');
            setView('login');
            setShowPwdModal(false);
            setPwdMsg('');
            setOldPwd('');
            setNewPwd('');
        }, 2000);
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setPwdMsg('❌ Error: ' + errorMessage);
    }
  };

  if (loading && view === 'login') return <div className="p-10 text-center font-mono">Initializing Secure Environment...</div>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-100 text-slate-900 font-sans relative">
      
      {view === 'dashboard' && (
         <div className="absolute top-4 right-4 flex items-center gap-3">
             <button 
                onClick={() => setShowPwdModal(true)} 
                className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-blue-600 transition bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200"
             >
                🔑 Change Pass
             </button>
             <button 
                onClick={() => { account.deleteSession('current'); setView('login'); }} 
                className="text-sm font-bold text-red-400 hover:text-red-600 underline decoration-2 underline-offset-4"
             >
                Logout
             </button>
         </div>
      )}

      {view === 'login' ? (
        <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-xl">
          <h1 className="text-2xl font-bold mb-6 text-blue-900">🔐 Secure Access</h1>
          
          {loginError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded font-bold">
                {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input type="email" placeholder="Email" className="p-3 border rounded" value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" className="p-3 border rounded" value={password} onChange={e => setPassword(e.target.value)} required />
            <button disabled={loading} className="bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Verifying...' : 'Login'}
            </button>
          </form>
        </div>
      ) : (
        <div className="w-full max-w-md flex flex-col items-center gap-6 mt-10">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-800">Hello, {user?.name}</h1>
            <p className="text-slate-500 text-sm mt-1">{new Date().toDateString()}</p>
          </div>

          <button 
            onClick={performAttendance}
            disabled={loading}
            className={`w-48 h-48 rounded-full border-4 shadow-2xl flex flex-col items-center justify-center transition-all transform hover:scale-105 active:scale-95 ${
              currentStatus === 'checked-in' 
                ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' 
                : 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'
            }`}
          >
            <span className="text-4xl mb-2">
              {currentStatus === 'checked-in' ? '🛑' : '🚀'}
            </span>
            <span className="font-extrabold text-xl tracking-wider">
              {currentStatus === 'checked-in' ? 'CHECK OUT' : 'CHECK IN'}
            </span>
            <span className="text-xs uppercase mt-2 font-semibold opacity-60">
              {loading ? 'Processing...' : (currentStatus === 'checked-in' ? 'End Shift' : 'Start Shift')}
            </span>
          </button>

          <div className={`px-6 py-2 rounded-full font-mono text-sm font-bold border ${
             currentStatus === 'checked-in' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-slate-200 text-slate-600 border-slate-300'
          }`}>
            CURRENTLY: {currentStatus === 'checked-in' ? '🟢 CLOCKED IN' : '⚪ CLOCKED OUT'}
          </div>

          <div className="w-full bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden mt-2">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wide">
              Recent Activity
            </div>
            <div className="divide-y divide-slate-100">
              {history.length === 0 && <div className="p-4 text-center text-sm text-slate-400 italic">No history found.</div>}
              {history.map((item) => (
                <div key={item.id} className="flex justify-between items-center p-3 hover:bg-slate-50 transition">
                  <div className="flex flex-col">
                    <span className={`text-sm font-bold ${item.action === 'check-in' ? 'text-green-600' : 'text-red-500'}`}>
                      {item.action === 'check-in' ? 'Check In' : 'Check Out'}
                    </span>
                    <span className="text-xs text-slate-400">{item.timestamp}</span>
                  </div>
                  <div className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                    Verified
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showPwdModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-80">
                <h2 className="text-lg font-bold mb-4 text-gray-800">Change Password</h2>
                <form onSubmit={handleChangePassword} className="space-y-3">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Old Password</label>
                        <input type="password" value={oldPwd} onChange={e=>setOldPwd(e.target.value)} className="w-full p-2 border rounded mt-1" required />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">New Password</label>
                        <input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)} className="w-full p-2 border rounded mt-1" required />
                    </div>
                    
                    {pwdMsg && <p className={`text-xs font-bold text-center ${pwdMsg.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>{pwdMsg}</p>}
                    
                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={()=>{setShowPwdModal(false); setPwdMsg('');}} className="flex-1 bg-gray-100 py-2 rounded font-bold text-gray-600 hover:bg-gray-200">Cancel</button>
                        <button type="submit" className="flex-1 bg-blue-600 py-2 rounded font-bold text-white hover:bg-blue-700">Update</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}