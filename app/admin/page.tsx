"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { databases, functions, account } from "../../lib/appwrite";
import { Query, Models, ID } from "appwrite";
import { 
    ShieldCheckIcon, UserPlusIcon, XCircleIcon, CalendarDaysIcon, CurrencyRupeeIcon, ClipboardDocumentListIcon, ShieldExclamationIcon, ArrowLeftOnRectangleIcon, MagnifyingGlassIcon, PlusCircleIcon, TrashIcon, Cog6ToothIcon
} from '@heroicons/react/24/outline'; 

import { 
    DB_ID, 
    FUNCTION_ID, 
    EMPLOYEE_COLLECTION, 
    AUDIT_COLLECTION,
    HOLIDAY_COLLECTION,
    LEAVE_COLLECTION 
} from '../../lib/constants'; 
import { formatTimestamp } from '../../lib/utils'; 
import { addManualLog, deleteLog } from '../../lib/adminService';

interface AuditLogDocument extends Models.Document {
  timestamp: string;
  actorId: string;
  action: string;
  payload: string;
}
interface HolidayDocument extends Models.Document {
  date: string;
  name: string;
}
interface LeaveDocument extends Models.Document {
  employeeId: string;
  date: string;
  type: string;
  status: string;
}
interface EmployeeProfile extends Models.Document {
  name: string;
  email: string;
  salaryMonthly: number;
  deviceFingerprint?: string;
  joinDate: string;
}

type DailyStatus =
  | "Present"
  | "Absent"
  | "Half-Day"
  | "Weekend"
  | "Holiday"
  | "Leave"
  | "Pre-Employment";

interface DailyRecord {
  date: string;
  day: string;
  status: DailyStatus;
  inT: string;
  outT: string;
  dur: number;
  ot: number;
  notes: string;
}

interface PayrollReport {
  employeeId: string;
  employeeName: string;
  month: string;
  netSalary: string;
  presentDays: number;
  absentDays: number;
  holidayDays: number;
  paidLeaveDays: number;
  halfDays: number;
  dailyBreakdown: DailyRecord[];
}

interface ParsedLog extends AuditLogDocument {
  employeeName: string;
  device: string;
}

type ViewMode = "audit" | "payroll" | "manage" | "settings";

export default function AdminDashboard() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("manage");
  const [reports, setReports] = useState<PayrollReport[]>([]);
  
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [empPage, setEmpPage] = useState(1);
  const [empTotal, setEmpTotal] = useState(0);
  const EMP_LIMIT = 20;

  const [holidays, setHolidays] = useState<HolidayDocument[]>([]);

  const [logs, setLogs] = useState<ParsedLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [auditFilter, setAuditFilter] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const AUDIT_LIMIT = 20;

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [leaveEmpId, setLeaveEmpId] = useState("");
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveType, setLeaveType] = useState("Sick");

  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpEmail, setNewEmpEmail] = useState("");
  const [newEmpPass, setNewEmpPass] = useState("");
  const [newEmpSalary, setNewEmpSalary] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [manualEmpId, setManualEmpId] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualAction, setManualAction] = useState<"check-in" | "check-out">("check-in");
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [isUpdatingAuth, setIsUpdatingAuth] = useState(false);

  const selectedReport = reports.find(r => r.employeeId === selectedReportId);

  const fetchEmployees = async (page: number) => {
    try {
      const offset = (page - 1) * EMP_LIMIT;
      const empRes = await databases.listDocuments<EmployeeProfile>(
        DB_ID, 
        EMPLOYEE_COLLECTION,
        [
          Query.limit(EMP_LIMIT),
          Query.offset(offset),
          Query.orderAsc("name"),
        ]
      );
      setEmployees(empRes.documents);
      setEmpTotal(empRes.total);
      setEmpPage(page);
    } catch (error) {
      console.error("Failed to fetch employee list", error);
    }
  };

  const fetchAuditLogs = async (page: number, filterTerm: string = auditFilter) => {
    try {
      const offset = (page - 1) * AUDIT_LIMIT;
      const queries = [
          Query.limit(AUDIT_LIMIT),
          Query.offset(offset),
          Query.orderDesc("timestamp"),
      ];
      if (filterTerm) {
          queries.push(Query.search('payload', filterTerm)); 
      }
      const res = await databases.listDocuments<AuditLogDocument>(DB_ID, AUDIT_COLLECTION, queries);
      const parsed: ParsedLog[] = await Promise.all(
        res.documents.map(async (log) => {
          let payload: { employeeName?: string; device?: string } = {};
          try { payload = JSON.parse(log.payload); } catch {}
          const employeeName = payload?.employeeName || "Unknown";
          const device = payload?.device || "-";
          return { ...log, employeeName, device };
        })
      );
      setLogs(parsed);
      setAuditTotal(res.total);
      setAuditPage(page);
    } catch (error) {
      console.error("Failed to fetch logs", error);
    }
  };

  const fetchHolidays = async () => {
    try {
      const res = await databases.listDocuments<HolidayDocument>(
        DB_ID,
        HOLIDAY_COLLECTION,
        [Query.limit(100), Query.orderAsc("date")]
      );
      setHolidays(res.documents);
    } catch (error) {
      console.error("Failed to fetch holidays", error);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await account.get();
      } catch {
        router.replace("/admin-login");
        return;
      }
      await fetchEmployees(1);
      await fetchAuditLogs(1);
      await fetchHolidays();
      setIsLoading(false);
    };
    init();
  }, [router]);

  useEffect(() => { 
    const load = async () => await fetchAuditLogs(auditPage);
    load();
  }, [auditPage]);
  
  useEffect(() => { 
    const load = async () => await fetchEmployees(empPage);
    load();
  }, [empPage]);

  const handleDeleteHoliday = async (id: string) => {
    try {
      await databases.deleteDocument(DB_ID, HOLIDAY_COLLECTION, id);
      await fetchHolidays();
    } catch (error) {
      alert("Failed to delete holiday");
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await databases.createDocument(DB_ID, HOLIDAY_COLLECTION, ID.unique(), {
        date: newHolidayDate,
        name: newHolidayName,
      });
      await fetchHolidays();
      setNewHolidayDate("");
      setNewHolidayName("");
    } catch (error) {
      alert("Failed to add holiday");
    }
  };

  const handleApproveLeave = async (empId: string, date: string) => {
    try {
      await databases.createDocument(DB_ID, LEAVE_COLLECTION, ID.unique(), {
        employeeId: empId,
        date,
        type: leaveType,
        status: "Approved",
      });
      alert("Leave approved");
      setLeaveEmpId("");
      setLeaveDate("");
    } catch (error) {
      alert("Failed to approve leave");
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const execution = await functions.createExecution(FUNCTION_ID, JSON.stringify({
        action: "create_employee",
        data: {
          name: newEmpName,
          email: newEmpEmail,
          password: newEmpPass,
          salary: Number(newEmpSalary),
        }
      }));
      
      const response = JSON.parse(execution.responseBody);
      
      if (response.success) {
        alert("Employee created successfully");
        await fetchEmployees(1);
        // Clear form only on success
        setNewEmpName("");
        setNewEmpEmail("");
        setNewEmpPass("");
        setNewEmpSalary("");
      } else {
        alert(`Failed: ${response.message || "Unknown error"}`);
      }
    } catch (error) {
      alert("Failed to create employee");
    }
    setIsCreating(false);
  };

  const handleGenerateReport = async () => {
    try {
      const resp = await functions.createExecution(
        FUNCTION_ID,
        JSON.stringify({ action: "get_payroll_report" })
      );
      const output = JSON.parse(resp.responseBody);
      setReports(output.reports);
    } catch (error) {
      alert("Failed to generate report");
    }
  };

  const handleManualEntry = async () => {
    if (!manualEmpId || !manualDate) {
      alert("Fill all fields");
      return;
    }
    setIsManualSubmitting(true);
    try {
      await addManualLog(manualEmpId, manualAction, new Date(manualDate));
      await fetchAuditLogs(auditPage);
      setManualEmpId("");
      setManualDate("");
      alert("Manual entry added");
    } catch (error) {
      alert("Failed to add entry");
    }
    setIsManualSubmitting(false);
  };

  const handleDeleteLog = async (logId: string) => {
    if (!confirm("Delete this log?")) return;
    try {
      await deleteLog(logId);
      await fetchAuditLogs(auditPage);
    } catch (error) {
      alert("Failed to delete log");
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingAuth(true);
    try {
      await account.updatePassword(newPass, oldPass);
      alert("Password updated successfully");
      setOldPass("");
      setNewPass("");
    } catch (error) {
      alert("Failed to update password");
    }
    setIsUpdatingAuth(false);
  };

  const handleLogout = async () => {
    try {
      await account.deleteSession("current");
      router.replace("/admin-login");
    } catch {}
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <ShieldCheckIcon className="w-16 h-16 sm:w-20 sm:h-20 text-cyan-500 mx-auto mb-4 animate-pulse" />
          <p className="text-xl sm:text-2xl font-bold text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 shadow-lg">
        <div className="px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h1 className="text-lg sm:text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 flex items-center gap-2">
              <ShieldCheckIcon className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-500" />
              <span className="hidden sm:inline">Guardian Admin</span>
              <span className="sm:hidden">Admin</span>
            </h1>
          </div>
          
          {/* Mobile-optimized navigation - horizontal scroll on small screens */}
          <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-hide">
            <div className="flex gap-2 min-w-max sm:min-w-0">
              <button onClick={() => setViewMode("manage")} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-semibold text-xs sm:text-sm transition-all whitespace-nowrap ${viewMode === "manage" ? "bg-cyan-600 text-white shadow-lg" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                <UserPlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Manage</span>
              </button>
              <button onClick={() => setViewMode("payroll")} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-semibold text-xs sm:text-sm transition-all whitespace-nowrap ${viewMode === "payroll" ? "bg-cyan-600 text-white shadow-lg" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                <CurrencyRupeeIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Payroll</span>
              </button>
              <button onClick={() => setViewMode("audit")} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-semibold text-xs sm:text-sm transition-all whitespace-nowrap ${viewMode === "audit" ? "bg-cyan-600 text-white shadow-lg" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                <ClipboardDocumentListIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Audit</span>
              </button>
              <button onClick={() => setViewMode("settings")} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-semibold text-xs sm:text-sm transition-all whitespace-nowrap ${viewMode === "settings" ? "bg-cyan-600 text-white shadow-lg" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                <Cog6ToothIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-6 py-4 sm:py-6 pb-safe">
        {!isLoading && viewMode === "manage" && (
          <div className="space-y-4 sm:space-y-6">
            <div className="bg-slate-800 rounded-lg sm:rounded-xl shadow-lg border border-slate-700 overflow-hidden">
              <h2 className="font-bold text-base sm:text-xl p-3 sm:p-4 text-cyan-400 flex items-center gap-2 border-b border-slate-700">
                <UserPlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                Create Employee
              </h2>
              <form onSubmit={handleCreateEmployee} className="p-3 sm:p-6" autoComplete="off">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <input required placeholder="Full Name" autoComplete="off" className="p-2.5 sm:p-3 rounded bg-slate-700 text-white border border-slate-600 text-sm focus:ring-1 focus:ring-cyan-500 outline-none" value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} />
                  <input required type="email" placeholder="Email" autoComplete="off" className="p-2.5 sm:p-3 rounded bg-slate-700 text-white border border-slate-600 text-sm focus:ring-1 focus:ring-cyan-500 outline-none" value={newEmpEmail} onChange={(e) => setNewEmpEmail(e.target.value)} />
                  <input required type="password" minLength={8} placeholder="Password" autoComplete="new-password" className="p-2.5 sm:p-3 rounded bg-slate-700 text-white border border-slate-600 text-sm focus:ring-1 focus:ring-cyan-500 outline-none" value={newEmpPass} onChange={(e) => setNewEmpPass(e.target.value)} />
                  <input required type="number" placeholder="Monthly Salary (₹)" autoComplete="off" className="p-2.5 sm:p-3 rounded bg-slate-700 text-white border border-slate-600 text-sm focus:ring-1 focus:ring-cyan-500 outline-none" value={newEmpSalary} onChange={(e) => setNewEmpSalary(e.target.value)} />
                </div>
                <button disabled={isCreating} className="mt-3 sm:mt-4 w-full bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 sm:py-3 rounded-lg font-bold text-sm transition shadow-lg disabled:opacity-50 active:scale-95">
                  {isCreating ? "Creating..." : "Create Employee"}
                </button>
              </form>
            </div>

            <div className="bg-slate-800 rounded-lg sm:rounded-xl shadow-lg border border-slate-700 overflow-hidden">
              <h2 className="font-bold text-base sm:text-xl p-3 sm:p-4 text-cyan-400 flex items-center gap-2 border-b border-slate-700">
                <CalendarDaysIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                Holidays
              </h2>
              <form onSubmit={handleAddHoliday} className="p-3 sm:p-4 bg-slate-900/50 border-b border-slate-700">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input required type="date" className="flex-1 p-2.5 sm:p-3 rounded bg-slate-700 text-white border border-slate-600 text-sm" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} />
                  <input required placeholder="Holiday Name" className="flex-1 p-2.5 sm:p-3 rounded bg-slate-700 text-white border border-slate-600 text-sm" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} />
                  <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 sm:py-3 rounded font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition">
                    <PlusCircleIcon className="w-4 h-4" /> Add
                  </button>
                </div>
              </form>
              <div className="divide-y divide-slate-700 max-h-64 sm:max-h-80 overflow-y-auto">
                {holidays.map((h) => (
                  <div key={h.$id} className="p-3 sm:p-4 flex items-center justify-between hover:bg-slate-700/50 transition">
                    <div>
                      <p className="font-semibold text-white text-sm">{h.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{h.date}</p>
                    </div>
                    <button onClick={() => handleDeleteHoliday(h.$id)} className="text-red-400 hover:text-red-300 p-2 rounded-full hover:bg-red-900/30 transition active:scale-95" title="Delete">
                      <TrashIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg sm:rounded-xl shadow-lg border border-slate-700 overflow-hidden">
              <h2 className="font-bold text-base sm:text-xl p-3 sm:p-4 text-cyan-400 flex items-center gap-2 border-b border-slate-700">
                <ShieldExclamationIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                Approve Leave
              </h2>
              <div className="p-3 sm:p-6">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <select className="flex-1 p-2.5 sm:p-3 rounded bg-slate-700 text-white border border-slate-600 text-sm" value={leaveEmpId} onChange={(e) => setLeaveEmpId(e.target.value)}>
                    <option value="">Select Employee</option>
                    {employees.map((e) => <option key={e.$id} value={e.$id}>{e.name}</option>)}
                  </select>
                  <select className="flex-1 p-2.5 sm:p-3 rounded bg-slate-700 text-white border border-slate-600 text-sm" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                    <option value="Sick">Sick</option>
                    <option value="Casual">Casual</option>
                  </select>
                  <input type="date" className="flex-1 p-2.5 sm:p-3 rounded bg-slate-700 text-white border border-slate-600 text-sm" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
                  <button onClick={() => handleApproveLeave(leaveEmpId, leaveDate)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 sm:py-3 rounded font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition">
                    <ShieldExclamationIcon className="w-4 h-4" /> Approve
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg sm:rounded-xl shadow-lg border border-slate-700 overflow-hidden">
              <h2 className="font-bold text-base sm:text-xl p-3 sm:p-4 text-cyan-400 flex items-center gap-2 border-b border-slate-700">
                <UserPlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                All Employees
              </h2>
              
              <div className="flex justify-between items-center p-3 sm:p-4 bg-slate-900 border-b border-slate-700 text-xs sm:text-sm">
                <p className="text-slate-400 font-medium">Page {empPage} of {Math.ceil(empTotal / EMP_LIMIT)}</p>
                <div className="flex gap-2">
                  <button onClick={() => setEmpPage(empPage - 1)} disabled={empPage === 1} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded text-xs hover:bg-slate-600 disabled:opacity-30 active:scale-95 transition">Prev</button>
                  <button onClick={() => setEmpPage(empPage + 1)} disabled={empPage * EMP_LIMIT >= empTotal} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded text-xs hover:bg-slate-600 disabled:opacity-30 active:scale-95 transition">Next</button>
                </div>
              </div>

              <div className="block sm:hidden divide-y divide-slate-700 max-h-96 overflow-y-auto">
                {employees.map((emp) => (
                  <div key={emp.$id} className="p-3 hover:bg-slate-700/50 transition">
                    <p className="font-semibold text-white text-sm mb-1">{emp.name}</p>
                    <p className="text-xs text-slate-400 mb-2">{emp.email}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-green-400 font-mono">₹{emp.salaryMonthly.toLocaleString()}/mo</span>
                      <span className="text-xs text-slate-500">{emp.joinDate}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-700 text-cyan-400 uppercase text-xs">
                    <tr>
                      <th className="p-3">Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Salary</th>
                      <th className="p-3">Join Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {employees.map((emp) => (
                      <tr key={emp.$id} className="hover:bg-slate-700 transition">
                        <td className="p-3 font-semibold text-white">{emp.name}</td>
                        <td className="p-3 text-slate-400">{emp.email}</td>
                        <td className="p-3 text-green-400 font-mono">₹{emp.salaryMonthly.toLocaleString()}</td>
                        <td className="p-3 text-slate-500">{emp.joinDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!isLoading && viewMode === "payroll" && (
          <div className="space-y-4 sm:space-y-6">
            <div className="bg-slate-800 rounded-lg sm:rounded-xl shadow-lg border border-slate-700 p-3 sm:p-6">
              <h2 className="font-bold text-base sm:text-xl mb-3 sm:mb-4 text-cyan-400 flex items-center gap-2">
                <CurrencyRupeeIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                Generate Payroll Report - Current Month
              </h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={handleGenerateReport}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 sm:py-3 rounded font-bold text-sm active:scale-95 transition w-full sm:w-auto"
                >
                  Generate Report for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                📊 Report will be generated for the current month attendance data
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              <div className="lg:col-span-1 bg-slate-800 rounded-lg sm:rounded-xl shadow-lg border border-slate-700 overflow-hidden max-h-[500px] sm:max-h-[600px] flex flex-col">
                <h3 className="p-3 sm:p-4 font-bold text-cyan-400 border-b border-slate-700 text-sm sm:text-base">Employees</h3>
                <div className="overflow-y-auto flex-1">
                  {reports.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-sm">
                      <p>No reports generated yet.</p>
                      <p className="text-xs mt-2">Select a month and click Generate Report</p>
                    </div>
                  ) : (
                    reports.map((r) => (
                      <button key={r.employeeId} onClick={() => setSelectedReportId(r.employeeId)} className={`w-full text-left p-3 border-b border-slate-700 transition hover:bg-slate-700 active:scale-98 ${selectedReportId === r.employeeId ? "bg-slate-700" : ""}`}>
                        <p className="font-semibold text-white text-sm">{r.employeeName}</p>
                        <p className="text-xs text-slate-400">{r.month}</p>
                        <p className="text-xs text-green-400 font-mono mt-1">Net: {r.netSalary}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="lg:col-span-2 overflow-hidden">
                {selectedReport ? (
                  <div className="bg-slate-800 rounded-lg sm:rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                    <div className="p-3 sm:p-4 bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border-b border-slate-700">
                      <h3 className="text-lg sm:text-xl font-bold text-white mb-1">{selectedReport.employeeName}</h3>
                      <p className="text-xs sm:text-sm text-slate-300">{selectedReport.month}</p>
                      <p className="text-xl sm:text-2xl font-bold text-green-400 mt-2">Net: {selectedReport.netSalary}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 p-3 sm:p-4 bg-slate-900/50 border-b border-slate-700 text-center text-xs sm:text-sm">
                      <div className="p-2"><span className="block text-xl sm:text-2xl font-bold text-green-400">{selectedReport.presentDays}</span>Present</div>
                      <div className="p-2"><span className="block text-xl sm:text-2xl font-bold text-red-400">{selectedReport.absentDays}</span>Absent</div>
                      <div className="p-2"><span className="block text-xl sm:text-2xl font-bold text-yellow-400">{selectedReport.halfDays}</span>Half</div>
                      <div className="p-2"><span className="block text-xl sm:text-2xl font-bold text-cyan-400">{selectedReport.paidLeaveDays}</span>Leaves</div>
                      <div className="p-2"><span className="block text-xl sm:text-2xl font-bold text-purple-400">{selectedReport.holidayDays}</span>Holiday</div>
                    </div>
                    
                    <div className="block sm:hidden divide-y divide-slate-700 max-h-96 overflow-y-auto">
                      {selectedReport.dailyBreakdown.map((d, i) => (
                        <div key={i} className="p-3 hover:bg-slate-700/50 transition">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-slate-300 text-xs">{d.date}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${d.status === "Present" ? "bg-green-900/50 text-green-400" : d.status === "Absent" ? "bg-red-900/50 text-red-400" : "bg-yellow-900/50 text-yellow-400"}`}>{d.status}</span>
                          </div>
                          <div className="text-xs text-slate-400">
                            <span>{d.inT} - {d.outT}</span>
                            <span className="ml-2 font-mono">{d.dur > 0 ? d.dur.toFixed(1) + "h" : "-"}</span>
                          </div>
                          {d.notes && <p className="text-xs text-slate-500 mt-1">{d.notes}</p>}
                        </div>
                      ))}
                    </div>

                    <div className="hidden sm:block p-3 sm:p-6 overflow-x-auto">
                      <table className="w-full text-sm text-left border border-slate-700 rounded-lg overflow-hidden">
                        <thead className="bg-slate-700 text-cyan-400 uppercase text-xs">
                          <tr>
                            <th className="p-3">Date</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">In/Out</th>
                            <th className="p-3 text-right">Dur</th>
                            <th className="p-3">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                          {selectedReport.dailyBreakdown.map((d, i) => (
                            <tr key={i} className="hover:bg-slate-700 transition">
                              <td className="p-3 font-mono text-slate-300 text-xs">{d.date} <span className="text-xs text-slate-500">({d.day})</span></td>
                              <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${d.status === "Present" ? "bg-green-900/50 text-green-400" : d.status === "Absent" ? "bg-red-900/50 text-red-400" : "bg-yellow-900/50 text-yellow-400"}`}>{d.status}</span></td>
                              <td className="p-3 text-xs font-medium text-slate-300">{d.inT} - {d.outT}</td>
                              <td className="p-3 font-mono text-right text-slate-300">{d.dur > 0 ? d.dur.toFixed(1) + "h" : "-"}</td>
                              <td className="p-3 text-xs text-slate-500">{d.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 bg-slate-800 rounded-lg sm:rounded-xl text-center text-slate-400 border border-slate-700">
                    <ArrowLeftOnRectangleIcon className="w-12 h-12 mx-auto mb-3" />
                    <p>Select an employee</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!isLoading && viewMode === "audit" && (
          <div className="bg-slate-800 rounded-lg sm:rounded-xl shadow-lg border border-slate-700 overflow-hidden">
            <h2 className="font-bold text-base sm:text-xl p-3 sm:p-4 text-cyan-400 flex items-center gap-2 border-b border-slate-700">
              <ClipboardDocumentListIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              Audit Log
            </h2>

            <div className="p-3 sm:p-4 bg-slate-900/50 border-b border-slate-700 space-y-3">
              <label className="block text-xs font-bold text-slate-400">MANUAL CORRECTION</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <select className="flex-1 p-2.5 sm:p-3 rounded bg-slate-700 text-white border border-slate-600 text-sm" value={manualEmpId} onChange={(e) => setManualEmpId(e.target.value)}>
                  <option value="">Select Employee</option>
                  {employees.map(e => <option key={e.$id} value={e.$id}>{e.name}</option>)}
                </select>
                <select 
                  className="flex-1 p-2.5 sm:p-3 rounded bg-slate-700 text-white border border-slate-600 text-sm" 
                  value={manualAction} 
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "check-in" || value === "check-out") {
                      setManualAction(value as "check-in" | "check-out");
                    }
                  }}
                >
                  <option value="check-in">Check In</option>
                  <option value="check-out">Check Out</option>
                </select>
                <input type="datetime-local" className="flex-1 p-2.5 sm:p-3 rounded bg-slate-700 text-white border border-slate-600 text-sm" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
                <button onClick={handleManualEntry} disabled={isManualSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 sm:py-3 rounded font-bold text-sm flex items-center justify-center gap-1 active:scale-95 transition">
                  <PlusCircleIcon className="w-4 h-4" /> Add
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">SEARCH LOGS</label>
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="text" placeholder="Filter by Name..." value={auditFilter} onChange={(e) => { setAuditFilter(e.target.value); fetchAuditLogs(1, e.target.value); }} className="w-full p-2.5 sm:p-3 pl-10 rounded bg-slate-800 text-white border border-slate-600 focus:ring-1 focus:ring-cyan-500 text-sm" />
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center p-3 sm:p-4 bg-slate-900 border-b border-slate-700 text-xs sm:text-sm">
              <p className="text-slate-400 font-medium">Page {auditPage} of {Math.ceil(auditTotal / AUDIT_LIMIT)}</p>
              <div className="flex gap-2">
                <button onClick={() => setAuditPage(auditPage - 1)} disabled={auditPage === 1} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded text-xs hover:bg-slate-600 disabled:opacity-30 active:scale-95 transition">Prev</button>
                <button onClick={() => setAuditPage(auditPage + 1)} disabled={auditPage * AUDIT_LIMIT >= auditTotal} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded text-xs hover:bg-slate-600 disabled:opacity-30 active:scale-95 transition">Next</button>
              </div>
            </div>
            
            <div className="block sm:hidden divide-y divide-slate-700 max-h-[500px] overflow-y-auto">
              {logs.map((log) => (
                <div key={log.$id} className="p-3 hover:bg-slate-700/50 transition">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-white text-sm mb-1">{log.employeeName}</p>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold uppercase ${log.action === "check-in" ? "bg-green-900/50 text-green-400" : "bg-cyan-900/50 text-cyan-400"}`}>{log.action}</span>
                    </div>
                    <button onClick={() => handleDeleteLog(log.$id)} className="text-red-400 hover:text-red-300 p-2 rounded-full hover:bg-red-900/30 transition active:scale-95" title="Delete">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mb-1">{formatTimestamp(log.timestamp)}</p>
                  <p className="text-xs text-slate-500 truncate">{log.device}</p>
                </div>
              ))}
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-700 text-cyan-400 uppercase text-xs">
                  <tr>
                    <th className="p-3">Timestamp (IST)</th>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Device / Note</th>
                    <th className="p-3 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {logs.map((log) => (
                    <tr key={log.$id} className="hover:bg-slate-700 transition">
                      <td className="p-3 text-slate-400 font-mono text-xs">{formatTimestamp(log.timestamp)}</td>
                      <td className="p-3 font-semibold text-white">{log.employeeName}</td>
                      <td className="p-3 uppercase font-bold text-xs"><span className={`px-3 py-1 rounded-full ${log.action === "check-in" ? "bg-green-900/50 text-green-400" : "bg-cyan-900/50 text-cyan-400"}`}>{log.action}</span></td>
                      <td className="p-3 font-mono text-xs text-slate-500 max-w-xs truncate">{log.device}</td>
                      <td className="p-3 text-right">
                        <button onClick={() => handleDeleteLog(log.$id)} className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-900/30 transition" title="Delete Log">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isLoading && viewMode === "settings" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-800 p-4 sm:p-8 rounded-lg sm:rounded-xl shadow-lg border border-slate-700">
              <h2 className="font-bold text-xl sm:text-2xl mb-4 sm:mb-6 text-slate-200 flex items-center gap-2 sm:gap-3 border-b border-slate-700 pb-3 sm:pb-4">
                <Cog6ToothIcon className="w-6 h-6 sm:w-7 sm:h-7 text-slate-400" />
                Admin Settings
              </h2>
              
              <div className="bg-slate-900/50 p-4 sm:p-6 rounded-lg border border-slate-700">
                <h3 className="text-base sm:text-lg font-bold text-cyan-400 mb-3 sm:mb-4">Change Password</h3>
                <form onSubmit={handleUpdatePassword} className="space-y-3 sm:space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Current Password</label>
                    <input type="password" required className="w-full bg-slate-800 border border-slate-600 rounded p-2.5 sm:p-3 text-white focus:border-cyan-500 outline-none transition text-sm" placeholder="Enter your current password" value={oldPass} onChange={(e) => setOldPass(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">New Password</label>
                    <input type="password" required minLength={8} className="w-full bg-slate-800 border border-slate-600 rounded p-2.5 sm:p-3 text-white focus:border-cyan-500 outline-none transition text-sm" placeholder="Enter new secure password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                  </div>
                  <div className="pt-2">
                    <button disabled={isUpdatingAuth} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 sm:py-3 rounded-lg transition shadow-lg disabled:opacity-50 active:scale-95 text-sm">
                      {isUpdatingAuth ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </form>
              </div>

              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-700 text-center">
                <p className="text-slate-500 text-xs sm:text-sm mb-3 sm:mb-4">Need to sign out securely?</p>
                <button onClick={handleLogout} className="text-red-400 hover:text-red-300 font-bold text-sm flex items-center justify-center gap-2 mx-auto active:scale-95 transition">
                  <ArrowLeftOnRectangleIcon className="w-4 h-4" /> Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}