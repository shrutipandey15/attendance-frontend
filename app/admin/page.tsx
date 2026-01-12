'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCurrentUser,
  logout as apiLogout,
  changePassword as apiChangePassword,
  createEmployee,
  updateEmployee,
  getPayrollReport,
  generatePayroll,
  unlockPayroll,
  createHoliday,
  deleteHoliday,
  getHolidays,
  getAuditLogs,
  modifyAttendance,
  resetEmployeeDevice,
  addOfficeLocation,
  getEmployees,
  deletePayroll
} from '../../lib/api';
import type { User, PayrollRecord, Holiday, AuditLog } from '../../lib/api';
import {
  ShieldCheckIcon, UserPlusIcon, CalendarDaysIcon, CurrencyRupeeIcon,
  ClipboardDocumentListIcon, Cog6ToothIcon, PlusCircleIcon, TrashIcon,
  MagnifyingGlassIcon, LockOpenIcon, LockClosedIcon, 
  PencilSquareIcon, DevicePhoneMobileIcon, MapPinIcon,
  ChevronDownIcon, UserIcon, XMarkIcon
} from '@heroicons/react/24/outline';

type ViewMode = 'manage' | 'payroll' | 'audit' | 'settings';

const getCurrentLocation = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
    } else {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    }
  });
};

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

  // Employee Dropdown & Edit State
  const [empFilter, setEmpFilter] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [showEmpList, setShowEmpList] = useState(false);
  const empDropdownRef = useRef<HTMLDivElement>(null);
  
  const [isEditingEmp, setIsEditingEmp] = useState(false);
  const [editEmpForm, setEditEmpForm] = useState({
    name: '',
    email: '',
    salary: '',
    joinDate: '',
    isActive: true
  });

  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDesc, setNewHolidayDesc] = useState('');
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  // Office Location State
  const [officeName, setOfficeName] = useState('');
  const [officeLat, setOfficeLat] = useState('');
  const [officeLng, setOfficeLng] = useState('');
  const [officeRadius, setOfficeRadius] = useState('100');
  const [isGettingLoc, setIsGettingLoc] = useState(false);

  // Payroll Tab State
  const [selectedMonth, setSelectedMonth] = useState('');
  const [payrollReports, setPayrollReports] = useState<PayrollRecord[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [isGeneratingPayroll, setIsGeneratingPayroll] = useState(false);
  const [isUnlockingPayroll, setIsUnlockingPayroll] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');

  // Attendance Editing State
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
    const savedTab = localStorage.getItem('adminViewMode');
    if (savedTab) {
      setViewMode(savedTab as ViewMode);
    }
    
    const handleClickOutside = (event: MouseEvent) => {
      if (empDropdownRef.current && !empDropdownRef.current.contains(event.target as Node)) {
        setShowEmpList(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeTab = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('adminViewMode', mode);
  };
  useEffect(() => {
    checkAdminSession();
  }, []);

  useEffect(() => {
    if (viewMode === 'manage') {
      fetchHolidays();
      fetchEmployees();
    } else if (viewMode === 'payroll') {
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
        fetchEmployees(); 
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsCreatingEmp(false);
    }
  };

  const startEditing = (emp: any) => {
    setEditEmpForm({
      name: emp.name,
      email: emp.email,
      salary: emp.salaryMonthly.toString(),
      joinDate: emp.joinDate ? emp.joinDate.split('T')[0] : '',
      isActive: emp.isActive
    });
    setIsEditingEmp(true);
  };

  const handleSubmitUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId) return;

    try {
      const result = await updateEmployee(selectedEmpId, {
          name: editEmpForm.name,
          email: editEmpForm.email,
          salary: parseFloat(editEmpForm.salary),
          joinDate: editEmpForm.joinDate,
          isActive: editEmpForm.isActive
      });

      if (result.success) {
          alert('✅ Employee updated successfully!');
          setIsEditingEmp(false);
          fetchEmployees(); // Refresh list to show new data
      } else {
          alert(`❌ ${result.message}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
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

  const handleAddOffice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!officeLat || !officeLng) {
      alert("Latitude and Longitude are required");
      return;
    }
    try {
      const result = await addOfficeLocation(
        officeName, 
        parseFloat(officeLat), 
        parseFloat(officeLng), 
        parseInt(officeRadius)
      );
      if (result.success) {
        alert('✅ Office Location Added! Employees can now check in here.');
        setOfficeName('');
        setOfficeLat('');
        setOfficeLng('');
        setOfficeRadius('100');
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleGetMyLocation = async () => {
    setIsGettingLoc(true);
    try {
      const pos = await getCurrentLocation();
      setOfficeLat(pos.coords.latitude.toFixed(6));
      setOfficeLng(pos.coords.longitude.toFixed(6));
    } catch (error: any) {
      alert("Could not get location. Ensure GPS is enabled.");
    } finally {
      setIsGettingLoc(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const result = await getEmployees();
      if (result.success && result.data) {
        setEmployees(result.data.employees);
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(empFilter.toLowerCase()) || 
    emp.email.toLowerCase().includes(empFilter.toLowerCase())
  );

  const selectedEmployee = employees.find(e => e.$id === selectedEmpId);

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

  const handleResetPayroll = async () => {
    if (!selectedMonth) return;
    const confirmReset = prompt(
      `⚠️ WARNING: This will DELETE all payroll and attendance calculations for ${selectedMonth}.\n\n` +
      `This is required if you added new employees and want to include them.\n\n` +
      `Type "DELETE" to confirm:`
    );
    if (confirmReset !== "DELETE") return;
    const reason = prompt("Reason for resetting (required):");
    if (!reason) return;
    try {
      const result = await deletePayroll(selectedMonth, reason);
      if (result.success) {
        alert(`Payroll reset successfully. You can now Generate it again.`);
        setPayrollReports([]);
        await fetchPayrollReport();
      } else {
        alert(`${result.message}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
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

  const handleResetDevice = async (employeeId: string, employeeName: string) => {
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

  const openEditModal = (day: any) => {
    if (!day.id) {
        alert("Cannot edit this record (ID missing). Please regenerate payroll.");
        return;
    }
    setEditingAttendance(day);
    setEditCheckIn(''); 
    setEditCheckOut('');
    setEditReason('');
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAttendance || !editReason) {
        alert("Reason is required");
        return;
    }
    try {
      const modifications: any = {};
      const baseDate = editingAttendance.date;
      if (editCheckIn) {
         const localDate = new Date(`${baseDate}T${editCheckIn}`);
         modifications.checkInTime = localDate.toISOString(); 
      }
      if (editCheckOut) {
         const localDate = new Date(`${baseDate}T${editCheckOut}`);
         modifications.checkOutTime = localDate.toISOString();
      }
      const result = await modifyAttendance(editingAttendance.id, editReason, modifications);
      if (result.success) {
        alert('✅ Attendance updated!');
        setEditingAttendance(null);
        fetchPayrollReport();
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
              onClick={() => changeTab(tab.id)}
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
            
            {/* EMPLOYEE FINDER & DETAILS SECTION */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-4">
              <h2 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
                <ClipboardDocumentListIcon className="w-6 h-6" />
                Find Employee
              </h2>

              {/* Searchable Dropdown Container */}
              <div className="relative" ref={empDropdownRef}>
                <div className="flex items-center gap-2 bg-slate-700 border border-slate-600 rounded-lg p-2 focus-within:ring-2 focus-within:ring-cyan-400">
                  <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 ml-2" />
                  <input
                    type="text"
                    placeholder="Search employee by name or email..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-slate-400 outline-none h-8"
                    value={empFilter}
                    onChange={(e) => {
                      setEmpFilter(e.target.value);
                      setShowEmpList(true);
                      if (!e.target.value) setSelectedEmpId(null);
                    }}
                    onFocus={() => setShowEmpList(true)}
                  />
                  {selectedEmpId ? (
                    <button 
                       onClick={() => { setSelectedEmpId(null); setEmpFilter(''); setIsEditingEmp(false); }}
                       className="text-slate-400 hover:text-white"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  ) : (
                    <ChevronDownIcon className="w-5 h-5 text-slate-400 mr-2" />
                  )}
                </div>

                {/* Dropdown List */}
                {showEmpList && (
                  <div className="absolute z-50 w-full mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {filteredEmployees.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-sm">No matches found</div>
                    ) : (
                      filteredEmployees.map(emp => (
                        <div
                          key={emp.$id}
                          className="px-4 py-3 hover:bg-slate-700 cursor-pointer border-b border-slate-700 last:border-0 transition"
                          onClick={() => {
                            setSelectedEmpId(emp.$id);
                            setEmpFilter(emp.name);
                            setShowEmpList(false);
                            setIsEditingEmp(false);
                          }}
                        >
                          <p className="font-bold text-white">{emp.name}</p>
                          <p className="text-xs text-slate-400">{emp.email}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Selected Employee Details Card OR Edit Form */}
              {selectedEmployee && (
                <div className="mt-6 bg-slate-750 border border-slate-600 rounded-lg p-6 animate-fade-in relative">
                  
                  {!isEditingEmp ? (
                    // === VIEW MODE ===
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center border ${
                          selectedEmployee.isActive ? 'bg-cyan-900/50 text-cyan-400 border-cyan-800' : 'bg-red-900/50 text-red-400 border-red-800'
                        }`}>
                          <UserIcon className="w-8 h-8" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-white">{selectedEmployee.name}</h3>
                          <p className="text-slate-400">{selectedEmployee.email}</p>
                          <div className="flex gap-2 mt-2">
                             <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                selectedEmployee.isActive 
                                  ? 'bg-green-900/50 text-green-400 border border-green-800' 
                                  : 'bg-red-900/50 text-red-400 border border-red-800'
                              }`}>
                                {selectedEmployee.isActive ? 'Active' : 'Inactive'}
                              </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right space-y-1">
                        <p className="text-xs text-slate-400 uppercase font-bold">Monthly Salary</p>
                        <p className="text-2xl font-mono text-cyan-400">₹{selectedEmployee.salaryMonthly?.toLocaleString()}</p>
                        <p className="text-xs text-slate-500 pt-2">Joined: {new Date(selectedEmployee.joinDate).toLocaleDateString()}</p>
                        
                        {/* Edit Button */}
                        <button 
                          onClick={() => startEditing(selectedEmployee)}
                          className="mt-4 flex items-center gap-2 text-sm font-bold text-cyan-400 hover:text-cyan-300 bg-slate-800 px-3 py-2 rounded border border-slate-600 hover:border-cyan-400 transition ml-auto"
                        >
                          <PencilSquareIcon className="w-4 h-4" /> Edit Profile
                        </button>
                      </div>
                    </div>
                  ) : (
                    // === EDIT MODE ===
                    <form onSubmit={handleSubmitUpdateEmployee} className="space-y-4">
                      <div className="flex items-center justify-between mb-4 border-b border-slate-600 pb-2">
                        <h3 className="font-bold text-white flex items-center gap-2">
                          <PencilSquareIcon className="w-5 h-5 text-cyan-400" />
                          Edit Employee
                        </h3>
                        <button 
                           type="button" 
                           onClick={() => setIsEditingEmp(false)}
                           className="text-slate-400 hover:text-white"
                        >
                           <XMarkIcon className="w-6 h-6" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label className="text-xs font-bold text-slate-400 uppercase">Full Name</label>
                            <input 
                              type="text" 
                              value={editEmpForm.name}
                              onChange={e => setEditEmpForm({...editEmpForm, name: e.target.value})}
                              className="w-full mt-1 p-2 bg-slate-900 border border-slate-600 rounded text-white"
                            />
                         </div>
                         <div>
                            <label className="text-xs font-bold text-slate-400 uppercase">Email</label>
                            <input 
                              type="email" 
                              value={editEmpForm.email}
                              onChange={e => setEditEmpForm({...editEmpForm, email: e.target.value})}
                              className="w-full mt-1 p-2 bg-slate-900 border border-slate-600 rounded text-white"
                            />
                         </div>
                         <div>
                            <label className="text-xs font-bold text-slate-400 uppercase">Monthly Salary (₹)</label>
                            <input 
                              type="number" 
                              value={editEmpForm.salary}
                              onChange={e => setEditEmpForm({...editEmpForm, salary: e.target.value})}
                              className="w-full mt-1 p-2 bg-slate-900 border border-slate-600 rounded text-white font-mono text-cyan-400"
                            />
                         </div>
                         <div>
                            <label className="text-xs font-bold text-slate-400 uppercase">Join Date</label>
                            <input 
                              type="date" 
                              value={editEmpForm.joinDate}
                              onChange={e => setEditEmpForm({...editEmpForm, joinDate: e.target.value})}
                              className="w-full mt-1 p-2 bg-slate-900 border border-slate-600 rounded text-white"
                            />
                         </div>
                      </div>

                      <div className="pt-2">
                         <label className="flex items-center gap-2 cursor-pointer group">
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors ${editEmpForm.isActive ? 'bg-green-600' : 'bg-slate-600'}`}>
                               <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${editEmpForm.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                            <input 
                               type="checkbox" 
                               className="hidden" 
                               checked={editEmpForm.isActive} 
                               onChange={e => setEditEmpForm({...editEmpForm, isActive: e.target.checked})} 
                            />
                            <span className="text-sm font-bold text-slate-300 group-hover:text-white">
                               {editEmpForm.isActive ? 'Account is Active' : 'Account is Inactive (Cannot Login)'}
                            </span>
                         </label>
                      </div>

                      <div className="flex gap-3 pt-2">
                         <button 
                           type="submit" 
                           className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 rounded transition"
                         >
                            Save Changes
                         </button>
                         <button 
                           type="button" 
                           onClick={() => setIsEditingEmp(false)} 
                           className="px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded transition border border-slate-600"
                         >
                            Cancel
                         </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Create Employee (Collapsed/Compact version could be nice, but keeping full for now) */}
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

            {/* Office Locations Management */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                <MapPinIcon className="w-6 h-6" />
                Office Locations
              </h2>
              
              <form onSubmit={handleAddOffice} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Location Name (e.g. HQ)"
                      value={officeName}
                      onChange={e => setOfficeName(e.target.value)}
                      className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                      required
                    />
                     <input
                      type="number"
                      placeholder="Radius (Meters)"
                      value={officeRadius}
                      onChange={e => setOfficeRadius(e.target.value)}
                      className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                      required
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex gap-2">
                        <input
                          type="number"
                          step="any"
                          placeholder="Latitude"
                          value={officeLat}
                          onChange={e => setOfficeLat(e.target.value)}
                          className="flex-1 p-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                          required
                        />
                         <input
                          type="number"
                          step="any"
                          placeholder="Longitude"
                          value={officeLng}
                          onChange={e => setOfficeLng(e.target.value)}
                          className="flex-1 p-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
                          required
                        />
                    </div>
                    <button
                      type="button"
                      onClick={handleGetMyLocation}
                      disabled={isGettingLoc}
                      className="bg-slate-700 hover:bg-slate-600 border border-slate-600 text-cyan-400 px-4 py-3 rounded-lg font-bold transition flex items-center justify-center gap-2"
                    >
                      <MapPinIcon className="w-5 h-5" />
                      {isGettingLoc ? "Locating..." : "Get My Current Location"}
                    </button>
                </div>
                
                <button
                  type="submit"
                  className="w-full bg-cyan-600 hover:bg-cyan-700 px-6 py-3 rounded-lg font-bold transition"
                >
                  Add Office Location
                </button>
              </form>
            </div>

            {/* Holiday Management */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                <CalendarDaysIcon className="w-6 h-6" />
                Holiday Management
              </h2>

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

              {/* Payroll Actions: Unlock & Reset */}
              {payrollReports.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700 space-y-4">
                  
                  {/* UNLOCK SECTION (Only if Locked) */}
                  {payrollReports[0]?.isLocked && (
                    <div>
                      <h3 className="text-sm font-bold text-amber-400 mb-2">Unlock for Editing</h3>
                      <div className="flex gap-3">
                        <input 
                          type="text" 
                          placeholder="Reason (required)" 
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

                  {/* RESET SECTION (Always visible if payroll exists) */}
                  <div>
                    <h3 className="text-sm font-bold text-red-400 mb-2">Danger Zone</h3>
                    <div className="flex items-center justify-between bg-red-900/20 p-3 rounded-lg border border-red-900/50">
                      <p className="text-sm text-red-200">
                        Missing an employee? Resetting will delete this report and allow you to Regenerate.
                      </p>
                      <button 
                        onClick={handleResetPayroll}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-bold text-sm transition flex items-center gap-2"
                      >
                        <TrashIcon className="w-4 h-4" />
                        Reset Payroll
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </div>

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

        {/* EDIT ATTENDANCE MODAL */}
        {editingAttendance && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700">
              <h3 className="text-xl font-bold text-white mb-4">Edit Attendance ({editingAttendance.date})</h3>
              <form onSubmit={handleSubmitEdit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    New Check-In <span className="text-cyan-600">(24-hour format, e.g., 13:00)</span>
                  </label>
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