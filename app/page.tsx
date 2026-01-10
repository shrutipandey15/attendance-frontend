'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { teams } from '../lib/appwrite';
import { generateDeviceKeys, isDeviceBound, deleteDeviceKeys } from '../lib/crypto';
import {
    login as apiLogin,
    logout as apiLogout,
    changePassword as apiChangePassword,
    getCurrentUser,
    checkIn,
    checkOut,
    getMyAttendance,
    registerDevice,
    getSystemInfo
} from '../lib/api';
import type { User, AttendanceRecord } from '../lib/api';
import {
    PencilSquareIcon, ArrowRightIcon, ArrowLeftIcon,
    CalendarDaysIcon, XMarkIcon, ShieldCheckIcon, ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

import { ADMIN_TEAM_ID } from '../lib/constants';

export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<'login' | 'dashboard'>('login');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [user, setUser] = useState<User | null>(null);
  const [currentStatus, setCurrentStatus] = useState<'checked-in' | 'checked-out' | 'unknown'>('unknown');
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);

  const [showPwdModal, setShowPwdModal] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');

  const [systemInfo, setSystemInfo] = useState<{
    checkInAllowed: boolean;
    checkOutAllowed: boolean;
    message?: string;
  } | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const activeUser = await getCurrentUser();

      if (!activeUser) {
        setView('login');
        setLoading(false);
        return;
      }

      setUser(activeUser);

      // Check if admin
      try {
        const teamList = await teams.list();
        const isAdmin = teamList.teams.some(t => t.$id === ADMIN_TEAM_ID);

        if (isAdmin) {
          router.push('/admin');
          return;
        }
      } catch (e) {
        console.log("Not an admin or team check failed", e);
      }

      // Fetch data
      await Promise.all([
        fetchAttendanceData(),
        fetchSystemInfo()
      ]);

      setView('dashboard');
    } catch (err) {
      console.error('Session check failed:', err);
      setView('login');
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemInfo = async () => {
    try {
      const result = await getSystemInfo();
      if (result.success && result.data) {
        setSystemInfo({
          checkInAllowed: result.data.checkInAllowed,
          checkOutAllowed: result.data.checkOutAllowed
        });
      }
    } catch (error) {
      console.error('Failed to fetch system info:', error);
    }
  };

  const fetchAttendanceData = async () => {
    try {
      const result = await getMyAttendance();

      if (result.success && result.data) {
        const records = result.data.records;
        setHistory(records.slice(0, 15)); // Last 15 records

        // Find today's record
        const today = new Date().toISOString().split('T')[0];
        const todayRecord = records.find(r => r.date === today);

        setTodayAttendance(todayRecord || null);

        // Determine current status
        if (todayRecord) {
          if (todayRecord.checkInTime && !todayRecord.checkOutTime) {
            setCurrentStatus('checked-in');
          } else if (todayRecord.checkOutTime) {
            setCurrentStatus('checked-out');
          } else {
            setCurrentStatus('checked-out');
          }
        } else {
          setCurrentStatus('checked-out');
        }
      }
    } catch (error) {
      console.error('Failed to fetch attendance:', error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');

    try {
      const result = await apiLogin(email, password);

      if (result.success) {
        await checkSession();
      } else {
        setLoginError(result.message || 'Login failed');
        setLoading(false);
      }
    } catch (error: unknown) {
      setLoading(false);
      setLoginError("Network error. Please try again.");
      console.error(error);
    }
  };

  const performAttendance = async () => {
    if (!user) return;

    setActionLoading(true);

    try {
      const intent = currentStatus === 'checked-in' ? 'check-out' : 'check-in';

      // Check if device is bound
      let isBound = await isDeviceBound();

      if (!isBound) {
        // Register device
        const publicKey = await generateDeviceKeys();
        const deviceFingerprint = navigator.userAgent;

        const registerResult = await registerDevice(
          user.$id,
          user.email,
          publicKey,
          deviceFingerprint
        );

        if (!registerResult.success) {
          alert(registerResult.message || 'Failed to register device');
          setActionLoading(false);
          return;
        }
      }

      // Perform check-in or check-out
      const result = intent === 'check-in'
        ? await checkIn(user.$id, user.email)
        : await checkOut(user.$id, user.email);

      if (result.success) {
        alert(`✅ ${result.message}`);

        // Update status immediately
        setCurrentStatus(intent === 'check-in' ? 'checked-in' : 'checked-out');

        // Refresh attendance data
        await fetchAttendanceData();
      } else {
        // Check for device mismatch
        if (result.message.includes('Device not registered') || result.message.includes('Invalid signature')) {
          const retry = confirm(
            `${result.message}\n\nWould you like to re-register your device?`
          );

          if (retry) {
            await deleteDeviceKeys();
            window.location.reload();
          }
        } else {
          alert(`❌ ${result.message}`);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      alert(`🚨 Error: ${errorMessage}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg('Updating...');

    try {
      const result = await apiChangePassword(oldPwd, newPwd);

      if (result.success) {
        setPwdMsg('✅ Password Changed! Logging out...');
        setTimeout(async () => {
          await apiLogout();
          setView('login');
          setUser(null);
          setShowPwdModal(false);
          setPwdMsg('');
          setOldPwd('');
          setNewPwd('');
          window.location.reload();
        }, 2000);
      } else {
        setPwdMsg(`❌ ${result.message}`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setPwdMsg('❌ Error: ' + errorMessage);
    }
  };

  const handleLogout = async () => {
    await apiLogout();
    setView('login');
    setUser(null);
    setCurrentStatus('unknown');
    setHistory([]);
    window.location.reload();
  };

  const formatTimestamp = (isoString: string | null) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading && view === 'login') {
    return (
      <div className="p-10 text-center font-mono text-slate-400 bg-slate-900 min-h-screen flex items-center justify-center">
        <div className="space-y-4">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p>Initializing Secure Environment...</p>
        </div>
      </div>
    );
  }

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
            onClick={handleLogout}
            className="text-xs sm:text-sm font-bold text-red-400 hover:text-red-500 underline decoration-2 underline-offset-4 active:scale-95 transition"
          >
            Logout
          </button>
        </div>
      )}

      {view === 'login' ? (
        <div className="w-full max-w-md bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700">
          <h1 className="text-2xl sm:text-3xl font-extrabold mb-5 sm:mb-6 text-white flex items-center gap-2 sm:gap-3">
            <ShieldCheckIcon className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-500" />
            Secure Sign In
          </h1>

          {loginError && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-800 text-red-400 text-sm rounded font-bold flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
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

          {/* Check-in/Check-out Button */}
          <button
            onClick={performAttendance}
            disabled={actionLoading || loading}
            className={`w-44 h-44 sm:w-60 sm:h-60 rounded-full border-4 sm:border-8 shadow-2xl flex flex-col items-center justify-center transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
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
              {actionLoading ? 'Processing...' : (currentStatus === 'checked-in' ? 'End Shift' : 'Start Shift')}
            </span>
          </button>

          {/* Status Badge */}
          <div className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-mono text-sm sm:text-base font-bold border shadow-inner ${
            currentStatus === 'checked-in' ? 'bg-green-900/50 text-green-400 border-green-800' : 'bg-slate-700 text-cyan-400 border-cyan-800'
          }`}>
            <ShieldCheckIcon className="w-4 h-4 sm:w-5 sm:h-5 inline mr-2" />
            STATUS: {currentStatus === 'checked-in' ? 'CLOCKED IN' : 'CLOCKED OUT'}
          </div>

          {/* Today's Summary */}
          {todayAttendance && (
            <div className="w-full bg-slate-800 rounded-lg p-4 border border-slate-700">
              <h3 className="text-cyan-400 font-bold text-sm mb-3">Today's Summary</h3>
              <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                <div>
                  <p className="text-slate-400">Check-in</p>
                  <p className="text-white font-bold">{formatTime(todayAttendance.checkInTime)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Check-out</p>
                  <p className="text-white font-bold">{formatTime(todayAttendance.checkOutTime)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Work Hours</p>
                  <p className="text-white font-bold">{todayAttendance.workHours.toFixed(1)}h</p>
                </div>
                <div>
                  <p className="text-slate-400">Status</p>
                  <p className={`font-bold capitalize ${
                    todayAttendance.status === 'present' ? 'text-green-400' :
                    todayAttendance.status === 'half_day' ? 'text-yellow-400' :
                    todayAttendance.status === 'absent' ? 'text-red-400' :
                    'text-slate-400'
                  }`}>
                    {todayAttendance.status.replace('_', ' ')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Recent Activity */}
          <div className="w-full max-w-md bg-slate-800 rounded-lg sm:rounded-xl shadow-lg border border-slate-700 overflow-hidden mt-2">
            <div className="bg-slate-700 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-600 text-xs sm:text-sm font-bold text-cyan-400 uppercase tracking-wide flex justify-between items-center">
              <span>Recent Activity</span>
              <span className="text-xs font-normal text-slate-500">{history.length} Records</span>
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
                {history.length === 0 && (
                  <div className="p-4 text-center text-xs sm:text-sm text-slate-500 italic">
                    No history found.
                  </div>
                )}
                {history.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-2.5 sm:p-3 hover:bg-slate-700 transition">
                    <div className="flex flex-col">
                      <span className={`text-xs sm:text-sm font-bold capitalize ${
                        item.status === 'present' ? 'text-green-400' :
                        item.status === 'half_day' ? 'text-yellow-400' :
                        item.status === 'absent' ? 'text-red-400' :
                        item.status === 'sunday' ? 'text-blue-400' :
                        item.status === 'holiday' ? 'text-purple-400' :
                        'text-slate-400'
                      }`}>
                        {item.status.replace('_', ' ')} - {item.day}
                      </span>
                      <span className="text-xs text-slate-400">{item.date}</span>
                      <span className="text-xs text-slate-500">
                        {item.checkInTime ? formatTime(item.checkInTime) : '--'} → {item.checkOutTime ? formatTime(item.checkOutTime) : '--'}
                      </span>
                    </div>
                    <div className="text-xs bg-slate-900 text-cyan-400 px-2 sm:px-3 py-1 rounded-full font-bold border border-cyan-900 flex items-center gap-1">
                      <ShieldCheckIcon className="w-3 h-3" />
                      <span>{item.workHours.toFixed(1)}h</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
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
                  onChange={e => setOldPwd(e.target.value)}
                  className="w-full p-3 border border-slate-600 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-cyan-400 text-base"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase block mb-1">New Password</label>
                <input
                  type="password"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  className="w-full p-3 border border-slate-600 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-cyan-400 text-base"
                  required
                />
              </div>

              {pwdMsg && (
                <p className={`text-sm font-bold text-center mt-3 ${
                  pwdMsg.includes('Error') || pwdMsg.includes('❌')
                    ? 'text-red-400 bg-red-900/50 p-2 rounded'
                    : 'text-green-400 bg-green-900/50 p-2 rounded'
                }`}>
                  {pwdMsg}
                </p>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {setShowPwdModal(false); setPwdMsg('');}}
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
