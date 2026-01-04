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
      const auditLogRes = await databases.listDocuments<AuditLogDocument>(
        DB_ID,
        AUDIT_COLLECTION,
        queries
      );
      const parsedLogs: ParsedLog[] = auditLogRes.documents.map((doc) => {
        let details = { employeeName: "Unknown", device: "Unknown" };
        try {
          details = JSON.parse(doc.payload);
        } catch (e) {}
        return { ...doc, ...details };
      });
      setLogs(parsedLogs);
      setAuditTotal(auditLogRes.total);
      setAuditPage(page);
    } catch (error) {
      console.error("Failed to fetch audit logs", error);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [holRes] = await Promise.all([
        databases.listDocuments<HolidayDocument>(DB_ID, HOLIDAY_COLLECTION, [
          Query.orderDesc("date"),
        ]),
      ]);
      setHolidays(holRes.documents);
      if (employees.length === 0) fetchEmployees(1); 

      const payrollExecution = await functions.createExecution(
        FUNCTION_ID,
        JSON.stringify({ action: "get_payroll_report" }),
        false
      );
      const payrollResponse = JSON.parse(payrollExecution.responseBody);
      if (payrollResponse.success) {
          setReports(payrollResponse.reports);
          if (payrollResponse.reports.length > 0 && !selectedReportId) {
            setSelectedReportId(payrollResponse.reports[0].employeeId);
          }
      } else {
          console.error("Failed to get payroll report:", payrollResponse.message);
      }
    } catch (error) {
      console.error(error);
    } 
  };

  useEffect(() => {
    fetchData();
  }, []);
  
  useEffect(() => {
    if (viewMode === 'audit') fetchAuditLogs(auditPage); 
    if (viewMode === 'manage') fetchEmployees(empPage);
    setIsLoading(false); 
  }, [auditPage, viewMode, empPage]);

  const handleManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEmpId || !manualDate) return alert("Please fill all fields");
    setIsManualSubmitting(true);
    try {
        await addManualLog(manualEmpId, manualAction, new Date(manualDate));
        alert("✅ Manual log added!");
        setManualDate("");
        fetchAuditLogs(1);
        fetchData();
    } catch (error: unknown) {
        alert("Error: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
        setIsManualSubmitting(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!window.confirm("⚠️ Are you sure? This will remove this attendance record permanently.")) return;
    try {
        await deleteLog(logId);
        fetchAuditLogs(auditPage);
        fetchData();
    } catch (error: unknown) {
        alert("Error: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const createEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const payload = JSON.stringify({
        action: "create_employee",
        data: { name: newEmpName, email: newEmpEmail, password: newEmpPass, salary: newEmpSalary },
      });
      const res = await functions.createExecution(FUNCTION_ID, payload, false);      
      const result = JSON.parse(res.responseBody);
      if (result.success) {
        alert(`✅ Created: ${result.userId}`);
        fetchEmployees(1); 
        fetchData(); 
        setNewEmpName(""); setNewEmpEmail(""); setNewEmpPass(""); setNewEmpSalary("");
      } else throw new Error(result.message || result.error); 
    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsCreating(false);
    }
  };

  const resetDevice = async (id: string, name: string) => {
    if (!confirm(`Reset device for ${name}?`)) return;
    await databases.updateDocument(DB_ID, EMPLOYEE_COLLECTION, id, { devicePublicKey: null, deviceFingerprint: null });
    alert("✅ Reset");
    fetchEmployees(empPage);
  };

  const addHoliday = async () => {
    try {
      await databases.createDocument(DB_ID, HOLIDAY_COLLECTION, ID.unique(), { date: newHolidayDate, name: newHolidayName });
      setNewHolidayDate("");
      fetchData();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const grantLeave = async () => {
    try {
      await databases.createDocument(DB_ID, LEAVE_COLLECTION, ID.unique(), { employeeId: leaveEmpId, date: leaveDate, type: leaveType, status: "Approved" });
      alert("✅ Granted");
      fetchData();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };
  const handleLogout = async () => {
    try {
      await account.deleteSession('current');
      router.push('/'); // Redirect to Login Page
    } catch (error) {
      alert("Logout failed: " + (error as Error).message);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingAuth(true);
    try {
        await account.updatePassword(newPass, oldPass);
        alert("✅ Password Updated! Please login again.");
        handleLogout(); // Force logout so they login with new password
    } catch (error) {
        alert("Error: " + (error as Error).message);
    } finally {
        setIsUpdatingAuth(false);
    }
  };

  const TABS: ViewMode[] = ["manage", "payroll", "audit", "settings"];

  return (
    <div className="min-h-screen bg-slate-900 p-8 font-sans text-gray-100">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex justify-between items-center mb-10 border-b border-slate-700 pb-4">
          <h1 className="text-4xl font-extrabold text-white flex items-center gap-3">
            <ShieldCheckIcon className="w-8 h-8 text-cyan-500" />
            Security Admin Panel
          </h1>
          
          <div className="flex gap-4 items-center">
            {/* Tabs */}
            <div className="flex bg-slate-800 rounded-lg p-1 shadow-inner border border-slate-700">
                {TABS.map((m) => (
                <button
                    key={m}
                    onClick={() => setViewMode(m as ViewMode)}
                    className={`px-4 py-2 rounded-md capitalize text-sm font-semibold transition-colors flex items-center gap-2 ${
                    viewMode === m ? "bg-cyan-600 text-white shadow-md" : "text-slate-400 hover:bg-slate-700"
                    }`}
                >
                    {/* Optional: Add Icons for tabs here if you want */}
                    {m === 'settings' && <Cog6ToothIcon className="w-4 h-4" />}
                    {m}
                </button>
                ))}
            </div>

            {/* Logout Button */}
            <button 
                onClick={handleLogout}
                className="bg-red-900/20 hover:bg-red-900/50 text-red-400 border border-red-900/50 p-2 rounded-lg transition"
                title="Logout"
            >
                <ArrowLeftOnRectangleIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {isLoading && (
            <div className="text-center p-10 text-lg font-semibold text-slate-500">
                Loading Application Data...
            </div>
        )}

        {!isLoading && viewMode === "manage" && (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700 col-span-3">
              <h2 className="font-extrabold text-xl mb-4 text-purple-400 flex items-center gap-2 border-b border-slate-700 pb-3">
                <UserPlusIcon className="w-5 h-5" />
                New Employee Setup
              </h2>
              <form onSubmit={createEmployee} className="grid grid-cols-5 gap-4 items-end pt-2" autoComplete="off">
                <input
                  placeholder="Full Name"
                  className="border border-slate-600 p-3 rounded-lg w-full bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  required
                  autoComplete="off"
                  name="empName_new"
                />
                <input
                  placeholder="Email Address"
                  className="border border-slate-600 p-3 rounded-lg w-full bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
                  value={newEmpEmail}
                  onChange={(e) => setNewEmpEmail(e.target.value)}
                  required
                  autoComplete="off"
                  name="empEmail_new"
                />
                <input
                  placeholder="Temporary Password"
                  type="password"
                  className="border border-slate-600 p-3 rounded-lg w-full bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
                  value={newEmpPass}
                  onChange={(e) => setNewEmpPass(e.target.value)}
                  required
                  autoComplete="new-password"
                  name="empPass_new"
                />
                <input
                  placeholder="Monthly Salary (₹)"
                  type="number"
                  className="border border-slate-600 p-3 rounded-lg w-full bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
                  value={newEmpSalary}
                  onChange={(e) => setNewEmpSalary(e.target.value)}
                  required
                  autoComplete="off"
                />
                <button
                  disabled={isCreating}
                  className="bg-purple-600 text-white p-3 rounded-lg font-bold hover:bg-purple-700 transition disabled:opacity-50 shadow-md"
                >
                  {isCreating ? 'Creating...' : 'Create Account'}
                </button>
              </form>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700 lg:col-span-2">
              <h2 className="font-extrabold text-xl mb-4 text-red-400 flex items-center gap-2 border-b border-slate-700 pb-3">
                <ShieldExclamationIcon className="w-5 h-5" />
                Device Management
              </h2>
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-700">
                {employees.map((e) => (
                  <div key={e.$id} className="flex justify-between items-center py-3 hover:bg-slate-700 transition rounded-md px-1">
                    <span className="font-medium text-gray-200">{e.name}</span>
                    {e.deviceFingerprint ? (
                      <button onClick={() => resetDevice(e.$id, e.name)} className="text-red-400 text-xs bg-red-900/30 px-3 py-1.5 rounded-full font-bold border border-red-800 hover:bg-red-900 transition">
                        <span className="flex items-center gap-1"><XCircleIcon className="w-3 h-3" /> RESET KEY</span>
                      </button>
                    ) : <span className="text-slate-500 text-xs px-3 py-1.5 border border-slate-700 rounded-full">Device Unbound</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-700">
                <p className="text-slate-400 text-xs font-medium">Page {empPage} of {Math.ceil(empTotal / EMP_LIMIT)}</p>
                <div className="flex gap-2">
                    <button onClick={() => setEmpPage(empPage - 1)} disabled={empPage === 1} className="px-3 py-1 bg-cyan-900/40 text-cyan-400 rounded-md text-sm font-bold disabled:opacity-30 border border-cyan-900">Previous</button>
                    <button onClick={() => setEmpPage(empPage + 1)} disabled={empPage * EMP_LIMIT >= empTotal} className="px-3 py-1 bg-cyan-900/40 text-cyan-400 rounded-md text-sm font-bold disabled:opacity-30 border border-cyan-900">Next</button>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
              <h2 className="font-extrabold text-xl mb-4 text-green-400 flex items-center gap-2 border-b border-slate-700 pb-3">
                <CalendarDaysIcon className="w-5 h-5" />
                Holidays & Leave
              </h2>
              <div className="space-y-4">
                <div className="border border-green-800 p-4 rounded-lg bg-slate-900/50">
                    <h3 className="font-semibold text-green-500 mb-2">Declare Holiday</h3>
                    <div className="flex gap-2">
                        <input type="date" className="border border-slate-600 p-2 rounded-lg w-full bg-slate-700 text-white" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} />
                        <input placeholder="Holiday Name" className="border border-slate-600 p-2 rounded-lg w-full bg-slate-700 text-white" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} />
                        <button onClick={addHoliday} className="bg-green-600 text-white px-4 rounded-lg font-bold hover:bg-green-700 transition">+ Add</button>
                    </div>
                </div>
                <div className="border border-cyan-800 p-4 rounded-lg bg-slate-900/50">
                    <h3 className="font-semibold text-cyan-500 mb-2">Grant Leave</h3>
                    <div className="flex flex-col gap-3">
                        <select className="border border-slate-600 p-2 rounded-lg w-full bg-slate-700 text-white" value={leaveEmpId} onChange={(e) => setLeaveEmpId(e.target.value)}>
                            <option value="" className="bg-slate-700">-- Select Employee --</option>
                            {employees.map((e) => (<option key={e.$id} value={e.$id} className="bg-slate-700">{e.name}</option>))}
                        </select>
                        <div className="flex gap-2">
                            <input type="date" className="border border-slate-600 p-2 rounded-lg w-full bg-slate-700 text-white" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
                             <select className="border border-slate-600 p-2 rounded-lg w-full bg-slate-700 text-white" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                                <option value="Sick" className="bg-slate-700">Sick Leave</option>
                                <option value="Casual" className="bg-slate-700">Casual Leave</option>
                                <option value="Vacation" className="bg-slate-700">Vacation</option>
                            </select>
                        </div>
                        <button onClick={grantLeave} disabled={!leaveEmpId || !leaveDate} className="bg-cyan-600 text-white p-2 rounded-lg font-bold hover:bg-cyan-700 transition disabled:opacity-50">Grant Leave</button>
                    </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isLoading && viewMode === "payroll" && (
          <div className="grid lg:grid-cols-4 gap-8">
            <div className="lg:col-span-1 bg-slate-800 rounded-xl shadow-lg border border-slate-700 p-4 max-h-[80vh] overflow-y-auto">
                <h2 className="font-extrabold text-xl mb-4 text-cyan-400 border-b border-slate-700 pb-2">Employee Payrolls</h2>
                {reports.map((r) => (
                    <button key={r.employeeId} onClick={() => setSelectedReportId(r.employeeId)} className={`w-full text-left p-3 rounded-lg transition-colors mb-2 border ${selectedReportId === r.employeeId ? 'bg-cyan-600 text-white shadow-md border-cyan-500' : 'bg-slate-700 text-slate-200 hover:bg-slate-700/70 border-slate-700'}`}>
                        <span className="font-semibold block">{r.employeeName}</span>
                        <span className="text-xs opacity-80 flex items-center"><CurrencyRupeeIcon className="w-3 h-3 mr-1" />{r.netSalary}</span>
                    </button>
                ))}
            </div>
            <div className="lg:col-span-3">
                {reports.length > 0 && selectedReport ? (
                    <div key={selectedReport.employeeId} className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700">
                        <div className="bg-slate-900 text-white p-6 rounded-t-xl flex justify-between items-center border-b border-cyan-600">
                            <div><h3 className="font-extrabold text-2xl text-white">{selectedReport.employeeName}</h3><span className="text-sm text-slate-400 mt-1 block">Report for {selectedReport.month}</span></div>
                            <div className="text-right"><span className="block text-xs text-cyan-400 uppercase tracking-widest">NET PAYABLE</span><span className="font-mono text-4xl font-black text-green-400 flex items-center justify-end gap-1"><CurrencyRupeeIcon className="w-6 h-6" />₹{selectedReport.netSalary}</span></div>
                        </div>
                        <div className="grid grid-cols-5 text-center p-4 bg-slate-900 text-sm font-bold text-slate-400 uppercase divide-x divide-slate-700 border-b border-slate-700">
                            <div className="p-2"><span className="block text-2xl font-bold text-green-400">{selectedReport.presentDays}</span>Present</div>
                            <div className="p-2"><span className="block text-2xl font-bold text-red-400">{selectedReport.absentDays}</span>Absent</div>
                            <div className="p-2"><span className="block text-2xl font-bold text-yellow-400">{selectedReport.halfDays}</span>Half Days</div>
                            <div className="p-2"><span className="block text-2xl font-bold text-cyan-400">{selectedReport.paidLeaveDays}</span>Leaves</div>
                            <div className="p-2"><span className="block text-2xl font-bold text-purple-400">{selectedReport.holidayDays}</span>Holidays</div>
                        </div>
                        <div className="p-6 overflow-x-auto">
                            <table className="w-full text-sm text-left border border-slate-700 rounded-lg overflow-hidden">
                                <thead className="bg-slate-700 text-cyan-400 uppercase text-xs"><tr><th className="p-3">Date</th><th className="p-3">Status</th><th className="p-3">In/Out</th><th className="p-3 text-right">Dur</th><th className="p-3">Notes</th></tr></thead>
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
                ) : <div className="p-8 bg-slate-800 text-center text-slate-400"><ArrowLeftOnRectangleIcon className="w-12 h-12 mx-auto mb-3" /><p>Select an employee</p></div>}
            </div>
          </div>
        )}

        {!isLoading && viewMode === "audit" && (
          <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
            <h2 className="font-extrabold text-xl p-4 text-cyan-400 flex items-center gap-2 border-b border-slate-700">
                <ClipboardDocumentListIcon className="w-5 h-5" />
                Secure Audit Log & Management
            </h2>

            <div className="p-4 bg-slate-900/50 border-b border-slate-700 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-bold text-slate-400 mb-1 ml-1">MANUAL CORRECTION</label>
                    <div className="flex gap-2">
                        <select className="p-2 rounded bg-slate-700 text-white border border-slate-600 text-sm" value={manualEmpId} onChange={(e) => setManualEmpId(e.target.value)}>
                            <option value="">Select Employee</option>
                            {employees.map(e => <option key={e.$id} value={e.$id}>{e.name}</option>)}
                        </select>
                        <select 
    className="p-2 rounded bg-slate-700 text-white border border-slate-600 text-sm" 
    value={manualAction} 
    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setManualAction(e.target.value as "check-in" | "check-out")}
>
    <option value="check-in">Check In</option>
    <option value="check-out">Check Out</option>
</select>
                        <input type="datetime-local" className="p-2 rounded bg-slate-700 text-white border border-slate-600 text-sm" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
                        <button onClick={handleManualEntry} disabled={isManualSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold text-sm flex items-center gap-1">
                            <PlusCircleIcon className="w-4 h-4" /> Add
                        </button>
                    </div>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-bold text-slate-400 mb-1 ml-1">SEARCH LOGS</label>
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input type="text" placeholder="Filter by Name..." value={auditFilter} onChange={(e) => { setAuditFilter(e.target.value); fetchAuditLogs(1, e.target.value); }} className="w-full p-2 pl-10 rounded bg-slate-800 text-white border border-slate-600 focus:ring-1 focus:ring-cyan-500" />
                    </div>
                </div>
            </div>
            
            <div className="flex justify-between items-center p-4 bg-slate-900 border-b border-slate-700 text-sm">
                <p className="text-slate-400 font-medium">Page {auditPage} of {Math.ceil(auditTotal / AUDIT_LIMIT)}</p>
                <div className="flex gap-3">
                    <button onClick={() => setAuditPage(auditPage - 1)} disabled={auditPage === 1} className="px-3 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 disabled:opacity-30">Prev</button>
                    <button onClick={() => setAuditPage(auditPage + 1)} disabled={auditPage * AUDIT_LIMIT >= auditTotal} className="px-3 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 disabled:opacity-30">Next</button>
                </div>
            </div>
            
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
        )}

        {!isLoading && viewMode === "settings" && (
            <div className="max-w-2xl mx-auto">
                <div className="bg-slate-800 p-8 rounded-xl shadow-lg border border-slate-700">
                    <h2 className="font-extrabold text-2xl mb-6 text-slate-200 flex items-center gap-3 border-b border-slate-700 pb-4">
                        <Cog6ToothIcon className="w-7 h-7 text-slate-400" />
                        Admin Account Settings
                    </h2>
                    
                    <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                        <h3 className="text-lg font-bold text-cyan-400 mb-4">Change Password</h3>
                        <form onSubmit={handleUpdatePassword} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Current Password</label>
                                <input 
                                    type="password" 
                                    required 
                                    className="w-full bg-slate-800 border border-slate-600 rounded p-3 text-white focus:border-cyan-500 outline-none transition"
                                    placeholder="Enter your current password"
                                    value={oldPass}
                                    onChange={(e) => setOldPass(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">New Password</label>
                                <input 
                                    type="password" 
                                    required 
                                    minLength={8}
                                    className="w-full bg-slate-800 border border-slate-600 rounded p-3 text-white focus:border-cyan-500 outline-none transition"
                                    placeholder="Enter new secure password"
                                    value={newPass}
                                    onChange={(e) => setNewPass(e.target.value)}
                                />
                            </div>
                            <div className="pt-2">
                                <button 
                                    disabled={isUpdatingAuth}
                                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg transition shadow-lg disabled:opacity-50"
                                >
                                    {isUpdatingAuth ? "Updating..." : "Update Password"}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-700 text-center">
                        <p className="text-slate-500 text-sm mb-4">Need to sign out securely?</p>
                        <button onClick={handleLogout} className="text-red-400 hover:text-red-300 font-bold text-sm flex items-center justify-center gap-2 mx-auto">
                            <ArrowLeftOnRectangleIcon className="w-4 h-4" /> Sign Out Now
                        </button>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
}