'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCurrentUser,
  logout as apiLogout,
  changePassword as apiChangePassword,
  createEmployee,
  getPayrollReport,
  generatePayroll,
  unlockPayroll,
  createHoliday,
  deleteHoliday,
  getHolidays,
  getAuditLogs,
  modifyAttendance,
  resetEmployeeDevice
} from '../../lib/api';
import type { User, PayrollRecord, Holiday, AuditLog } from '../../lib/api';
import {
  ShieldCheckIcon, UserPlusIcon, CalendarDaysIcon, CurrencyRupeeIcon,
  ClipboardDocumentListIcon, Cog6ToothIcon, PlusCircleIcon, TrashIcon,
  MagnifyingGlassIcon, LockOpenIcon, LockClosedIcon, 
  PencilSquareIcon, DevicePhoneMobileIcon // <--- ADDED ICONS
} from '@heroicons/react/24/outline';

type ViewMode = 'manage' | 'payroll' | 'audit' | 'settings';

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('manage');

  // Manage Tab State
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpPassword, setNewEmpPassword] = useState('');
  const [newEmpSalary, setNewEmpSalary] = useState('8000');
  const [newEmpJoinDate, setNewEmpJoinDate] = useState('');
  const [isCreatingEmp, setIsCreatingEmp] = useState(false);

  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDesc, setNewHolidayDesc] = useState('');
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // Payroll Tab State
  const [selectedMonth, setSelectedMonth] = useState('');
  const [payrollReports, setPayrollReports] = useState<PayrollRecord[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [isGeneratingPayroll, setIsGeneratingPayroll] = useState(false);
  const [isUnlockingPayroll, setIsUnlockingPayroll] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');

  // Attendance Editing State (ADDED)
  const [editingAttendance, setEditingAttendance] = useState<any>(null);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [editReason, setEditReason] = useState('');

  // Audit Tab State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditFilter, setAuditFilter] = useState('');
  const AUDIT_LIMIT = 20;

  // Settings Tab State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');

  useEffect(() => {
    checkAdminSession();
  }, []);

  useEffect(() => {
    if (viewMode === 'manage') {
      fetchHolidays();
    } else if (viewMode === 'payroll') {
      // Set default month to current
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      setSelectedMonth(currentMonth);
    } else if (viewMode === 'audit') {
      fetchAuditLogs(1);
    }
  }, [viewMode]);

  const checkAdminSession = async () => {
    try {
      const activeUser = await getCurrentUser();

      if (!activeUser) {
        router.push('/');
        return;
      }

      setUser(activeUser);
    } catch (error) {
      console.error('Admin session check failed:', error);
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // MANAGE TAB FUNCTIONS
  // ============================================

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingEmp(true);

    try {
      const result = await createEmployee({
        email: newEmpEmail,
        password: newEmpPassword,
        name: newEmpName,
        salary: parseFloat(newEmpSalary),
        joinDate: newEmpJoinDate
      });

      if (result.success) {
        alert(`✅ ${result.message}`);
        setNewEmpName('');
        setNewEmpEmail('');
        setNewEmpPassword('');
        setNewEmpSalary('8000');
        setNewEmpJoinDate('');
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsCreatingEmp(false);
    }
  };

  const fetchHolidays = async () => {
    try {
      const result = await getHolidays();
      if (result.success && result.data) {
        setHolidays(result.data.holidays);
      }
    } catch (error) {
      console.error('Failed to fetch holidays:', error);
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await createHoliday(newHolidayDate, newHolidayName, newHolidayDesc);

      if (result.success) {
        alert(`✅ ${result.message}`);
        setNewHolidayDate('');
        setNewHolidayName('');
        setNewHolidayDesc('');
        await fetchHolidays();
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleDeleteHoliday = async (holidayId: string, holidayName: string) => {
    if (!confirm(`Delete holiday: ${holidayName}?`)) return;

    try {
      const result = await deleteHoliday(holidayId);

      if (result.success) {
        alert(`✅ ${result.message}`);
        await fetchHolidays();
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  // ============================================
  // PAYROLL TAB FUNCTIONS
  // ============================================

  const handleGeneratePayroll = async () => {
    if (!selectedMonth) {
      alert('Please select a month');
      return;
    }

    if (!confirm(`Generate payroll for ${selectedMonth}?`)) return;

    setIsGeneratingPayroll(true);

    try {
      const result = await generatePayroll(selectedMonth);

      if (result.success) {
        alert(`✅ ${result.message}`);
        await fetchPayrollReport();
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsGeneratingPayroll(false);
    }
  };

  const handleUnlockPayroll = async () => {
    if (!selectedMonth) {
      alert('Please select a month');
      return;
    }

    if (!unlockReason.trim()) {
      alert('Please provide a reason for unlocking payroll');
      return;
    }

    if (!confirm(`Unlock payroll for ${selectedMonth}?`)) return;

    setIsUnlockingPayroll(true);

    try {
      const result = await unlockPayroll(selectedMonth, unlockReason);

      if (result.success) {
        alert(`✅ ${result.message}`);
        setUnlockReason('');
        await fetchPayrollReport();
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsUnlockingPayroll(false);
    }
  };

  const fetchPayrollReport = async () => {
    if (!selectedMonth) return;

    try {
      const result = await getPayrollReport(selectedMonth);

      if (result.success && result.data) {
        setPayrollReports(result.data.reports);
      }
    } catch (error) {
      console.error('Failed to fetch payroll:', error);
    }
  };

  // --- NEW: Handle Device Reset ---
  const handleResetDevice = async (employeeId: string, employeeName: string) => {
    // Prevent bubbling if clicked inside accordion header
    if (!confirm(`Reset device binding for ${employeeName}? They will need to re-register their device.`)) return;
    
    const reason = prompt("Enter reason for reset (required):");
    if (!reason) return;

    try {
      const result = await resetEmployeeDevice(employeeId, reason);
      if (result.success) {
        alert('✅ Device reset successfully. Employee can now re-register.');
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  // --- NEW: Open Edit Modal ---
  const openEditModal = (day: any) => {
    if (!day.id) {
        alert("Cannot edit this record (ID missing). Please regenerate payroll.");
        return;
    }
    setEditingAttendance(day);
    // Reset inputs
    setEditCheckIn(''); 
    setEditCheckOut('');
    setEditReason('');
  };

  // --- NEW: Submit Attendance Edit ---
  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAttendance || !editReason) {
        alert("Reason is required");
        return;
    }

    try {
      const modifications: any = {};
      
      // If user entered time, assume it is for the record's date
      // NOTE: This assumes Local Time input. We append :00Z or convert as needed.
      // For simplicity in this demo, we assume the user inputs HH:MM and we append it to the date YYYY-MM-DD
      
      if (editCheckIn) {
        // Construct ISO string: "2024-01-20T09:00:00.000Z" (Assuming UTC/Server time expectation)
        // Or better, let the backend handle the date part if you send just time.
        // But your backend expects ISO strings. 
        // Let's attach the time to the date.
        modifications.checkInTime = `${editingAttendance.date}T${editCheckIn}:00.000Z`;
      }
      
      if (editCheckOut) {
        modifications.checkOutTime = `${editingAttendance.date}T${editCheckOut}:00.000Z`;
      }

      // Allow status change directly if needed, or let backend recalc based on time
      // modifications.status = 'present'; // Optional: Add a dropdown for status if you want manual override

      const result = await modifyAttendance(editingAttendance.id, editReason, modifications);
      
      if (result.success) {
        alert('✅ Attendance updated!');
        setEditingAttendance(null);
        fetchPayrollReport(); // Refresh data to show changes
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  useEffect(() => {
    if (selectedMonth && viewMode === 'payroll') {
      fetchPayrollReport();
    }
  }, [selectedMonth]);

  // ============================================
  // AUDIT TAB FUNCTIONS
  // ============================================

  const fetchAuditLogs = async (page: number, filter?: string) => {
    try {
      const offset = (page - 1) * AUDIT_LIMIT;
      const filters: any = {};

      if (filter) {
        filters.action = filter;
      }

      const result = await getAuditLogs(filters, AUDIT_LIMIT, offset);

      if (result.success && result.data) {
        setAuditLogs(result.data.logs);
        setAuditTotal(result.data.total);
        setAuditPage(page);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    }
  };

  const handleAuditFilterChange = (filter: string) => {
    setAuditFilter(filter);
    fetchAuditLogs(1, filter);
  };

  // ============================================
  // SETTINGS TAB FUNCTIONS
  // ============================================

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg('Updating...');

    try {
      const result = await apiChangePassword(oldPassword, newPassword);

      if (result.success) {
        setPasswordMsg('✅ Password changed successfully!');
        setOldPassword('');
        setNewPassword('');

        setTimeout(() => {
          setPasswordMsg('');
        }, 3000);
      } else {
        setPasswordMsg(`❌ ${result.message}`);
      }
    } catch (error: any) {
      setPasswordMsg(`❌ Error: ${error.message}`);
    }
  };

  const handleLogout = async () => {
    await apiLogout();
    router.push('/');
  };

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-400 font-mono">Loading Admin Panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white relative">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheckIcon className="w-8 h-8 text-cyan-400" />
            <div>
              <h1 className="text-xl font-bold">Admin Dashboard</h1>
              <p className="text-xs text-slate-400">{user?.name}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm font-bold text-red-400 hover:text-red-500 underline decoration-2"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-slate-800 border-b border-slate-700 px-4">
        <div className="max-w-7xl mx-auto flex gap-1 overflow-x-auto">
          {[
            { id: 'manage' as ViewMode, icon: UserPlusIcon, label: 'Manage' },
            { id: 'payroll' as ViewMode, icon: CurrencyRupeeIcon, label: 'Payroll' },
            { id: 'audit' as ViewMode, icon: ClipboardDocumentListIcon, label: 'Audit' },
            { id: 'settings' as ViewMode, icon: Cog6ToothIcon, label: 'Settings' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition whitespace-nowrap ${
                viewMode === tab.id
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-4">
        {/* MANAGE TAB */}
        {viewMode === 'manage' && (
          <div className="space-y-6">
            {/* Create Employee */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                <UserPlusIcon className="w-6 h-6" />
                Create New Employee
              </h2>
              <form onSubmit={handleCreateEmployee} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={newEmpName}
                  onChange={e => setNewEmpName(e.target.value)}
                  className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newEmpEmail}
                  onChange={e => setNewEmpEmail(e.target.value)}
                  className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={newEmpPassword}
                  onChange={e => setNewEmpPassword(e.target.value)}
                  className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
                  required
                />
                <input
                  type="number"
                  placeholder="Monthly Salary"
                  value={newEmpSalary}
                  onChange={e => setNewEmpSalary(e.target.value)}
                  className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
                  required
                />
                <input
                  type="date"
                  placeholder="Join Date"
                  value={newEmpJoinDate}
                  onChange={e => setNewEmpJoinDate(e.target.value)}
                  className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
                  required
                />
                <button
                  type="submit"
                  disabled={isCreatingEmp}
                  className="bg-cyan-600 hover:bg-cyan-700 px-6 py-3 rounded-lg font-bold transition disabled:opacity-50"
                >
                  {isCreatingEmp ? 'Creating...' : 'Create Employee'}
                </button>
              </form>
            </div>

            {/* Holiday Management */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                <CalendarDaysIcon className="w-6 h-6" />
                Holiday Management
              </h2>

              {/* Add Holiday Form */}
              <form onSubmit={handleAddHoliday} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <input
                  type="date"
                  value={newHolidayDate}
                  onChange={e => setNewHolidayDate(e.target.value)}
                  className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
                  required
                />
                <input
                  type="text"
                  placeholder="Holiday Name"
                  value={newHolidayName}
                  onChange={e => setNewHolidayName(e.target.value)}
                  className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
                  required
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={newHolidayDesc}
                  onChange={e => setNewHolidayDesc(e.target.value)}
                  className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
                />
                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold transition flex items-center justify-center gap-2"
                >
                  <PlusCircleIcon className="w-5 h-5" />
                  Add Holiday
                </button>
              </form>

              {/* Holidays List */}
              <div className="space-y-2">
                {holidays.length === 0 ? (
                  <p className="text-center text-slate-500 py-4">No holidays configured</p>
                ) : (
                  holidays.map(holiday => (
                    <div key={holiday.$id} className="flex items-center justify-between bg-slate-700 p-3 rounded-lg">
                      <div>
                        <p className="font-bold text-white">{holiday.name}</p>
                        <p className="text-sm text-slate-400">{holiday.date} - {holiday.description}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteHoliday(holiday.$id, holiday.name)}
                        className="text-red-400 hover:text-red-500 p-2"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* PAYROLL TAB */}
        {viewMode === 'payroll' && (
          <div className="space-y-6">
            {/* Month Selection and Actions */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-400 mb-2">Select Month</label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleGeneratePayroll}
                    disabled={isGeneratingPayroll || !selectedMonth}
                    className="bg-cyan-600 hover:bg-cyan-700 px-6 py-3 rounded-lg font-bold transition disabled:opacity-50 flex items-center gap-2"
                  >
                    <LockClosedIcon className="w-5 h-5" />
                    {isGeneratingPayroll ? 'Generating...' : 'Generate Payroll'}
                  </button>
                </div>
              </div>

              {/* Unlock Payroll Section */}
              {payrollReports.length > 0 && payrollReports[0]?.isLocked && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <h3 className="text-sm font-bold text-amber-400 mb-3">Unlock Payroll</h3>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Reason for unlocking (required)"
                      value={unlockReason}
                      onChange={e => setUnlockReason(e.target.value)}
                      className="flex-1 p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-amber-400"
                    />
                    <button
                      onClick={handleUnlockPayroll}
                      disabled={isUnlockingPayroll || !unlockReason.trim()}
                      className="bg-amber-600 hover:bg-amber-700 px-6 py-3 rounded-lg font-bold transition disabled:opacity-50 flex items-center gap-2"
                    >
                      <LockOpenIcon className="w-5 h-5" />
                      {isUnlockingPayroll ? 'Unlocking...' : 'Unlock'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Payroll Reports */}
            {payrollReports.length > 0 ? (
              <div className="grid gap-4">
                {payrollReports.map(report => (
                  <div key={report.employeeId} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                    <div
                      className="p-4 cursor-pointer hover:bg-slate-750 transition"
                      onClick={() => setSelectedReportId(selectedReportId === report.employeeId ? null : report.employeeId)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                             <h3 className="font-bold text-lg text-white">{report.employeeName}</h3>
                             {/* RESET DEVICE BUTTON ADDED HERE */}
                             <button
                               onClick={(e) => {
                                 e.stopPropagation(); 
                                 handleResetDevice(report.employeeId, report.employeeName);
                               }}
                               className="p-1 text-slate-500 hover:text-cyan-400 transition"
                               title="Reset Device Binding"
                             >
                               <DevicePhoneMobileIcon className="w-5 h-5" />
                             </button>
                          </div>
                          <p className="text-sm text-slate-400">
                            Base Salary: ₹{report.baseSalary} | Daily Rate: ₹{report.dailyRate}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-cyan-400">₹{report.netSalary}</p>
                          <p className="text-xs text-slate-400">
                            {report.isLocked ? '🔒 Locked' : '🔓 Unlocked'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-4 text-sm">
                        <div className="bg-green-900/30 px-3 py-2 rounded">
                          <p className="text-green-400 font-bold">{report.presentDays}</p>
                          <p className="text-xs text-slate-400">Present</p>
                        </div>
                        <div className="bg-yellow-900/30 px-3 py-2 rounded">
                          <p className="text-yellow-400 font-bold">{report.halfDays}</p>
                          <p className="text-xs text-slate-400">Half Day</p>
                        </div>
                        <div className="bg-red-900/30 px-3 py-2 rounded">
                          <p className="text-red-400 font-bold">{report.absentDays}</p>
                          <p className="text-xs text-slate-400">Absent</p>
                        </div>
                        <div className="bg-blue-900/30 px-3 py-2 rounded">
                          <p className="text-blue-400 font-bold">{report.sundayDays}</p>
                          <p className="text-xs text-slate-400">Sundays</p>
                        </div>
                        <div className="bg-purple-900/30 px-3 py-2 rounded">
                          <p className="text-purple-400 font-bold">{report.holidayDays}</p>
                          <p className="text-xs text-slate-400">Holidays</p>
                        </div>
                        <div className="bg-cyan-900/30 px-3 py-2 rounded">
                          <p className="text-cyan-400 font-bold">{report.leaveDays}</p>
                          <p className="text-xs text-slate-400">Leaves</p>
                        </div>
                      </div>
                    </div>

                    {/* Daily Breakdown */}
                    {selectedReportId === report.employeeId && report.dailyBreakdown && (
                      <div className="border-t border-slate-700 p-4 bg-slate-900/50">
                        <h4 className="font-bold text-cyan-400 mb-3">Daily Breakdown</h4>
                        <div className="max-h-96 overflow-y-auto space-y-1">
                          {report.dailyBreakdown.map((day: any, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-slate-800 p-2 rounded text-sm">
                              <div className="flex items-center gap-3">
                                <span className="text-slate-400 w-24">{day.date}</span>
                                <span className="text-slate-400 w-12">{day.day}</span>
                                <span className={`font-bold w-24 ${
                                  day.status === 'Present' ? 'text-green-400' :
                                  day.status === 'Half-Day' ? 'text-yellow-400' :
                                  day.status === 'Absent' ? 'text-red-400' :
                                  day.status === 'Sunday' ? 'text-blue-400' :
                                  day.status === 'Holiday' ? 'text-purple-400' :
                                  'text-slate-400'
                                }`}>
                                  {day.status}
                                </span>
                                {/* EDIT BUTTON ADDED HERE */}
                                <button 
                                  onClick={() => openEditModal(day)}
                                  className="text-slate-500 hover:text-cyan-400 p-1"
                                  title="Edit Attendance"
                                >
                                  <PencilSquareIcon className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="flex items-center gap-4 text-xs">
                                <span className="text-slate-400">{day.checkIn}</span>
                                <span className="text-slate-600">→</span>
                                <span className="text-slate-400">{day.checkOut}</span>
                                <span className="text-cyan-400 w-16 text-right">{day.hours.toFixed(1)}h</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-800 rounded-lg p-12 border border-slate-700 text-center">
                <CurrencyRupeeIcon className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No payroll data for selected month</p>
                <p className="text-sm text-slate-500 mt-2">Select a month and generate payroll to view reports</p>
              </div>
            )}
          </div>
        )}

        {/* AUDIT TAB */}
        {viewMode === 'audit' && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 flex items-center gap-4">
              <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter by action (e.g., check-in, check-out)..."
                value={auditFilter}
                onChange={e => handleAuditFilterChange(e.target.value)}
                className="flex-1 p-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
              />
            </div>

            {/* Audit Logs */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto">
                {auditLogs.length === 0 ? (
                  <div className="p-12 text-center">
                    <ClipboardDocumentListIcon className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No audit logs found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-700">
                    {auditLogs.map(log => (
                      <div key={log.id} className="p-4 hover:bg-slate-750 transition">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${
                                log.action === 'check-in' ? 'bg-green-900/50 text-green-400' :
                                log.action === 'check-out' ? 'bg-red-900/50 text-red-400' :
                                'bg-cyan-900/50 text-cyan-400'
                              }`}>
                                {log.action}
                              </span>
                              <span className="font-bold text-white">{log.actorName}</span>
                              {log.signatureVerified && (
                                <ShieldCheckIcon className="w-4 h-4 text-green-400" title="Signature Verified" />
                              )}
                            </div>
                            <p className="text-sm text-slate-400 mb-1">{log.details}</p>
                            <p className="text-xs text-slate-500">{formatDateTime(log.timestamp)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {auditTotal > AUDIT_LIMIT && (
                <div className="border-t border-slate-700 p-4 flex items-center justify-between">
                  <p className="text-sm text-slate-400">
                    Showing {(auditPage - 1) * AUDIT_LIMIT + 1} - {Math.min(auditPage * AUDIT_LIMIT, auditTotal)} of {auditTotal}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchAuditLogs(auditPage - 1)}
                      disabled={auditPage === 1}
                      className="px-4 py-2 bg-slate-700 rounded-lg font-bold hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => fetchAuditLogs(auditPage + 1)}
                      disabled={auditPage * AUDIT_LIMIT >= auditTotal}
                      className="px-4 py-2 bg-slate-700 rounded-lg font-bold hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {viewMode === 'settings' && (
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 max-w-md">
              <h2 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                <Cog6ToothIcon className="w-6 h-6" />
                Change Password
              </h2>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Old Password</label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
                    required
                  />
                </div>

                {passwordMsg && (
                  <div className={`p-3 rounded-lg font-bold text-sm ${
                    passwordMsg.includes('❌') ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'
                  }`}>
                    {passwordMsg}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-cyan-600 hover:bg-cyan-700 px-6 py-3 rounded-lg font-bold transition"
                >
                  Update Password
                </button>
              </form>
            </div>
          </div>
        )}

        {/* --- EDIT ATTENDANCE MODAL (ADDED) --- */}
        {editingAttendance && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700">
              <h3 className="text-xl font-bold text-white mb-4">Edit Attendance ({editingAttendance.date})</h3>
              <form onSubmit={handleSubmitEdit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">New Check-In (HH:MM)</label>
                  <input 
                    type="time" 
                    value={editCheckIn} 
                    onChange={e => setEditCheckIn(e.target.value)}
                    className="w-full p-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">New Check-Out (HH:MM)</label>
                  <input 
                    type="time" 
                    value={editCheckOut} 
                    onChange={e => setEditCheckOut(e.target.value)}
                    className="w-full p-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Reason (Required)</label>
                  <input 
                    type="text" 
                    required
                    value={editReason} 
                    onChange={e => setEditReason(e.target.value)}
                    placeholder="e.g. Forgot to punch out"
                    className="w-full p-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setEditingAttendance(null)}
                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded font-bold transition"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-700 rounded font-bold transition"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}