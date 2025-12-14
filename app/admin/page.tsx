"use client";
import { useEffect, useState } from "react";
import { databases, functions } from "../../lib/appwrite";
import { Query, Models, ID } from "appwrite";
import { 
    ShieldCheckIcon, UserPlusIcon, XCircleIcon, CalendarDaysIcon, CurrencyRupeeIcon, ClipboardDocumentListIcon, ShieldExclamationIcon, ArrowLeftOnRectangleIcon, MagnifyingGlassIcon
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

type ViewMode = "audit" | "payroll" | "manage";

export default function AdminDashboard() {
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
    if (viewMode === 'audit') {
        fetchAuditLogs(auditPage); 
    }
    if (viewMode === 'manage') {
        fetchEmployees(empPage);
    }
    setIsLoading(false); 
  }, [auditPage, viewMode, empPage]);


  const createEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const payload = JSON.stringify({
        action: "create_employee",
        data: {
          name: newEmpName,
          email: newEmpEmail,
          password: newEmpPass,
          salary: newEmpSalary,
        },
      });
const res = await functions.createExecution(
    FUNCTION_ID, 
    payload, 
    false
);      const result = JSON.parse(res.responseBody);
      if (result.success) {
        alert(`✅ Created: ${result.userId}`);
        fetchEmployees(1); 
        fetchData(); 
        setNewEmpName("");
        setNewEmpEmail("");
        setNewEmpPass("");
        setNewEmpSalary("");
      } else throw new Error(result.message || result.error); 
    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsCreating(false);
    }
  };

  const resetDevice = async (id: string, name: string) => {
    if (!confirm(`Reset device for ${name}?`)) return;
    await databases.updateDocument(DB_ID, EMPLOYEE_COLLECTION, id, {
      devicePublicKey: null,
      deviceFingerprint: null,
    });
    alert("✅ Reset");
    fetchEmployees(empPage);
  };

  const addHoliday = async () => {
    try {
      await databases.createDocument(DB_ID, HOLIDAY_COLLECTION, ID.unique(), {
        date: newHolidayDate,
        name: newHolidayName,
      });
      setNewHolidayDate("");
      fetchData();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const grantLeave = async () => {
    try {
      await databases.createDocument(DB_ID, LEAVE_COLLECTION, ID.unique(), {
        employeeId: leaveEmpId,
        date: leaveDate,
        type: leaveType,
        status: "Approved",
      });
      alert("✅ Granted");
      fetchData();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const TABS: ViewMode[] = ["manage", "payroll", "audit"];

  return (
    <div className="min-h-screen bg-slate-900 p-8 font-sans text-gray-100">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex justify-between items-center mb-10 border-b border-slate-700 pb-4">
          <h1 className="text-4xl font-extrabold text-white flex items-center gap-3">
            <ShieldCheckIcon className="w-8 h-8 text-cyan-500" />
            Security Admin Panel
          </h1>
          <div className="flex bg-slate-800 rounded-lg p-1 shadow-inner border border-slate-700">
            {TABS.map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-5 py-2 rounded-md capitalize text-sm font-semibold transition-colors ${
                  viewMode === m ? "bg-cyan-600 text-white shadow-md" : "text-slate-400 hover:bg-slate-700"
                }`}
              >
                {m}
              </button>
            ))}
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
              <form onSubmit={createEmployee} className="grid grid-cols-5 gap-4 items-end pt-2">
                <input
                  placeholder="Full Name"
                  className="border border-slate-600 p-3 rounded-lg w-full bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  required
                />
                <input
                  placeholder="Email Address"
                  className="border border-slate-600 p-3 rounded-lg w-full bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
                  value={newEmpEmail}
                  onChange={(e) => setNewEmpEmail(e.target.value)}
                  required
                />
                <input
                  placeholder="Temporary Password"
                  type="password"
                  className="border border-slate-600 p-3 rounded-lg w-full bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
                  value={newEmpPass}
                  onChange={(e) => setNewEmpPass(e.target.value)}
                  required
                />
                <input
                  placeholder="Monthly Salary (₹)"
                  type="number"
                  className="border border-slate-600 p-3 rounded-lg w-full bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
                  value={newEmpSalary}
                  onChange={(e) => setNewEmpSalary(e.target.value)}
                  required
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
                Device Management & Security 
              </h2>
              <div className="text-sm font-semibold text-slate-400 mb-3">Showing {employees.length} of {empTotal} Employees</div>
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-700">
                {employees.map((e) => (
                  <div
                    key={e.$id}
                    className="flex justify-between items-center py-3 hover:bg-slate-700 transition rounded-md px-1"
                  >
                    <span className="font-medium text-gray-200">{e.name}</span>
                    {e.deviceFingerprint ? (
                      <button
                        onClick={() => resetDevice(e.$id, e.name)}
                        className="text-red-400 text-xs bg-red-900/30 px-3 py-1.5 rounded-full font-bold border border-red-800 hover:bg-red-900 transition"
                      >
                        <span className="flex items-center gap-1">
                          <XCircleIcon className="w-3 h-3" />
                          RESET KEY
                        </span>
                      </button>
                    ) : (
                      <span className="text-slate-500 text-xs px-3 py-1.5 border border-slate-700 rounded-full">Device Unbound</span>
                    )}
                  </div>
                ))}
              </div>
              
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-700">
                <p className="text-slate-400 text-xs font-medium">
                    Page {empPage} of {Math.ceil(empTotal / EMP_LIMIT)}
                </p>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setEmpPage(empPage - 1)}
                        disabled={empPage === 1}
                        className="px-3 py-1 bg-cyan-900/40 text-cyan-400 rounded-md text-sm font-bold disabled:opacity-30 hover:bg-cyan-900 transition border border-cyan-900"
                    >
                        Previous
                    </button>
                    <button 
                        onClick={() => setEmpPage(empPage + 1)} 
                        disabled={empPage * EMP_LIMIT >= empTotal}
                        className="px-3 py-1 bg-cyan-900/40 text-cyan-400 rounded-md text-sm font-bold disabled:opacity-30 hover:bg-cyan-900 transition border border-cyan-900"
                    >
                        Next
                    </button>
                </div>
              </div>

            </div>

            <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
              <h2 className="font-extrabold text-xl mb-4 text-green-400 flex items-center gap-2 border-b border-slate-700 pb-3">
                <CalendarDaysIcon className="w-5 h-5" />
                Holidays & Leave Approval
              </h2>
              <div className="space-y-4">
                <div className="border border-green-800 p-4 rounded-lg bg-slate-900/50">
                    <h3 className="font-semibold text-green-500 mb-2">Declare Holiday</h3>
                    <div className="flex gap-2">
                        <input
                        type="date"
                        className="border border-slate-600 p-2 rounded-lg w-full bg-slate-700 text-white focus:ring-2 focus:ring-green-400 focus:border-green-400"
                        value={newHolidayDate}
                        onChange={(e) => setNewHolidayDate(e.target.value)}
                        />
                        <input
                        placeholder="Holiday Name"
                        className="border border-slate-600 p-2 rounded-lg w-full bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-green-400 focus:border-green-400"
                        value={newHolidayName}
                        onChange={(e) => setNewHolidayName(e.target.value)}
                        />
                        <button
                        onClick={addHoliday}
                        className="bg-green-600 text-white px-4 rounded-lg font-bold hover:bg-green-700 transition shadow-md"
                        >
                        + Add
                        </button>
                    </div>
                </div>

                <div className="border border-cyan-800 p-4 rounded-lg bg-slate-900/50">
                    <h3 className="font-semibold text-cyan-500 mb-2">Grant Leave (Approved)</h3>
                    <div className="flex flex-col gap-3">
                        <select
                            className="border border-slate-600 p-2 rounded-lg w-full bg-slate-700 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                            value={leaveEmpId}
                            onChange={(e) => setLeaveEmpId(e.target.value)}
                        >
                            <option value="" className="bg-slate-700">-- Select Employee --</option>
                            {employees.map((e) => (
                            <option key={e.$id} value={e.$id} className="bg-slate-700">
                                {e.name}
                            </option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                className="border border-slate-600 p-2 rounded-lg w-full bg-slate-700 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                                value={leaveDate}
                                onChange={(e) => setLeaveDate(e.target.value)}
                            />
                             <select
                                className="border border-slate-600 p-2 rounded-lg w-full bg-slate-700 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                                value={leaveType}
                                onChange={(e) => setLeaveType(e.target.value)}
                            >
                                <option value="Sick" className="bg-slate-700">Sick Leave</option>
                                <option value="Casual" className="bg-slate-700">Casual Leave</option>
                                <option value="Vacation" className="bg-slate-700">Vacation</option>
                            </select>
                        </div>
                        <button
                            onClick={grantLeave}
                            disabled={!leaveEmpId || !leaveDate}
                            className="bg-cyan-600 text-white p-2 rounded-lg font-bold hover:bg-cyan-700 transition disabled:opacity-50 shadow-md"
                        >
                            Grant Leave
                        </button>
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
                {reports.length === 0 && <p className="text-slate-400 text-sm italic">No reports generated.</p>}
                
                {reports.map((r) => (
                    <button
                        key={r.employeeId}
                        onClick={() => setSelectedReportId(r.employeeId)}
                        className={`w-full text-left p-3 rounded-lg transition-colors mb-2 border ${
                            selectedReportId === r.employeeId 
                                ? 'bg-cyan-600 text-white shadow-md border-cyan-500' 
                                : 'bg-slate-700 text-slate-200 hover:bg-slate-700/70 border-slate-700'
                        }`}
                    >
                        <span className="font-semibold block">{r.employeeName}</span>
                        <span className="text-xs opacity-80 flex items-center">
                            <CurrencyRupeeIcon className="w-3 h-3 mr-1" />
                            {r.netSalary}
                        </span>
                    </button>
                ))}
            </div>

            <div className="lg:col-span-3">
                {reports.length > 0 && selectedReport ? (
                    <div
                        key={selectedReport.employeeId}
                        className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700"
                    >
                        <div className="bg-slate-900 text-white p-6 rounded-t-xl flex justify-between items-center border-b border-cyan-600">
                            <div>
                                <h3 className="font-extrabold text-2xl text-white">{selectedReport.employeeName}</h3>
                                <span className="text-sm text-slate-400 mt-1 block">Payroll Report for {selectedReport.month}</span>
                            </div>
                            <div className="text-right">
                                <span className="block text-xs text-cyan-400 uppercase tracking-widest">
                                    NET PAYABLE
                                </span>
                                <span className="font-mono text-4xl font-black text-green-400 flex items-center justify-end gap-1">
                                    <CurrencyRupeeIcon className="w-6 h-6" />
                                    ₹{selectedReport.netSalary}
                                </span>
                            </div>
                        </div>
                        
                        {/* Payroll Metrics (High contrast) */}
                        <div className="grid grid-cols-5 text-center p-4 bg-slate-900 text-sm font-bold text-slate-400 uppercase divide-x divide-slate-700 border-b border-slate-700">
                            <div className="p-2">
                                <span className="block text-2xl font-bold text-green-400">{selectedReport.presentDays}</span>
                                Present Days
                            </div>
                            <div className="p-2">
                                <span className="block text-2xl font-bold text-red-400">{selectedReport.absentDays}</span>
                                Absent Days
                            </div>
                            <div className="p-2">
                                <span className="block text-2xl font-bold text-yellow-400">{selectedReport.halfDays}</span>
                                Half Days
                            </div>
                            <div className="p-2">
                                <span className="block text-2xl font-bold text-cyan-400">{selectedReport.paidLeaveDays}</span>
                                Paid Leave
                            </div>
                            <div className="p-2">
                                <span className="block text-2xl font-bold text-purple-400">{selectedReport.holidayDays}</span>
                                Holiday Pay
                            </div>
                        </div>

                        <div className="p-6 overflow-x-auto">
                            <table className="w-full text-sm text-left border border-slate-700 rounded-lg overflow-hidden">
                                <thead className="bg-slate-700 text-cyan-400 uppercase text-xs">
                                    <tr>
                                        <th className="p-3">Date</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3">In/Out</th>
                                        <th className="p-3 text-right">Duration (Hrs)</th>
                                        <th className="p-3">Notes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700">
                                    {selectedReport.dailyBreakdown.map((d, i) => (
                                        <tr key={i} className="hover:bg-slate-700 transition">
                                            <td className="p-3 font-mono text-slate-300 text-xs">
                                                {d.date}{" "}
                                                <span className="text-xs text-slate-500">({d.day})</span>
                                            </td>
                                            <td className="p-3">
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                                                        d.status === "Present" ? "bg-green-900/50 text-green-400"
                                                        : d.status === "Absent" ? "bg-red-900/50 text-red-400"
                                                        : d.status === "Half-Day" ? "bg-yellow-900/50 text-yellow-400"
                                                        : d.status === "Weekend" ? "bg-slate-700 text-slate-400"
                                                        : d.status === "Pre-Employment" ? "bg-slate-800 text-slate-500"
                                                        : "bg-cyan-900/50 text-cyan-400"
                                                    }`}
                                                >
                                                    {d.status}
                                                </span>
                                            </td>
                                            <td className="p-3 text-xs font-medium text-slate-300">
                                                {d.inT} - {d.outT}
                                            </td>
                                            <td className="p-3 font-mono text-right text-slate-300">
                                                {d.dur > 0 ? d.dur.toFixed(1) + "h" : "-"}
                                                {d.ot > 0 && (
                                                    <span className="text-red-400 font-bold ml-1">
                                                        (+{d.ot.toFixed(1)} OT)
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-xs text-slate-500">
                                                {d.notes}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="p-8 bg-slate-800 rounded-xl shadow-lg border border-slate-700 text-center text-slate-400">
                        <ArrowLeftOnRectangleIcon className="w-12 h-12 mx-auto text-cyan-700/50 mb-3" />
                        <p className="font-semibold">Select an employee from the left panel to view their detailed payroll report.</p>
                    </div>
                )}
            </div>
          </div>
        )}

        {!isLoading && viewMode === "audit" && (
          <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
            <h2 className="font-extrabold text-xl p-4 text-cyan-400 flex items-center gap-2 border-b border-slate-700">
                <ClipboardDocumentListIcon className="w-5 h-5" />
                Secure Audit Log
            </h2>

            <div className="p-4 bg-slate-900 border-b border-slate-700">
                <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Filter logs by Employee Name..."
                        value={auditFilter}
                        onChange={(e) => {
                            setAuditFilter(e.target.value);
                            fetchAuditLogs(1, e.target.value); 
                        }}
                        className="w-full p-3 pl-10 rounded-lg bg-slate-800 text-white placeholder-slate-400 border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    />
                </div>
            </div>
            
            <div className="flex justify-between items-center p-4 bg-slate-900 border-b border-slate-700 text-sm">
                <p className="text-slate-400 font-medium">
                    Showing Page {auditPage} of {Math.ceil(auditTotal / AUDIT_LIMIT)} ({auditTotal} total records)
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setAuditPage(auditPage - 1)}
                        disabled={auditPage === 1}
                        className="px-4 py-2 bg-cyan-800/50 text-cyan-300 rounded-lg font-bold hover:bg-cyan-800/80 transition disabled:opacity-30"
                    >
                        Previous
                    </button>
                    <button 
                        onClick={() => setAuditPage(auditPage + 1)} 
                        disabled={auditPage * AUDIT_LIMIT >= auditTotal}
                        className="px-4 py-2 bg-cyan-800/50 text-cyan-300 rounded-lg font-bold hover:bg-cyan-800/80 transition disabled:opacity-30"
                    >
                        Next
                    </button>
                </div>
            </div>
            
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-700 text-cyan-400 uppercase text-xs">
                <tr>
                  <th className="p-3">Timestamp (IST)</th>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Device Fingerprint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {logs.map((log) => (
                  <tr key={log.$id} className="hover:bg-slate-700 transition">
                    <td className="p-3 text-slate-400 font-mono text-xs">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="p-3 font-semibold text-white">{log.employeeName}</td>
                    <td className="p-3 uppercase font-bold text-xs tracking-wider">
                      <span
                        className={`px-3 py-1 rounded-full ${
                          log.action === "check-in"
                            ? "bg-green-900/50 text-green-400"
                            : "bg-cyan-900/50 text-cyan-400"
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-500 max-w-lg overflow-x-auto whitespace-nowrap">
                      {log.device}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}