"use client";
import { useEffect, useState } from "react";
import { databases, functions } from "../../lib/appwrite";
import { Query, Models, ID } from "appwrite";
import { formatTimestamp } from "../../lib/utils";

import { 
    DB_ID, 
    FUNCTION_ID, 
    EMPLOYEE_COLLECTION, 
    AUDIT_COLLECTION,
    HOLIDAY_COLLECTION,
    LEAVE_COLLECTION 
} from '../../lib/constants'; 

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

  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const AUDIT_LIMIT = 20;

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


  const fetchAuditLogs = async (page: number) => {
    try {
      const offset = (page - 1) * AUDIT_LIMIT;
      
      const auditLogRes = await databases.listDocuments<AuditLogDocument>(
        DB_ID,
        AUDIT_COLLECTION,
        [
          Query.limit(AUDIT_LIMIT),
          Query.offset(offset),
          Query.orderDesc("timestamp"),
        ]
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
      } else {
          console.error("Failed to get payroll report:", payrollResponse.message);
      }
      
    } catch (error) {
      console.error(error);
    } finally {
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
    <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-900">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-blue-900">
            🛡️ Admin Console
          </h1>
          <div className="flex bg-white rounded p-1 shadow border">
            {TABS.map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-4 py-2 rounded capitalize font-bold ${
                  viewMode === m ? "bg-blue-100 text-blue-800" : "text-gray-500"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {isLoading && (
             <div className="text-center p-10 text-lg font-semibold text-gray-500">
                Loading Data...
            </div>
        )}

        {!isLoading && viewMode === "manage" && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded shadow border col-span-2">
              <h2 className="font-bold text-lg mb-4 text-purple-800">
                ✨ Create Employee
              </h2>
              <form onSubmit={createEmployee} className="flex gap-4">
                <input
                  placeholder="Name"
                  className="border p-2 rounded w-full"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  required
                />
                <input
                  placeholder="Email"
                  className="border p-2 rounded w-full"
                  value={newEmpEmail}
                  onChange={(e) => setNewEmpEmail(e.target.value)}
                  required
                />
                <input
                  placeholder="Pass"
                  type="password"
                  className="border p-2 rounded w-full"
                  value={newEmpPass}
                  onChange={(e) => setNewEmpPass(e.target.value)}
                  required
                />
                <input
                  placeholder="Salary"
                  type="number"
                  className="border p-2 rounded w-full"
                  value={newEmpSalary}
                  onChange={(e) => setNewEmpSalary(e.target.value)}
                  required
                />
                <button
                  disabled={isCreating}
                  className="bg-purple-600 text-white px-4 rounded font-bold"
                >
                  {isCreating ? "..." : "+"}
                </button>
              </form>
            </div>

            <div className="bg-white p-6 rounded shadow border">
              <h2 className="font-bold text-lg mb-4">
                🔐 Device Reset (Showing {employees.length} of {empTotal} Employees)
              </h2>
              <div className="max-h-96 overflow-y-auto divide-y">
                {employees.map((e) => (
                  <div
                    key={e.$id}
                    className="flex justify-between items-center py-2 border-b"
                  >
                    <span>{e.name}</span>
                    {e.deviceFingerprint ? (
                      <button
                        onClick={() => resetDevice(e.$id, e.name)}
                        className="text-red-600 text-xs bg-red-50 px-2 py-1 rounded font-bold border border-red-100"
                      >
                        ⚠️ RESET KEY
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">No Device</span>
                    )}
                  </div>
                ))}
              </div>
              
              <div className="flex justify-between items-center mt-4 pt-4 border-t">
                <p className="text-gray-600 text-xs font-medium">
                    Page {empPage} of {Math.ceil(empTotal / EMP_LIMIT)}
                </p>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setEmpPage(empPage - 1)}
                        disabled={empPage === 1}
                        className="px-3 py-1 bg-blue-50 text-blue-700 rounded text-sm font-bold disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button 
                        onClick={() => setEmpPage(empPage + 1)} 
                        disabled={empPage * EMP_LIMIT >= empTotal}
                        className="px-3 py-1 bg-blue-50 text-blue-700 rounded text-sm font-bold disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded shadow border">
              <h2 className="font-bold text-lg mb-4">📅 Holidays & Leaves</h2>
              <div className="flex gap-2 mb-2">
                <input
                  type="date"
                  className="border p-1 rounded"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                />
                <input
                  placeholder="Holiday Name"
                  className="border p-1 rounded w-full"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                />
                <button
                  onClick={addHoliday}
                  className="bg-blue-600 text-white px-3 rounded font-bold"
                >
                  +
                </button>
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t">
                <select
                  className="border p-1 rounded"
                  value={leaveEmpId}
                  onChange={(e) => setLeaveEmpId(e.target.value)}
                >
                  <option value="">Employee</option>
                  {/* NOTE: This list now uses the paginated 'employees' list */}
                  {employees.map((e) => (
                    <option key={e.$id} value={e.$id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className="border p-1 rounded"
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                />
                <button
                  onClick={grantLeave}
                  className="bg-green-600 text-white px-3 rounded font-bold"
                >
                  Grant Sick Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {viewMode === "payroll" && (
          <div className="space-y-6">
            {reports.map((r) => (
              <div
                key={r.employeeId}
                className="bg-white rounded shadow overflow-hidden"
              >
                <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-lg">{r.employeeName}</h3>
                    <span className="text-xs opacity-70">{r.month}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-xs opacity-70">
                      NET PAYABLE
                    </span>
                    <span className="font-mono text-2xl font-bold text-green-400">
                      ₹{r.netSalary}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-5 text-center p-4 bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                  <div>
                    <span className="block text-lg text-green-600">
                      {r.presentDays}
                    </span>
                    Present
                  </div>
                  <div>
                    <span className="block text-lg text-blue-500">
                      {r.holidayDays}
                    </span>
                    Holiday
                  </div>
                  <div>
                    <span className="block text-lg text-purple-500">
                      {r.paidLeaveDays}
                    </span>
                    Leave
                  </div>
                  <div>
                    <span className="block text-lg text-red-500">
                      {r.absentDays}
                    </span>
                    Absent
                  </div>
                  <div>
                    <span className="block text-lg text-yellow-600">
                      {r.halfDays}
                    </span>
                    Half-Day
                  </div>
                </div>
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">In/Out</th>
                        <th className="p-2">Hrs</th>
                        <th className="p-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.dailyBreakdown.map((d, i) => (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-mono text-gray-600">
                            {d.date}{" "}
                            <span className="text-xs text-gray-400">
                              ({d.day})
                            </span>
                          </td>
                          <td className="p-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                                d.status === "Present"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {d.status}
                            </span>
                          </td>
                          <td className="p-2 text-xs">
                            {d.inT} - {d.outT}
                          </td>
                          <td className="p-2 font-mono">
                            {d.dur > 0 ? d.dur.toFixed(1) + "h" : "-"}
                          </td>
                          <td className="p-2 text-xs text-gray-500">
                            {d.notes}{" "}
                            {d.ot > 0 && (
                              <span className="text-blue-600 font-bold">
                                +{d.ot.toFixed(1)}h OT
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === "audit" && (
          <div className="bg-white rounded shadow overflow-hidden">
            
            <div className="flex justify-between items-center p-3 bg-gray-100 border-b">
                <p className="text-gray-600 text-sm font-medium">
                    Page {auditPage} of {Math.ceil(auditTotal / AUDIT_LIMIT)} ({auditTotal} total records)
                </p>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setAuditPage(auditPage - 1)}
                        disabled={auditPage === 1}
                        className="px-3 py-1 bg-blue-50 text-blue-700 rounded text-sm font-bold disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button 
                        onClick={() => setAuditPage(auditPage + 1)} 
                        disabled={auditPage * AUDIT_LIMIT >= auditTotal}
                        className="px-3 py-1 bg-blue-50 text-blue-700 rounded text-sm font-bold disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>
            
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-500 uppercase">
                <tr>
                  <th className="p-3">Time</th>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Device Fingerprint</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.$id} className="hover:bg-gray-50">
                    <td className="p-3 text-gray-600">
                      {formatTimestamp(log.timestamp)} 
                    </td>
                    <td className="p-3 font-bold">{log.employeeName}</td>
                    <td className="p-3 uppercase font-bold text-xs tracking-wider">
                      <span
                        className={`px-2 py-1 rounded ${
                          log.action === "check-in"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-gray-500">
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