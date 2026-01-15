/**
 * API Service Layer
 * Production-ready API client for attendance system backend
 */

import { client, account, functions } from './appwrite';
import { FUNCTION_ID } from './constants';
import { signData } from './crypto';

// ============================================
// TYPES
// ============================================

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

export interface User {
  $id: string;
  email: string;
  name: string;
}

export interface AttendanceRecord {
  date: string;
  day: string;
  status: 'present' | 'half_day' | 'absent' | 'sunday' | 'holiday' | 'leave';
  checkInTime: string | null;
  checkOutTime: string | null;
  workHours: number;
  isAdminModified: boolean;
  notes: string;
}

export interface AttendanceResponse {
  month: string;
  records: AttendanceRecord[];
  summary: {
    presentDays: number;
    halfDays: number;
    absentDays: number;
    sundayDays: number;
    holidayDays: number;
    totalWorkingDays: number;
  };
}

export interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface PayrollRecord {
  employeeId: string;
  employeeName: string;
  month: string;
  baseSalary: string;
  dailyRate: string;
  totalWorkingDays: number;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  sundayDays: number;
  holidayDays: number;
  leaveDays: number;
  netSalary: string;
  isLocked: boolean;
  dailyBreakdown: Array<{
    id: string; // Ensure ID is included for edits
    date: string;
    day: string;
    status: string;
    checkIn: string;
    checkOut: string;
    hours: number;
    notes: string;
  }>;
}

export interface Holiday {
  $id: string;
  date: string;
  name: string;
  description: string;
}

export interface Employee {
  $id: string;
  email: string;
  name: string;
  salaryMonthly: number;
  joinDate: string;
  isActive: boolean;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Execute function with payload
 */
async function callFunction(action: string, payload: any = {}): Promise<ApiResponse> {
  try {
    const execution = await functions.createExecution(
      FUNCTION_ID,
      JSON.stringify({ action, ...payload }),
      false
    );

    // Parse response from execution
    const responseBody = execution.responseBody;

    // Handle different response formats
    let result: ApiResponse;

    if (typeof responseBody === 'string') {
      try {
        result = JSON.parse(responseBody);
      } catch {
        // If parsing fails, treat as error message
        result = {
          success: false,
          message: responseBody || 'Unknown error occurred'
        };
      }
    } else {
      result = responseBody as ApiResponse;
    }

    return result;
  } catch (error: any) {
    console.error('API Error:', error);
    return {
      success: false,
      message: error.message || 'Network error. Please try again.'
    };
  }
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const user = await account.get();
    return user as User;
  } catch (error) {
    return null;
  }
}

export async function getCurrentLocation(): Promise<Location> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        reject(new Error(`Location error: ${error.message}`));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

/**
 * Format date for API (YYYY-MM-DD) in IST timezone
 * This ensures consistency with the backend which uses IST
 */
function formatDate(date: Date): string {
  // Convert to IST for consistency with backend
  const istDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const year = istDate.getFullYear();
  const month = String(istDate.getMonth() + 1).padStart(2, '0');
  const day = String(istDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================
// AUTHENTICATION
// ============================================

export async function login(email: string, password: string): Promise<ApiResponse<User>> {
  try {
    await account.createEmailPasswordSession(email, password);
    const user = await account.get();

    return {
      success: true,
      message: 'Login successful',
      data: user as User
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Login failed'
    };
  }
}

export async function logout(): Promise<void> {
  try {
    await account.deleteSession('current');
  } catch (error) {
    console.error('Logout error:', error);
  }
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<ApiResponse> {
  try {
    await account.updatePassword(newPassword, oldPassword);
    return {
      success: true,
      message: 'Password changed successfully'
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Failed to change password'
    };
  }
}

// ============================================
// DEVICE REGISTRATION
// ============================================

export async function registerDevice(
  userId: string,
  email: string,
  publicKey: string,
  deviceFingerprint: string
): Promise<ApiResponse> {
  return callFunction('register-device', {
    userId,
    email,
    publicKey,
    deviceFingerprint
  });
}

// ============================================
// ATTENDANCE - EMPLOYEE
// ============================================

/**
 * Check In
 * Updated to accept optional location data from UI
 */
export async function checkIn(userId: string, email: string, locationData?: Location): Promise<ApiResponse> {
  try {
    // Use passed location OR fetch it if missing
    const location = locationData || await getCurrentLocation();

    // Generate signature
    const today = formatDate(new Date());
    const dataToVerify = `${userId}:${today}:check-in`;
    const signature = await signData(dataToVerify);

    return callFunction('check-in', {
      userId,
      email,
      signature,
      dataToVerify,
      location
    });
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Check-in failed'
    };
  }
}

export async function checkOut(userId: string, email: string, locationData?: Location): Promise<ApiResponse> {
  try {
    const location = locationData || await getCurrentLocation();

    // Generate signature
    const today = formatDate(new Date());
    const dataToVerify = `${userId}:${today}:check-out`;
    const signature = await signData(dataToVerify);

    return callFunction('check-out', {
      userId,
      email,
      signature,
      dataToVerify,
      location
    });
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Check-out failed'
    };
  }
}

export async function getMyAttendance(month?: string): Promise<ApiResponse<AttendanceResponse>> {
  return callFunction('get-my-attendance', { month });
}

// ============================================
// SYSTEM INFO
// ============================================

export async function getSystemInfo(): Promise<ApiResponse> {
  return callFunction('get-system-info');
}

// ============================================
// ADMIN - EMPLOYEE MANAGEMENT
// ============================================

export async function createEmployee(data: {
  email: string;
  password: string;
  name: string;
  salary: number;
  joinDate: string;
}): Promise<ApiResponse> {
  return callFunction('create-employee', { data });
}

export async function getEmployees(): Promise<ApiResponse<{ employees: Employee[] }>> {
  return callFunction('get-employees');
}

export async function updateEmployee(employeeId: string, data: {
  name?: string;
  email?: string;
  salary?: number;
  joinDate?: string;
  isActive?: boolean;
}): Promise<ApiResponse> {
  return callFunction('update-employee', { employeeId, data });
}

export async function deleteEmployee(employeeId: string): Promise<ApiResponse> {
  return callFunction('delete-employee', { employeeId });
}

export async function resetEmployeeDevice(employeeId: string, reason: string): Promise<ApiResponse> {
  return callFunction('reset-device', { employeeId, reason });
}

// ============================================
// ADMIN - ATTENDANCE MODIFICATION
// ============================================

export async function modifyAttendance(
  attendanceId: string,
  reason: string,
  modifications: {
    checkInTime?: string;
    checkOutTime?: string;
    status?: string;
  }
): Promise<ApiResponse> {
  return callFunction('modify-attendance', {
    attendanceId,
    reason,
    modifications
  });
}

// ============================================
// ADMIN - HOLIDAYS
// ============================================

export async function createHoliday(
  date: string,
  name: string,
  description: string
): Promise<ApiResponse> {
  return callFunction('create-holiday', { date, name, description });
}

export async function deleteHoliday(holidayId: string): Promise<ApiResponse> {
  return callFunction('delete-holiday', { holidayId });
}

export async function getHolidays(): Promise<ApiResponse<{ holidays: Holiday[] }>> {
  return callFunction('get-holidays');
}

// ============================================
// ADMIN - OFFICE LOCATIONS
// ============================================

export async function addOfficeLocation(
  name: string,
  latitude: number,
  longitude: number,
  radiusMeters: number
): Promise<ApiResponse> {
  return callFunction('add-office-location', {
    name,
    latitude,
    longitude,
    radiusMeters
  });
}

// ============================================
// ADMIN - PAYROLL
// ============================================

export async function generatePayroll(month: string): Promise<ApiResponse> {
  return callFunction('generate-payroll', { month });
}

export async function unlockPayroll(month: string, reason: string): Promise<ApiResponse> {
  return callFunction('unlock-payroll', { month, reason });
}

export async function deletePayroll(month: string, reason: string): Promise<ApiResponse> {
  return callFunction('delete-payroll', { month, reason });
}

export async function getPayrollReport(month?: string): Promise<ApiResponse<{ reports: PayrollRecord[] }>> {
  return callFunction('get-payroll-report', { month });
}

// ============================================
// ADMIN - ATTENDANCE SHEET
// ============================================

export interface AttendanceSheetEmployee {
  employeeId: string;
  employeeName: string;
  id: string | null;
  status: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  workHours: number;
  isLocked: boolean;
  notes: string;
}

export interface AttendanceSheetDay {
  date: string;
  day: string;
  isSunday: boolean;
  employees: AttendanceSheetEmployee[];
}

export interface AttendanceSheetSummary {
  totalEmployees: number;
  checkedIn: number;
  checkedOut: number;
  notYetIn: number;
}

export async function getAllAttendance(
  date?: string,
  startDate?: string,
  endDate?: string
): Promise<ApiResponse<{
  records: AttendanceSheetDay[];
  summary: AttendanceSheetSummary;
  employees: { id: string; name: string; email: string }[];
}>> {
  return callFunction('get-all-attendance', { date, startDate, endDate });
}