'use client';
import { useState, useEffect } from 'react';
import { account, databases, functions, teams } from '../lib/appwrite';
import { generateDeviceKeys, isDeviceBound, signData, deleteDeviceKeys } from '../lib/crypto';
import { Query, Models } from 'appwrite';
import { useRouter } from 'next/navigation';
import { formatTimestamp } from '../lib/utils';
import { 
    PencilSquareIcon, ArrowRightOnRectangleIcon, ClockIcon, ArrowRightIcon, ArrowLeftIcon, CalendarDaysIcon, XMarkIcon, ShieldCheckIcon
} from '@heroicons/react/24/outline'; 

import { DB_ID, FUNCTION_ID, ADMIN_TEAM_ID, AUDIT_COLLECTION, EMPLOYEE_COLLECTION } from '../lib/constants';

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
        AUDIT_COLLECTION,
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
        AUDIT_COLLECTION,
        [
          Query.equal('actorId', userId),
          Query.orderDesc('timestamp'),
          Query.limit(15) 
        ]
      );

      const items = response.documents.map(doc => ({
        id: doc.$id,
        action: doc.action,
        timestamp: formatTimestamp(doc.timestamp),
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
        const docs = await databases.listDocuments(DB_ID, EMPLOYEE_COLLECTION, [Query.equal('email', user.email)]);
        if(docs.total > 0) {
            await databases.updateDocument(DB_ID, EMPLOYEE_COLLECTION, docs.documents[0].$id, { 
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
        if(response.message.includes("Device mismatch")) {
            addLog("🔧 Attempting device re-binding...");
            await deleteDeviceKeys();
            window.location.reload();
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
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

  if (loading && view === 'login') return <div className="p-10 text-center font-mono text-slate-400 bg-slate-900 min-h-screen">Initializing Secure Environment...</div>;

  return (
<div className="h-full w-full overflow-y-auto bg-slate-900 flex items-center justify-center p-3 sm:p-4 relative overscroll-none">
      {view === 'dashboard' && (
         <div className="absolute top-3 sm:top-4 right-3 sm:right-4 flex items-center gap-2 sm:gap-3 z-10">
             <button 
                onClick={() => setShowPwdModal(true)} 
                className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold text-slate-400 hover:text-cyan-400 transition bg-slate-800 px-3 sm:px-4 py-2 rounded-full shadow-md border border-slate-700 active:scale-95"
             >
                <PencilSquareIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Change Pass</span>
                <span className="sm:hidden">Pass</span>
             </button>
             <button 
                onClick={() => { account.deleteSession('current'); setView('login'); }} 
                className="text-xs sm:text-sm font-bold text-red-400 hover:text-red-500 underline decoration-2 underline-offset-4 active:scale-95 transition"
             >
                Logout
             </button>
         </div>
      )}

      {view === 'login' ? (
        <div className="w-full max-w-md bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700">
          <h1 className="text-2xl sm:text-3xl font-extrabold mb-5 sm:mb-6 text-white flex items-center gap-2 sm:gap-3">
             <ArrowRightOnRectangleIcon className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-500" />
             Secure Sign In
          </h1>
          
          {loginError && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-800 text-red-400 text-sm rounded font-bold">
                {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input 
              type="email" 
              placeholder="Email" 
              className="p-3 border border-slate-700 rounded-lg w-full bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 text-base" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
            <input 
              type="password" 
              placeholder="Password" 
              className="p-3 border border-slate-700 rounded-lg w-full bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 text-base" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
            <button 
              disabled={loading} 
              className="bg-cyan-600 text-white p-3 rounded-lg font-bold hover:bg-cyan-700 transition disabled:opacity-50 shadow-md active:scale-95"
            >
              {loading ? 'Verifying...' : 'Login Securely'}
            </button>
          </form>
        </div>
      ) : (
        <div className="w-full max-w-md flex flex-col items-center gap-6 sm:gap-8 mt-6 sm:mt-10 px-3 sm:px-0">
          <div className="text-center">
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white">Hello, {user?.name}</h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-2 font-medium flex items-center justify-center gap-2">
                <CalendarDaysIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
                Today is {new Date().toDateString()}
            </p>
          </div>

          {/* Mobile: smaller button, Desktop: larger */}
          <button 
            onClick={performAttendance}
            disabled={loading}
            className={`w-44 h-44 sm:w-60 sm:h-60 rounded-full border-4 sm:border-8 shadow-2xl flex flex-col items-center justify-center transition-all duration-300 transform hover:scale-105 active:scale-95 ${
              currentStatus === 'checked-in' 
                ? 'bg-red-900/40 border-red-700 text-red-400 hover:bg-red-900/60' 
                : 'bg-green-900/40 border-green-700 text-green-400 hover:bg-green-900/60'
            }`}
          >
            <span className="mb-1 sm:mb-2">
              {currentStatus === 'checked-in' ? (
                  <ArrowLeftIcon className="w-12 h-12 sm:w-16 sm:h-16" />
              ) : (
                  <ArrowRightIcon className="w-12 h-12 sm:w-16 sm:h-16" />
              )}
            </span>
            <span className="font-extrabold text-lg sm:text-2xl tracking-wider">
              {currentStatus === 'checked-in' ? 'CHECK OUT' : 'CHECK IN'}
            </span>
            <span className="text-xs sm:text-sm uppercase mt-1 sm:mt-2 font-semibold opacity-60 text-slate-300 px-2 text-center">
              {loading ? 'Processing...' : (currentStatus === 'checked-in' ? 'End Shift' : 'Start Shift')}
            </span>
          </button>

          <div className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-mono text-sm sm:text-base font-bold border shadow-inner ${
             currentStatus === 'checked-in' ? 'bg-green-900/50 text-green-400 border-green-800' : 'bg-slate-700 text-cyan-400 border-cyan-800'
          }`}>
            <ShieldCheckIcon className="w-4 h-4 sm:w-5 sm:h-5 inline mr-2" />
            STATUS: {currentStatus === 'checked-in' ? 'CLOCKED IN' : 'CLOCKED OUT'}
          </div>

          <div className="w-full max-w-md bg-slate-800 rounded-lg sm:rounded-xl shadow-lg border border-slate-700 overflow-hidden mt-2">
            <div className="bg-slate-700 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-600 text-xs sm:text-sm font-bold text-cyan-400 uppercase tracking-wide flex justify-between items-center">
              <span>Recent Activity</span>
              <span className="text-xs font-normal text-slate-500">{history.length} Logs</span>
            </div>
            
            <div className="max-h-60 sm:max-h-80 overflow-y-auto custom-scrollbar"> 
                <style jsx global>{`
                    .custom-scrollbar::-webkit-scrollbar {
                        width: 6px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                        background: #1f2937;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                        background-color: #06b6d4;
                        border-radius: 4px;
                        border: 1px solid #1f2937;
                    }
                    @media (min-width: 640px) {
                        .custom-scrollbar::-webkit-scrollbar {
                            width: 8px;
                        }
                    }
                `}</style>

                <div className="divide-y divide-slate-700">
                  {history.length === 0 && <div className="p-4 text-center text-xs sm:text-sm text-slate-500 italic">No history found.</div>}
                  {history.map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-2.5 sm:p-3 hover:bg-slate-700 transition">
                      <div className="flex flex-col">
                        <span className={`text-xs sm:text-sm font-bold ${item.action === 'check-in' ? 'text-green-400' : 'text-red-400'}`}>
                          {item.action === 'check-in' ? 'Check In' : 'Check Out'}
                        </span>
                        <span className="text-xs text-slate-400">{item.timestamp}</span>
                      </div>
                      <div className="text-xs bg-slate-900 text-cyan-400 px-2 sm:px-3 py-1 rounded-full font-bold border border-cyan-900 flex items-center gap-1">
                        <ShieldCheckIcon className="w-3 h-3" />
                        <span className="hidden sm:inline">VERIFIED</span>
                        <span className="sm:hidden">✓</span>
                      </div>
                    </div>
                  ))}
                </div>
            </div>
          </div>
        </div>
      )}

      {showPwdModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md transform scale-100 transition-transform duration-300 border border-slate-700">
                <div className="flex justify-between items-center border-b border-slate-700 pb-3 mb-4 sm:mb-5">
                    <h2 className="text-lg sm:text-xl font-extrabold text-white">Change Password</h2>
                    <button 
                      onClick={() => setShowPwdModal(false)} 
                      className="text-slate-400 hover:text-white transition active:scale-95"
                    >
                        <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                </div>
                <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Old Password</label>
                        <input 
                          type="password" 
                          value={oldPwd} 
                          onChange={e=>setOldPwd(e.target.value)} 
                          className="w-full p-3 border border-slate-600 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-cyan-400 text-base" 
                          required 
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">New Password</label>
                        <input 
                          type="password" 
                          value={newPwd} 
                          onChange={e=>setNewPwd(e.target.value)} 
                          className="w-full p-3 border border-slate-600 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-cyan-400 text-base" 
                          required 
                        />
                    </div>
                    
                    {pwdMsg && <p className={`text-sm font-bold text-center mt-3 ${pwdMsg.includes('Error') ? 'text-red-400 bg-red-900/50 p-2 rounded' : 'text-green-400 bg-green-900/50 p-2 rounded'}`}>{pwdMsg}</p>}
                    
                    <div className="flex gap-3 pt-4">
                        <button 
                          type="button" 
                          onClick={()=>{setShowPwdModal(false); setPwdMsg('');}} 
                          className="flex-1 bg-slate-700 py-3 rounded-lg font-bold text-slate-300 hover:bg-slate-600 transition active:scale-95"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit" 
                          className="flex-1 bg-cyan-600 py-3 rounded-lg font-bold text-white hover:bg-cyan-700 transition active:scale-95"
                        >
                          Update
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}