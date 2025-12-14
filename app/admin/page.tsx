"use client";
import { useEffect, useState } from "react";
import { databases, functions } from "../../lib/appwrite";
import { Query, Models, ID } from "appwrite";

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
}

type DailyStatus =
  | "Present"
  | "Absent"
  | "Half-Day"
  | "Weekend"
  | "Holiday"
  | "Leave";

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
  const [holidays, setHolidays] = useState<HolidayDocument[]>([]);

  const [logs, setLogs] = useState<ParsedLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const DB_ID = "693d2c7a002d224e1d81";
  const FUNCTION_ID = "693d43f9002a766e0d81";

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [empRes, logRes, holRes, leaveRes] = await Promise.all([
        databases.listDocuments<EmployeeProfile>(DB_ID, "employees"),
        databases.listDocuments<AuditLogDocument>(DB_ID, "audit", [
          Query.limit(500),
          Query.orderDesc("timestamp"),
        ]),
        databases.listDocuments<HolidayDocument>(DB_ID, "holidays", [
          Query.orderDesc("date"),
        ]),
        databases.listDocuments<LeaveDocument>(DB_ID, "leaves", [
          Query.equal("status", "Approved"),
        ]),
      ]);

      setEmployees(empRes.documents);
      setHolidays(holRes.documents);

      const parsedLogs: ParsedLog[] = logRes.documents.map((doc) => {
        let details = { employeeName: "Unknown", device: "Unknown" };
        try {
          details = JSON.parse(doc.payload);
        } catch (e) {}
        return { ...doc, ...details };
      });
      setLogs(parsedLogs);

      setReports(
        empRes.documents.map((emp) =>
          calculatePayroll(
            emp,
            logRes.documents,
            holRes.documents,
            leaveRes.documents
          )
        )
      );
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

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
        fetchData();
        setNewEmpName("");
        setNewEmpEmail("");
      } else throw new Error(result.error);
    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsCreating(false);
    }
  };

  const resetDevice = async (id: string, name: string) => {
    if (!confirm(`Reset device for ${name}?`)) return;
    await databases.updateDocument(DB_ID, "employees", id, {
      devicePublicKey: null,
      deviceFingerprint: null,
    });
    alert("✅ Reset");
    fetchData();
  };

  const addHoliday = async () => {
    try {
      await databases.createDocument(DB_ID, "holidays", ID.unique(), {
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
      await databases.createDocument(DB_ID, "leaves", ID.unique(), {
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

  const calculatePayroll = (
    emp: EmployeeProfile,
    allLogs: AuditLogDocument[],
    holidays: HolidayDocument[],
    leaves: LeaveDocument[]
  ): PayrollReport => {
    const today = new Date();
    const daysInMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0
    ).getDate();
    const records = [];
    let present = 0,
      absent = 0,
      half = 0,
      hol = 0,
      lev = 0,
      workDays = 0;

    const empLogs = allLogs.filter((l) => l.actorId === emp.$id);
    const empLeaves = leaves.filter((l) => l.employeeId === emp.$id);

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(today.getFullYear(), today.getMonth(), d);
      if (date > new Date()) continue;
      const dateStr = date.toISOString().split("T")[0];
      const isSun = date.getDay() === 0;
      const holiday = holidays.find((h) => h.date === dateStr);
      const leave = empLeaves.find((l) => l.date === dateStr);
      const logs = empLogs
        .filter((l) => l.timestamp.startsWith(dateStr))
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

      let status: DailyStatus = isSun
        ? "Weekend"
        : holiday
        ? "Holiday"
        : leave
        ? "Leave"
        : "Absent";
      let notes = holiday?.name || leave?.type || "";
      let dur = 0,
        ot = 0,
        inT = "-",
        outT = "-";

      if (!isSun && !holiday) workDays++;

      if (logs.length > 0) {
        inT = new Date(logs[0].timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        if (logs.at(-1)?.action === "check-out") {
          outT = new Date(logs.at(-1)!.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          dur =
            (new Date(logs.at(-1)!.timestamp).getTime() -
              new Date(logs[0].timestamp).getTime()) /
            3600000;

          if (isSun || holiday) {
            status = "Present";
            present++;
            ot = dur;
            notes = isSun ? "Sunday OT" : `Holiday Work`;
          } else {
            if (dur > 0 && dur < 4) {
              status = "Half-Day";
              half++;
            } else {
              status = "Present";
              present++;
            }
            if (dur > 10) ot = dur - 10;
          }
        } else {
          outT = "⚠️ Missed";
          dur = 0;
          
          if (isSun || holiday) {
             notes = notes ? `${notes} (Missed Check-out)` : "Missed Check-out";
          } else {
             status = "Absent";
             absent++;
             notes = "❌ Forgot Check-out (0 Pay)";
          }
        }
      } else {
        if (status === "Holiday") hol++;
        else if (status === "Leave") lev++;
        else if (status === "Absent" && !isSun) absent++;
      }

      records.push({
        date: dateStr,
        day: date.toLocaleDateString("en-US", { weekday: "short" }),
        status,
        inT,
        outT,
        dur,
        ot,
        notes,
      });
    }

    const rate = workDays > 0 ? emp.salaryMonthly / workDays : 0;
    const net = Math.max(
      0,
      emp.salaryMonthly - absent * rate - half * 0.5 * rate
    );

    return {
      employeeId: emp.$id,
      employeeName: emp.name,
      month: today.toLocaleDateString("en-US", { month: "long" }),
      netSalary: net.toLocaleString("en-IN", { maximumFractionDigits: 2 }),
      presentDays: present,
      absentDays: absent,
      holidayDays: hol,
      paidLeaveDays: lev,
      halfDays: half,
      dailyBreakdown: records,
    };
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

        {viewMode === "manage" && (
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
              <h2 className="font-bold text-lg mb-4">🔐 Device Reset</h2>
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
                                  : d.status === "Absent"
                                  ? "bg-red-100 text-red-700"
                                  : d.status === "Half-Day"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : d.status === "Weekend"
                                  ? "bg-gray-100 text-gray-500"
                                  : "bg-blue-100 text-blue-700"
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
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-500 uppercase">
                <tr>
                  <th className="p-3">Time</th>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.$id} className="hover:bg-gray-50">
                    <td className="p-3 text-gray-600">
                      {new Date(log.timestamp).toLocaleString()}
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
                      {log.device?.substring(0, 30)}...
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
